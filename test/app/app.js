var _ = require('underscore');
var concat = require('concat-stream');
var debug = require('debug')('test-app');
var express = require('express');
var formidableGrid = require('../../lib/formidable-grid');
var gm = require('gm');
var logger = require('morgan');
var mongo = require('mongodb');
var GridStore = mongo.GridStore;

var port = process.env.PORT || 3000;

function delay(timeout) {
    return new Promise(function(resolve) {
        setTimeout(resolve.bind(null), timeout);
    });
}

function check_file_exists(db, count, file) {
    return new Promise(function(resolve, reject) {
        GridStore.exist(db, file.id, function(err, exist) {
            if (err) {
                return reject(err);
            }
            if (! exist) {
                debug('-- Read[count=' + count + '] file ' + file.id.toString() + ' - failed');
                if (count > 0) {
                    // File does not exist, but we're stuborn and want to retry
                    // another time ...
                    delay(100).then(
                        check_file_exists(db, count - 1, file)
                            .then(resolve).catch(reject)
                    );
                } else {
                    // Ok, seems that file does really not exist, too bad ...
                    reject(Object.create(
                        new Error('File not found bitch!'), {status: {value: 404}}
                    ));
                }
            } else {
                resolve(true);
            }
        });
    });
}

function read_file(db, file) {
    return new Promise(function(resolve, reject) {
        debug('-- Read file ' + file.id.toString());
        check_file_exists(db, 2, file)
            .then(function() {
                var grid_store = new GridStore(db, file.id, 'r');
                var istream = grid_store.stream();
                var ostream = concat(resolve);

                function _error(err) {
                    debug('-- Read file ' + file.id.toString() + ' - failed');
                    istream.removeAllListeners();
                    ostream.removeAllListeners();
                    reject(err);
                }

                function _done(buf) {
                    debug('-- Read file ' + file.id.toString() + ' - done');
                    istream.removeAllListeners();
                    ostream.removeAllListeners();
                    resolve(buf);
                }

                ostream
                    .once('error', _error)
                    .once('finish', _done);
                istream
                    .once('error', _error)
                    .pipe(ostream);
            })
            .catch(reject);
    });
}

function write_file(db, buf, options) {
    return new Promise(function(resolve, reject) {
        var id = new mongo.ObjectID();
        var grid_store = new GridStore(db, id, id.toString(), 'w', options);
        var stream = grid_store.stream();

        debug('-- Write buffer to db');
        stream
            .once('error', function(err) {
                debug('-- Write buffer to db - failed');
                stream.removeAllListeners();
                reject(err);
            })
            .once('end', function() {
                debug('-- Write buffer to db - done');
                stream.removeAllListeners();
                resolve({
                    id: id,
                    lastModified: new Date(),
                    name: id.toString()
                });
            })
            .end(buf);
    });
}

function create_thumb(db, file) {
    return read_file(db, file)
        .then(function(buf) {
            return new Promise(function(resolve, reject) {
                debug('-- Create thumbnail image');
                gm(buf, file.name)
                    .resize(256)
                    .toBuffer('PNG', function(err, buf) {
                        if (err) {
                            debug('-- Create thumbnail image - failed');
                            return reject(err);
                        }
                        debug('-- Create thumbnail image - done');
                        write_file(db, buf, {content_type: 'image/png'})
                            .then(resolve)
                            .catch(reject);
                    });
            });
        })
        .then(function(thumb) {
            return _.extend(thumb, {mime: 'image/png'});
        });
}

function handle_form_data(form, req) {
    var files = [];
    return new Promise(function(resolve, reject) {
        debug('-- form-data begin receiving data');
        form
            .on('file', function(name, file) {
                files.push(file);
            })
            .once('error', function(err) {
                debug('-- form-data begin receiving data - failed');
                reject(err);
            })
            .once('end', function() {
                debug('-- form-data begin receiving data - done');
                resolve(files);
            })
            .parse(req);
    });
}

function create_thumbs(db, files) {
    return Promise.all(_.map(files, create_thumb.bind(null, db)))
        .then(function (thumbs) {
            return _.zip(files, thumbs);
        });
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
            var form = formidableGrid(db, mongo, {
                accept: ['image/.*']
            });

            handle_form_data(form, req)
                .then(create_thumbs.bind(null, db))
                .then(function(result) {
                    res.send(result);
                })
                .catch(next);
        });

        app.get('/files/:id', function(req, res, next) {
            try {
                var file_id = new mongo.ObjectID(req.params.id);
                GridStore.exist(db, file_id, function(err, exist) {
                    if (err) {
                        next(err);
                    } else if (! exist) {
                        next(Object.create(
                            new Error('File not found'), {status: {value: 404}}
                        ));
                    } else {
                        var grid_store = new GridStore(db, file_id, 'r');
                        var stream = grid_store.stream();

                        res.type('image/png');
                        res.on('pipe', function() {
                            res.type(grid_store.contentType);
                        });
                        stream.pipe(res);
                    }
                });
            } catch (err) {
                res.status(500).send(err);
            }
        });

        // 404 not found
        app.use(function(req, res, next) {
            var err = new Error('Not Found');
            err.status = 404;
            next(err);
        });

        // error handlers
        app.use(function(err, req, res, next) {
            console.log(err);
            console.log(err.stack);
            res.status(err.status || 500);
            res.send(err);
        });

        app.listen(port, function() {
            debug('Express server listening on port ' + port);
        });
    }
);
