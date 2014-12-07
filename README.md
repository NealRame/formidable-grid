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

  > See **options** below for more details.

**Options:**

- `accept`

  > An array of `String` or `RegExp`. Each incoming file is accepted if and
  > only if there is at least one entry in the accept list matching its mime
  > type.

**Return:**

A customized `formidable.IncomingForm` object. You don't have to provide a
`onPart` routine. See [Formidable](https://github.com/felixge/node-formidable)
documentation for mode details.

### Events

#### file

Emitted whenever a file has been received. The callback will be passed two
parameters: the first is the field name the file is associated with in the
incoming form, the second is an object hash providing informations on the file.

The object hash provides theses attributes:
- `id`: the id of the file in the mongodb database,
- `lastModified`: the date of creation of the file in the database,
- `name`: the name of the file,
- `mime`: the mime type of the file

```js
form.on('file', function(fieldname, file) {
})
```

#### progress

See [formidable](https://github.com/felixge/node-formidable#progress) for more
details.

#### field

See [formidable](https://github.com/felixge/node-formidable#field) for more
details.

#### fileBegin

See [formidable](https://github.com/felixge/node-formidable#filebegin) for more
details.

#### error

See [formidable](https://github.com/felixge/node-formidable#error) for more
details.

#### aborted

See [formidable](https://github.com/felixge/node-formidable#aborted) for more
details.

#### end

See [formidable](https://github.com/felixge/node-formidable#end) for more
details.

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
            // Create a FormidableGrid parser wich only accept image files.
            var form = formidableGrid(db, mongo, {
                accept: ['image/.*']
            });
            var files = [];

            form
                .on('file', function(name, file) {
                    console.log('-> ' + name);
                    files.push(files);
                })
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
