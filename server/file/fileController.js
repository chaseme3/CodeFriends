'use strict';
var config = require('config');
var Promise = require('bluebird');
var mongoClient = Promise.promisifyAll(require('mongodb').MongoClient);
var Q = require('q');
var moment = require('moment');
var _ = require('lodash');
var ProjectCollection = require('../models').collections.ProjectCollection;
// var Project = require('../models').models.Project;

var mongoIndex = function (str) {
  return str.replace('.', '');
};

var fileController = {

  createNewFileOrFolder: function (req, res) {
    var projectName = req.body.project_name || req.param('project_name');
    var fileName = req.body.file_name || req.param('file_name');
    var type = req.body.type || req.param('type');
    var projectId = req.body.project_id || req.param('project_id') || null;
    var path = req.body.path || req.param('path') || '';
    var fileInfo = {
      projectName: projectName,
      fileName: fileName,
      type: type,
      projectId: projectId,
      path: path
    };
    if (type !== 'file' && type !== 'folder') {
      return res.status(400).send('Invalid File Type Specified').end();
    }
    fileController._createNewFileOrFolder(fileInfo)
      .then(function (fileStructure) {
        return res.status(201).json(fileStructure);
      })
      .catch(function (err) {
        return res.status(400).send(err.toString()).end();
      });
  },

  _createNewFileOrFolder: function (fileInfo) {
    var projectName = fileInfo.projectName;
    var fileName = fileInfo.fileName;
    var type = fileInfo.type;
    var projectId = fileInfo.projectId || null;
    var path = fileInfo.path;
    // var projectIdOrName = fileInfo.projectIdOrName;
    var userId = fileInfo.userId || null;
    return new Q()
      .then(function () {
        // Check if name is valid (no white space)
        if (!fileController._isValidFileName(fileName)) {
          throw new Error('Invalid File Name');
        }
      })
      .then(function () {
        return fileController.getFileStructure(projectName);
      })
      .then(function (fileStructure) {
        // Check if path exists
        if (!fileController._isPathValid(fileStructure, path, fileName)) {
          throw new Error('File Already Exists');
        }
        // Create Object with author, timeCreated
        var newAddition = {
          name: fileName,
          created: moment().format(config.get('timeFormat')),
          author: userId,
          type: type,
          path: path + '/' + fileName,
          // projectIdOrName: projectIdOrName
        };
        if (type === 'folder') {
          newAddition.files = {};
        }
        var updatedFileStructure = fileController._appendToFileStructure(fileStructure, path, fileName, newAddition);
        // Update file structure for whole project in mongo
        return fileController._updateFileStructure(updatedFileStructure);
      });
  },
  /**
   * Updated fileStructure in Mongo Database
   *
   * @param <Object> fileStructure
   * @return <Promise>
   */
  _updateFileStructure: function (fileStructure) {
    return mongoClient.connectAsync(config.get('mongo'))
      .then(function (db) {
        return Promise.promisifyAll(db.collection('project_file_structre'));
      })
      .then(function (projectCollection) {
        return projectCollection.updateAsync({
            _id: fileStructure._id
          }, {
            $set: {
              files: fileStructure.files
            }
          }, {
            w: 1
          })
          .then(function () {
            return projectCollection.findOneAsync({
              _id: fileStructure._id
            });
          });
      });
  },

  _isValidFileName: function (fileName) {
    return !(/\s/g.test(fileName) || /\//g.test(fileName));
  },

  _appendToFileStructure: function (fileStructure, path, fileName, newAddition) {
    fileController._getSubFileStructure(fileStructure, path, function (subFileStructure) {
      if (!fileController._isFileInFileStructre(subFileStructure)) {
        subFileStructure.files[mongoIndex(fileName)] = newAddition;
      }
    });
    return fileStructure;
  },

  _getSubFileStructure: function (fileStructure, path, cb) {
    var _path = path.split('/').filter(function (str) {
      return str.length > 0;
    });
    var traverseFileStructure = function (_fileStructure, pathStructure) {
      if (pathStructure.length === 0) {
        cb(_fileStructure);
        return true;
      }
      if (_fileStructure.files[mongoIndex(pathStructure[0])]) {
        var subFileStructure = _fileStructure.files[mongoIndex(pathStructure[0])];
        return traverseFileStructure(subFileStructure, pathStructure.splice(1));
      }
      return false;
    };
    return traverseFileStructure(fileStructure, _path);
  },
  /**
   * Check if a given path if valid within a fileStructure
   *
   * @param <Object> fileStructrue queried from mongoDB
   * @param <String> path to be queried in fileStructure
   * @param <String> name of file
   * @return <Boolean>
   */
  _isPathValid: function (fileStructure, filePath) {
    if (filePath === '') return !fileController._isFileInFileStructre(fileStructure, filePath);
    var isValidPath = false;
    fileController._getSubFileStructure(fileStructure, filePath, function (subFileStructure) {
      if (!fileController._isFileInFileStructre(subFileStructure, filePath)) {
        isValidPath = true;
      }
    });
    return isValidPath;
  },

  _isFileInFileStructre: function (fileStructure, filePath) {
    return _.any(fileStructure.files, function (file) {
      return file.path === filePath;
    });
  },

  get: function (req, res) {
    var project_name = req.body.project_name;
    return fileController.getFileStructure(project_name)
      .then(function (fileStructure) {
        return res.json(fileStructure);
      });
  },

  getFileStructure: function (projectIdOrName) {
    return new Q().then(function () {
        if (typeof projectIdOrName === 'number') {
          return ProjectCollection
            .query('where', 'id', '=', projectIdOrName)
            .fetchOne();
        }
        if (typeof projectIdOrName === 'string') {
          return ProjectCollection
            .query('where', 'project_name', '=', projectIdOrName)
            .fetchOne();
        }
        throw new Error('No Project ID or name specified');
      })
      .then(function (project) {
        // Get project structure form mongo
        return mongoClient.connectAsync(config.get('mongo'))
          .then(function (db) {
            var projectCollection = Promise.promisifyAll(db.collection('project_file_structre'));
            return projectCollection.findOneAsync({
                project_id: project.get('id')
              })
              .then(function (projectFileStructure) {
                // Create empty project if nothing is found
                if (projectFileStructure === null) {
                  return projectCollection.insertAsync({
                      project_id: project.get('id'),
                      files: {}
                    })
                    .then(function (projectFileStructure) {
                      return projectFileStructure[0];
                    });
                }
                return projectFileStructure;
              })
              .then(function (projectFileStructure) {
                db.close();
                projectFileStructure.paths = fileController.getPathsForFileStructure(projectFileStructure);
                return projectFileStructure;
              });
          })
          .catch(function (error) {
            console.log('Error Connecting to MongoDB', error);
          });
      });
  },

  getPathsForFileStructure: function (fileStructure, isFilesAttribute) {
    isFilesAttribute = isFilesAttribute || false;
    var paths = [];
    var getPaths = function (_fileStructure) {
      _.each(_fileStructure, function (fileOrFolder) {
        paths.push(fileOrFolder.path);
        if (fileOrFolder.type === 'folder') {
          getPaths(fileOrFolder.files);
        }
      });
    };
    if (!isFilesAttribute) getPaths(fileStructure.files); // default
    if (isFilesAttribute) getPaths(fileStructure);
    return paths;
  },

  moveFileInProject: function (req, res) {
    var fileInfo = req.body;
    var fileContent;

    return fileController.getFileStructure(fileInfo.projectIdOrName)
      .then(function (fileStructure) {
        if (fileController._isPathValid(fileStructure, fileInfo.path)) {
          return fileStructure;
        }
      })
      .then(function (fileStructure) {
        return fileController.moveObjectProperty(fileInfo.oldUrl, fileInfo.newUrl, fileStructure);
      })
      .then(function (newFileStructureToAdd) {
        return fileController._updateFileStructure(newFileStructureToAdd);
      })
      .then()
  },


  moveObjectProperty: function (oldUrl, newUrl, object) {
    console.log('object at beginning: ', object);

    var oldUrlArray = oldUrl.split('/');
    var newUrlArray = newUrl.split('/');
    var baseObject = object.fileStructure.files[oldUrlArray[0]];
    var storageForFileToMove;

    var deleteProperty = function (round, urlArray, obj, index) {
      var totalRounds = oldUrlArray.length - 1;

      if (round === totalRounds) {
        var objKey = oldUrlArray[index];
        storageForFileToMove = obj.files[objKey];
        delete obj.files[objKey];
        return;
      }
      var objToPass;
      var objKey = oldUrlArray[index];
      if (obj.type === 'folder') {
        var temp = obj.files;
        objToPass = temp[objKey];
      } else if (obj.type === 'file') {
        objToPass = obj[objKey];
      } else {
        console.log('Error traversing file. Check if file path exists.');
      }
      deleteProperty(round + 1, urlArray, objToPass, index + 1);
    };
    deleteProperty(1, oldUrlArray, baseObject, 1);
    console.log('object after deleting property: ', object);

    var addProperty = function (round, urlArray, obj, index) {
      var totalRounds = urlArray.length - 1;

      if (round === totalRounds) {
        var objKey = urlArray[index];
        console.log('obj in base case of addProperty: ', obj);
        console.log('objKey: ', objKey);
        console.log('property we are adding: ', storageForFileToMove);
        obj.files[objKey] = storageForFileToMove;
        return;
      }

      var objToPass;
      var objKey = urlArray[index];
      if (obj.type === 'folder') {
        var temp = obj.files;
        objToPass = temp[objKey];
      } else if (obj.type === 'file') {
        objToPass = obj[objKey];
      } else {
        console.log('Error traversing file. Check if file path exists.');
      }
      addProperty(round + 1, urlArray, objToPass, index + 1);
    };
    addProperty(1, newUrlArray, baseObject, 1);
    console.log('object after adding property: ', object);

    return object.fileStructure;
  }

};

module.exports = fileController;

// var obj1 = {
//     fileStructure:  {
//         _id: '54adfd09936bc2112ddbfe88',
//         project_id: 5,
//         files: { 
//             mainjs: { 
//                 name: 'main.js',
//                 created: '2015-01-07T19:01:04-08:00',
//                 author: null,
//                 type: 'file',
//                 path: '//main.js' 
//             },
//             exampleFolder: { 
//                 name: 'exampleFolder',
//                 created: '2015-01-07T19:01:12-08:00',
//                 author: null,
//                 type: 'folder',
//                 path: '/example',
//                 files: { 
//                     carjs: { 
//                         name: 'main.js',
//                         created: '2015-01-07T19:01:04-08:00',
//                         author: null,
//                         type: 'file',
//                         path: '//main.js' 
//                     },
//                     cowFolder: { 
//                         name: 'cowFolder',
//                         created: '2015-01-07T19:01:12-08:00',
//                         author: null,
//                         type: 'folder',
//                         path: '/example',
//                         files: {
//                             cowjs: { 
//                                 name: 'cow.js',
//                                 created: '2015-01-07T19:01:04-08:00',
//                                 author: null,
//                                 type: 'file',
//                                 path: '//main.js'
//                             }
//                         }
//                     }
//                 }
//             },
//             dummyForTest2js: { 
//                 name: 'dummyForTest2.js',
//                 created: '2015-01-07T19:01:39-08:00',
//                 author: 4,
//                 type: 'file',
//                 path: '/dummyForTest2.js' 
//             } 
//         }
//     }
// }

// var url1 = 'exampleFolder/cowFolder/cowjs';
// var url2 = 'exampleFolder/cowjs';

// var moveObjectProperty = function (oldUrl, newUrl, object){
//     console.log('object at beginning: ', object);

//     var oldUrlArray =  oldUrl.split('/');
//     var newUrlArray =  newUrl.split('/');
//     var baseObject = object.fileStructure.files[oldUrlArray[0]];
//     var storageForFileToMove;

//     var deleteProperty = function(round, urlArray, obj, index){
//         var totalRounds = oldUrlArray.length -1;

//         if(round === totalRounds){
//             var objKey = oldUrlArray[index];
//             storageForFileToMove = obj.files[objKey];
//             delete obj.files[objKey];
//             return;
//         }        
//         var objToPass;
//         var objKey = oldUrlArray[index];
//         if(obj.type === 'folder'){
//             var temp = obj.files;
//             objToPass = temp[objKey];
//         }else if(obj.type === 'file'){
//             objToPass = obj[objKey];    
//         }else{
//             console.log('Error traversing file. Check if file path exists.');
//         }
//         deleteProperty(round + 1, urlArray, objToPass, index + 1);
//     }
//     deleteProperty(1, oldUrlArray, baseObject, 1);
//     console.log('object after deleting property: ', object);

//     var addProperty = function(round, urlArray, obj, index){
//         var totalRounds = urlArray.length -1;

//         if(round === totalRounds){
//             var objKey = urlArray[index];
//             console.log('obj in base case of addProperty: ', obj);
//             console.log('objKey: ', objKey);
//             console.log('property we are adding: ', storageForFileToMove);
//             obj.files[objKey] = storageForFileToMove;
//             return;
//         }

//         var objToPass;
//         var objKey = urlArray[index];
//         if(obj.type === 'folder'){
//             var temp = obj.files;
//             objToPass = temp[objKey];
//         }else if(obj.type === 'file'){
//             objToPass = obj[objKey];    
//         }else{
//             console.log('Error traversing file. Check if file path exists.');
//         }
//         addProperty(round + 1, urlArray, objToPass, index + 1);
//     }
//     addProperty(1, newUrlArray, baseObject, 1);
//     console.log('object after adding property: ', object);
//     return object;

// };

// console.log(moveObjectProperty(url1, url2, obj1));