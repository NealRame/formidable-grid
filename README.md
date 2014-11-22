Formidable Grid
===============

Store [Formidable](https://github.com/felixge/node-formidable) uploads into
[MongoDB](http://www.mongodb.org)
[GridFS](http://docs.mongodb.org/manual/core/gridfs/?_ga=1.85784351.701162369.1410014968).

## Install

```sh
npm install --save git+https://github.com/NealRame/formidable-grid.git
```

## Usage

The interface is the same as the `formidable` module. Indeed `formidable-grid`
is just an extension of `formidable` to upload directly in a mongodb database.
The `formidableGrid` function returns an instance of `formidable.IncomingForm`.

```js
var formidableGrid = require('formidable-grid');
```

### formidableGrid(db, mongo[, options])

**Arguments:**

- `db` _Required_

  > An opened mongodb database instance.

- `mongo` _Required_

  > A mongodb driver.

- `options`

  > See [options] for more details.

**Options:**

- `accept`

  > An array of `String` or `RegExp`. Each incoming file is accepted if and
  > only if there is at least one entry in the accept list matching its mime
  > type.

**Return:**

A customized `formidable.IncomingForm` object. You don't have to provide a
`onPart` routine. See [Formidable](https://github.com/felixge/node-formidable)
documentation for mode details.

## Example with _**express**_

```js
var express = require('express');
var formidableGrid = require('formidable-grid');
var mongo = require('mongodb');

mongo.MongoClient.connect(
    'mongodb://test:test@127.0.0.1:27017/test',
    {native_parser: true},
    function (err, db) {
        var app = express();

        app.get('/', function(req, res) {
            res.send(
                '<!DOCTYPE html>'
                + '<html>'
                + '<head><title>FormidableGrid app test</title></head>'
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
            var files = [];
            // Create a FormidableGrid parser wich only accept image files.
            var form = formidableGrid(db, mongo, {
                accept: ['image/.*']
            });

            form
                .on('file', files.push.bind(files))
                .once('error', next)
                .once('end', res.send.bind(res, files))
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

        app.listen(3000, function() {
            console.log('Waiting for the end of the world ...');
        });
    }
);
```
