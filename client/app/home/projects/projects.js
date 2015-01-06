/*global angular:true, moment:true */
angular.module('code.projects', ['ui.router'])
  .controller('projectsController', function ($scope, $state, $http, Projects, chatFactory) {

    // on project state initialize, get projects
    $scope.init = function () {

      Projects.getProjects(function (res) {
        $scope.projects = res;

        angular.forEach($scope.projects, function (theProject) {
          theProject.createString = moment(theProject.created_at).format("dddd, MMMM Do YYYY");
          theProject.updateString = moment(theProject.updated_at).format("dddd, MMMM Do YYYY, h:mm:ss a");
        });
      });

    };

    $scope.createProject = function () {
      console.log('$scope.newProjectName !!!!!!', $scope.newProjectName);
      return $http.post('/api/project', {
          project_name: $scope.newProjectName
        })
        .then(function (res) {
          console.log('RES !!!!!!', res);
          return res.data;
        })
        .then(function () {
          return Projects.getProjects(function (res) {
            $scope.projects = res;
            console.log('RES $scope.projects !!!!!', $scope.projects);
          });

        });

      $scope.init();
    };
    $scope.init();
  });