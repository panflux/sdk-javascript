import cryptoJS from 'crypto-js';

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
    const arr = new Uint8Array((len || 40) / 2);
    window.crypto.getRandomValues(arr);
    return Array.from(arr, (dec) => ('0' + dec.toString(16)).substr(-2)).join('');
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
     * @return {*}
     */
    validateResponse: function(response) {
        if (response.status !== 200) {
            throw Error(response.statusText);
        }
        return response.json();
    },
};
