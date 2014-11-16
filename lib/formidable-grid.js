var debug = require('debug')('formidable-grid');
var formidable = require('formidable');
var GridFs = require('gridfs-stream');

var onPart = function(part) {
    // this is set to the formidable.IncomingForm object
    if (! part.filename) {
        return this.handlePart(part);
    }

    // used by formidable in order to determine if the end is reached
    this._flushing++;

    var file = {
        id: new this.mongo.ObjectID,
        lastModified: new Date,
        name: part.filename,
        mime: part.mime
    };

    var stream = this.gridFs.createWriteStream({
        _id: file.id,
        content_type: file.mime,
        filename: file.name,
        mode: 'w',
    });

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

    var done = function(err) {
        debug('-- done: err = ' + err);
        stream.removeAllListeners();
        if (err) {
            this.emit('error', err);
        } else {
            this.emit('file', file);
            this._flushing--;
            this._maybeEnd();
        }
    };

    this.emit('fileBegin', file);

    stream
        .on('drain', this.callback(this.resume))
        .once('error', this.callback(done));
    part
        .on('data', this.callback(on_data))
        .once('end', this.callback(on_end));
};

var formidableGrid = function(options) {
    if (! options.db)    throw new Error('Missing db!');
    if (! options.mongo) throw new Error('Missing mongodb driver!');

    var db = options.db;
    var mongo = options.mongo;

    return Object.create(
        new formidable.IncomingForm,
        {
            mongo: {
                get: function() { return mongo; },
                configurable: false
            },
            gridFs: {
                value: GridFs(db, mongo),
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
