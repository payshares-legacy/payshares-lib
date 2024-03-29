var EventEmitter = require('events').EventEmitter;
var util         = require('util');
var UInt160      = require('./uint160').UInt160;
var Currency     = require('./currency').Currency;
var RippleError  = require('./rippleerror').RippleError;
var Server       = require('./server').Server;

// Request events emitted:
//  'success' : Request successful.
//  'error'   : Request failed.
//  'remoteError'
//  'remoteUnexpected'
//  'remoteDisconnected'
function Request(remote, command) {
  EventEmitter.call(this);

  this.remote = remote;
  this.requested = false;

  this.message = {
    command: command,
    id: void(0)
  };
};

util.inherits(Request, EventEmitter);

Request.prototype.broadcast = function() {
  this._broadcast = true;
  return this.request();
};

// Send the request to a remote.
Request.prototype.request = function(remote) {
  if (this.requested) {
    return;
  }

  this.requested = true;

  this.on('error', function(){});
  this.emit('request', remote);

  if (this._broadcast) {
    this.remote._servers.forEach(function(server) {
      this.setServer(server);
      this.remote.request(this);
    }, this);
  } else {
    this.remote.request(this);
  }

  return this;
};

Request.prototype.callback = function(callback, successEvent, errorEvent) {
  var self = this;

  if (this.requested || typeof callback !== 'function') {
    return this;
  }

  var called = false;

  function requestSuccess(message) {
    if (!called) {
      called = true;
      callback.call(self, null, message);
    }
  };

  function requestError(error) {
    if (!called) {
      called = true;

      if (!(error instanceof RippleError)) {
        error = new RippleError(error);
      }

      callback.call(self, error);
    }
  };

  this.once(successEvent || 'success', requestSuccess);
  this.once(errorEvent   || 'error'  , requestError);
  this.request();

  return this;
};

Request.prototype.timeout = function(duration, callback) {
  var self = this;

  function requested() {
    self.timeout(duration, callback);
  };

  if (!this.requested) {
    // Defer until requested
    return this.once('request', requested);
  }

  var emit = this.emit;
  var timed_out = false;

  var timeout = setTimeout(function() {
    timed_out = true;

    if (typeof callback === 'function') {
      callback();
    }

    emit.call(self, 'timeout');
  }, duration);

  this.emit = function() {
    if (!timed_out) {
      clearTimeout(timeout);
      emit.apply(self, arguments);
    }
  };

  return this;
};

Request.prototype.setServer = function(server) {
  var selected = null;

  switch (typeof server) {
    case 'object':
      selected = server;
      break;

    case 'string':
      // Find server by URL
      var servers = this.remote._servers;

      for (var i=0, s; (s=servers[i]); i++) {
        if (s._url === server) {
          selected = s;
          break;
        }
      }
      break;
  };

  if (selected instanceof Server) {
    this.server = selected;
  }

  return this;
};

Request.prototype.buildPath = function(build) {
  if (this.remote.local_signing) {
    throw new Error(
      '`build_path` is completely ignored when doing local signing as '
      + '`Paths` is a component of the signed blob. The `tx_blob` is signed,'
      + 'sealed and delivered, and the txn unmodified after' );
  }

  if (build) {
    this.message.build_path = true;
  } else {
    // ND: rippled currently intreprets the mere presence of `build_path` as the
    // value being `truthy`
    delete this.message.build_path;
  }

  return this;
};

Request.prototype.ledgerChoose = function(current) {
  if (current) {
    this.message.ledger_index = this.remote._ledger_current_index;
  } else {
    this.message.ledger_hash  = this.remote._ledger_hash;
  }

  return this;
};

// Set the ledger for a request.
// - ledger_entry
// - transaction_entry
Request.prototype.ledgerHash = function(hash) {
  this.message.ledger_hash = hash;
  return this;
};

// Set the ledger_index for a request.
// - ledger_entry
Request.prototype.ledgerIndex = function(ledger_index) {
  this.message.ledger_index = ledger_index;
  return this;
};

Request.prototype.ledgerSelect = function(ledger) {
  switch (ledger) {
    case 'current':
    case 'closed':
    case 'validated':
      this.message.ledger_index = ledger;
      break;

    default:
      if (isNaN(ledger)) {
        this.message.ledger_hash  = ledger;
      } else if ((ledger = Number(ledger))) {
        this.message.ledger_index = ledger;
      }
      break;
  }

  return this;
};

Request.prototype.accountRoot = function(account) {
  this.message.account_root  = UInt160.json_rewrite(account);
  return this;
};

Request.prototype.index = function(index) {
  this.message.index  = index;
  return this;
};

// Provide the information id an offer.
// --> account
// --> seq : sequence number of transaction creating offer (integer)
Request.prototype.offerId = function(account, sequence) {
  this.message.offer = {
    account:  UInt160.json_rewrite(account),
    seq:      sequence
  };
  return this;
};

// --> index : ledger entry index.
Request.prototype.offerIndex = function(index) {
  this.message.offer = index;
  return this;
};

Request.prototype.secret = function(secret) {
  if (secret) {
    this.message.secret = secret;
  }
  return this;
};

Request.prototype.txHash = function(hash) {
  this.message.tx_hash = hash;
  return this;
};

Request.prototype.txJson = function(json) {
  this.message.tx_json = json;
  return this;
};

Request.prototype.txBlob = function(json) {
  this.message.tx_blob = json;
  return this;
};

Request.prototype.rippleState = function(account, issuer, currency) {
  this.message.ripple_state = {
    currency : currency,
    accounts : [
      UInt160.json_rewrite(account),
      UInt160.json_rewrite(issuer)
    ]
  };
  return this;
};

Request.prototype.accounts = function(accounts, proposed) {
  if (!Array.isArray(accounts)) {
    accounts = [ accounts ];
  }

  // Process accounts parameters
  var processedAccounts = accounts.map(function(account) {
    return UInt160.json_rewrite(account);
  });

  if (proposed) {
    this.message.accounts_proposed = processedAccounts;
  } else {
    this.message.accounts = processedAccounts;
  }

  return this;
};

Request.prototype.addAccount = function(account, proposed) {
  var processedAccount = UInt160.json_rewrite(account);

  if (proposed) {
    this.message.accounts_proposed = (this.message.accounts_proposed || []).concat(processedAccount);
  } else {
    this.message.accounts = (this.message.accounts || []).concat(processedAccount);
  }

  return this;
};

Request.prototype.rtAccounts =
Request.prototype.accountsProposed = function(accounts) {
  return this.accounts(accounts, true);
};

Request.prototype.addAccountProposed = function(account) {
  return this.addAccount(account, true);
};

Request.prototype.books = function(books, snapshot) {
  // Reset list of books (this method overwrites the current list)
  this.message.books = [ ];

  for (var i=0, l=books.length; i<l; i++) {
    var book = books[i];
    this.addBook(book, snapshot);
  }

  return this;
};

Request.prototype.addBook = function(book, snapshot) {
  if (!Array.isArray(this.message.books)) {
    this.message.books = [ ];
  }

  var json = { };

  function processSide(side) {
    if (!book[side]) {
      throw new Error('Missing ' + side);
    }

    var obj = json[side] = {
      currency: Currency.json_rewrite(book[side].currency)
    };

    if (obj.currency !== 'XPS') {
      obj.issuer = UInt160.json_rewrite(book[side].issuer);
    }
  }

  [ 'taker_gets', 'taker_pays' ].forEach(processSide);

  if (snapshot) {
    json.snapshot = true;
  }

  if (book.both) {
    json.both = true;
  }

  this.message.books.push(json);
};

exports.Request = Request;
