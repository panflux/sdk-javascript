import {LoginError, RefreshTokenError, GraphQLError, RequestTokenError} from './../src/error';

const table = [
    {
        name: 'LoginError test',
        cName: LoginError,
        params: {
            msg: 'some error',
            err: new Error('test error'),
        },
        expect: {
            name: 'LoginError',
            internal: Error,
            message: 'some error: test error',
        },
    },
    {
        name: 'RefreshTokenError test',
        cName: RefreshTokenError,
        params: {
            msg: '',
            err: new Error('test error'),
        },
        expect: {
            name: 'RefreshTokenError',
            internal: Error,
            message: 'Error during refresh token: test error',
        },
    },
    {
        name: 'GraphQLError test',
        cName: GraphQLError,
        params: {
            msg: '',
            err: undefined,
        },
        expect: {
            name: 'GraphQLError',
            internal: undefined,
            message: 'Error in GraphQL link',
        },
    },
    {
        name: 'RequestTokenError test',
        cName: RequestTokenError,
        params: {
            msg: '',
            err: undefined,
        },
        expect: {
            name: 'RequestTokenError',
            internal: undefined,
            message: 'Error during request token',
        },
    },
];

table.forEach((definition) => {
    test(definition.name, async () => {
        const params = definition.params;
        const expected = definition.expect;
        const err = new definition.cName(params.err, params.msg);
        expect(err.name).toBe(expected.name);
        expect(err.message).toBe(expected.message);
        if (expected.internal) {
            expect(err.internalError).toBeInstanceOf(expected.internal);
        } else {
            expect(err.internalError).toBeUndefined();
        }
    });
});

