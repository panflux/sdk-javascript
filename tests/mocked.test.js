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
    await expect(client.authenticate()).rejects.toThrow();
});

test('Scope joining and retrieval', async () => {
    fetch
        .mockResolvedValueOnce(new Response(JSON.stringify({
            edges: ['https://fake.edge.com/'],
            access_token: 'foo',
        })));

    await Client.init(Object.assign({}, testConfig, {
        scope: ['foo', 'bar', 'baz'],
    })).authenticate();

    expect(JSON.parse(fetch.mock.calls[0][1].body).scope).toBe('foo bar baz');
});

// TODO revamp when underlying code is fixed
// test('Lazy link reuse', async () => {
//     const client = Client.init(testConfig);
//     client.connect = jest.fn().mockResolvedValue('foo');

//     expect(client.getLink()).toEqual(client.getLink());
//     expect(client.connect).toHaveBeenCalledTimes(1);
// });
