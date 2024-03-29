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

Main method that scans a file system for files and symlinks, returns an object with the following fields:

- `basedir` - a directory path which is using to make an absolute path for files and symlinks
- `files` – a list of files that meet a path requirements and match to one of rules if any
- `symlinks` – a list of symlinks that meet a path requirements
- `errors` – a list of errors occuried during file processing or symlink resolving
- `pathsScanned` – a number of paths which was examinated during a scanning
- `filesTested` – a number of file paths which was examinated by rules

A value of `options` parameter is a string (which equivalent to `{ basedir: <string> }` object) or an object with all optional fields:

> Note: `options` argument is also optional which equivalent to a call `scanFs({})` or `scanFs({ basedir: process.pwd() })`.

- **basedir**

  Type: `string`  
  Default: `process.cwd()`

  Base directory to scan and resolve paths to. All the paths in a result are relative to `basedir`.

- **include**

  Type: `string`, `string[]` or `null`  
  Default: `null`

  A list of directories to scan relative to `basedir`. When used, a scanned file path must start with one of the directories from the list. `include` has priority over `exclude` option, i.e. `include` wins when the same path is used in `include` and `exclude` options. Paths should be specified in POSIX disregarding of used operating system.

- **exclude**

  Type: `string`, `string[]` or `null`  
  Default: `null`

  A list of directories to avoid scan relative to `basedir`. When used, a file relative path must not start with any of the directories from the list. Paths should be specified in POSIX disregarding of used operating system.

- **rules**

  Type: `Rule` or `Rule[]`  
  Default: `[{}]`

  `rules` defines which files should be added to a result and how to process them. When not set no any file will be matched. A first rule that can be applied wins, so other rules are skipping.

- **resolveSymlinks**

  Type: `boolean`  
  Default: `false`

  Try to resolve the canonical pathname for symbolic links, the result is storing in `realpath` of `Symlink`. In case a resolving is failed or disabled the `realpath` field will contain `null`. On failure, an error is emitting with reason `resolve-symlink`.

- **onError**

  Type: `function(error)` or `null`  
  Default: `null`

  A handler that is used when an error is occuring during FS scan or file processing. By default nothing happens, but adds to errors `array` which can be reached by `errors` field of a result.

A **rule** is an object with following fields (all are optional):

- **test**

  Type: `RegExp`, `RegExp[]` or `null`  
  Default: `null`

  A list of RegExps that applies to a POSIX path relative to `options.basedir`.

- **include**

  Type: `string`, `string[]` or `null`  
  Default: `null`

  The same as for `options.include` but applies on a rule's level. When used it also populates `options.include`.

- **exclude**

  Type: `string`, `string[]` or `null`  
  Default: `undefnullined`

  The same as for `options.exclude` but applies on a rule's level.

- **extract**

  Type: `function(file: File, content: string, rule: MatchRule)`  
  Default: `undefined`

  A function that extract some data from a file content. Such a function receives three arguments:

  - `file` – an instance of `File`
  - `content` – a string or `Buffer` (depends on `encoding` option, see below) which contain a content of file
  - `rule` – rule object with normalized options and `basedir` (as a value of `options.basedir`)

  On failure, an error is emitting with reason `extract`.

- **encoding**

  Type: `BufferEncoding` or `null`  
  Default: `'utf8'`

  Specifies an enconding for `content` parameter of `extract` callback when used. Allowed values are the same as for Node.js's `Buffer` (see [Buffers and character encodings](https://nodejs.org/docs/latest-v18.x/api/buffer.html#buffers-and-character-encodings)). When option value is set to `null`, the value of `content` is `Buffer` instead of string

- **only**

  Type: `boolean`  
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
  encoding?: BufferEncoding | null;
};
type Options = {
  basedir?: string;
  include?: string | string[];
  exclude?: string | string[];
  rules?: Rule | Rule[];
  resolveSymlinks?: boolean;
  onError?: boolean | ((error: Error) => void);
};

type AcceptCallback = (relpath: string) => boolean;
type ExtractCallback = (file: File, content: string | Buffer, rule: MatchRule) => void;
type MatchRule = {
  basedir: string;
  accept: AcceptCallback;
  extract: ExtractCallback | null;
  encoding: BufferEncoding | null;
  config: Rule;
  test: RegExp[] | null;
  include: string[] | null;
  exclude: string[] | null;
};
type NormalizedOptions = {
  basedir: string;
  include: string[];
  exclude: string[];
  rules: MatchRule[];
  resolveSymlinks: boolean;
  onError: (error: Error) => void;
};

type ScanResult = {
  basedir: string;
  files: File[];
  symlinks: Symlink[];
  errors: ScanError[];
  pathsScanned: number;
  filesTested: number;
};

type File = {
  path: string;
  posixPath: string;
  errors?: Array<{ message: string; details: any }>;
  error(message: string, details: any): void;
};
type Symlink = {
  path: string;
  posixPath: string;
  realpath: string | null;
};
type ScanError = Error & {
  reason: 'resolve-symlink' | 'extract';
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
