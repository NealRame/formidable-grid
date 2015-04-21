var _ = require('underscore');
var debug = require('debug')('formidable-grid');
var Busboy = require('busboy');
var util = require('util');

function pipe_to_gridfs(i_stream, mongo, db, content_type) {
    return new Promise(function(resolve, reject) {
        debug('-- pipe stream to gridFs');

        var id = new mongo.ObjectID();
        var grid_store = new mongo.GridStore(db, id, id.toString(), 'w', {
            content_type: content_type
        });
        var o_stream = grid_store.stream();

        o_stream
            .on('drain', function() {
                debug('-- output stream drained!');
                process.nextTick(i_stream.resume.bind(i_stream));
            });

        i_stream
            .on('data', function(data) {
                i_stream.pause();
                debug(util.format('-- write chunk of data to file: size=%d', data.length));
                o_stream.write(data);
                debug('-- waiting for drain event');
            })
            .once('error', function(err) {
                reject(err);
            })
            .once('end', function() {
                debug('-- end of data');
                o_stream.end(function() {
                    debug('-- output stream flushed');
                    resolve(grid_store);
                });
            })
            .resume();
    });
}

function make_validator(validator_name, filters) {
    if (_.isArray(filters) && ! _.isEmpty(filters)) {
        return function(str) {
            debug(util.format('-- validate %s with %s', validator_name, str));
            return _.some(filters, function(re) {
                var ok = re.test(str);
                debug(util.format('-- try with %s - %s', re.toString(), ok ? 'yes':'no'));
                return ok;
            });
        };
    }

    if (_.isRegExp(filters)) {
        return function(str) {
            debug(util.format('-- validate %s with %s', validator_name, str));
            debug(util.format('-- try with %s', filters.toString()));
            return filters.test(str);
        };
    }

    return function(str) {
        debug(util.format('-- validate %s width %s', validator_name, str));
        return true;
    };
}

function FormidableGrid(db, mongo, options) {
    if (! db)    throw new Error('Missing db!');
    if (! mongo) throw new Error('Missing mongodb driver!');

    options = options || {};

    this.db = function() {
        return db;
    };
    this.mongo = function() {
        return mongo;
    };

    this.acceptFieldName = make_validator('field name', options.accepted_field_names);
    this.acceptMimeType = make_validator('mime type', options.accepted_mime_types);
};

FormidableGrid.prototype.parse = function(req) {
    var db = this.db();
    var mongo = this.mongo();
    var busboy = new Busboy({headers: req.headers});
    var parts = [];

    var on_file_part = (function(field_name, file, file_name, encoding, mime_type) {
        var promise;
        debug('-- handle file part', field_name, file_name, encoding, mime_type);
        if (this.acceptFieldName(field_name) && this.acceptMimeType(mime_type)) {
            debug(util.format('-- validate - [%s - %s] - accepted', field_name, mime_type));
            promise = pipe_to_gridfs(file, mongo, db, mime_type)
                .then(function(grid_store) {
                    return {
                        field: field_name,
                        file_name: grid_store.filename
                    };
                });
        } else {
            debug(util.format('-- validate - [%s - %s] - rejected', field_name, mime_type));
            file.resume();
            promise = Promise.resolve(null);
        }
        return promise;
    }).bind(this);

    var on_field_part = (function (field_name, value) {
        var promise;
        debug('field part: ', field_name, util.inspect(value));
        if (this.acceptFieldName(field_name)) {
            promise = Promise.resolve({
                field: field_name,
                value: value
            });
        } else {
            promise = Promise.resolve(null);
        }
        return promise;
    }).bind(this);

    return new Promise(function(resolve, reject) {
        busboy
            .on('file', function(field_name, file, file_name, encoding, mime_type) {
                parts.push(on_file_part(field_name, file, file_name, encoding, mime_type));
            })
            .on('field', function(field_name, value) {
                parts.push(on_field_part(field_name, value));
            })
            .once('error', function(err) {
                reject(err);
            })
            .once('finish', function() {
                Promise.all(parts)
                    .then(resolve)
                    .catch(reject);
            });
        req.pipe(busboy);
    });
};

module.exports = FormidableGrid;
