const fsPromise = require('fs/promises');
const path = require('path');

class File {
    constructor(relpath) {
        this.path = relpath;
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

function scanError(reason, path, error) {
    error.reason = reason;
    error.path = path;
    error.toJSON = () => {
        return {
            reason,
            path,
            message: String(error)
        };
    };

    return error;
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

function composeAccept(first, second) {
    return first
        ? (fullpath, relpath) => first(fullpath, relpath) && second(fullpath, relpath)
        : second;
}

function normalizeOptions(options) {
    const basedir = path.resolve(options.basedir || process.cwd());
    const generalInclude = new Set(
        ensureArray(options.include)
            .map(dir => path.resolve(basedir, dir))
    );
    const generalExclude = new Set(
        ensureArray(options.exclude)
            .map(dir => path.resolve(basedir, dir))
    );
    const onError = 'onError' in options === false
        ? err => console.error('[@discoveryjs/scan-fs] Error:', err)
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
                let accept = null;

                if (rule.test) {
                    test = ensureArray(rule.test).slice();

                    if (!test.every(isRegExp)) {
                        throw new Error('rule.test should be a RegExp or array of RegExp');
                    }

                    accept = (relpath) => {
                        for (const rx of test) {
                            if (rx.test(relpath)) {
                                return true;
                            }
                        }

                        return false;
                    };
                }

                if (rule.include) {
                    include = ensureArray(rule.include);

                    if (!include.every(isString)) {
                        throw new Error('rule.include should be a string or array of strings');
                    }

                    include = include.map(dir => {
                        dir = path.resolve(basedir, dir);

                        let cursor = dir;
                        while (cursor !== basedir) {
                            // FIXME: include should be added only for rules
                            // with such includes not all the rules
                            generalInclude.add(cursor);
                            cursor = path.dirname(cursor);
                        }

                        return dir;
                    });

                    accept = composeAccept(accept, (fullpath) => {
                        for (const dir of include) {
                            if (fullpath == dir || fullpath.startsWith(dir + '/')) {
                                return true;
                            }
                        }

                        return false;
                    });
                }

                if (rule.exclude) {
                    exclude = ensureArray(rule.exclude);

                    if (!exclude.every(isString)) {
                        throw new Error('rule.exclude should be a string or array of strings');
                    }

                    exclude = exclude.map(dir => path.resolve(basedir, dir));

                    accept = composeAccept(accept, (fullpath) => {
                        for (const dir of exclude) {
                            if (fullpath === dir || fullpath.startsWith(dir + '/')) {
                                return false;
                            }
                        }

                        return true;
                    });
                }

                if (typeof rule.extract === 'function') {
                    extract = rule.extract;
                } else if (rule.extract) {
                    throw new Error('rule.extract should be a function');
                }

                return Object.freeze({
                    ...rule,
                    test,
                    include,
                    exclude,
                    accept,
                    extract
                });
            });

    // include has a priority over exclude
    generalInclude.forEach(dir => generalExclude.delete(dir));

    return {
        basedir,
        include: [...generalInclude],
        exclude: [...generalExclude],
        onError,
        rules
    };
}

function scanFs(options) {
    async function collect(basedir, absdir, reldir, files) {
        const tasks = [];

        for (const dirent of await fsPromise.readdir(absdir, { withFileTypes: true })) {
            const relpath = reldir + dirent.name;
            const fullpath = absdir + dirent.name;

            pathsScanned++;

            if (exclude.includes(fullpath)) {
                continue;
            }

            if (dirent.isDirectory()) {
                tasks.push(collect(basedir, fullpath + path.sep, relpath + path.sep, files));
                continue;
            }

            if (dirent.isSymbolicLink()) {
                tasks.push(fsPromise.realpath(fullpath)
                    .then(realpath => {
                        symlinks.push({
                            path: relpath,
                            realpath
                        });
                    })
                    .catch(error => {
                        errors.push(error = scanError('resolve-symlink', fullpath, error));
                        onError(error);
                    })
                );
                continue;
            }

            filesTested++;

            for (const rule of rules) {
                if (rule.accept && !rule.accept(relpath, fullpath)) {
                    continue;
                }

                const file = new File(relpath);

                files.push(file);

                if (rule.extract !== null) {
                    tasks.push(fsPromise.readFile(fullpath, 'utf8')
                        .then(content => rule.extract(file, content, {
                            basedir,
                            path: fullpath,
                            rule
                        }))
                        .catch(error => {
                            errors.push(error = scanError('extract', fullpath, error));
                            onError(error);
                        })
                    );
                }

                break;
            }
        }

        return tasks.length > 0 ? Promise.all(tasks) : Promise.resolve();
    }

    const files = [];
    const symlinks = [];
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

    if (!include.length) {
        include.push(basedir);
    } else {
        exclude.push(...include);
    }

    return Promise.all(include.map(dir =>
        collect(basedir, dir + path.sep, '', files)
    )).then(() =>
        Object.assign(files, {
            symlinks,
            errors,
            stat: {
                pathsScanned,
                filesTested,
                filesMatched: files.length,
                errors: errors.length,
                time: Date.now() - startTime
            }
        })
    );
};

module.exports = scanFs;
module.exports.normalizeOptions = normalizeOptions;
