import cryptoJS from 'crypto-js';
import cryptoRandomString from 'crypto-random-string';

/**
 * @param {string} string
 * @return {string}
 */
function base64URL(string) {
    return string.toString(cryptoJS.enc.Base64).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * @param {number} len
 * @return {string}
 */
function generateRandomString(len) {
    return cryptoRandomString({length: (len || 40)});
}

export default {
    /**
     * Generate a code_challenge parameter based on a provided code_verifier value.
     *
     * @param {string} codeVerifier
     * @return {string}
     */
    generateCodeChallenge: function(codeVerifier) {
        return base64URL(cryptoJS.SHA256(codeVerifier));
    },

    /**
     * Generate a random code_verifier
     *
     * @return {string}
     */
    generateCodeVerifier: function() {
        return generateRandomString(64);
    },

    /**
     * Generate a CSRF token
     *
     * @return {string}
     */
    generateCSRF: function() {
        return generateRandomString(16);
    },

    /**
     * This function should be chained to a fetch request Promise to process the response parameters
     *
     * @param {object} response
     * @return {Promise<Object>}
     */
    validateResponse: async function(response) {
        if (response.status !== 200) {
            return Promise.reject(new Error(response.statusText));
        }
        return Promise.resolve(response.json());
    },
};
