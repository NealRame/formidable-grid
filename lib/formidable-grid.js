var _ = require('underscore');
var debug = require('debug')('formidable-grid');
var Busboy = require('busboy');
var GridFs = require('gridfs');
var util = require('util');

function make_validator(filters) {
    if (_.isArray(filters) && ! _.isEmpty(filters)) {
        var validators = _.map(filters, make_validator.bind(null));
        return function(str) {
            return _.some(validators, function(validator) {
                return validator(str);
            });
        };
    }

    if (_.isRegExp(filters)) {
        return function(str) {
            debug(util.format('   try with %s', filters.toString()));
            return filters.test(str);
        };
    }

    if (_.isString(filters)) {
        return function(str) {
            debug(util.format('   try with %s', filters));
            return str === filters;
        };
    }

    return function(str) {
        return true;
    };
}

function handle_file_part(field_name, file, file_name, encoding, mime_type) {
    var self = this;
    var promise;
    debug(util.format('-- handle file part ["%s", %s]', field_name, mime_type));
    if (this.acceptFieldName(field_name) && this.acceptMimeType(mime_type)) {
        promise = new Promise(function(resolve, reject) {
            var gfs = new GridFs(self.mongo, self.db, self.root);
            var id = new self.mongo.ObjectID();
            var ostream = gfs.createWriteStream(id, {
                content_type: mime_type,
            });
            debug(util.format('-- start streaming to: "%s"'), id.toString());
            ostream
                .once('end', function() {
                    debug(util.format('-- stop streaming to: "%s"', id.toString()));
                    ostream.gs.close(function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            resolve({
                                field: field_name,
                                value: id.toString(),
                            });
                        }
                    });
                })
                .once('error', reject);
            file.pipe(ostream);
            file.resume();
        });
    } else {
        debug(util.format('-- ["%s", "%s"] - rejected', field_name, mime_type));
        file.resume();
        promise = Promise.resolve(null);
    }
    return promise;
}

function handle_field_part(field_name, value) {
    var promise;
    debug(util.format('-- handle field part "%s"', field_name));
    if (this.acceptFieldName(field_name)) {
        promise = Promise.resolve({
            field: field_name,
            value: value
        });
    } else {
        debug(util.format('-- "%s" - rejected', field_name));
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

    var field_name_validator = make_validator(options.accepted_field_names);
    var mime_type_validator = make_validator(options.accepted_mime_types);

    this.acceptFieldName = function(str) {
        debug(util.format('-- validate field name "%s"', str));
        return field_name_validator(str);
    };

    this.acceptMimeType = function(str) {
        debug(util.format('-- validate mime type "%s"', str));
        return mime_type_validator(str);
    };
}

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
