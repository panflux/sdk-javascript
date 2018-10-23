/*
 * Panflux Javascript SDK
 * (c) Omines Internetbureau B.V. - https://omines.nl/
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

const {ApolloLink, execute, makePromise} = require('apollo-link');
const {setContext} = require('apollo-link-context');
const {onError} = require('apollo-link-error');
const {createHttpLink} = require('apollo-link-http');

const EventEmitter = require('eventemitter3');
const fetch = require('cross-fetch');
const gql = require('graphql-tag');

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

        // TODO: Check options for validity
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
                scope: 'api:read',
            }),
            headers: {
                'Content-Type': 'application/json',
            },
        })
            .then((response) => response.json())
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
                return ApolloLink.from([
                    onError((params) => {
                        this.emit('error', params);
                    }),
                    setContext(() => ({
                        headers: {
                            accept: 'application/json',
                            authorization: token.access_token ? `Bearer ${token.access_token}` : '',
                        },
                    })),
                    createHttpLink({
                        uri: (token.edges[0] || '') + '/graphql',
                        fetch,
                    }),
                ]);
            })
        ;
    }

    /**
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
     * Return a promise resolving to an ApolloLink instance.
     *
     * @return {Promise<ApolloLink>}
     */
    async getLink() {
        if (!this._apollo) {
            this._apollo = this.connect();
        }
        return this._apollo;
    }

    /** @return {token} */
    get token() {
        return this._token;
    }
};
