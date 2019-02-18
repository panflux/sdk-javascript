/*
 * Panflux Javascript SDK
 * (c) Omines Internetbureau B.V. - https://omines.nl/
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import {ApolloLink, execute, makePromise, split} from 'apollo-link';
import {setContext} from 'apollo-link-context';
import {onError} from 'apollo-link-error';
import {HttpLink} from 'apollo-link-http';
import {RetryLink} from 'apollo-link-retry';
import {WebSocketLink} from 'apollo-link-ws';

import EventEmitter from 'eventemitter3';
import WebSocket from 'isomorphic-ws';
import fetch from 'cross-fetch';
import gql from 'graphql-tag';

const STATE_TOKEN = 'panflux_token';

const DEFAULT_TOKEN_URL = 'https://panflux.app/oauth/v2/token';
const DEFAULT_AUTHORIZE_URL = 'https://panflux.app/oauth/v2/authorize';

/**
 * @param {number} len
 * @return {string}
 */
function generateCSRF(len) {
    const arr = new Uint8Array((len || 40) / 2);
    window.crypto.getRandomValues(arr);
    return Array.from(arr, (dec) => ('0' + dec.toString(16)).substr(-2)).join('');
}

/**
 * This function should be chained to a fetch request Promise to process the response parameters
 *
 * @param {object} response
 * @return {*}
 */
function validateResponse(response) {
    if (response.status !== 200) {
        throw Error(response.statusText);
    }
    return response.json();
}

/**
 * The Client class is the main encapsulation of a Panflux API client.
 */
class Client extends EventEmitter {
    /**
     * Client constructor.
     *
     * @param {object} opts
     * @param {object?} token Optional cached token from previous session
     */
    constructor(opts, token) {
        super();

        opts = opts || {};
        if (opts.scope && Array.isArray(opts.scope)) {
            opts.scope = opts.scope.join(' ');
        }
        this._opts = opts;

        if (token) {
            this._token = Promise.resolve(token);
        }
        this._resolving = false;
    }

    /**
     * Static initialization helper.
     *
     * @param {object} opts
     * @param {object?} token Optional cached token from previous session
     * @return {Client}
     */
    static init(opts, token) {
        const client = new Client(opts, token);

        // When a valid token is present return early
        if (null != client.token) {
            return client;
        }

        // If we are running inside a browser check for a code query parameter.
        if (client._isBrowser()) {
            const q = location.search.substring(1);
            const o = {};
            q.replace(/([^=&]+)=([^&]*)/g, (m, key, value) => {
                o[decodeURIComponent(key)] = decodeURIComponent(value);
            });
            // we only accept requests with a code and a state
            if (undefined === o.code || undefined === o.state) {
                return client;
            }
            client._resolving = true;
            client._verifyAuthResponse(o.code, o.state)
                .then((token) => {
                    client._resolving = false;
                    client._token = Promise.resolve(token);
                    return client;
                })
                .catch((err) => console.error(err));
        }

        return client;
    }

    /**
     * @return {Promise<object>}
     */
    async login() {
        if (this._isBrowser()) {
            return Promise.resolve(this._loginFromBrowser());
        }
    }

    /**
     * @param {string} code
     *
     * @return {Promise<object>}
     */
    async requestToken(code) {
        return fetch(this._opts.tokenURL || DEFAULT_TOKEN_URL, {
            method: 'POST',
            body: JSON.stringify({
                grant_type: 'authorization_code',
                client_id: this._opts.clientID,
                client_secret: this._opts.clientSecret,
                redirect_uri: location.origin, // TODO Find better way to provide return URI
                code: code,
            }),
            headers: {
                'Content-Type': 'application/json',
            },
        })
            .then(validateResponse)
            .then(this._returnToken);
    }

    /**
     * Authenticate using client credentials.
     *
     * @return {Promise<object>}
     */
    async authenticate() {
        if (!this._opts.clientID || !this._opts.clientSecret) {
            throw Error('ClientID and ClientSecret options are required to use OAuth2 client credentials grant');
        }
        return fetch(this._opts.tokenURL || DEFAULT_TOKEN_URL, {
            method: 'POST',
            body: JSON.stringify({
                grant_type: 'client_credentials',
                client_id: this._opts.clientID,
                client_secret: this._opts.clientSecret,
                scope: this._opts.scope || '',
            }),
            headers: {
                'Content-Type': 'application/json',
            },
        })
            .then(validateResponse)
            .then(this._returnToken);
    }

