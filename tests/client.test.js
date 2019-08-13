/*
 * Panflux Javascript SDK
 * (c) Omines Internetbureau B.V. - https://omines.nl/
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import {Client} from '../src/index';

const nock = require('nock');
const testConfig = require('./testConfig');

const dummyToken = {
    access_token: 'fake',
    edges: ['https://example.org'],
    expire_time: (+new Date() / 1000) + 3600,
    expires_in: 3600,
    refresh_token: 'fake',
    token_type: 'Bearer',
};

// register some global test URL's
nock('https://panflux.app')
    .post('/oauth/v2/token', (body) => {
        return body.client_id && body.client_id !== '[secure]';
    }).reply(400).persist()
    .post('/oauth/v2/authorize').reply(200).persist()
    .post('/oauth/v2/token').reply(200, JSON.stringify(dummyToken)).persist();

// register some mock URL's for edge
nock('https://example.org')
    .post('/graphql', (body) => {
        return body.operationName && body.operationName.trim() == 'Me';
    }).reply(200, '{"data":{"me": {"id":"44b1e286-5598-4e00-aadb-72a6080eecf4"}}, "errors":[]}').persist()
    .post('/graphql', (body) => {
        return body.operationName && body.operationName.trim() == 'UserMe';
    }).reply(200, '{"data":{"user":{"id":"44b1e286-5598-4e00-aadb-72a6080eecf4","name":"dummy"}}, "errors":[]}').persist();

nock('ws://example.org')
    .get().reply(500).persist();

test('Client instantiation', async () => {
    const onNewToken = jest.fn();

    const client = Client.init(testConfig);
    client.on('newToken', onNewToken);
    let token = null;

    try {
        token = await client.authenticate();
    } catch (e) {
        return Promise.reject(e);
    }

    expect(client).toBeInstanceOf(Client);
    expect(onNewToken).toHaveBeenCalledWith(token);
    expect(client.token).toBe(token);

    // TODO Revamp this part when underlying code is fixed
    return client.query('query Me { me { id, name } }').then(async (response) => {
        expect(response.me.id).toMatch(/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/);

        // Double check for parametrized queries
        return client.query('query UserMe($id: UUID!) { user(id: $id) { id, name } }', {id: response.me.id}).then((nestedResponse) => {
            console.log(nestedResponse);
            expect(nestedResponse.user.id).toBe(response.me.id);
            return Promise.resolve(JSON.stringify(nestedResponse));
        });
    });
});

test('Empty configuration', async () => {
    const client = Client.init({
        clientID: undefined,
        clientSecret: undefined,
    });
    await expect(client.authenticate()).rejects.toThrow('ClientID and ClientSecret options are required');
});

// TODO revamp when underlying code is fixed
// test('Invalid query', async () => {
//     // This test may be slow on congested networks
//     jest.setTimeout(15000);
//     const onError = jest.fn();

//     const client = Client.init(testConfig);
//     client.on('error', onError);

//     await expect(client.query('query { foo bar }')).rejects.toThrow(Error);
//     expect(onError).toHaveBeenCalled();
// });

test('Invalid credentials', async () => {
    const client = Client.init(Object.assign({}, testConfig, {clientID: '684'}));

    await expect(client.authenticate()).rejects.toThrow(Error);
});

// TODO revamp when underlying code is fixed
// test('Subscription', async () => {
//     let client; let subscription;
//     client = Client.init(testConfig);
//     await client.authenticate();
//     return new Promise((resolve) => {
//         client.subscribe('subscription { ping }', (response) => {
//             expect(response.ping).toMatch(/^2[0-9]{3}-[01][0-9]/);
//             subscription.unsubscribe();
//             expect(subscription.closed).toBe(true);
//             resolve();
//         }).then((s) => {
//             subscription = s;
//         });
//     });
// });

// TODO revamp when underlying code is fixed
// test('Invalid subscription', async () => {
//     const client = Client.init(testConfig);
//     return Promise.all([
//         new Promise((resolve) => {
//             client.on('error', (err) => resolve('Call failed correctly: ' + err.message));
//         }),
//         new Promise((resolve, reject) => {
//             client.subscribe('subscription { nonexistentSubscription }',
//                 (data) => reject(new Error('Data callback should not be invoked')),
//                 (err) => resolve('Error callback was invoked correctly'),
//             );
//         }),
//     ]);
// });

// TODO revamp when underlying code is fixed
// test('Token reuse', async () => {
//     const client1 = Client.init(testConfig);
//     const client2 = Client.init(testConfig, await client1.authenticate());

//     const onNewToken = jest.fn();
//     client2.on('newToken', onNewToken);

//     await client2.query('query { me { id, name } }');

//     expect(onNewToken).toHaveBeenCalledTimes(0);
// });
