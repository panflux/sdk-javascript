import babel from 'rollup-plugin-babel';
import filesize from 'rollup-plugin-filesize';

const env = process.env.NODE_ENV;
const pkg = require('./package.json');

export default {
    input: 'src/index.js',
    output: {
        file: {
            es: pkg.module,
            cjs: pkg.main,
        }[env],
        format: env,
    },
    external: [
        'apollo-link',
        'apollo-link-context',
        'apollo-link-error',
        'apollo-link-http',
        'apollo-link-retry',
        'apollo-link-ws',
        'eventemitter3',
        'isomorphic-ws',
        'cross-fetch',
        'graphql-tag',
    ],
    plugins: [
        babel({
            exclude: 'node_modules/**',
            plugins: ['@babel/plugin-external-helpers'],
            externalHelpers: true,
        }),
        filesize(),
    ],
};