    /**
     * Prepare GraphQL connections based on configured parameters and token.
     *
     * @return {Promise<ApolloLink>}
     */
    async connect() {
        return (this._token ? Promise.resolve(this._token) : this.authenticate())
            .then((token) => {
                const uri = (token.edges[0]) + '/graphql';
                return ApolloLink.from([
                    new RetryLink({attempts: {retryIf: (error) => (error.statusCode !== 400)}}),
                    onError((params) => {
                        this.emit('error', params);
                    }),
                    setContext(() => ({
                        headers: {
                            accept: 'application/json',
                            authorization: `Bearer ${token.access_token}`,
                        },
                    })),
                    split(({query: {definitions}}) =>
                        definitions.some(
                            ({kind, operation}) =>
                                kind === 'OperationDefinition' && operation === 'subscription',
                        ),
                    new WebSocketLink({uri: uri.replace(/^http/, 'ws'), options: {
                        lazy: true,
                        reconnect: true,
                        reconnectionAttempts: 3,
                        connectionParams: {
                            authToken: token.access_token,
                        },
                    }, webSocketImpl: WebSocket}),
                    new HttpLink({uri, fetch}),
                    ),
                ]);
            })
        ;
    }

    /**
     * Execute a GraphQL query. Do not wrap the query in `query { ... }` markers.
     *
     * @param {string} query
     * @param {object?} variables Optional variables
     * @return {Promise<object>} The raw query response
     */
    async query(query, variables) {
        return this.getLink()
            .then((link) => makePromise(execute(link, {query: gql(query), variables})))
            .then((response) => response.data)
        ;
    }

    /**
     * Start a GraphQL subscription. Do not wrap the query in `subscription { ... }` markers.
     *
     * @param {string} query
     * @param {function} nextCallback
     * @param {function?} errorCallback
     * @param {function?} completeCallback
     * @return {Promise<ZenObservable.Subscription>} Promise that resolves to the active subscription.
     */
    async subscribe(query, nextCallback, errorCallback, completeCallback) {
        return this.getLink()
            .then((link) => execute(link, {query: gql(query)}).subscribe({
                next: (data) => {
                    if (data.data) {
                        nextCallback(data.data);
                    } else if (data.errors) {
                        // Only forward the first error, use error event for the rest if needed
                        if (errorCallback) errorCallback(data.errors[0]);
                    } else {
                        /* istanbul ignore next */
                        throw Error('Could not parse subscription response message');
                    }
                },
                error: errorCallback,
                complete: completeCallback,
            }));
    }

    /**
     * Return a promise resolving to an ApolloLink instance.
     *
     * @return {Promise<ApolloLink>}
     */
    async getLink() {
        if (this._token && ((Date.now() / 1000) + 5000) > this._token.expire_time) {
            this._token = this._apollo = null;
        }
        if (!this._apollo) {
            this._apollo = this.connect();
        }
        return this._apollo;
    }

    /** @return {token} */
    get token() {
        return this._token;
    }

    /** @return {boolean} */
    get resolving() {
        return this._resolving;
    }

    /**
     * Login the user and retrieve an access request code.
     *
     * @private
     *
     * @return {object}
     */
    _loginFromBrowser() {
        if (!this._opts.clientID) {
            throw Error('ClientID options are required to use OAuth2 access_code grant');
        }
        const url = this._opts.authURL || DEFAULT_AUTHORIZE_URL;
        const token = generateCSRF(16);
        const q = Object.entries({
            response_type: 'code',
            redirect_uri: location.origin,
            scope: this._opts.scope || '',
            client_id: this._opts.clientID,
            state: token,
        }).map(([key, val]) => `${encodeURIComponent(key)}=${encodeURIComponent(val)}`).join('&');

        // Store the token so we can later verify if we requested the token
        if (undefined === window['localStorage']) {
            console.error('No localStorage is present. State validation cannot be performed.');
        } else {
            window.localStorage.setItem(STATE_TOKEN, token);
        }

        location.href = url + '?' + q;
        return {};
    }

    /**
     * @param {string} code
     * @param {string} state
     *
     * @private
     */
    async _verifyAuthResponse(code, state) {
        if (undefined === window['localStorage']) {
            console.error('No localStorage is present. State validation cannot be performed.');
        } else {
            const token = window.localStorage.getItem(STATE_TOKEN);
            if (token !== state) {
                throw new Error('Response state does not match request token');
            }
        }

        // Request an access code
        return this.requestToken(code);
    }

    /**
     * This function should be chained to a fetch request Promise, behind the validateResponse so the
     * valid token will be checked, stored and returned. Use this function in combination with .bind()
     *
     * @private
     * @param {object} token
     * @return {{edges}|*}
     */
    _returnToken(token) {
        if (!token.edges || token.edges.length < 1) {
            throw Error('Returned token must reference edges to be used in API');
        }

        this._token = token;
        this.emit('newToken', token);
        return token;
    }


    /**
     * @return {boolean}
     * @private
     */
    _isBrowser() {
        return window !== undefined && typeof window === 'object';
    }
}


export default Client;
