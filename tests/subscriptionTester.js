/*
 * Panflux Javascript SDK
 * (c) Omines Internetbureau B.V. - https://omines.nl/
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

const Client = require('../src/client');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

Client.init(require('./testConfig')).subscribe('ping',
    (data) => console.info(data),
    (err) => console.error(err),
    () => console.log('Completed'),
).then((subscription) => {
    setTimeout(() => subscription.unsubscribe(), 5000);
});
