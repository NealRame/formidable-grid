var _ = require('underscore');
var debug = require('debug')('formidable-grid');
var formidable = require('formidable');

var onPart = function(part) {
    var done = function(err) {
        debug('-- done: err = ' + err);
        stream.removeAllListeners();
        if (err) {
            this._error(err);
        } else {
            this.emit('file', part.name, file);
            this._flushing--;
            this._maybeEnd();
        }
    };

    var on_data = function(data) {
        debug('-- on_data: length = ' + data.length);
        this.pause();
        stream.write(data);
    };

    var on_end = function() {
        debug('-- store write end');
        part.removeAllListeners();
        stream.end();
    };

    var on_aborted = function() {
        debug('-- request aborted');
        stream.removeAllListeners();
        stream.end();
        this.mongo.GridStore.unlink(this.db, file.id, function() {
            debug('-- file removed');
        });
    };

    // this is set to the formidable.IncomingForm object
    if (! part.filename) {
        return this.handlePart(part);
    }

    if (! this.accept(part.mime)) {
        return this._error(_.extend(
            new Error('Unsupported Media Type'),
            {status: 415}
        ));
    }

    // used by formidable in order to determine if the end is reached
    this._flushing++;
    this.emit('fileBegin', file);

    var file = {
        id: new this.mongo.ObjectID(),
        lastModified: new Date(),
        name: part.filename,
        mime: part.mime,
    };
    var grid_store = new this.mongo.GridStore(this.db, file.id, file.name, 'w', {
        content_type: file.mime
    });
    var stream = grid_store.stream();

    debug('-- Start part streaming to grid store');

    stream
        .on('drain',     this.callback(this.resume))
        .once('error',   this.callback(done))
        .once('end', this.callback(done));
    part
        .on('data',      this.callback(on_data))
        .once('end',     this.callback(on_end));
    this
        .once('aborted', this.callback(on_aborted));
};

var formidableGrid = function(db, mongo, options) {
    if (! db)    throw new Error('Missing db!');
    if (! mongo) throw new Error('Missing mongodb driver!');

    var accept_ = _.filter(
        (options ? options.accept : []) || [],
        function(item) {
            return _.isString(item) || _.isRegExp(item);
        }
    );

    return Object.create(
        new formidable.IncomingForm,
        {
            mongo: {
                get: function() { return mongo; },
                configurable: false
            },
            db: {
                get: function() { return db; },
                configurable: false
            },
            accept: {
                value: function(type) {
                    if (_.isString(type)) {
                        if (accept_.length > 0) {
                            return _.some(accept_, function(filter) {
                                return type.match(filter);
                            });
                        }
                        return true;
                    }
                },
                configurable: false
            },
            onPart: {
                value: onPart,
                configurable: false
            },
            callback: {
                value: function(fn) { return fn.bind(this); },
                configurable: false
            }
        }
    );
};

module.exports = formidableGrid;
