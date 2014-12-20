var express = require('express');
var models = require('../models.js').models;
var collections = require('../models.js').collections;

var projectController = {};

projectController.post = function (req, res) {

  var project_name = req.body.project_name;

  if (!project_name) {
    res.status(400).end();
  }
  var newProject = new models.Project({
      project_name: project_name
    })
    .save()
    .then(function (model) {
      res.json(model.toJSON());
    })
};

projectController.getAllProjects = function (req, res) {
  models.Project
    .fetchAll({
      withRelated: ['user']
    })
    .then(function (coll) {
      res.send(coll.toJSON());
    });
};

//MAKE SEARCHABLE BY EITHER ID OR NAME
projectController.getSpecificProject = function (req, res) {
  models.Project
    .query('where', 'project_name', '=', req.params.project_name)
    .fetch({
      withRelated: ['user']
    })
    .then(function (coll) {
      res.send(coll);
    });
};


//HOW WILL WE FIND OUT find out if they have permission?
//ALWAYS USER THE PROJECT / USER IDs?
//GET
////get specific users or projects by the name OR the id
////
////
//PUT
////add user to a project
////add project to a user
////remove users from a project
////remove project from a user
//DELETE
//delete a user
//delete a project

projectController.put = function (req, res) {
  res.status(200).end();
};

projectController.delete = function (req, res) {
  res.status(200).end();
};

module.exports = projectController;