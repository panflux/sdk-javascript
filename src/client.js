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

const DEFAULT_TOKEN_URL = 'https://panflux.app/oauth/v2/token';

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
    }

    /**
     * Static initialization helper.
     *
     * @param {object} opts
     * @param {object?} token Optional cached token from previous session
     * @return {module.Client}
     */
    static init(opts, token) {
        return new Client(opts, token);
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
            .then((response) => {
                if (response.status !== 200) {
                    throw Error(response.statusText);
                }
                return response.json();
            })
            .then((token) => {
                if (!token.edges || token.edges.length < 1) {
                    throw Error('Returned token must reference edges to be used in API');
                }

                this._token = token;
                this.emit('newToken', token);
                return token;
            })
        ;
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
                    new RetryLink(),
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
}

export default Client;
