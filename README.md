# @discoveryjs/scan-fs

[![NPM version](https://img.shields.io/npm/v/@discoveryjs/scan-fs.svg)](https://www.npmjs.com/package/@discoveryjs/scan-fs)
[![Twitter](https://img.shields.io/badge/Twitter-@js_discovery-blue.svg)](https://twitter.com/js_discovery)

An utility for seeking files by file system scanning and optionally populating file info with processing their content. It's like a Webpack's loaders but for extracting data from a FS and files.

Is a part of [Discovery.js](https://github.com/discoveryjs) projects.

<!-- TOC depthFrom:2 -->

- [How to use](#how-to-use)
- [API](#api)
    - [scanFs(options): Promise.<Array.<File>>](#scanfsoptions-promisearrayfile)
    - [scanFs.normalizeOptions(options: Object): Object](#scanfsnormalizeoptionsoptions-object-object)
- [Examples](#examples)
- [License](#license)

<!-- /TOC -->

## How to use

Install:

```
npm install @discoveryjs/scan-fs
```

Use:

```js
const scanFs = require('@discoveryjs/scan-fs');

scanFs({ /* options */ }).then(files => {
    // do something with found and processed files
});
```

## API

### scanFs(options): Promise.<Array.<File>>

Main method that returns a promise which resolves in a files list. Files list is an array of File instances. Beside that it has additional fields:

- `errors` a list of some error occuried during scanning and file processing
- `stat` an object with some counters and elapsed time

`options` is an object with fields (all are optional):

- **basedir**

  Type: `String`  
  Default: `process.cwd()`

  Base directory to scan.

- **include**

  Type: `String`, `Array.<String>` or `null`  
  Default: `null`

  A list of directories relative to `basedir`. When used, a scanned file path must starts with one of an directories in the list. It's like a white list of paths. In case when the same path is used in `include` and `exclude`, `include` has priority over `exclude` (i.e. `include` wins).

- **exclude**

  Type: `String`, `Array.<String>` or `null`  
  Default: `null`

  A list of directories relative to `basedir`. When used, a scanned file path must not starts with any of directories in the list. It's like a black list of paths.

  > NOTE: `.git` and `node_modules` paths are including to `exclude` implicitly. To include them into scan just add required paths in `include`.

- **rules**

  Type: `Rule` or `Array.<Rule>`  
  Default: `[{}]`

  Rules define which files should be added to a result and how to process them. When not set no any file will be matched. A first rule that can be applied wins, so other rules are ignoring.

- **onError**

  Type: `function(error)` or `null`  
  Default: `error => console.error('...', error)`

  A handler that is used when an error is occuring during FS scan or file processing. By default errors output in `stderr`, that's can be disabled by passing another function or a falsy value. Errors also can be reached by `errors` field of a result (i.e. `files.errors`).

A **rule** is an object with following fields (all are optional):

- **test**

  Type: `RegExp`, `Array.<RegExp>` or `null`  
  Default: `null`

  A list of RegExps that applies to relative to `options.basedir` path of file.

- **include**

  Type: `String`, `Array.<String>` or `null`  
  Default: `null`

  The same as for `options.include` but applies on a rule level. When used it also populates `options.include`.

- **exclude**

  Type: `String`, `Array.<String>` or `null`  
  Default: `null`

  The same as for `options.exclude` but applies on a rule level.

- **extract**

  Type: `function(file, content, context)` or `Array.<function(file, content, context)>`  
  Default: `[]`

  A list of function that extract some data from a file content. Such function takes three arguments:
  - `file` – an instance of File
  - `content` – a buffer contains content of a file
  - `meta` – object with useful context data:
    - `basedir` – a value of `options.basedir`
    - `stats` – `fs.stats()` result object for processing file
    - `rule` – a normalized rule config that applied

- **only**

  Type: `Boolean`  
  Default: `false`

  When `only` is true only single rule applies. If several rules have truthy value for `only`, then first rule wins. The option is useful for debugging.

### scanFs.normalizeOptions(options: Object): Object

This method is used internally to normalize options, which is reducing checking and potential errors during a FS scan. The method can be useful to understand how `scanFs()` transforms passed options.

## Examples

Find all `package.json` files from `node_modules` and extract `name` and `dependencies` from each one:

```js
const scanFs = require('@discoveryjs/scan-fs');

scanFs({
    include: ['node_modules'],
    rules: [{
        test: /\/package.json$/,
        extract: (file, content) => {
            const pkg = JSON.parse(content);
            file.name = pkg.name;
            file.dependencies = pkg.dependencies;
        }
    }]
}).then(files => {
    files.forEach(file => console.log(file));
});
```

## License

MIT
