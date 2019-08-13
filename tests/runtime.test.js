/*
 * Panflux Javascript SDK
 * (c) Omines Internetbureau B.V. - https://omines.nl/
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import runtime from '../src/runtime';

test('Generate CSRF token', () => {
    const token1 = runtime.generateCSRF();
    const token2 = runtime.generateCSRF();

    expect(token1.length).toBe(16);
    expect(token2.length).toBe(16);
    expect(token1).not.toEqual(token2);
});

test('Generate code verifier', () => {
    const verifier1 = runtime.generateCodeVerifier();
    const verifier2 = runtime.generateCodeVerifier();

    expect(verifier1.length).toBe(64);
    expect(verifier2.length).toBe(64);
    expect(verifier1).not.toEqual(verifier2);
});

test('Sign code challenge', () => {
    const verifier = runtime.generateCodeVerifier();
    const challenge = runtime.generateCodeChallenge(verifier);

    expect(challenge.length).toBe(43);
});

test('Resolve good request', async () => {
    const json = jest.fn();
    const resp = {
        status: 200,
        json: json,
    };

    await runtime.validateResponse(resp);
    expect(json).toHaveBeCalled();
});

test('Resolve bad request', async () => {
    const resp = {
        status: 500,
        statusText: 'ERROR MESSAGE',
    };

    await expect(runtime.validateResponse(resp)).rejects.toThrow('ERROR MESSAGE');
});
