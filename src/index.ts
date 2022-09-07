import { promises as fsPromise } from 'fs';
import * as path from 'path';

export type Options = {
    basedir?: string;
    include?: string | string[];
    exclude?: string | string[];
    rules?: Rule | Rule[];
    resolveSymlinks?: boolean;
    onError?: boolean | ((error: Error) => void);
};

export type Rule = ExtractStringRule | ExtractBufferRule;
export type ExtractStringCallback = (file: File, content: string, rule: MatchRule) => void;
export type ExtractBufferCallback = (file: File, content: Buffer, rule: MatchRule) => void;
type BaseRule = {
    only?: boolean;
    test?: RegExp | RegExp[];
    include?: string | string[];
    exclude?: string | string[];
};
type ExtractStringRule = BaseRule & {
    encoding?: BufferEncoding;
    extract?: ExtractStringCallback;
};
type ExtractBufferRule = BaseRule & {
    encoding: null;
    extract: ExtractBufferCallback;
};

export type AcceptCallback = (relpath: string) => boolean;

export type NormalizedOptions = {
    basedir: string;
    include: string[];
    exclude: string[];
    rules: MatchRule[];
    resolveSymlinks?: boolean;
    onError: (error: Error) => void;
};
export type MatchRule = {
    basedir: string;
    accept: AcceptCallback;
    encoding: Rule['encoding'];
    extract: ((file: File, content: string | Buffer, rule: MatchRule) => void) | null;
    config: Rule;
    test: RegExp[] | null;
    include: string[] | null;
    exclude: string[] | null;
};

export type ScanResult = {
    basedir: string;
    files: File[];
    symlinks: Symlink[];
    errors: ScanError[];
    pathsScanned: number;
    filesTested: number;
};
export type ScanErrorReason = 'resolve-symlink' | 'extract';
export type ScanError = Error & {
    reason: ScanErrorReason;
    path: string;
    toJSON(): { reason: string; path: string; message: string };
};

export class File {
    path: string;
    posixPath: string;
    errors?: Array<{ message: string; details: any }>;

