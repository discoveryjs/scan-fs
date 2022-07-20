# @discoveryjs/scan-fs

[![NPM version](https://img.shields.io/npm/v/@discoveryjs/scan-fs.svg)](https://www.npmjs.com/package/@discoveryjs/scan-fs)
[![Build](https://github.com/discoveryjs/scan-fs/actions/workflows/build.yml/badge.svg)](https://github.com/discoveryjs/scan-fs/actions/workflows/build.yml)
[![Coverage Status](https://coveralls.io/repos/github/discoveryjs/scan-fs/badge.svg?branch=master)](https://coveralls.io/github/discoveryjs/scan-fs?branch=master)
[![Twitter](https://img.shields.io/badge/Twitter-@js_discovery-blue.svg)](https://twitter.com/js_discovery)

An utility for seeking files by file system scanning and optionally populating file info with processing their content. It's like a Webpack's loaders but for extracting data from a FS and files.

Is a part of [Discovery.js](https://github.com/discoveryjs) projects.

<!-- TOC depthFrom:2 -->

- [How to use](#how-to-use)
- [API](#api)
  - [scanFs(options?: Options | string): Promise\<ScanResult>](#scanfsoptions-options--string-promisescanresult)
  - [normalizeOptions(options: Options | string = {}): NormalizedOptions](#normalizeoptionsoptions-options--string---normalizedoptions)
  - [Types](#types)
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
import { scanFs } from '@discoveryjs/scan-fs';
// or const { scanFs } = require('@discoveryjs/scan-fs')

const { files, symlinks, errors } = scanFs({
  /* options */
});
```

## API

### scanFs(options?: Options | string): Promise<ScanResult>

Main method that scans a file system for files and returns a promise which resolves in a files list. Files list is an array of `File` instances. Beside that it has additional fields:

- `errors` a list of some error occuried during scanning and file processing
- `stat` an object with some counters and elapsed time

`options` is a string (which transforms into `{ basedir: <string> }`) or an object with all optional fields:

> Note: `options` argument is also optional which equivalent to a call `scanFs({})` or `scanFs({ basedir: process.pwd() })`.

- **basedir**

  Type: `string`  
  Default: `process.cwd()`

  Base directory to scan. All the paths in a result are relative to `basedir`.

- **include**

  Type: `string`, `string[]` or `null`  
  Default: `null`

  A list of directories to scan, relative to `basedir`. When used, a scanned file path must start with one of the directories from the list. In case when the same path is used in `include` and `exclude`, `include` has priority over `exclude` (i.e. `include` wins).

- **exclude**

  Type: `string`, `string[]` or `null`  
  Default: `null`

  A list of directories to avoid scan, relative to `basedir`. When used, a scanned file path must not start with any of the directories from the list.

- **rules**

  Type: `Rule` or `Rule[]`  
  Default: `[{}]`

  `rules` defines which files should be added to a result and how to process them. When not set no any file will be matched. A first rule that can be applied wins, so other rules are skipping.

- **onError**

  Type: `function(error)` or `null`  
  Default: `error => console.error('...', error)`

  A handler that is used when an error is occuring during FS scan or file processing. By default errors output in `stderr`, that's can be disabled by passing another function or a falsy value. Errors also can be reached by `errors` field of a result (i.e. `files.errors`).

A **rule** is an object with following fields (all are optional):

- **test**

  Type: `RegExp`, `RegExp[]` or `null`  
  Default: `null`

  A list of RegExps that applies to relative to `options.basedir` path of file.

- **include**

  Type: `string`, `string[]` or `null`  
  Default: `null`

  The same as for `options.include` but applies on a rule level. When used it also populates `options.include`.

- **exclude**

  Type: `string`, `string[]` or `null`  
  Default: `null`

  The same as for `options.exclude` but applies on a rule level.

- **extract**

  Type: `function(file: File, content: string, rule: MatchRule)`  
  Default: `[]`

  A list of function that extract some data from a file content. Such function takes three arguments:

  - `file` – an instance of `File`
  - `content` – a buffer contains content of a file
  - `rule` – rule object with normalized options and `basedir` (as a value of `options.basedir`)

- **only**

  Type: `Boolean`  
  Default: `false`

  When `only` is true only single rule applies. If several rules have truthy value for `only`, then first rule wins. The option is useful for debugging.

### normalizeOptions(options: Options = {}): NormalizedOptions

This method is used internally to normalize options, which is reducing checking and potential errors during a FS scan. The method can be useful to understand how `scanFs()` transforms passed options.

### Types

```ts
type Rule = {
  only?: boolean;
  test?: RegExp | RegExp[];
  include?: string | string[];
  exclude?: string | string[];
  extract?: ExtractCallback;
};
type Options = {
  posix?: boolean;
  basedir?: string;
  include?: string | string[];
  exclude?: string | string[];
  rules?: Rule | Rule[];
  onError?: boolean | ((error: Error) => void);
};

type AcceptCallback = (relpath: string) => boolean;
type ExtractCallback = (file: File, content: string, rule: MatchRule) => void;
type MatchRule = {
  basedir: string;
  accept: AcceptCallback;
  extract: ExtractCallback | null;
  config: Rule;
  test: RegExp[] | null;
  include: string[] | null;
  exclude: string[] | null;
};
type NormalizedOptions = {
  posix: boolean;
  basedir: string;
  include: string[];
  exclude: string[];
  onError: (error: Error) => void;
  rules: MatchRule[];
};

type ScanResult = {
  files: File[];
  symlinks: Symlink[];
  errors: ScanError[];
  pathsScanned: number;
  filesTested: number;
};

type File = {
  path: string;
  errors?: Array<{ message: string; details: any }>;
  error(message: string, details: any): void;
};
type Symlink = {
  path: string;
  realpath: string | null;
};
type ScanError = Error & {
  reason: string;
  path: string;
  toJSON(): { reason: string; path: string; message: string };
};
```

## Examples

Find all `package.json` files from `node_modules` and extract `name` and `dependencies` from each one:

```js
import { scanFs } from '@discoveryjs/scan-fs';

const { files } = await scanFs({
  exclude: ['.git', 'node_modules'],
  rules: [
    {
      test: /\/package.json$/,
      extract(file, content) {
        const pkg = JSON.parse(content);
        file.name = pkg.name;
        file.dependencies = pkg.dependencies;
      }
    }
  ]
});

for (const file of files) {
  console.log(file);
}
```

## License

MIT
