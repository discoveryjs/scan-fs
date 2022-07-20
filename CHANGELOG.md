## next

- Allowed to pass a string value as an options, it's equivalent to `{ basedir: <string> }`
- Fixed `scanFs()` definition to allow omitting of `options` argument
- Changed `scanFs()` to return a plain object instead of `File[]` with additional fields

  ```js
  // before
  const files = await scanFs(...)
  console.log(files, files.symlinks);

  // after
  const { files, symlinks } = await scanFs(...)
  console.log(files, symlinks);
  ```

- Replaced `stat` object in `scanFs()` result with fields `pathsScanned` and `filesTested`
- Rename `NormRule` type into `MatchRule`
- Added `ScanResult` type to define returning type of `scanFs()`

## 3.0.0 (2022-06-09)

- Added TypeScript typings (rewritten in TypeScript)
- Converted to ES modules. However, CommonJS is supported as well (dual module)
- Changed exporting for main function from `require('@discoveryjs/scan-fs')` into `require('@discoveryjs/scan-fs').scanFs`
- Used `Symlink` internal class for symlinks entries
- Allowed `scanFn()` invocation with no options
- Fixed path building when `include` option is used

## 2.0.0 (2022-04-26)

- Boosted performance up to 3-4 times
- Changed bahaviour of `basedir` to use a single include path when `include` is not provided
- Changed `extract` option for a file rule to not accept an array of functions
- Removed exclusion for `node_modules` and `.git` paths by default
- Added `symlinks` and `errors` fields to result
- Removed `size` field in a file entry
- Various fixes and improvements

## 1.0.0 (2019-09-07)

- Initial release
