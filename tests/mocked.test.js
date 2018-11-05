/*
 * Panflux Javascript SDK
 * (c) Omines Internetbureau B.V. - https://omines.nl/
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import {Client} from '../src/index';

jest.mock('cross-fetch');
const {fetch} = require('cross-fetch');
const {Response} = jest.requireActual('cross-fetch');

afterEach(() => fetch.mockClear());

const testConfig = {
    clientID: 'foo',
    clientSecret: 'bar',
};

test('Default configurations', async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({
        edges: ['https://fake.edge.com/'],
        access_token: 'foo',
    })));

    const client = Client.init(testConfig);
    const token = await client.authenticate();

    expect(token.access_token).toBe('foo');
    expect(fetch).toHaveBeenCalledTimes(1);
});

test('Invalid token handling', async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({
        edges: [],
        access_token: 'foo',
    })));

    const client = Client.init(testConfig);
    expect(client.authenticate()).rejects.toThrow();
});

test('Lazy link reuse', async () => {
    const client = Client.init(testConfig);
    client.connect = jest.fn().mockResolvedValue('foo');

    expect(client.getLink()).toEqual(client.getLink());
    expect(client.connect).toHaveBeenCalledTimes(1);
});
