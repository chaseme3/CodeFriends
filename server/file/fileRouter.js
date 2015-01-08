'use strict';

var express = require('express');
var fileController = require('./fileController');

var fileRouter = express.Router();


fileRouter.post('/', fileController.createNewFileOrFolder);
fileRouter.get('/', fileController.get);
fileRouter.put('/moveFolder', fileController.moveFileInProject);

module.exports = fileRouter;