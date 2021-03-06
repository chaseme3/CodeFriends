//dependencies
var bodyParser = require('body-parser'),
  path = require('path'),
  morgan = require('morgan'),
  marked = require('marked'),
  session = require('express-session'),
  express = require('express');

var liveDB = require('livedb-mongo');

// shareJS and codemirror dependencies
var connect = require('connect'),
  http = require('http'),
  argv = require('optimist').argv,
  // serveStatic = require( 'serve-static' ), not sure if we need this. 
  shareCodeMirror = require('share-codemirror'),
  Duplex = require('stream').Duplex,
  livedb = require('livedb'),
  sharejs = require('share'),
  shareJSport = argv.p || 8007,
  shareJSapp = connect(),
  server = http.createServer(shareJSapp),
  // No credentials passed on to MongoDB (might need to change)
  db = liveDB('mongodb://localhost:27017/codeFriends?auto_reconnect', {
    safe: true
  }),
  // For memory-stored livedb, use livedb.memory()
  backend = livedb.client(db),
  share = sharejs.server.createClient({
    backend: backend
  }),
  WebSocketServer = require('ws').Server,
  wss = new WebSocketServer({
    server: server
  });

server.listen(shareJSport);
console.log('editor listening on http://localhost:' + shareJSport + '/');

//create editor ws connection

wss.on('connection', function (client) {
  var stream = new Duplex({
    objectMode: true
  });
  stream._write = function (chunk, encoding, callback) {
    console.log('s->c ', chunk);
    client.send(JSON.stringify(chunk));
    return callback();
  };
  stream._read = function () {};
  stream.headers = client.upgradeReq.headers;
  stream.remoteAddress = client.upgradeReq.connection.remoteAddress;
  client.on('message', function (data) {
    console.log('c->s ', data);
    return stream.push(JSON.parse(data));
  });
  stream.on('error', function (msg) {
    return client.close(msg);
  });
  client.on('close', function (reason) {
    stream.push(null);
    stream.emit('close');
    console.log('client went away');
    return client.close(reason);
  });
  stream.on('end', function () {
    return client.close();
  });
  return share.listen(stream);
});

server.listen(shareJSport);
console.log("editor listening on http://localhost:" + shareJSport + "/");

// Set routes
var auth = require('./auth');
var db = require('./db');

var port = process.env.PORT || 8000;
var auth = require('./auth');
var authRouter = require('./auth/authRouter');
var apiRouter = require('./api');

// Init app
var app = express();

// Middlewares
app
// .use(cookieParser)
  .use(bodyParser.urlencoded({
    extended: true
  }))
  .use(bodyParser.json())
  .use(morgan('dev'))
  // .use(expressMethodOverride)
  .use(session({
    secret: 'zfnzkwjehgweghw',
    resave: false,
    saveUninitialized: true
  }))
  .use(auth.initialize())
  .use(auth.session());

//set routes
var port = process.env.PORT || 8000;
console.log('got to router in index.js')
app
  .use(express.static(__dirname + '/../client'))
  .use('/auth', authRouter)
  .use('/api', apiRouter)
  .listen(port, function () {
    console.log('Server listening on port: ', port);
  });

module.exports = app;