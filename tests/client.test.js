/*
 * Panflux Javascript SDK
 * (c) Omines Internetbureau B.V. - https://omines.nl/
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

const {Client} = require('../index.js');
const testConfig = require('./testConfig');

test('Client instantiation', async () => {
    const onNewToken = jest.fn();

    const client = Client.init(testConfig);
    client.on('newToken', onNewToken);

    const token = await client.authenticate();

    expect(client).toBeInstanceOf(Client);
    expect(onNewToken).toBeCalledWith(token);
    expect(client.token).toBe(token);

    return client.query('me { id, name }');
});

test('Missing required properties', () => {
    expect(() => Client.init()).toThrow('Required property');
    expect(() => Client.init({tokenURL: 'https://example.org/'})).toThrow('Required property');
});

test('Invalid query', async () => {
    const onError = jest.fn();

    const client = Client.init(testConfig);
    client.on('error', onError);

    return client.query('foo bar').catch((error) => {
        expect(onError).toBeCalled();
        expect(error.message).toContain('Response not successful');
    });
});

test('Invalid credentials', async () => {
    const client = Client.init(Object.assign({}, testConfig, {clientID: '684'}));

    await expect(client.authenticate()).rejects.toThrow(Error);
});

test('Subscription', async () => {
    let client; let subscription;
    return new Promise((resolve) => {
        client = Client.init(testConfig);
        client.subscribe('ping', (response) => {
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
    return new Promise((resolve, reject) => {
        const client = Client.init(testConfig);
        client.on('error', (err) => {
            resolve('Call failed correctly: ' + err.message);
        });
        client.subscribe('pong', (data) => {
            reject('Call did not fail');
        });
    });
});

test('Token reuse', async () => {
    const client1 = Client.init(testConfig);
    const client2 = Client.init(testConfig, await client1.authenticate());

    const onNewToken = jest.fn();
    client2.on('newToken', onNewToken);

    await client2.query('me { id, name }');

    expect(onNewToken).toHaveBeenCalledTimes(0);
});
