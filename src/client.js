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
import runtime from './runtime';

const STATE_TOKEN = 'panflux_token';
const CHANNEL_NAME = 'panflux_channel';
const OAUTH_ERROR = 'panflux_oauth_error';

const DEFAULT_TOKEN_URL = 'https://panflux.app/oauth/v2/token';
const DEFAULT_AUTHORIZE_URL = 'https://panflux.app/oauth/v2/authorize';

const defaultOpts = {
    authURL: DEFAULT_AUTHORIZE_URL,
    tokenURL: DEFAULT_TOKEN_URL,
    state: '',
    sameWindow: false,
};

/**
 * This function wil test if an `window` global is available
 *
 * @return {bool}
 */
function hasWindowObject() {
    try {
        if (typeof window === 'object') {
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

let channel;
if (hasWindowObject() && undefined !== window.BroadcastChannel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
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
        this._opts = Object.assign(defaultOpts, opts);

        if (token) {
            this._token = Promise.resolve(token);
        }
        this._resolving = false;
        this._codeVerifier = null;
    }

    /**
     * Static initialization helper.
     *
     * @param {object} opts
     * @param {object?} token Optional cached token from previous session
     * @return {Client}
     */
    static init(opts, token) {
        console.warn('This SDK is a work in progress, use at your own discretion');
        const client = new Client(opts, token);

        // When a valid token is present return early
        if (null != client.token) {
            return client;
        }

        if (undefined !== channel) {
            channel.onmessage = client._onChannelMessage.bind(client);
        }

        return client;
    }

    /**
     * @return {Promise<object>}
     */
    async login() {
        if (this._isBrowser()) {
            return Promise.resolve(this._loginFromBrowser());
        } else if (this._isNodeJS()) {
            return Promise.resolve(this.authenticate());
        }
        throw new Error('The Panflux SDK has no way to determine the platform you\'re using');
    }

    /**
     * @param {string} code
     * @param {string} returnUrl
     *
     * @return {Promise<object>}
     */
    async requestToken(code, returnUrl) {
        const opts = {
            grant_type: 'authorization_code',
            client_id: this._opts.clientID,
            redirect_uri: returnUrl,
            code: code,
        };
        if (this._opts.client_secret) {
            opts['client_secret'] = this._opts.client_secret;
        } else {
            if (this._opts.sameWindow && window.localStorage) {
                this._codeVerifier = window.localStorage.getItem('verifier');
            }
            opts['code_verifier'] = this._codeVerifier;
        }
        return fetch(this._opts.tokenURL, {
            method: 'POST',
            body: JSON.stringify(opts),
            headers: {
                'Content-Type': 'application/json',
            },
        })
            .then(runtime.validateResponse)
            .then(this._returnToken.bind(this));
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
        return fetch(this._opts.tokenURL, {
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
            .then(runtime.validateResponse)
            .then(this._returnToken.bind(this));
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
     * This function will handle an incoming request with query params
     *
     * @param {string} query
     * @param {string} returnUrl
     *
     * @return {Client}
     */
    handleBrowserResult(query, returnUrl) {
        const o = {};
        query.replace(/([^=&]+)=([^&]*)/g, (m, key, value) => {
            o[decodeURIComponent(key)] = decodeURIComponent(value);
        });
        // check for any incoming errors
        if (o.state && o.error) {
            return this._handleCodeError(o);
        }
        // we only accept requests with a code and a state
        if (undefined === o.code || undefined === o.state) {
            return this;
        }
        this._verifyAuthResponse(o.code, o.state);

        this._resolving = true;
        this._handleCodeSuccess(o.code, returnUrl);

        return this;
    }

    /**
     * This function will publish an error to the broadcast channel or stop executing code
     * by raising an error.
     *
     * @param {Object} params
     */
    _handleCodeError(params) {
        if (undefined !== channel) {
            // send message to other tabs so application can pick up further authorization
            channel.postMessage(Object.assign({
                type: OAUTH_ERROR,
            }, params));
            if (!this._opts.sameWindow) {
                window.close();
            }
            return;
        }
        const msg = params.error + ': ' + params.error_description;
        throw new Error(msg);
    }

    /**
     * Handle code success will publish the received code to the broadcast channel
     * if it is available or request a token if no broadcast channel can be used.
     *
     * @param {string} code
     * @param {string} returnUrl
     */
    _handleCodeSuccess(code, returnUrl) {
        if (undefined !== channel) {
            // send message to other tabs so application can pick up further authorization
            channel.postMessage({
                type: STATE_TOKEN,
                code: code,
            });
        }
        if (!this._opts.sameWindow) {
            window.close();
        } else {
            this.requestToken(code, returnUrl)
                .then((token) => {
                    this._resolving = false;
                    this._token = Promise.resolve(token);

                    return this;
                })
                .catch((err) => console.error(err));
        }
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
        this._codeVerifier = runtime.generateCodeVerifier();
        if (this._opts.sameWindow && window.localStorage) {
            window.localStorage.setItem('verifier', this._codeVerifier);
        } else if (this._opts.sameWindow && !window.localStorage) {
            throw new Error('No localStorage present, you cannot use sameWindow option');
        }
        const url = this._opts.authURL || DEFAULT_AUTHORIZE_URL;
        const token = runtime.generateCSRF();
        const q = Object.entries({
            response_type: 'code',
            redirect_uri: location.origin,
            scope: this._opts.scope,
            client_id: this._opts.clientID,
            code_challenge: runtime.generateCodeChallenge(this._codeVerifier),
            code_challenge_method: 'S256',
            state: token,
        }).map(([key, val]) => `${encodeURIComponent(key)}=${encodeURIComponent(val)}`).join('&');

        // Store the token so we can later verify if we requested the token
        if (undefined === window['localStorage']) {
            console.error('No localStorage is present. State validation cannot be performed.');
        } else {
            window.localStorage.setItem(STATE_TOKEN, token);
        }

        if (this._opts.sameWindow) {
            location.href = url + '?' + q;
        } else {
            window.open(url + '?' + q);
        }
        return {};
    }

    /**
     * @param {string} code
     * @param {string} state
     *
     * @return {boolean}
     *
     * @private
     */
    _verifyAuthResponse(code, state) {
        if (undefined === window['localStorage']) {
            console.error('No localStorage is present. State validation cannot be performed.');
        } else {
            const token = window.localStorage.getItem(STATE_TOKEN);
            if (token !== state) {
                throw new Error('Response state does not match request token');
            }
        }

        return true;
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
        // if an token function was provided let that handle the error.
        this.emit('newToken', token);
        return token;
    }


    /**
     * @return {boolean}
     * @private
     */
    _isBrowser() {
        return hasWindowObject();
    }

    /**
     * @return {boolean}
     * @private
     */
    _isNodeJS() {
        return !hasWindowObject() && typeof module !== 'undefined' && module.exports;
    }

    /**
     * @param {object} ev
     * @private
     */
    _onChannelMessage(ev) {
        if (undefined === ev.data.type) {
            return;
        }
        switch (ev.data.type) {
        case STATE_TOKEN:
            this._resolving = true;
            this.requestToken(ev.data.code, location.origin)
                .then((token) => {
                    this._resolving = false;
                    this._token = Promise.resolve(token);

                    return this;
                })
                .catch((err) => console.error(err));
            break;
        case OAUTH_ERROR:
            this.emit('oauthError', ev.data);
            break;
        }
    }
}


export default Client;
