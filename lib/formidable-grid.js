var _ = require('underscore');
var debug = require('debug')('formidable-grid');
var formidable = require('formidable');
var GridFs = require('gridfs-stream');

var onPart = function(part) {
    var on_data = function(data) {
        debug('-- on_data: length = ' + data.length);
        this.pause();
        stream.write(data);
    };

    var on_end = function() {
        debug('-- store write end');
        part.removeAllListeners();
        stream.once('close', done.bind(this, null));
        stream.end();
    };

    var on_aborted = function() {
        debug('-- request aborted');
        stream.removeAllListeners();
        stream.end();
        this.gridFs.remove({_id: file.id}, function(){
            debug('-- file removed');
        });
    };

    var done = function(err) {
        debug('-- done: err = ' + err);
        stream.removeAllListeners();
        if (err) {
            this._error(err);
        } else {
            this.emit('file', file);
            this._flushing--;
            this._maybeEnd();
        }
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

    var file = {
        id: new this.mongo.ObjectID,
        lastModified: new Date,
        name: part.filename,
        mime: part.mime,
    };

    var stream = this.gridFs.createWriteStream({
        _id: file.id,
        content_type: file.mime,
        filename: file.name,
        mode: 'w',
    });

    this.emit('fileBegin', file);

    stream
        .on('drain',     this.callback(this.resume))
        .once('error',   this.callback(done));
    part
        .on('data',      this.callback(on_data))
        .once('end',     this.callback(on_end));
    this
        .once('aborted', this.callback(on_aborted));
};

var formidableGrid = function(db, mongo, options) {
    if (! db)    throw new Error('Missing db!');
    if (! mongo) throw new Error('Missing mongodb driver!');

    var gridFs_ = GridFs(db, mongo);
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
            gridFs: {
                get: function() { return gridFs_; },
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
