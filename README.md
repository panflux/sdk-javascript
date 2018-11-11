# Panflux Javascript SDK

[![Build Status](https://img.shields.io/travis/com/panflux/sdk-javascript.svg)](https://travis-ci.com/panflux/sdk-javascript)
[![Codecov](https://img.shields.io/codecov/c/github/panflux/sdk-javascript.svg)](https://codecov.io/gh/panflux/sdk-javascript)
[![npm version](https://badge.fury.io/js/%40panflux%2Fsdk.svg)](https://badge.fury.io/js/%40panflux%2Fsdk)
[![GitHub license](https://img.shields.io/github/license/panflux/sdk-javascript.svg)](https://github.com/panflux/sdk-javascript/blob/master/LICENSE)

This is the Javascript client library (SDK) for consuming Panflux APIs.

## Install

```bash
# Choose your flavor of package manager:
yarn add @panflux/sdk
# or
npm i --save @panflux/sdk
```

## Usage

Load the client class:
```js
const {Client} = require('@panflux/sdk');
// or
import Client from '@panflux/sdk';
```
Initialize the client:
```js
const client = Client.init({
    clientID: 'your-id',
    clientSecret: 'your-secret',
    tokenURL: 'endpoint-if-not-default'
})
```
Do a simple query:
```js
client.query('me { id, name }').then((response) => {
    console.info(`Authenticated as ${response.me.name}`);
});
```
Subscribe to ping tests:
```js
client.subscribe('ping',
    data => console.info(data),
    err => console.error(err),
    () => console.info('Subscription closed'),
}).then(subscription => {
    setTimeout(() => subscription.unsubscribe(), 5000);
});
```

### License

MIT, see the included LICENSE file.
