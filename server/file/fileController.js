'use strict';
var config = require('config');
var Promise = require('bluebird');
var mongoClient = Promise.promisifyAll(require('mongodb').MongoClient);
var Q = require('q');
var moment = require('moment');
var _ = require('lodash');
var path = require('path');

var ProjectCollection = require('../models').collections.ProjectCollection;
var downloadController = require('./downloadController');
// var Project = require('../models').models.Project;

var mongoIndex = function (str) {
  return str.replace('.', '');
};

var fileController = {
  createNewFileOrFolder: function (req, res) {
    var projectName = req.body.projectName || req.param('projectName');
    var type = req.body.type || req.param('type');
    var projectId = req.body.projectId || req.param('projectId') || null;
    var filePath = req.body.filePath || req.param('filePath') || '';
    var fileInfo = {
      projectName: projectName,
      filePath: filePath,
      type: type,
      projectId: projectId,
    };
    if (type !== 'file' && type !== 'folder') {
      return res.status(400).send('Invalid File Type Specified').end();
    }
    fileController._createNewFileOrFolder(fileInfo)
      .then(function (fileStructure) {
        return res.status(201).json(fileStructure);
      })
      .catch(function (err) {
        console.log('Error Creating File or Folder:', err);
        return res.status(400).send(err.toString()).end();
      });
  },
  _createNewFileOrFolder: function (fileInfo) {
    var projectName = fileInfo.projectName;
    var type = fileInfo.type;
    var projectId = fileInfo.projectId || null;
    var filePath = fileInfo.filePath;
    var userId = fileInfo.userId || null;
    return new Q()
      .then(function () {
        // Check if name is valid (no white space)
        if (!fileController._isValidFileName(filePath)) {
          throw new Error('Invalid File Name');
        }
      })
      .then(function () {
        var temp;
        if (projectName) {
          temp = projectName;
        } else {
          temp = projectId;
        }
        return fileController.getFileStructure(temp);
      })
      .then(function (fileStructure) {
        // Check if path exists
        if (!fileController._isPathValidAndFileDoesNotExistAtPath(fileStructure, filePath)) {
          throw new Error('Path is Invalid or File Already Exists');
        }
        // Create Object with author, timeCreated
        var newAddition = {
          name: path.basename(filePath),
          created: moment().format(config.get('timeFormat')),
          author: userId,
          type: type,
          path: filePath
        };
        if (type === 'folder') {
          newAddition.files = {};
        }
        var updatedFileStructure = fileController._appendToFileStructure(fileStructure, filePath, newAddition);
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
  _isValidFileName: function (filePath) {
    var fileName = path.basename(filePath);
    return !(/\s/g.test(fileName) || /\//g.test(fileName));
  },
  _appendToFileStructure: function (fileStructure, filePath, newAddition) {
    var fileDirname = path.dirname(filePath);
    var fileName = path.basename(filePath);
    if (fileDirname === '.') fileDirname = '';
    if (!fileController._isFileInFileStructre(fileStructure, filePath)) {
      var subFileStructure = fileController._getSubFileStructure(fileStructure, fileDirname);
      subFileStructure.files[mongoIndex(fileName)] = newAddition;
    }
    return fileStructure;
  },
  _getSubFileStructure: function (fileStructure, filePath) {
    var _filePath = filePath.split('/').filter(function (str) {
      return str.length > 0;
    });
    var traverseFileStructure = function (_fileStructure, filePathStructure) {
      if (filePathStructure.length === 0) {
        return _fileStructure;
      }
      if (_fileStructure.files[mongoIndex(filePathStructure[0])]) {
        var subFileStructure = _fileStructure.files[mongoIndex(filePathStructure[0])];
        return traverseFileStructure(subFileStructure, filePathStructure.splice(1));
      }
      return false;
    };
    return traverseFileStructure(fileStructure, _filePath);
  },
  /**
   * Check if a given path if valid within a fileStructure
   *
   * @param <Object> fileStructure queried from mongoDB
   * @param <String> path to be queried in fileStructure
   * @param <String> name of file
   * @return <Boolean>
   */
  _isPathValidAndFileDoesNotExistAtPath: function (fileStructure, filePath) {
    var fileDirname = path.dirname(filePath);
    if (fileDirname === '') return !fileController._isFileInFileStructre(fileStructure, filePath);
    if (fileDirname === '.') return !fileController._isFileInFileStructre(fileStructure, filePath);
    return !fileController._isFileInFileStructre(fileStructure, filePath);
  },
  /**
   * Returns if file is in the root of the fileStructure
   *
   * @param <Object> (fileStructure)
   * @return <Boolean>
   */
  _isFileInFileStructre: function (fileStructure, filePath) {
    var fileName = path.basename(filePath);
    var fileDirname = path.dirname(filePath);
    var subFileStructure = fileStructure;
    if (fileDirname !== '.') {
      subFileStructure = fileController._getSubFileStructure(fileStructure, fileDirname);
    }
    return _.any(subFileStructure.files, function (file) {
      return file.name === fileName;
    });
  },
  get: function (req, res) {
    var projectName = req.body.projectName;
    return fileController.getFileStructure(projectName)
      .then(function (fileStructure) {
        return res.json(fileStructure);
      });
  },
  getFileStructure: function (projectIdOrName) {
    return new Q().then(function () {
        if (typeof projectIdOrName === 'string') {
          return ProjectCollection
            .query('where', 'project_name', '=', projectIdOrName)
            .fetchOne();
        } else if (typeof projectIdOrName === 'number') {
          return ProjectCollection
            .query('where', 'id', '=', projectIdOrName)
            .fetchOne();
        } else {
          throw new Error('No Project ID or name specified');
        }
        // if (projectId !== null && projectId !== undefined) { // If project ID
        //   // Check if project ID exists
        //   return ProjectCollection
        //     .query('where', 'id', '=', projectId)
        //     .fetchOne();
        // }
        // If project name
        // if (projectName !== null && projectName !== undefined) {
        //   // Get project ID
        //   return ProjectCollection
        //     .query('where', 'project_name', '=', projectName)
        //     .fetchOne();
        // }
        // throw new Error('No Project ID or name specified');
      })
      .then(function (project) {
        // Get project structure form mongo
        return mongoClient.connectAsync(config.get('mongo'))
          .then(function (db) {
            var projectCollection = Promise.promisifyAll(db.collection('project_file_structre'));
            return projectCollection.findOneAsync({
                projectId: project.get('id')
              })
              .then(function (projectFileStructure) {
                // Create empty project if nothing is found
                if (projectFileStructure === null) {
                  return projectCollection.insertAsync({
                      projectId: project.get('id'),
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
    var filePaths = [];
    var getPaths = function (_fileStructure) {
      _.each(_fileStructure, function (fileOrFolder) {
        filePaths.push(fileOrFolder.path);
        if (fileOrFolder.type === 'folder') {
          getPaths(fileOrFolder.files);
        }
      });
    };
    if (!isFilesAttribute) getPaths(fileStructure.files); // default
    if (isFilesAttribute) getPaths(fileStructure);

    return filePaths;
  },
  moveFileInProject: function (req, res) {

    var fileInfo = req.body;
    var fileContent;
    var fileStructure;
    var oldPath = fileInfo.filePath;
    var newPath = fileInfo.newPath;
    downloadController._getFileContents(fileInfo.projectIdOrName, fileInfo.filePath)
      .then(function (content) {
        fileContent = content;
      })
      .catch(function (err) {
        console.log('Error moving the file: ', err);
      });

    return fileController.getFileStructure(fileInfo.projectIdOrName)
      .then(function (currentFileStructure) {
        // console.log('currentFileStructure: ', currentFileStructure);
        fileStructure = currentFileStructure;
        return fileController._isPathValidAndFileDoesNotExistAtPath(fileStructure, fileInfo.filePath);
      })
      .then(function (validOrNot) {
        //this test needs to be stronger eventually. Right now it expexts the above function to send a false, meaning
        //that something is currently at that path so it is not available to place new files
        if (validOrNot === false) {
          return fileController.moveObjectProperty(oldPath, newPath, fileStructure);
        }
      })
      .then(function (newFileStructureToAdd) {
        console.log('newFileStructureToAdd: ', newFileStructureToAdd);
        return fileController._updateFileStructure(newFileStructureToAdd);
      })
      .then(function (newFileStructre) {
        console.log('newFileStructre: ', newFileStructre);
      })
      .catch(function (err) {
        console.log('Hello World #1', err);
      });

    //     .then(function () {
    //       return getDocumentHash(projectName, documentName)
    //         .then(function (documentHash) {
    //           backend.submitAsync('documents', documentHash, {
    //               create: {
    //                 type: 'text',
    //                 data: fileContent
    //               }
    //             })
    //             .catch(function (err) {
    //               console.log('Document Already Exists', err);
    //             })
    //             .then(function () { // err, version, transformedByOps, snapshot
    //               var fileInfo = {
    //                 projectName: projectName,
    //                 fileName: documentName,
    //                 type: type,
    //                 path: '',
    //                 userId: userId
    //               };
    //               fileController._createNewFileOrFolder(fileInfo)
    //                 .then(function (newFileStructre) {
    //                   res.json(newFileStructre);
    //                 })
    //                 .catch(function (err) {
    //                   console.log('Error Creating File or Folder: ', err);
    //                   res.status(400).end();
    //                 });
    //             });
    //         })
    //         .catch(function (err) {
    //           console.log('Error uploading file', err);
    //         });
    //     })
  },


  moveObjectProperty: function (oldPath, newPath, object) {
    var oldPathArray = oldPath.split('/').splice(1, oldPath.length);
    var newPathArray = newPath.split('/').splice(1, newPath.length);
    var firstBaseObject = object.files[oldPathArray[0]];
    var secondBaseObject = object.files[oldPathArray[0]];
    var storageForFileToMove;

    var deleteProperty = function (round, urlArray, obj, index) {

      var totalRounds = oldPathArray.length - 1;

      if (round === totalRounds) {
        var objKey = oldPathArray[index].replace('.', '');
        storageForFileToMove = obj.files[objKey];
        delete obj.files[objKey];
        return;
      }
      var objToPass;
      var objKey = oldPathArray[index];
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
    deleteProperty(1, oldPathArray, firstBaseObject, 1);

    var addProperty = function (round, urlArray, obj, index) {
      var totalRounds = urlArray.length - 1 || 1;

      if (round === totalRounds) {

        var objKey = urlArray[index].replace('.', '');
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
    addProperty(1, newPathArray, object, 0);
    console.log('object.files after adding property: ', object.files);

    //change paths property to reflect new filestructure
    object.paths.push(newPath);
    for (var i = 0; i < object.paths.length; i++) {
      if (object.paths[i] === oldPath) {
        object.paths.splice(i, 1);
        break;
      }
    }

    return object;
  }

};

module.exports = fileController;