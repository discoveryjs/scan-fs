## 4.0.0 (2024-03-15)

- Allowed to pass a string value as an options, it's equivalent to `{ basedir: <string> }`
- Fixed `scanFs()` definition to allow omitting of `options` argument
- Added `resolveSymlinks` option to enable symlink resolving, a symlink resolving is disabled by default
- Added `posixPath` field to `File` and `Symlink` interfaces
- Added `encoding` option for `Rule` to specify an encoding for a file content
- Changed rule's `test` option to apply to POSIX paths disregarding of operating system used
- Changed `include` and `exclude` options to take POSIX paths disregarding of operating system used which are supposed to be relative to `basedir`
- Changed a returning value of `scanFs()`:
  - Added `basedir` field
  - Replaced `stat` object with fields `pathsScanned` and `filesTested`
  - Return a plain object instead of `File[]` array with additional fields
      ```js
      // before
      const files = await scanFs(...)
      console.log(files, files.symlinks);

      // after
      const { files, symlinks } = await scanFs(...)
      console.log(files, symlinks);
      ```
- Renamed `NormRule` type into `MatchRule`
- Added `ScanResult` type to define returning type of `scanFs()`
- Removed output errors to console by default

## 4.0.0-rc.1 (2022-09-08)

See changes in [4.0.0](#400-2024-03-15)

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
