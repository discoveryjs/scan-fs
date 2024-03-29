const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const esbuild = require('esbuild');
const { rollup, watch } = require('rollup');
const chalk = require('chalk');
const { version } = require('../package.json');

const external = ['fs', 'fs/promises', 'path', 'url', 'assert', 'module', '@discoveryjs/scan-fs'];

function replaceContent(map) {
    return {
        name: 'file-content-replacement',
        transform(code, id) {
            const key = path.relative('', id);

            if (map.hasOwnProperty(key)) {
                return map[key](code, id);
            }
        }
    };
}

function resolvePath(ts = false, ext) {
    return {
        name: 'resolve-path',
        resolveId(source, parent) {
            if (parent && !/\/(src|lib)\//.test(parent) && /\/(src|lib)\//.test(source)) {
                return {
                    id: source
                        // .replace(/\/lib\//, '/cjs/')
                        .replace(/\/src\//, '/lib/')
                        .replace(/\.js$/, ext),
                    external: true
                };
            }
            if (ts && parent && source.startsWith('.')) {
                return path.resolve(path.dirname(parent), source.replace(/\.js$/, '.ts'));
            }
            return null;
        }
    };
}

function transpileTypeScript() {
    return {
        name: 'transpile-ts',
        transform(input, id) {
            if (id.endsWith('.ts')) {
                const { code, map } = esbuild.transformSync(input, {
                    sourcefile: id,
                    sourcemap: true,
                    loader: 'ts'
                });

                return {
                    code,
                    map
                };
            }
        }
    };
}

function readDir(dir) {
    return fs
        .readdirSync(dir)
        .filter((fn) => fn.endsWith('.js') || fn.endsWith('.ts'))
        .map((fn) => `${dir}/${fn}`);
}

async function transpile({
    entryPoints,
    outputDir,
    format,
    watch: watchMode = false,
    ts = false,
    onSuccess
}) {
    const outputExt = format === 'esm' ? '.js' : '.cjs';
    const doneMessage = (duration) =>
        `${
            ts ? 'Compile TypeScript to JavaScript (ESM)' : 'Convert ESM to CommonJS'
        } into "${outputDir}" done in ${duration}ms`;

    const inputOptions = {
        external,
        input: entryPoints,
        plugins: [
            resolvePath(ts, outputExt),
            transpileTypeScript(),
            replaceContent({
                'src/version.ts': () => `export const version = "${version}";`
            })
        ]
    };
    const outputOptions = {
        dir: outputDir,
        entryFileNames: `[name]${outputExt}`,
        sourcemap: ts,
        format,
        exports: 'auto',
        preserveModules: true,
        interop: false,
        esModule: format === 'esm',
        generatedCode: {
            constBindings: true
        }
    };

    if (!watchMode) {
        const startTime = Date.now();
        const bundle = await rollup(inputOptions);
        await bundle.write(outputOptions);
        await bundle.close();

        console.log(doneMessage(Date.now() - startTime));

        if (typeof onSuccess === 'function') {
            await onSuccess();
        }
    } else {
        const watcher = watch({
            ...inputOptions,
            output: outputOptions
        });

        watcher.on('event', ({ code, duration, error }) => {
            if (code === 'BUNDLE_END') {
                console.log(doneMessage(duration));

                if (typeof onSuccess === 'function') {
                    onSuccess();
                }
            } else if (code === 'ERROR') {
                console.error(chalk.bgRed.white('ERROR!'), chalk.red(error.message));
            }
        });
    }
}

async function generateTypes(fatal = true) {
    const doneMessage = (duration) => `Generate .d.ts files into "lib" done in ${duration}ms`;

    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        exec('npm run ts-emit-types', (error, stdout, stderr) => {
            if (error) {
                console.error(chalk.bgRed.white('ERROR!'), chalk.red(error.message));
                stdout && console.error(chalk.red(stdout));
                stderr && console.error(chalk.red(stderr));

                if (fatal) {
                    reject(error);
                } else {
                    resolve();
                }
            } else {
                console.log(doneMessage(Date.now() - startTime));
                resolve();
            }
        });
    });
}

async function transpileAll(options) {
    const { watch = false, types = false } = options || {};

    await transpile({
        entryPoints: ['src/index.ts'],
        outputDir: './lib',
        format: 'esm',
        watch,
        ts: true,
        onSuccess: async () => {
            if (types) {
                generateTypes(!watch);
            }

            await transpile({
                entryPoints: ['lib/index.js'],
                outputDir: './lib',
                format: 'cjs'
            });
        }
    });
    await transpile({
        entryPoints: readDir('test'),
        outputDir: './lib-test',
        format: 'esm',
        watch,
        ts: true,
        onSuccess: () =>
            transpile({
                entryPoints: readDir('lib-test'),
                outputDir: './lib-test',
                format: 'cjs'
            })
    });
}

module.exports = transpileAll;

if (require.main === module) {
    transpileAll({
        watch: process.argv.includes('--watch'),
        types: process.argv.includes('--types')
    });
}
