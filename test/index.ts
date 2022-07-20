import assert from 'assert';
import { scanFs, File } from '@discoveryjs/scan-fs';

const basedir = `${process.cwd()}/test-fixtures`;
const expected = Array.from(
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
        'foo/foo/foo/file4-1.css'
    ],
    (path) => ({ path })
);

async function run(...args: Parameters<typeof scanFs>): ReturnType<typeof scanFs> {
    const result = await scanFs(...args);

    result.files.sort((a, b) => (a.path < b.path ? -1 : 1));

    return result;
}
function expectedForPath(path: string) {
    const pattern = path + '/';

    return expected
        .filter((file) => file.path.startsWith(pattern))
        .map((file) => ({ ...file, path: file.path.slice(pattern.length) }));
}

describe('scanFs()', () => {
    before(() => process.chdir(basedir));

    it('should run without options', async () => {
        const actual = await run();

        assert.deepEqual(actual.files, expected);
    });

    it('allow to pass a string as options', async () => {
        const actual = await run('bar');

        assert.deepEqual(actual.files, expectedForPath('bar'));
    });

    it('using with for .. of', async () => {
        const actual: File[] = [];

        for (const file of (await run('bar')).files) {
            actual.push(file);
        }

        assert.deepEqual(actual, expectedForPath('bar'));
    });

    describe('options', () => {
        it('basedir', async () => {
            const actual = await run({ basedir: 'bar' });

            assert.deepEqual(actual.files, expectedForPath('bar'));
        });

        it('include as string', async () => {
            const actual = await run({ include: 'bar' });

            assert.deepEqual(
                actual.files,
                expected.filter((file) => file.path.startsWith('bar/'))
            );
        });

        it('include as array of strings', async () => {
            const actual = await run({ include: ['bar', 'baz'] });

            assert.deepEqual(
                actual.files,
                expected.filter(
                    (file) => file.path.startsWith('bar/') || file.path.startsWith('baz/')
                )
            );
        });

        it('exclude as string', async () => {
            const actual = await run({ exclude: 'bar' });

            assert.deepEqual(
                actual.files,
                expected.filter((file) => !file.path.startsWith('bar/'))
            );
        });

        it('exclude as array of strings', async () => {
            const actual = await run({ exclude: ['bar', 'baz'] });

            assert.deepEqual(
                actual.files,
                expected.filter(
                    (file) => !file.path.startsWith('bar/') && !file.path.startsWith('baz/')
                )
            );
        });
    });

    describe('rules', () => {
        it('rules as object', async () => {
            const actual = await run({ rules: {} });

            assert.deepEqual(actual.files, expected);
        });

        it('rules as object with test option', async () => {
            const actual = await run({ rules: { test: /\.js$/ } });

            assert.deepEqual(
                actual.files,
                expected.filter((file) => file.path.endsWith('.js'))
            );
        });

        it('rules as array', async () => {
            const actual = await run({ rules: [{ test: /\.js$/ }, { test: /\.css$/ }] });

            assert.deepEqual(
                actual.files,
                expected.filter((file) => file.path.endsWith('.js') || file.path.endsWith('.css'))
            );
        });
    });
});
