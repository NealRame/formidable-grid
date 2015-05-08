var _ = require('underscore');
var debug = require('debug')('test-app');
var express = require('express');
var FormidableGrid = require('../../lib/formidable-grid');
var gm = require('gm');
var logger = require('morgan');
var mongo = require('mongodb');
var GridFs = require('gridfs');
var util = require('util');

var port = process.env.PORT || 3000;

function create_thumb(db, file) {
    return new Promise(function(resolve, reject) {
        var gfs = new GridFs(mongo, db);
        var id = new mongo.ObjectID();
        gfs.existsAsync(file)
            .then(function(exist) {
                if (! exist) {
                    reject(new Error(util.format('Cannot create thumbnail because file "%s" does exist.')));
                } else {
                    var istream = gfs.createReadStream(file);
                    var ostream = gfs.createWriteStream(id, {
                        content_type: 'image/png'
                    });
                    ostream
                        .once('end', resolve.bind(null, {
                            original: file,
                            thumbnail: id.toString()
                        }))
                        .once('error', reject);
                    gm(istream)
                        .resize(256)
                        .stream('png')
                        .pipe(ostream);
                }
            });
    });
}

function create_thumbs(db, files) {
    return Promise.all(_.map(files, create_thumb.bind(null, db)));
}

mongo.MongoClient.connect(
    'mongodb://test:test@127.0.0.1:27017/test',
    {native_parser: true},
    function (err, db) {
        debug('Connected to db');

        var app = express();

        app.use(logger('dev'));
        app.get('/', function(req, res) {
            res.send(
                '<!DOCTYPE html>' +
                '<html>' +
                '<head>' +
                '<title>FormidableGrid app test</title>' +
                '</head>' +
                '<body>' +
                '<form action="/upload" enctype="multipart/form-data" method="post">' +
                '<input type="file" name="file">' +
                '<input type="submit" value="upload">' +
                '</form>' +
                '</body>' +
                '</html>'
            );
        });

        app.post('/upload', function(req, res, next) {
            var form = new FormidableGrid(db, mongo, {
                accepted_field_names: [ 'file', 'foo', 'gee' ],
                accepted_mime_types: [ /^image\/.*/ ]
            });
            form.parse(req)
                .then(function(form_data) {
                    debug(util.inspect(form_data));
                    return _.chain(form_data)
                        .reject(_.partial(_.has, _, 'file'))
                        .map(function(data) {
                            return [data.field, data.value];
                        })
                        .object()
                        .extend({files: _.chain(form_data).pluck('file').compact().value()})
                        .value();
                })
                .then(function(data) {
                    return create_thumbs(db, data.files)
                        .then(function(pictures) {
                            return _.chain(data)
                                .omit('files')
                                .extend({pictures: pictures})
                                .value();
                        })
                })
                .then(function(result) {
                    debug(util.format('-- %s', util.inspect(result)));
                    res.send(result);
                })
                .catch(next);
        });

        app.get('/files/:id', function(req, res, next) {
            var gfs = new GridFs(mongo, db);
            var file_id = req.params.id;
            gfs.existsAsync(file_id)
                .then(function(exist) {
                    if (! exist) {
                        throw Object.create(
                            new Error('File not found'),
                            {status: {value: 404}}
                        );
                    }
                    return gfs.statAsync(file_id);
                })
                .then(function(stats) {
                    debug(util.format('-- %s', util.inspect(stats)));
                    res.type(stats.contentType);
                    gfs.createReadStream(file_id).pipe(res);
                })
                .catch(next);
        });

        // 404 not found
        app.use(function(req, res, next) {
            var err = new Error('Not Found');
            err.status = 404;
            next(err);
        });

        // error handlers
        app.use(function(err, req, res, next) {
            debug(err);
            res.status(err.status || 500);
            res.send(err);
        });

        app.listen(port, function() {
            debug('Express server listening on port ' + port);
        });
    }
);
