/*
 * Panflux Javascript SDK
 * (c) Omines Internetbureau B.V. - https://omines.nl/
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

require('dotenv').config();

module.exports = {
    tokenURL: process.env.TOKEN_URL,
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
};
