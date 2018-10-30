/*
 * Panflux Javascript SDK
 * (c) Omines Internetbureau B.V. - https://omines.nl/
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

const {ApolloLink, execute, makePromise, split} = require('apollo-link');
const {setContext} = require('apollo-link-context');
const {onError} = require('apollo-link-error');
const {HttpLink} = require('apollo-link-http');
const {WebSocketLink} = require('apollo-link-ws');

const EventEmitter = require('eventemitter3');
const fetch = require('cross-fetch');
const gql = require('graphql-tag');

const DEFAULT_SCOPE = 'api:read';
const DEFAULT_TOKEN_URL = 'https://panflux.app/oauth/v2/token';

/**
 * The Client class is the main encapsulation of a Panflux API client.
 */
module.exports = class Client extends EventEmitter {
    /**
     * Client constructor.
     *
     * @param {object} opts
     * @param {object?} token Optional cached token from previous session
     */
    constructor(opts, token) {
        super();

        opts = opts || {};
        ['tokenURL', 'clientID', 'clientSecret'].forEach((field) => {
            if (!(field in opts) || typeof opts[field] !== 'string') {
                throw Error(`Required property '${field}' is either not set or not a string value`);
            }
        });

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
     * @return {Promise<object>}
     */
    async authenticate() {
        return fetch(this._opts.tokenURL || DEFAULT_TOKEN_URL, {
            method: 'POST',
            body: JSON.stringify({
                grant_type: 'client_credentials',
                client_id: this._opts.clientID,
                client_secret: this._opts.clientSecret,
                scope: this._opts.scope || DEFAULT_SCOPE,
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
                const uri = (token.edges[0] || '') + '/graphql';
                return ApolloLink.from([
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
                    }, webSocketImpl: require('ws')}),
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
     * @return {Promise<object>} The raw query response
     */
    async query(query) {
        return this.getLink()
            .then((link) => makePromise(execute(link, {query: gql`query {${query}}`})))
            .then((response) => response.data)
        ;
    }

    /**
     * Start a GraphQL subscription. Do not wrap the query in `subscription { ... }` markers.
     *
     * @param {string} query
     * @param {function} cb Callback function to be called when events are returned.
     * @return {Promise<object>} The raw query response
     */
    async subscribe(query, cb) {
        return this.getLink()
            .then((link) => execute(link, {query: gql`subscription {${query}}`}).subscribe({
                next: (response) => cb(response.data),
            }))
        ;
    }

    /**
     * Return a promise resolving to an ApolloLink instance.
     *
     * @return {Promise<ApolloLink>}
     */
    async getLink() {
        if (!this._apollo) {
            this._apollo = this.connect();
        }
        // TODO: Detect expired tokens
        return this._apollo;
    }

    /** @return {token} */
    get token() {
        return this._token;
    }
};
