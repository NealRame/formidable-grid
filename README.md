Formidable Grid
===============

Parse _form-data_ request and store incoming files in _mongodb_.

## Install

```sh
npm install --save git+https://github.com/NealRame/formidable-grid.git
```

## API

### FormidableGrid(db, mongo[, options])

Constructs a `FormidableGrid`.

**Arguments:**
- `db` _Required_
  > An opened mongodb database instance.

- `mongo` _Required_
  > A mongodb driver.

- `options`
  > See options below for more details.

**Options:**
- `root`
  > The root collection in mongodb to use to store incoming files.
  > Default value is `mongo.GridStore.DEFAULT_ROOT_COLLECTION`.

- `accepted_field_names`
  > An array of `String` or `RegExp`. If that option is provided, each incoming
  > field name must match at least one of these entry to be accepted.

- `accepted_mime_types`
  > An array of `String` or `RegExp`. If that option is provided, each incoming
  > file mime type must match at least one of these entry to be accepted.

### FormidableGrid#parse(req)

Parse a given request.

**Arguments:**
- req, a http request.

**Return:**
- a `Promise` of an `Array` of field or file objects.
  - Field objects are of the form:
```javascript
{
    field: 'the_field_name',
    value: 'the_field_value'
}
```
  - File objets are of the form:
```javascript
{
    field: 'the_field_name',
    file: '554566e43fff918d1fa15422'
}
```

## Example with _**express**_

```js
var express = require('express');
var FormidableGrid = require('formidable-grid');
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
            var form = new FormidableGrid(db, mongo, {
                accepted_field_names: [ /^foo$/ ],    // only handle foo field
                accepted_mime_types: [ /^image\/.*/ ] // only image file
            });
            form.parse(req)
                .then(function(form_data) {
                    res.send(form_data);
                })
                .catch(next);
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
