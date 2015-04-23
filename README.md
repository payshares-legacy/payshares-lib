#The Payshares JavaScript Library

`payshares-lib` connects to the Payshares network via the WebSocket protocol.  It runs in Node.js or in the browser.



###Use payshares-lib for:

+ Connecting to a local or remote paysharesd in JavaScript (Node.js or browser)
+ Issuing [paysharesd API](https://www.payshares.org/api/) requests
+ Listening to events on the payshares network (transaction, ledger, etc.)
+ Signing and submitting transactions to the payshares network

###In this file:

1. Overview
2. [Getting `payshares-lib`](README.md#getting-payshares-lib)
3. [Quickstart](README.md#quickstart)
4. [Running tests](https://github.com/payshares/payshares-lib#running-tests)

###For additional documentation see:

1. [The `payshares-lib` Guides (docs/GUIDES.md)](docs/GUIDES.md)
2. [The `payshares-lib` API Reference (docs/REFERENCE.md)](docs/REFERENCE.md)


###Also see:

+ https://wiki.payshares.org/
+ https://www.payshares.org/

##Getting `payshares-lib`

**Via npm for Node.js**

```
  $ npm install payshares-lib
```

**Build from the source using `gulp`**

```
  $ git clone https://github.com/payshares/payshares-lib
  $ cd payshares-lib
  $ npm install
  $ gulp
```

Then use the minified `build/payshares-*-min.js` in your webpage

##Quickstart

`Remote` ([remote.js](https://github.com/payshares/payshares-lib/blob/develop/src/js/payshares/remote.js)) is the module responsible for managing connections to `paysharesd` servers:

```js
/* Loading payshares-lib with Node.js */
var Remote = require('payshares-lib').Remote;

/* Loading payshares-lib in a webpage */
// var Remote = payshares.Remote;

var remote = new Remote({
  // see the API Reference for available options
  trusted:        true,
  local_signing:  true,
  local_fee:      true,
  fee_cushion:     1.5,
  servers: [
    {
        host:    'live.payshares.org'
      , port:    9001
      , secure:  true
    }
  ]
});

remote.connect(function() {
  /* remote connected */

  // see the API Reference for available functions
});
```

See [The `payshares-lib` Guides](docs/GUIDES.md) and [The `payshares-lib` API Reference](docs/REFERENCE.md) for walkthroughs and details about all of the available functions and options.

##Running tests

1. Clone the repository

2. `cd` into the repository and install dependencies with `npm install`

3. `npm test` or `make test` or `node_modules\.bin\mocha test\*-test.js` 

**Generating code coverage**

payshares-lib uses `istanbul` to generate code coverage. To create a code coverage report, run `npm test --coverage`. The report will be created in `coverage/lcov-report/`.
