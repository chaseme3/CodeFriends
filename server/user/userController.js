var models = require('../models.js').models;
var collections = require('../models.js').collections;

var userController = {};

userController.getAllUsers = function (req, res) {
	collections.UserCollection
		.fetchAll({
			withRelated: 'project'
		})
		.then(function (coll) {
			res.json(coll.toJSON()).end();
		})
};

userController.post = function (req, res) {
	res.status(200).end();
};


userController.put = function (req, res) {
	res.status(200).end();
};

userController.delete = function (req, res) {
	res.status(200).end();
};

module.exports = userController;