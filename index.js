const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readdirPromise = promisify(fs.readdir);
const readFilePromise = promisify(fs.readFile);
const statPromise = promisify(fs.stat);

class File {
    constructor(filename, size) {
        this.filename = filename;
        this.size = size;
        this.errors = undefined;
    }

    error(message, details) {
        if (!Array.isArray(this.errors)) {
            this.errors = [];
        }

        this.errors.push({
            message: String(message),
            details
        });
    }
}

function ensureArray(value, fallback) {
    if (Array.isArray(value)) {
        return value;
    }

    return value ? [value] : fallback || [];
}

function isRegExp(value) {
    return value instanceof RegExp;
}

function isString(value) {
    return typeof value === 'string';
}

function isFunction(value) {
    return typeof value === 'function';
}

function normalizeOptions(options) {
    const basedir = options.basedir || process.cwd();
    const generalInclude = new Set(
        ensureArray(options.include)
            .map(dir => path.resolve(basedir, dir))
    );
    const generalExclude = new Set(
        ensureArray(options.exclude)
            .concat(['.git', 'node_modules'])
            .map(dir => path.resolve(basedir, dir))
    );
    const onError = 'onError' in options === false
        ? err => console.error('[@discovery/scan-fs] Error:', err)
        : isFunction(options.onError)
            ? options.onError
            : () => {};

    const rawRules = ensureArray(options.rules).filter(Boolean);
    const onlyRule = rawRules.find(rule => rule.only);
    const rules =
        (onlyRule ? [onlyRule] : rawRules.length ? rawRules : [{}])
            .map(rule => {
                let test = null;
                let include = null;
                let exclude = null;
                let extract = null;

                if (rule.test) {
                    test = Object.freeze(ensureArray(rule.test));

                    if (!test.every(isRegExp)) {
                        throw new Error('rule.test should be a RegExp or array of RegExp');
                    }
                }

                if (rule.include) {
                    include = ensureArray(rule.include);

                    if (!include.every(isString)) {
                        throw new Error('rule.include should be a string or array of strings');
                    }

                    include = Object.freeze(
                        include.map(dir => {
                            dir = path.resolve(basedir, dir);

                            let cursor = dir;
                            while (cursor !== basedir) {
                                // FIXME: include should be added only for rules
                                // with such includes not all the rules
                                generalInclude.add(cursor);
                                cursor = path.dirname(cursor);
                            }

                            return dir;
                        })
                    );
                }

                if (rule.exclude) {
                    exclude = ensureArray(rule.exclude);

                    if (!exclude.every(isString)) {
                        throw new Error('rule.exclude should be a string or array of strings');
                    }

                    exclude = Object.freeze(
                        exclude.map(dir => path.resolve(basedir, dir))
                    );
                }

                extract = Object.freeze(ensureArray(rule.extract));
                if (!extract.every(isFunction)) {
                    throw new Error('rule.extract should be a function or array of functions');
                }

                return Object.freeze(Object.assign({}, rule, {
                    test,
                    include,
                    exclude,
                    extract
                }));
            });

    // include has a priority over exclude
    generalInclude.forEach(dir => generalExclude.delete(dir));

    return {
        basedir,
        include: generalInclude.size ? [...generalInclude] : null,
        exclude: generalExclude.size ? [...generalExclude] : null,
        onError,
        rules
    };
}

function scanFs(options) {
    function collect(dir) {
        return readdirPromise(dir).then(files =>
            Promise.all(files.map(fn => {
                const fullpath = path.join(dir, fn);
                const relpath = path.relative(basedir, fullpath);
                const pathCheck = dir => fullpath === dir || fullpath.startsWith(dir + '/');

                pathsScanned++;

                if (include && !include.some(pathCheck)) {
                    return;
                }

                if (exclude && exclude.some(pathCheck)) {
                    return;
                }

                return statPromise(fullpath).then(stats => {
                    if (stats.isDirectory()) {
                        return collect(fullpath);
                    }

                    filesTested++;

                    for (let rule of rules) {
                        if (rule.test && !rule.test.some(rx => rx.test(relpath))) {
                            continue;
                        }

                        if (rule.include && !rule.include.some(pathCheck)) {
                            continue;
                        }

                        if (rule.exclude && rule.exclude.some(pathCheck)) {
                            continue;
                        }

                        const file = new File(
                            relpath,
                            stats.size
                        );

                        result.push(file);

                        if (rule.extract.length) {
                            return readFilePromise(fullpath, 'utf8')
                                .then(content =>
                                    rule.extract.forEach(fn => fn(file, content, {
                                        basedir,
                                        stats,
                                        rule
                                    }))
                                )
                                .catch(error => {
                                    errors.push(error);
                                    onError(error);
                                });
                        }
                    }
                }).catch(() => { /* ignore errors */ });
            }).filter(Boolean))
        ).catch(error => {
            errors.push(error);
            onError(error);
        });
    }

    const result = [];
    const errors = [];
    const startTime = Date.now();
    const {
        basedir,
        include,
        exclude,
        onError,
        rules
    } = normalizeOptions(options);
    let pathsScanned = 0;
    let filesTested = 0;

    return collect(basedir).then(() =>
        Object.assign(result, {
            errors: errors,
            stat: {
                pathsScanned,
                filesTested,
                filesMatched: result.length,
                time: Date.now() - startTime
            }
        })
    );
};

module.exports = scanFs;
module.exports.normalizeOptions = normalizeOptions;
