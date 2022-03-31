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
    const basedir = path.resolve(options.basedir || process.cwd());
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
                    test = ensureArray(rule.test).slice();

                    if (!test.every(isRegExp)) {
                        throw new Error('rule.test should be a RegExp or array of RegExp');
                    }
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
                }

                if (rule.exclude) {
                    exclude = ensureArray(rule.exclude);

                    if (!exclude.every(isString)) {
                        throw new Error('rule.exclude should be a string or array of strings');
                    }

                    exclude = exclude.map(dir => path.resolve(basedir, dir));
                }

                extract = ensureArray(rule.extract).slice();
                if (!extract.every(isFunction)) {
                    throw new Error('rule.extract should be a function or array of functions');
                }

                return Object.freeze({
                    ...rule,
                    test,
                    include,
                    exclude,
                    extract
                });
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
    async function collect(dir, files = []) {
        const tasks = [];

        for (const dirent of await fsPromise.readdir(dir, { withFileTypes: true })) {
            const fullpath = path.join(dir, dirent.name);
            const relpath = path.relative(basedir, fullpath);
            const pathCheck = dir => fullpath === dir || fullpath.startsWith(dir + '/');

            pathsScanned++;

            if (include && !include.some(pathCheck)) {
                continue;
            }

            if (exclude && exclude.some(pathCheck)) {
                continue;
            }

            if (dirent.isDirectory()) {
                tasks.push(collect(fullpath, files));
                continue;
            }

            if (dirent.isSymbolicLink()) {
                tasks.push(fsPromise.realpath(fullpath).then(realpath => {
                    symlinks.push({
                        path: relpath,
                        realpath
                    });
                }));
                continue;
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

                const file = new File(relpath);

                files.push(file);

                if (rule.extract.length) {
                    tasks.push(fsPromise.readFile(fullpath, 'utf8').then(async content => {
                        for (const extractor of rule.extract) {
                            try {
                                await extractor(file, content, {
                                    basedir,
                                    path: fullpath,
                                    rule
                                });
                            } catch (extractError) {
                                errors.push(extractError);
                                onError(extractError);
                            }
                        }
                    }).catch(error => {
                        errors.push(error);
                        onError(error);
                    }));
                }

                break;
            }
        }

        return Promise.all(tasks);
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

    return collect(basedir, files).then(() =>
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