    constructor(relpath: string, posixRelpath: string) {
        this.path = relpath;
        this.posixPath = posixRelpath;
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
    path: string;
    posixPath: string;
    realpath: string | null;

    constructor(relpath: string, posixRelpath: string, relRealpath: string | null) {
        this.path = relpath;
        this.posixPath = posixRelpath;
        this.realpath = relRealpath;
    }
}

function scanErrorToJSON(this: ScanError) {
    return {
        reason: this.reason,
        path: this.path,
        message: String(this)
    };
}

function scanError(reason: ScanErrorReason, path: string, error: ScanError) {
    error.reason = reason;
    error.path = path;
    error.toJSON = scanErrorToJSON;

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

function posixNormalize(relpath: string) {
    return path.posix.resolve('/', relpath).slice(1);
}

function ensureEndsWithSep(value: string, sep: string) {
    return value && !value.endsWith(sep) ? value + sep : value;
}

export function normalizeOptions(options: Options | string = {}): NormalizedOptions {
    if (typeof options === 'string') {
        options = { basedir: options };
    }

    const basedir = path.resolve(options.basedir || process.cwd());
    const resolveSymlinks = Boolean(options.resolveSymlinks);
    const generalInclude = new Set(ensureArray(options.include).map(posixNormalize));
    const generalExclude = new Set(ensureArray(options.exclude).map(posixNormalize));
    const onError = typeof options.onError === 'function' ? options.onError : () => {};

    const rawRules = ensureArray(options.rules).filter(Boolean);
    const onlyRule = rawRules.find((rule) => rule.only);
    const rules = (onlyRule ? [onlyRule] : rawRules.length ? rawRules : [{}]).map((rule) => {
        let test: RegExp[] | null = null;
        let include: string[] | null = null;
        let exclude: string[] | null = null;
        let encoding = rule.encoding;
        let extract = null;
        let accept = null;

        if (rule.test) {
            const ruleTest = ensureArray(rule.test).slice();

            if (!ruleTest.every(isRegExp)) {
                throw new Error('rule.test should be a RegExp or array of RegExp');
            }

            test = ruleTest;
            accept = (posixRelpath: string) => {
                for (const rx of ruleTest) {
                    if (rx.test(posixRelpath)) {
                        return true;
                    }
                }

                return false;
            };
        }

        if (rule.include) {
            const ruleInclude = ensureArray(rule.include);

            if (!ruleInclude.every(isString)) {
                throw new Error('rule.include should be a string or array of strings');
            }

            include = ruleInclude.map(posixNormalize);
            accept = composeAccept(accept, (posixRelpath) => {
                for (const dir of ruleInclude) {
                    if (posixRelpath === dir || posixRelpath.startsWith(dir + '/')) {
                        return true;
                    }
                }

                return false;
            });

            for (let dir of ruleInclude) {
                while (dir !== '' && dir !== '.') {
                    // FIXME: include should be added only for rules
                    // with such includes not all the rules
                    generalInclude.add(dir);
                    dir = path.dirname(dir);
                }
            }
        }

        if (rule.exclude) {
            const ruleExclude = ensureArray(rule.exclude);

            if (!ruleExclude.every(isString)) {
                throw new Error('rule.exclude should be a string or array of strings');
            }

            exclude = ruleExclude.map(posixNormalize);
            accept = composeAccept(accept, (posixRelpath) => {
                for (const dir of ruleExclude) {
                    if (posixRelpath === dir || posixRelpath.startsWith(dir + '/')) {
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

        if (typeof encoding !== 'string' && encoding !== null) {
            encoding = 'utf8';
        }

        return Object.freeze({
            basedir,
            accept,
            extract,
            encoding,
            config: rule,
            test,
            include,
            exclude
        } as MatchRule);
    });

    // include has a priority over exclude
    generalInclude.forEach((dir) => generalExclude.delete(dir));

    return {
        basedir,
        include: [...generalInclude],
        exclude: [...generalExclude],
        rules,
        resolveSymlinks,
        onError
    };
}

export async function scanFs(options?: Options | string): Promise<ScanResult> {
    async function collect(basedir: string, reldir: string, posixReldir: string) {
        const tasks = [];

        for (const dirent of await fsPromise.readdir(basedir + reldir, { withFileTypes: true })) {
            const relpath = reldir + dirent.name;
            const posixRelpath = posixReldir + dirent.name;

            pathsScanned++;

            if (exclude.includes(posixRelpath)) {
                continue;
            }

            if (dirent.isDirectory()) {
                tasks.push(collect(basedir, relpath + path.sep, posixRelpath + '/'));
                continue;
            }

            if (dirent.isSymbolicLink()) {
                const symlink = new Symlink(relpath, posixRelpath, null);

                symlinks.push(symlink);

                if (resolveSymlinks) {
                    tasks.push(
                        fsPromise
                            .realpath(basedir + relpath)
                            .then((realpath) => {
                                symlink.realpath = path.relative(basedir, realpath);
                            })
                            .catch((error) => {
                                errors.push((error = scanError('resolve-symlink', relpath, error)));
                                onError(error);
                            })
                    );
                }
                continue;
            }

            filesTested++;

            for (const rule of rules) {
                const { accept, extract } = rule;

                if (accept && !accept(posixRelpath)) {
                    continue;
                }

                const file = new File(relpath, posixRelpath);

                files.push(file);

                if (extract !== null) {
                    tasks.push(
                        fsPromise
                            .readFile(basedir + relpath, rule.encoding)
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

        if (tasks.length > 0) {
            await Promise.all(tasks);
        }
    }

    const files: File[] = [];
    const symlinks: Symlink[] = [];
    const errors: ScanError[] = [];
    const { basedir, include, exclude, rules, resolveSymlinks, onError } =
        normalizeOptions(options);
    let pathsScanned = 0;
    let filesTested = 0;

    if (!include.length) {
        include.push('');
    } else {
        exclude.push(...include);
    }

    await Promise.all(
        include.map((posixRelpath) => {
            return collect(
                ensureEndsWithSep(basedir, path.sep),
                ensureEndsWithSep(posixRelpath, '/').replace(/\//g, path.sep),
                ensureEndsWithSep(posixRelpath, '/')
            );
        })
    );

    return {
        basedir,
        files,
        symlinks,
        errors,
        pathsScanned,
        filesTested
    };
}
