## next

- Added TypeScript typings (rewritten in TypeScript)
- Converted to ES modules. However, CommonJS is supported as well (dual module)
- Changed exporting for main function from `require('@discoveryjs/scan-fs')` into `require('@discoveryjs/scan-fs').scanFs`
- Used `Symlink` internal class for symlinks entries
- Allowed `scanFn()` invocation with no options

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
