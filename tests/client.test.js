/*
 * Panflux Javascript SDK
 * (c) Omines Internetbureau B.V. - https://omines.nl/
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import {Client} from '../src/index';

const testConfig = require('./testConfig');

test('Client instantiation', async () => {
    const onNewToken = jest.fn();

    const client = Client.init(testConfig);
    client.on('newToken', onNewToken);

    const token = await client.authenticate();

    expect(client).toBeInstanceOf(Client);
    expect(onNewToken).toHaveBeenCalledWith(token);
    expect(client.token).toBe(token);

    return client.query('query Me { me { id, name } }').then((response) => {
        expect(response.me.id).toMatch(/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/);

        // Double check for parametrized queries
        return client.query('query UserMe($id: UUID!) { user(id: $id) { id, name } }', {id: response.me.id}).then((nestedResponse) => {
            expect(nestedResponse.user.id).toBe(response.me.id);
        });
    });
});

test('Empty configuration', async () => {
    const client = Client.init();
    expect(client.authenticate()).rejects.toThrow('ClientID and ClientSecret options are required');
});

test('Invalid query', async () => {
    // This test may be slow on congested networks
    jest.setTimeout(15000);
    const onError = jest.fn();

    const client = Client.init(testConfig);
    client.on('error', onError);

    await expect(client.query('query { foo bar }')).rejects.toThrow(Error);
    expect(onError).toHaveBeenCalled();
});

test('Invalid credentials', async () => {
    const client = Client.init(Object.assign({}, testConfig, {clientID: '684'}));

    await expect(client.authenticate()).rejects.toThrow(Error);
});

test('Subscription', async () => {
    let client; let subscription;
    return new Promise((resolve) => {
        client = Client.init(testConfig);
        client.subscribe('subscription { ping }', (response) => {
            expect(response.ping).toMatch(/^2[0-9]{3}-[01][0-9]/);
            subscription.unsubscribe();
            expect(subscription.closed).toBe(true);
            resolve();
        }).then((s) => {
            subscription = s;
        });
    });
});

test('Invalid subscription', async () => {
    const client = Client.init(testConfig);
    return Promise.all([
        new Promise((resolve) => {
            client.on('error', (err) => resolve('Call failed correctly: ' + err.message));
        }),
        new Promise((resolve, reject) => {
            client.subscribe('subscription { nonexistentSubscription }',
                (data) => reject(new Error('Data callback should not be invoked')),
                (err) => resolve('Error callback was invoked correctly'),
            );
        }),
    ]);
});

test('Token reuse', async () => {
    const client1 = Client.init(testConfig);
    const client2 = Client.init(testConfig, await client1.authenticate());

    const onNewToken = jest.fn();
    client2.on('newToken', onNewToken);

    await client2.query('query { me { id, name } }');

    expect(onNewToken).toHaveBeenCalledTimes(0);
});
