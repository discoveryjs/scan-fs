import { promises as fsPromise } from 'fs';
import * as path from 'path';

export type ScanError = Error & {
    reason: string;
    path: string;
    toJSON(): { reason: string; path: string; message: string };
};
export type AcceptCallback = (relpath: string) => boolean;
export type ExtractCallback = (file: File, content: string, rule: NormRule) => void;
export type Rule = {
    only?: boolean;
    test?: RegExp | RegExp[];
    include?: string | string[];
    exclude?: string | string[];
    extract?: ExtractCallback;
};
export type NormRule = {
    basedir: string;
    config: Rule;
    test: RegExp[] | null;
    include: string[] | null;
    exclude: string[] | null;
    accept: AcceptCallback;
    extract: ExtractCallback | null;
};
export type Options = {
    posix?: boolean;
    basedir?: string;
    include?: string | string[];
    exclude?: string | string[];
    rules?: Rule | Rule[];
    onError?: boolean | ((error: Error) => void);
};

export class File {
    path: string;
    errors?: Array<{ message: string; details: any }>;

    constructor(relpath: string) {
        this.path = relpath;
    }

    error(message: string, details: any) {
        if (!Array.isArray(this.errors)) {
            this.errors = [];
        }

        this.errors.push({
            message: String(message),
            details
        });
    }
}

export class Symlink {
    constructor(public path: string, public realpath: string | null) {}
}

function scanError(reason: string, path: string, error: ScanError) {
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

function ensureArray<T>(value: T | T[] | undefined): T[] {
    if (Array.isArray(value)) {
        return value;
    }

    return value ? [value] : [];
}

function isRegExp(value: any) {
    return value instanceof RegExp;
}

function isString(value: any) {
    return typeof value === 'string';
}

function composeAccept(first: AcceptCallback | null, second: AcceptCallback): AcceptCallback {
    return first ? (relpath) => first(relpath) && second(relpath) : second;
}

export function normalizeOptions(options: Options | string = {}) {
    if (typeof options === 'string') {
        options = { basedir: options };
    }

    const posix = Boolean(options.posix);
    const pathSep = posix ? path.posix.sep : path.sep;
    const basedir = path.resolve(options.basedir || process.cwd());
    const generalInclude = new Set(
        ensureArray(options.include).map((dir) => path.resolve(basedir, dir))
    );
    const generalExclude = new Set(
        ensureArray(options.exclude).map((dir) => path.resolve(basedir, dir))
    );
    const onError =
        'onError' in options === false
            ? (err: Error) => console.error('[@discoveryjs/scan-fs] Error:', err)
            : typeof options.onError === 'function'
            ? options.onError
            : () => {};

    const rawRules = ensureArray(options.rules).filter(Boolean);
    const onlyRule = rawRules.find((rule) => rule.only);
    const rules = (onlyRule ? [onlyRule] : rawRules.length ? rawRules : [{}]).map((rule) => {
        let test: RegExp[] | null = null;
        let include: string[] | null = null;
        let exclude: string[] | null = null;
        let extract = null;
        let accept = null;

        if (rule.test) {
            const ruleTest = ensureArray(rule.test).slice();

            if (!ruleTest.every(isRegExp)) {
                throw new Error('rule.test should be a RegExp or array of RegExp');
            }

            test = ruleTest;
            accept = (relpath: string) => {
                for (const rx of ruleTest) {
                    if (rx.test(relpath)) {
                        return true;
                    }
                }

                return false;
            };
        }

        if (rule.include) {
            let ruleInclude = ensureArray(rule.include);

            if (!ruleInclude.every(isString)) {
                throw new Error('rule.include should be a string or array of strings');
            }

            ruleInclude = ruleInclude.map((dir) => {
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

            include = ruleInclude;
            accept = composeAccept(accept, (relpath) => {
                for (const dir of ruleInclude) {
                    if (relpath == dir || relpath.startsWith(dir + pathSep)) {
                        return true;
                    }
                }

                return false;
            });
        }

        if (rule.exclude) {
            let ruleExclude = ensureArray(rule.exclude);

            if (!ruleExclude.every(isString)) {
                throw new Error('rule.exclude should be a string or array of strings');
            }

            ruleExclude = ruleExclude.map((dir) => path.resolve(basedir, dir));

            exclude = ruleExclude;
            accept = composeAccept(accept, (relpath) => {
                for (const dir of ruleExclude) {
                    if (relpath === dir || relpath.startsWith(dir + pathSep)) {
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
            basedir,
            config: rule,
            test,
            include,
            exclude,
            accept,
            extract
        } as NormRule);
    });

    // include has a priority over exclude
    generalInclude.forEach((dir) => generalExclude.delete(dir));

    return {
        posix,
        basedir,
        include: [...generalInclude],
        exclude: [...generalExclude],
        onError,
        rules
    };
}

export function scanFs(options: Options | string) {
    async function collect(basedir: string, absdir: string, reldir: string): Promise<any> {
        const tasks = [];

        for (const dirent of await fsPromise.readdir(absdir, { withFileTypes: true })) {
            const relpath = reldir + dirent.name;
            const fullpath = absdir + dirent.name;

            pathsScanned++;

            if (exclude.includes(fullpath)) {
                continue;
            }

            if (dirent.isDirectory()) {
                tasks.push(collect(basedir, fullpath + pathSep, relpath + pathSep));
                continue;
            }

            if (dirent.isSymbolicLink()) {
                const symlink = new Symlink(relpath, null);
                symlinks.push(symlink);
                tasks.push(
                    fsPromise
                        .realpath(fullpath)
                        .then((realpath) => {
                            symlink.realpath = path.relative(basedir, realpath);
                        })
                        .catch((error) => {
                            errors.push((error = scanError('resolve-symlink', relpath, error)));
                            onError(error);
                        })
                );
                continue;
            }

            filesTested++;

            for (const rule of rules) {
                const { accept, extract } = rule;

                if (accept && !accept(relpath)) {
                    continue;
                }

                const file = new File(relpath);

                files.push(file);

                if (extract !== null) {
                    tasks.push(
                        fsPromise
                            .readFile(fullpath, 'utf8')
                            .then((content) => extract(file, content, rule))
                            .catch((error) => {
                                errors.push((error = scanError('extract', relpath, error)));
                                onError(error);
                            })
                    );
                }

                break;
            }
        }

        return tasks.length > 0 ? Promise.all(tasks) : Promise.resolve();
    }

    const files: File[] = [];
    const symlinks: Symlink[] = [];
    const errors: ScanError[] = [];
    const startTime = Date.now();
    const { posix, basedir, include, exclude, onError, rules } = normalizeOptions(options);
    const pathSep = posix ? path.posix.sep : path.sep;
    let pathsScanned = 0;
    let filesTested = 0;

    if (!include.length) {
        include.push(basedir);
    } else {
        exclude.push(...include);
    }

    return Promise.all(
        include.map((dir) => {
            const relpath = path.relative(basedir, dir);
            return collect(basedir, dir + pathSep, relpath ? relpath + pathSep : '');
        })
    ).then(() =>
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
}
