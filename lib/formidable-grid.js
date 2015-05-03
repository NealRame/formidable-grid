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

function handle_file_part(field_name, file, file_name, encoding, mime_type) {
    var promise;
    debug('-- handle file part', field_name, file_name, encoding, mime_type);
    if (this.acceptFieldName(field_name) && this.acceptMimeType(mime_type)) {
        debug(util.format('-- validate - [%s - %s] - accepted', field_name, mime_type));

        var gfs = new GridFs(this.mongo, this.db, this.root);
        var id = new this.mongo.ObjectID();
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
}

function handle_field_part(field_name, value) {
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
}

function FormidableGrid(db, mongo, options) {
    if (! db)    throw new Error('Missing db!');
    if (! mongo) throw new Error('Missing mongodb driver!');

    options = options || {};

    Object.defineProperty(this, 'mongo', {
        get: function() {
            return mongo;
        }
    });
    Object.defineProperty(this, 'db', {
        get: function() {
            return db;
        }
    });
    Object.defineProperty(this, 'root', {
        get: function() {
            return options.root;
        }
    });
    this.acceptFieldName = make_validator('field name', options.accepted_field_names);
    this.acceptMimeType = make_validator('mime type', options.accepted_mime_types);
};

FormidableGrid.prototype.parse = function(req) {
    var self = this;
    var busboy = new Busboy({headers: req.headers});
    var parts = [];

    return new Promise(function(resolve, reject) {
        busboy
            .on('file', function() {
                parts.push(handle_file_part.apply(self, arguments));
            })
            .on('field', function() {
                parts.push(handle_field_part.apply(self, arguments));
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
