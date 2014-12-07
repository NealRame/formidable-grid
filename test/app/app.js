var debug = require('debug')('test-app');
var express = require('express');
var formidableGrid = require('../../lib/formidable-grid');
var logger = require('morgan');
var mongo = require('mongodb');

var port = process.env.PORT || 3000;

mongo.MongoClient.connect(
    'mongodb://test:test@127.0.0.1:27017/test',
    {native_parser: true},
    function (err, db) {
        debug('Connected to db');

        var app = express();

        app.use(logger('dev'));
        app.get('/', function(req, res) {
            res.send(
                '<!DOCTYPE html>'
                + '<html>'
                + '<head>'
                + '<title>FormidableGrid app test</title>'
                + '</head>'
                + '<body>'
                + '<form action="/upload" enctype="multipart/form-data" method="post">'
                + '<input type="file" name="file">'
                + '<input type="submit" value="upload">'
                + '</form>'
                + '</body>'
                + '</html>'
            );
        });

        app.post('/upload', function(req, res, next) {
            var form = formidableGrid(db, mongo, {
                accept: ['image/.*']
            });
            var files = [];

            debug('Somebody is trying to upload something!');

            form
                .on('file', function(name, file) {
                    console.log(name);
                    files.push(file);
                })
                .once('error', next)
                .once('end', function() {
                    console.log('pouet');
                    res.send(files);
                })
                .parse(req);
        });

        // 404 not found
        app.use(function(req, res, next) {
            var err = new Error('Not Found');
            err.status = 404;
            next(err);
        });

        // error handlers
        app.use(function(err, req, res, next) {
            res.status(err.status || 500);
            res.send(err);
        });

        app.listen(port, function() {
            debug('Express server listening on port ' + port);
        });
    }
);
