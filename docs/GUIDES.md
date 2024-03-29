#`payshares-lib` Guides

This file provides step-by-step walkthroughs for some of the most common usages of `payshares-lib`.

###Guides in this document:

1. [Connecting to the Payshares network with `Remote`](GUIDES.md#1-connecting-to-the-payshares-network-with-remote)
2. [Using `Remote` functions and `Request` objects](GUIDES.md#2-using-remote-functions-and-request-objects)
3. [Submitting a payment to the network](GUIDES.md#3-submitting-a-payment-to-the-network)
   * [A note on transaction fees](GUIDES.md#a-note-on-transaction-fees)
4. [Submitting a trade offer to the network](GUIDES.md#4-submitting-a-trade-offer-to-the-network)
5. [Listening to the network](GUIDES.md#5-listening-to-the-network)


###Also see:

1. [The `payshares-lib` README](../README.md)
2. [The `payshares-lib` API Reference](REFERENCE.md)

##1. Connecting to the Payshares network with `Remote`

1. [Get `payshares-lib`](README.md#getting-payshares-lib)
2. Load the `payshares-lib` module into a Node.js file or webpage:
  ```js
  /* Loading payshares-lib with Node.js */
  var Remote = require('payshares-lib').Remote;

  /* Loading payshares-lib in a webpage */
  // var Remote = payshares.Remote;
  ```
3. Create a new `Remote` and connect to the network:
  ```js
  var remote = new Remote({options});

  remote.connect(function() {
    /* remote connected, use some remote functions here */
  });
  ```
  __NOTE:__ See the API Reference for available [`Remote` options](REFERENCE.md#1-remote-options)
4. You're connected! Read on to see what to do now.


##2. Using `Remote` functions and `Request` objects

All `Remote` functions return a `Request` object. 

A `Request` is an `EventEmitter` so you can listen for success or failure events -- or, instead, you can provide a callback to the `Remote` function.

Here is an example, using `request_server_info()`, of how `Remote` functions can be used with event listeners (the first code block) or with a callback (the second block):

+ Using a `Remote` function with `Request` event listeners:
```js
var request = remote.request_server_info();
request.on('success', function(res) {
  //handle success
});
request.on('error', function(err) {
  //handle error
});
request.request(); // this triggers the request if it has not already been sent to the server
```

+ Using a `Remote` function with a callback:
```js
remote.request_server_info(function(err, res) {
  if (err) {
    //handle error
  } else {
    //handle success
  }
});
```

__NOTE:__ See the API Reference for available [`Remote` functions](REFERENCE.md#2-remote-functions)




##3. Submitting a payment to the network

Submitting a payment transaction to the Payshares network involves connecting to a `Remote`, creating a transaction, signing it with the user's secret, and submitting it to the `paysharesd` server. Note that the `Amount` module is used to convert human-readable amounts like '1XRP' or '10.50USD' to the type of Amount object used by the Payshares network.

```js
/* Loading payshares-lib Remote and Amount modules in Node.js */ 
var Remote = require('payshares-lib').Remote;
var Amount = require('payshares-lib').Amount;

/* Loading payshares-lib Remote and Amount modules in a webpage */
// var Remote = payshares.Remote;
// var Amount = payshares.Amount;

var MY_ADDRESS = 'rrrMyAddress';
var MY_SECRET  = 'secret';
var RECIPIENT  = 'rrrRecipient';
var AMOUNT     = Amount.from_human('1XPS');

var remote = new Remote({ /* Remote options */ });

remote.connect(function() {
  remote.set_secret(MY_ADDRESS, MY_SECRET);

  var transaction = remote.transaction();

  transaction.payment({
    from: MY_ADDRESS, 
    to: RECIPIENT, 
    amount: AMOUNT
  });

  transaction.submit(function(err, res) {
    /* handle submission errors / success */
  });
});
```

###A note on transaction fees

A full description of network transaction fees can be found on the [Payshares Wiki](https://wiki.payshares.co/Transaction_Fee).

In short, transaction fees are very small amounts (on the order of ~10) of [Stroop](https://wiki.payshares.co/Stroop) spent with every transaction. They are largely used to account for network load and prevent spam. With `payshares-lib`, transaction fees are calculated locally by default and the fee you are willing to pay is submitted along with your transaction.

Since the fee required for a transaction may change between the time when the original fee was calculated and the time when the transaction is submitted, it is wise to use the [`fee_cushion`](REFERENCE.md#1-remote-options) to ensure that the transaction will go through. For example, suppose the original fee calculated for a transaction was 10 stroop but at the instant the transaction is submitted the server is experiencing a higher load and it has raised its minimum fee to 12 stroop. Without a `fee_cushion`, this transaction would not be processed by the server, but with a `fee_cushion` of, say, 1.5 it would be processed and you would just pay the 2 extra stroop.

The [`max_fee`](REFERENCE.md#1-remote-options) option can be used to avoid submitting a transaction to a server that is charging unreasonably high fees.


##4. Submitting a trade offer to the network

Submitting a trade offer to the network is similar to submitting a payment transaction. Here is an example for a trade that expires in 24 hours where you are offering to sell 1 USD in exchange for 100 XPS:

```js
/* Loading payshares-lib Remote and Amount modules in Node.js */ 
var Remote = require('payshares-lib').Remote;
var Amount = require('payshares-lib').Amount;

/* Loading payshares-lib Remote and Amount modules in a webpage */
// var Remote = payshares.Remote;
// var Amount = payshares.Amount;

var MY_ADDRESS = 'rrrMyAddress';
var MY_SECRET  = 'secret';

var BUY_AMOUNT = Amount.from_human('100XPS');
var SELL_AMOUNT = Amount.from_human('1USD');

// EXPIRATION must be a Date object, leave undefined to submit offer that won't expire
var now = new Date();
var tomorrow = new Date(now.getTime() + (24 * 60 * 60 * 1000));
var EXPIRATION = tomorrow;

var remote = new Remote({ /* Remote options */ });

remote.connect(function() {
  remote.set_secret(MY_ADDRESS, MY_SECRET);

  var transaction = remote.transaction();

  transaction.offer_create({
    from: MY_ADDRESS, 
    buy: BUY_AMOUNT, 
    sell: SELL_AMOUNT, 
    expiration: EXPIRATION
  });

  transaction.submit(function(err, res) {
    /* handle submission errors / success */
  });
});
```

##5. Listening to the network

In some (relatively rare) cases you may want to subscribe to the network event feed and listen for transactions and the ledger closings.

```js
 /* Loading payshares-lib with Node.js */
  var Remote = require('payshares-lib').Remote;

  /* Loading payshares-lib in a webpage */
  // var Remote = payshares.Remote;

  var remote = new Remote({options});

  remote.connect(function() {
    remote.on('transaction_all', transactionListener);
    remote.on('ledger_closed', ledgerListener);
  });

  function transactionListener (transaction_data) {
    // handle transaction_data
    // see https://www.payshares.co/api/#api-subscribe for the format of transaction_data
  }

  function ledgerListener (ledger_data) {
    // handle ledger_data
    // see https://www.payshares.co/api/#api-subscribe for the format of ledger_data
  }
```
* https://https://www.payshares.co/api/#api-subscribe

