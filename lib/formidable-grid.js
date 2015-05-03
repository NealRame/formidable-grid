var _ = require('underscore');
var debug = require('debug')('formidable-grid');
var Busboy = require('busboy');
var GridFs = require('gridfs');
var util = require('util');

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

            var gfs = new GridFs(mongo, db);
            var id = new mongo.ObjectID();
            var ostream = gfs.createWriteStream(id, {
                content_type: mime_type,
            });

            promise = new Promise(function(resolve, reject) {
                ostream
                    .once('end', resolve.bind(null, {
                        field: field_name,
                        file: id.toString(),
                    }))
                    .once('error', reject);
                file.pipe(ostream);
                file.resume();
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
