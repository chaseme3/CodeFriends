var models = require('../models.js').models;
var collections = require('../models.js').collections;

var projectController = {};

projectController.getAllProjects = function (req, res) {
  collections.ProjectCollection
    .fetchAll({
      withRelated: ['user']
    })
    .then(function (coll) {
      res.json(coll.toJSON()).end();
    })
};

//dummy data, currently an array of projects as objects
// res.json([{
//   name: 'Whatever',
//   createdAt: 'Fri, 19 Dec 2014 00:58:17 GMT'
// }, {
//   name: 'Whatever2',
//   createdAt: 'Tue, 16 Dec 2014 00:58:17 GMT'
// }]);

// projectController.getProject = function (req, res) {
//   //dummy data
//   res.json({
//     indexhtml: 'htmlcodehtmlcode'
//   });
// };
projectController.post = function (req, res) {
  res.status(200).end();
};



projectController.put = function (req, res) {
  //add users
  //add files
  //remove users
  res.status(200).end();
};

projectController.delete = function (req, res) {
  res.status(200).end();
};

module.exports = projectController;