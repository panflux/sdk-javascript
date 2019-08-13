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

// This should stop the websocket Apollo link from trying
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

    return client.query('query Me { me { id, name } }').then(async (response) => {
        expect(response.me.id).toMatch(/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/);

        // Double check for parametrized queries
        return client.query('query UserMe($id: UUID!) { user(id: $id) { id, name } }', {id: response.me.id}).then((nestedResponse) => {
            expect(nestedResponse.user.id).toBe(response.me.id);
            return Promise.resolve(JSON.stringify(nestedResponse));
        });
    });
});

test('Empty configuration', async () => {
    // we explicitly set the values to undefined since it seems to hold data from earlier tests.
    const client = Client.init({
        clientID: undefined,
        clientSecret: undefined,
    });
    await expect(client.authenticate()).rejects.toThrow('ClientID and ClientSecret options are required');
});

test('Invalid query', async () => {
    // This test may be slow on congested networks
    jest.setTimeout(15000);

    const client = Client.init(testConfig);
    await expect(client.query('query { foo bar }')).rejects.toThrow(Error);
});

test('Invalid credentials', async () => {
    const client = Client.init(Object.assign({}, testConfig, {clientID: '684'}));

    await expect(client.authenticate()).rejects.toThrow(Error);
});

test('Channel token message handling', async () => {
    const client = Client.init(testConfig);
    const ev = {
        data: {
            type: 'panflux_token',
            code: 'dummy',
        },
    };

    client._onChannelMessage(ev);
    expect(client.resolving).toBe(true);
});

test('Channel error message handling', async () => {
    const client = Client.init(testConfig);
    const data = {
        type: 'panflux_oauth_error',
        message: 'dummy',
    };
    const ev = {
        data: data,
    };
    const fn = jest.fn();
    client.on('oauthError', fn);

    client._onChannelMessage(ev);
    expect(fn).toHaveBeenCalledWith(data);

    // this should not cause some wild exception.
    client._onChannelMessage();
});

test('Run the code to login from a browser in a new window', () => {
    const openFn = jest.fn();

    // construct a mock window object
    global.window = Object.create(window);
    global.window.open = openFn;

    const config = {ClientID: testConfig.ClientID, sameWindow: false};
    const client = Client.init(config);
    client._loginFromBrowser();

    expect(openFn).toHaveBeenCalledWith(expect.stringMatching(/https:\/\/panflux\.app\/oauth\/v2\/authorize\?response_type=code*/));
});

test('Run the code to login from a browser in the new window', () => {
    // construct a mock window object
    global.window = Object.create(window);
    Object.defineProperty(window, 'location', {
        value: {
            href: '',
        },
        writable: true,
    });

    const config = {ClientID: testConfig.ClientID, sameWindow: true};
    const client = Client.init(config);
    client._loginFromBrowser();

    expect(global.window.location.href).toEqual(expect.stringMatching(/https:\/\/panflux\.app\/oauth\/v2\/authorize\?response_type=code*/));
});

test('Handle browser result', async () => {
    const config = {ClientID: testConfig.ClientID, sameWindow: true};
    const client = Client.init(config);

    // construct a mock window object
    global.window = Object.create(window);
    window.localStorage.setItem('panflux_token', 'state');

    const result = await client.handleBrowserResult({
        code: 'code',
        state: 'state',
    }, 'https://return.url');

    expect(result).toBe(true);
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
