/**
 * SDKError represents the special type of error that can be thrown
 * by this SDK.
 */
class SDKError extends Error {
    /**
     * SDKError constructor.
     *
     * @param {object|null} err
     * @param {string|null} msg
     */
    constructor(err, msg) {
        let internal = msg || '';
        if (err) {
            internal += err.message ?
                internal === '' ? err.message : ': ' + err.message :
                err;
        }
        super(internal);
        this.message = internal;
        this.name = 'SDKError';
        if (err) {
            this.err = err;
        }
    }

    /**
     * @return {object|null}
     */
    get internalError() {
        return this.err;
    }
}


/**
 * LoginError is thrown on login failure
 */
export class LoginError extends SDKError {
    /**
     * @param {object|null} err
     * @param {string|null} msg
     */
    constructor(err, msg) {
        super(err, msg || 'Error during login');
        this.name = 'LoginError';
    }
}

/**
 * RefreshTokenError is thrown on login failure
 */
export class RefreshTokenError extends SDKError {
    /**
     * @param {object|null} err
     * @param {string|null} msg
     */
    constructor(err, msg) {
        super(err, msg || 'Error during refresh token');
        this.name = 'RefreshTokenError';
    }
}

/**
 * RequestTokenError is thrown on login failure
 */
export class RequestTokenError extends SDKError {
    /**
     * @param {object|null} err
     * @param {string|null} msg
     */
    constructor(err, msg) {
        super(err, msg || 'Error during request token');
        this.name = 'RequestTokenError';
    }
}

/**
 * GraphQLError is thrown on login failure
 */
export class GraphQLError extends SDKError {
    /**
     * @param {object|null} err
     * @param {string|null} msg
     */
    constructor(err, msg) {
        super(err, msg || 'Error in GraphQL link');
        this.name = 'GraphQLError';
    }
}
