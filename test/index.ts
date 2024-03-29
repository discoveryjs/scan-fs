import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { scanFs, File, Options } from '@discoveryjs/scan-fs';

const basedir = path.join(process.cwd(), 'test-fixtures');
const ospath = (str: string) => str.replace(/\//g, path.sep);
const expectedFiles = Array.from(
    [
        'bar.test',
        'bar/a/file3-1.js',
        'bar/b/file3-2.js',
        'bar/c/file3-3.css',
        'bar/file2-1.js',
        'baz/file2-2.txt',
        'file1.js',
        'file2.ts',
        'foo.test',
        'foo/foo/foo/file-with-error.css'
    ],
    (path) => ({
        path: ospath(path),
        posixPath: path
    })
);

async function run(...args: Parameters<typeof scanFs>): ReturnType<typeof scanFs> {
    const result = await scanFs(...args);

    result.files.sort((a, b) => (a.path < b.path ? -1 : 1));

    return result;
}

function expectedForDir(expected, dir: string) {
    const pattern = dir + path.sep;

    return expected
        .filter((entry) => entry.path.startsWith(pattern))
        .map((entry) => ({
            ...entry,
            path: entry.path.slice(pattern.length),
            posixPath: entry.posixPath.slice(pattern.length)
        }));
}

function expectedFilesForDir(dir: string) {
    return expectedForDir(expectedFiles, dir);
}

describe('scanFs()', () => {
    before(() => {
        process.chdir(basedir);

        // ensure symlinks are existed
        const symlinks = [
            {
                path: ospath('symlink-broken'),
                posixPath: 'symlink-broken',
                realpath: null
            },
            {
                path: ospath('symlink1'),
                posixPath: 'symlink1',
                realpath: ospath('baz/file2-2.txt')
            },
            {
                path: ospath('bar/symlink2'),
                posixPath: 'bar/symlink2',
                realpath: ospath('file1.js')
            }
        ];

        for (const symlink of symlinks) {
            try {
                fs.symlinkSync(
                    path.relative(
                        path.dirname(symlink.path),
                        path.resolve(String(symlink.realpath))
                    ),
                    symlink.path
                );
            } catch {}
        }
    });

    it('should run without options', async () => {
        const actual = await run();

        assert.deepEqual(actual.files, expectedFiles);
    });

    it('allow to pass a string as options', async () => {
        const actual = await run('bar');

        assert.deepEqual(actual.files, expectedFilesForDir('bar'));
    });

    it('using with for .. of', async () => {
        const actual: File[] = [];

        for (const file of (await run()).files) {
            actual.push(file);
        }

        assert.deepEqual(actual, expectedFiles);
    });

    describe('symlinks', () => {
        it('should collect symlinks by default', async () => {
            const actual = await run();

            assert.deepEqual(actual.symlinks, [
                {
                    path: ospath('symlink-broken'),
                    posixPath: 'symlink-broken',
                    realpath: null
                },
                {
                    path: ospath('symlink1'),
                    posixPath: 'symlink1',
                    realpath: null
                },
                {
                    path: ospath('bar/symlink2'),
                    posixPath: 'bar/symlink2',
                    realpath: null
                }
            ]);
        });

        it('should collect symlinks relative to basedir', async () => {
            const actual = await run({ basedir: 'bar' });

            assert.deepEqual(actual.symlinks, [
                {
                    path: 'symlink2',
                    posixPath: 'symlink2',
                    realpath: null
                }
            ]);
        });

        it('should resolve symlinks with resolveSymlinks:true', async () => {
            const actual = await run({ resolveSymlinks: true });

            assert.deepEqual(actual.symlinks, [
                {
                    path: ospath('symlink-broken'),
                    posixPath: 'symlink-broken',
                    realpath: null
                },
                {
                    path: ospath('symlink1'),
                    posixPath: 'symlink1',
                    realpath: ospath('baz/file2-2.txt')
                },
                {
                    path: ospath('bar/symlink2'),
                    posixPath: 'bar/symlink2',
                    realpath: ospath('file1.js')
                }
            ]);
        });

        it('should resolve symlinks with resolveSymlinks:true relative to basedir', async () => {
            const actual = await run({ basedir: 'bar', resolveSymlinks: true });

            assert.deepEqual(actual.symlinks, [
                {
                    path: 'symlink2',
                    posixPath: 'symlink2',
                    realpath: ospath('../file1.js')
                }
            ]);
        });
    });

    describe('basedir', () => {
        it('should be equal to process.cwd() when not set', async () => {
            const actual = await run();

            assert.strictEqual(actual.basedir, process.cwd());
        });

        it('should be resolved to process.cwd() when path is relative', async () => {
            const actual = await run({ basedir: 'bar' });

            assert.strictEqual(actual.basedir, path.join(process.cwd(), 'bar'));
        });

        it('should be the same when path is absolute', async () => {
            const expected = path.join(process.cwd(), 'bar', 'a');
            const actual = await run({ basedir: expected });

            assert.strictEqual(actual.basedir, expected);
        });

        it('should be normalized', async () => {
            const expected = path.join(process.cwd(), 'bar', 'a');
            const actual = await run({
                basedir: [process.cwd(), 'bar', 'xxx', '..', 'a'].join(path.sep)
            });

            assert.strictEqual(actual.basedir, expected);
        });
    });

    describe('options', () => {
        it('basedir', async () => {
            const actual = await run({ basedir: 'bar' });

            assert.deepEqual(actual.files, expectedFilesForDir('bar'));
        });

        it('should throw when basedir is a non-exists path', () => {
            return assert.rejects(
                () => run({ basedir: 'non-exists' }),
                /no such file or directory/
            );
        });

        it('should throw when basedir is a non-exists path', () => {
            return assert.rejects(
                () => run({ basedir: ospath('foo/foo/foo/file-with-error.css') }),
                /not a directory/
            );
        });

        it('include as string', async () => {
            const actual = await run({ include: 'foo/foo' });

            assert.deepEqual(
                actual.files,
                expectedFiles.filter((file) =>
                    file.path.startsWith('foo' + path.sep + 'foo' + path.sep)
                )
            );
        });

        it('include as array of strings', async () => {
            const actual = await run({ include: ['bar', 'foo/foo'] });

            assert.deepEqual(
                actual.files,
                expectedFiles.filter(
                    (file) =>
                        file.path.startsWith('bar' + path.sep) ||
                        file.path.startsWith('foo' + path.sep + 'foo' + path.sep)
                )
            );
        });

        it('exclude as string', async () => {
            const actual = await run({ exclude: 'foo/foo' });

            assert.deepEqual(
                actual.files,
                expectedFiles.filter(
                    (file) => !file.path.startsWith('foo' + path.sep + 'foo' + path.sep)
                )
            );
        });

        it('exclude as array of strings', async () => {
            const actual = await run({ exclude: ['bar', 'foo/foo'] });

            assert.deepEqual(
                actual.files,
                expectedFiles.filter(
                    (file) =>
                        !file.path.startsWith('bar' + path.sep) &&
                        !file.path.startsWith('foo' + path.sep + 'foo' + path.sep)
                )
            );
        });
    });

    describe('rules', () => {
        it('rules as object', async () => {
            const actual = await run({ rules: {} });

            assert.deepEqual(actual.files, expectedFiles);
        });

        it('rules as object with test option', async () => {
            const actual = await run({ rules: { test: /\.js$/ } });

            assert.deepEqual(
                actual.files,
                expectedFiles.filter((file) => file.path.endsWith('.js'))
            );
        });

        it('rules as array', async () => {
            const actual = await run({
                rules: [
                    { test: /\.js$/ },
                    {
                        test: /\.css$/,
                        extract(file, content) {
                            if (file.path.includes('error')) {
                                throw new Error('Parse error');
                            }

                            file.content = content.replace(/\r\n?/g, '\n');
                        }
                    }
                ]
            });

            assert.deepEqual(
                actual.files,
                expectedFiles
                    .filter((file) => file.path.endsWith('.js') || file.path.endsWith('.css'))
                    .map((file) =>
                        file.path.endsWith('.css') && !file.path.includes('error')
                            ? { ...file, content: `/* ${path.basename(file.path)} */\n` }
                            : file
                    )
            );
            assert.deepEqual(actual.errors[0].message, 'Parse error');
        });

        describe('encoding', () => {
            function runWithEncoding(encoding?: BufferEncoding | null) {
                const rules: Options = {
                    test: /^bar\.test$/,
                    extract(file, content) {
                        file.content = content;
                    }
                };

                if (encoding !== undefined) {
                    rules.encoding = encoding;
                }

                return run({ rules }).then(({ files }) => files[0].content);
            }

            it('default', async () => {
                const actual = await runWithEncoding();

                assert.strictEqual(actual, 'hello world');
            });

            it('utf8', async () => {
                const actual = await runWithEncoding('utf8');

                assert.strictEqual(actual, 'hello world');
            });

            it('hex', async () => {
                const actual = await runWithEncoding('hex');

                assert.strictEqual(actual, '68656c6c6f20776f726c64');
            });

            it('null (Buffer)', async () => {
                const actual = await runWithEncoding(null);

                assert(Buffer.isBuffer(actual), 'file content should be a Buffer');
            });
        });
    });
});
