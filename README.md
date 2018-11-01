Panflux Javascript SDK
----------------------

[![Build Status](https://travis-ci.com/panflux/sdk-javascript.svg?branch=master)](https://travis-ci.com/panflux/sdk-javascript)
[![codecov](https://codecov.io/gh/panflux/sdk-javascript/branch/master/graph/badge.svg)](https://codecov.io/gh/panflux/sdk-javascript)

Do not use yet, unstable development going on.

Install
-------
```bash
# Choose your flavor of package manager:
yarn add @panflux/sdk
# or
npm i --save @panflux/sdk
```

Usage
-----
Load the client class:
```js
const {Client} = require('@panflux/sdk');
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
    () => console.log('Completed'),
}).then(subscription => {
    setTimeout(() => subscription.unsubscribe(), 5000);
});
```
