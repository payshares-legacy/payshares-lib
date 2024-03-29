var payshares =
/******/ (function(modules) { // webpackBootstrap
/******/ 	
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;
/******/ 		
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};
/******/ 		
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 		
/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;
/******/ 		
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/******/ 	
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/ 	
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/ 	
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/ 	
/******/ 	
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ function(module, exports, __webpack_require__) {

	exports.Remote           = __webpack_require__(1).Remote;
	exports.Request          = __webpack_require__(2).Request;
	exports.Amount           = __webpack_require__(3).Amount;
	exports.Account          = __webpack_require__(4).Account;
	exports.Transaction      = __webpack_require__(5).Transaction;
	exports.Currency         = __webpack_require__(6).Currency;
	exports.Base             = __webpack_require__(7).Base;
	exports.UInt160          = __webpack_require__(8).UInt160;
	exports.UInt256          = __webpack_require__(9).UInt256;
	exports.Seed             = __webpack_require__(10).Seed;
	exports.Meta             = __webpack_require__(11).Meta;
	exports.SerializedObject = __webpack_require__(12).SerializedObject;
	exports.RippleError      = __webpack_require__(13).RippleError;
	exports.Message          = __webpack_require__(14).Message;
	exports.VaultClient      = __webpack_require__(15).VaultClient;
	exports.AuthInfo         = __webpack_require__(16).AuthInfo;
	exports.RippleTxt        = __webpack_require__(17).RippleTxt;
	exports.binformat        = __webpack_require__(18);
	exports.utils            = __webpack_require__(19);
	exports.Server           = __webpack_require__(20).Server;

	// Important: We do not guarantee any specific version of SJCL or for any
	// specific features to be included. The version and configuration may change at
	// any time without warning.
	//
	// However, for programs that are tied to a specific version of ripple.js like
	// the official client, it makes sense to expose the SJCL instance so we don't
	// have to include it twice.
	exports.sjcl   = __webpack_require__(19).sjcl;

	exports.config = __webpack_require__(21);

	// camelCase to under_scored API conversion
	function attachUnderscored(c) {
	  var o = exports[c];

	  Object.keys(o.prototype).forEach(function(key) {
	    var UPPERCASE = /([A-Z]{1})[a-z]+/g;

	    if (!UPPERCASE.test(key)) {
	      return;
	    }

	    var underscored = key.replace(UPPERCASE, function(c) {
	      return '_' + c.toLowerCase();
	    });

	    o.prototype[underscored] = o.prototype[key];
	  });
	};

	[ 'Remote',
	  'Request',
	  'Transaction',
	  'Account',
	  'Server'
	].forEach(attachUnderscored);

	// vim:sw=2:sts=2:ts=8:et


/***/ },
/* 1 */
/***/ function(module, exports, __webpack_require__) {

	// Remote access to a server.
	// - We never send binary data.
	// - We use the W3C interface for node and browser compatibility:
	//   http://www.w3.org/TR/websockets/#the-websocket-interface
	//
	// This class is intended for both browser and Node.js use.
	//
	// This class is designed to work via peer protocol via either the public or
	// private WebSocket interfaces. The JavaScript class for the peer protocol
	// has not yet been implemented. However, this class has been designed for it
	// to be a very simple drop option.
	//
	// YYY Will later provide js/network.js which will transparently use multiple
	// instances of this class for network access.

	var EventEmitter = __webpack_require__(35).EventEmitter;
	var util         = __webpack_require__(36);
	var LRU          = __webpack_require__(47);
	var Request      = __webpack_require__(2).Request;
	var Server       = __webpack_require__(20).Server;
	var Amount       = __webpack_require__(3).Amount;
	var Currency     = __webpack_require__(6).Currency;
	var UInt160      = __webpack_require__(8).UInt160;
	var Transaction  = __webpack_require__(5).Transaction;
	var Account      = __webpack_require__(4).Account;
	var Meta         = __webpack_require__(11).Meta;
	var OrderBook    = __webpack_require__(22).OrderBook;
	var PathFind     = __webpack_require__(23).PathFind;
	var RippleError  = __webpack_require__(13).RippleError;
	var utils        = __webpack_require__(19);
	var sjcl         = __webpack_require__(19).sjcl;
	var config       = __webpack_require__(21);
	var log          = __webpack_require__(24).internal.sub('remote');

	/**
	 *    Interface to manage the connection to a Ripple server.
	 *
	 *    This implementation uses WebSockets.
	 *
	 *    Keys for opts:
	 *
	 *      trace
	 *      max_listeners      : Set maxListeners for remote; prevents EventEmitter warnings
	 *      connection_offset  : Connect to remote servers on supplied interval (in seconds)
	 *      trusted            : truthy, if remote is trusted
	 *      max_fee            : Maximum acceptable transaction fee
	 *      fee_cushion        : ESTRa fee multiplier to account for async fee changes.
	 *      servers            : Array of server objects with the following form
	 *      canonical_signing  : Signatures should be canonicalized and the "canonical" flag set
	 *
	 *         {
	 *              host:    <string>
	 *            , port:    <number>
	 *            , secure:  <boolean>
	 *         }
	 *
	 *    Events:
	 *      'connect'
	 *      'disconnect'
	 *      'state':
	 *      - 'online'        : Connected and subscribed.
	 *      - 'offline'       : Not subscribed or not connected.
	 *      'subscribed'      : This indicates stand-alone is available.
	 *
	 *    Server events:
	 *      'ledger_closed'   : A good indicate of ready to serve.
	 *      'transaction'     : Transactions we receive based on current subscriptions.
	 *      'transaction_all' : Listening triggers a subscribe to all transactions
	 *                          globally in the network.
	 *
	 *    @param opts      Connection options.
	 *    @param trace
	 */

	function Remote(opts, trace) {
	  EventEmitter.call(this);

	  var self = this;
	  var opts = opts || { };

	  this.trusted = Boolean(opts.trusted);
	  this.state = 'offline'; // 'online', 'offline'
	  this._server_fatal = false; // True, if we know server exited.

	  this.local_sequence = Boolean(opts.local_sequence); // Locally track sequence numbers
	  this.local_fee = (typeof opts.local_fee === 'boolean') ? opts.local_fee : true;// Locally set fees
	  this.local_signing = (typeof opts.local_signing === 'boolean') ? opts.local_signing : true;
	  this.canonical_signing = (typeof opts.canonical_signing === 'boolean') ? opts.canonical_signing : true;

	  this.fee_cushion = (typeof opts.fee_cushion === 'number') ? opts.fee_cushion : 1.2;
	  this.max_fee = (typeof opts.max_fee === 'number') ? opts.max_fee : Infinity;

	  this._ledger_current_index = void(0);
	  this._ledger_hash = void(0);
	  this._ledger_time = void(0);

	  this._stand_alone = void(0);
	  this._testnet = void(0);
	  this.trace = Boolean(opts.trace);

	  this._transaction_subs = 0;
	  this._connection_count = 0;
	  this._connected = false;

	  this._connection_offset = 1000 * (typeof opts.connection_offset === 'number' ? opts.connection_offset : 0);
	  this._submission_timeout = 1000 * (typeof opts.submission_timeout === 'number' ? opts.submission_timeout : 10);

	  this._received_tx = LRU({ max: 100 });
	  this._cur_path_find = null;

	  // Local signing implies local fees and sequences
	  if (this.local_signing) {
	    this.local_sequence = true;
	    this.local_fee = true;
	  }

	  this._servers = [ ];
	  this._primary_server = void(0);

	  // Cache information for accounts.
	  // DEPRECATED, will be removed
	  // Consider sequence numbers stable if you know you're not generating bad transactions.
	  // Otherwise, clear it to have it automatically refreshed from the network.
	  // account : { seq : __ }
	  this.accounts = { };

	  // Account objects by AccountId.
	  this._accounts = { };

	  // OrderBook objects
	  this._books = { };

	  // Secrets that we know about.
	  // Secrets can be set by calling set_secret(account, secret).
	  // account : secret
	  this.secrets = { };

	  // Cache for various ledgers.
	  // XXX Clear when ledger advances.
	  this.ledgers = {
	    current : {
	      account_root : { }
	    }
	  };

	  if (typeof this._connection_offset !== 'number') {
	    throw new TypeError('Remote "connection_offset" configuration is not a Number');
	  }

	  if (typeof this._submission_timeout !== 'number') {
	    throw new TypeError('Remote "submission_timeout" configuration is not a Number');
	  }

	  if (typeof this.max_fee !== 'number') {
	    throw new TypeError('Remote "max_fee" configuration is not a Number');
	  }

	  if (typeof this.fee_cushion !== 'number') {
	    throw new TypeError('Remote "fee_cushion" configuration is not a Number');
	  }

	  if (!/^(undefined|boolean)$/.test(typeof opts.trace)) {
	    throw new TypeError('Remote "trace" configuration is not a Boolean');
	  }

	  if (typeof this.local_signing !== 'boolean') {
	    throw new TypeError('Remote "local_signing" configuration is not a Boolean');
	  }

	  if (typeof this.local_fee !== 'boolean') {
	    throw new TypeError('Remote "local_fee" configuration is not a Boolean');
	  }

	  if (typeof this.local_sequence !== 'boolean') {
	    throw new TypeError('Remote "local_sequence" configuration is not a Boolean');
	  }

	  if (!/^(undefined|number)$/.test(typeof opts.ping)) {
	    throw new TypeError('Remote "ping" configuration is not a Number');
	  }

	  if (!/^(undefined|object)$/.test(typeof opts.storage)) {
	    throw new TypeError('Remote "storage" configuration is not an Object');
	  }

	  // Fallback for previous API
	  if (!opts.hasOwnProperty('servers') && opts.websocket_ip) {
	    opts.servers = [
	      {
	        host:     opts.websocket_ip,
	        port:     opts.websocket_port,
	        secure:   opts.websocket_ssl,
	        trusted:  opts.trusted
	      }
	    ];
	  }

	  (opts.servers || []).forEach(function(server) {
	    var pool = Number(server.pool) || 1;
	    while (pool--) {
	      self.addServer(server);
	    };
	  });

	  // This is used to remove Node EventEmitter warnings
	  var maxListeners = opts.maxListeners || opts.max_listeners || 0;

	  this._servers.concat(this).forEach(function(emitter) {
	    if (emitter instanceof EventEmitter) {
	      emitter.setMaxListeners(maxListeners);
	    }
	  });

	  function listenerAdded(type, listener) {
	    if (type === 'transaction_all') {
	      if (!self._transaction_subs && self._connected) {
	        self.request_subscribe('transactions').request();
	      }
	      self._transaction_subs += 1;
	    }
	  };

	  this.on('newListener', listenerAdded);

	  function listenerRemoved(type, listener) {
	    if (type === 'transaction_all') {
	      self._transaction_subs -= 1;
	      if (!self._transaction_subs && self._connected) {
	        self.request_unsubscribe('transactions').request();
	      }
	    }
	  };

	  this.on('removeListener', listenerRemoved);

	  if (opts.storage) {
	    this.storage = opts.storage;
	    this.once('connect', this.getPendingTransactions.bind(this));
	  }

	  function pingServers() {
	    var pingRequest = self.requestPing();
	    pingRequest.on('error', function(){});
	    pingRequest.broadcast();
	  };

	  if (opts.ping) {
	    this.once('connect', function() {
	      self._pingInterval = setInterval(pingServers, opts.ping * 1000);
	    });
	  }
	};

	util.inherits(Remote, EventEmitter);

	// Flags for ledger entries. In support of account_root().
	Remote.flags = {
	  // Account Root
	  account_root: {
	    PasswordSpent:   0x00010000, // True, if password set fee is spent.
	    RequireDestTag:  0x00020000, // True, to require a DestinationTag for payments.
	    RequireAuth:     0x00040000, // True, to require a authorization to hold IOUs.
	    DisallowXRP:     0x00080000, // True, to disallow sending XRP.
	    DisableMaster:   0x00100000  // True, force regular key.
	  },

	  // Offer
	  offer: {
	    Passive:         0x00010000,
	    Sell:            0x00020000  // True, offer was placed as a sell.
	  },

	  // Ripple State
	  state: {
	    LowReserve:      0x00010000, // True, if entry counts toward reserve.
	    HighReserve:     0x00020000,
	    LowAuth:         0x00040000,
	    HighAuth:        0x00080000,
	    LowNoRipple:     0x00100000,
	    HighNoRipple:    0x00200000
	  }
	};

	Remote.from_config = function(obj, trace) {
	  var serverConfig = (typeof obj === 'string') ? config.servers[obj] : obj;
	  var remote = new Remote(serverConfig, trace);

	  function initializeAccount(account) {
	    var accountInfo = config.accounts[account];
	    if (typeof accountInfo === 'object') {
	      if (accountInfo.secret) {
	        // Index by nickname
	        remote.setSecret(account, accountInfo.secret);
	        // Index by account ID
	        remote.setSecret(accountInfo.account, accountInfo.secret);
	      }
	    }
	  };

	  if (config.accounts) {
	    Object.keys(config.accounts).forEach(initializeAccount);
	  }

	  return remote;
	};

	/**
	 * Check that server message is valid
	 *
	 * @param {Object} message
	 */

	Remote.isValidMessage = function(message) {
	  return (typeof message === 'object')
	      && (typeof message.type === 'string');
	};

	/**
	 * Check that server message contains valid
	 * ledger data
	 *
	 * @param {Object} message
	 */

	Remote.isValidLedgerData = function(message) {
	  return (typeof message === 'object')
	    && (typeof message.fee_base === 'number')
	    && (typeof message.fee_ref === 'number')
	    && (typeof message.fee_base === 'number')
	    && (typeof message.ledger_hash === 'string')
	    && (typeof message.ledger_index === 'number')
	    && (typeof message.ledger_time === 'number')
	    && (typeof message.reserve_base === 'number')
	    && (typeof message.reserve_inc === 'number')
	    && (typeof message.txn_count === 'number');
	};

	/**
	 * Check that server message contains valid
	 * load status data
	 *
	 * @param {Object} message
	 */

	Remote.isValidLoadStatus = function(message) {
	  return (typeof message.load_base === 'number')
	      && (typeof message.load_factor === 'number');
	};

	/**
	 * Set the emitted state: 'online' or 'offline'
	 *
	 * @param {String} state
	 */

	Remote.prototype._setState = function(state) {
	  if (this.state !== state) {
	    if (this.trace) {
	      log.info('set_state:', state);
	    }

	    this.state = state;
	    this.emit('state', state);

	    switch (state) {
	      case 'online':
	        this._online_state = 'open';
	        this._connected = true;
	        this.emit('connect');
	        this.emit('connected');
	        break;
	      case 'offline':
	        this._online_state = 'closed';
	        this._connected = false;
	        this.emit('disconnect');
	        this.emit('disconnected');
	        break;
	    }
	  }
	};

	/**
	 * Inform remote that the remote server is not comming back.
	 */

	Remote.prototype.setServerFatal = function() {
	  this._server_fatal = true;
	};

	/**
	 * Enable debug output
	 *
	 * @param {Boolean} trace
	 */

	Remote.prototype.setTrace = function(trace) {
	  this.trace = (trace === void(0) || trace);
	  return this;
	};

	Remote.prototype._trace = function() {
	  if (this.trace) {
	    log.info.apply(log, arguments);
	  }
	};

	/**
	 * Store a secret - allows the Remote to automatically fill 
	 * out auth information.
	 *
	 * @param {String} account
	 * @param {String} secret
	 */

	Remote.prototype.setSecret = function(account, secret) {
	  this.secrets[account] = secret;
	};

	Remote.prototype.getPendingTransactions = function() {
	  var self = this;

	  function resubmitTransaction(tx) {
	    if (typeof tx !== 'object') {
	      return;
	    }

	    var transaction = self.transaction();
	    transaction.parseJson(tx.tx_json);
	    transaction.clientID(tx.clientID);
	    Object.keys(tx).forEach(function(prop) {
	      switch (prop) {
	        case 'secret':
	          case 'submittedIDs':
	          case 'submitIndex':
	          transaction[prop] = tx[prop];
	        break;
	      }
	    });

	    transaction.submit();
	  };

	  this.storage.getPendingTransactions(function(err, transactions) {
	    if (!err && Array.isArray(transactions)) {
	      transactions.forEach(resubmitTransaction);
	    }
	  });
	};

	Remote.prototype.addServer = function(opts) {
	  var self = this;

	  var server = new Server(this, opts);

	  function serverMessage(data) {
	    self._handleMessage(data, server);
	  };

	  server.on('message', serverMessage);

	  function serverConnect() {
	    self._connection_count += 1;

	    if (opts.primary) {
	      self._setPrimaryServer(server);
	    }
	    if (self._connection_count === 1) {
	      self._setState('online');
	    }
	    if (self._connection_count === self._servers.length) {
	      self.emit('ready');
	    }
	  };

	  server.on('connect', serverConnect);

	  function serverDisconnect() {
	    self._connection_count--;
	    if (self._connection_count === 0) {
	      self._setState('offline');
	    }
	  };

	  server.on('disconnect', serverDisconnect);

	  server.on('connecting', function() {
	    self.emit('connecting');
	  });

	  server.on('reconnecting', function(timeout) {
	    self.emit('reconnecting', timeout);
	  });

	  this._servers.push(server);

	  return this;
	};

	/**
	 * Connect to the Ripple network.
	 *
	 * @param {Function} callback
	 * @api public
	 */

	Remote.prototype.connect = function(online) {
	  if (!this._servers.length) {
	    throw new Error('No servers available.');
	  }

	  switch (typeof online) {
	    case 'undefined':
	      break;
	    case 'function':
	      this.once('connect', online);
	      break;
	    default:
	      // Downwards compatibility
	      if (!Boolean(online)) {
	        return this.disconnect();
	      }
	  }

	  var self = this;

	  ;(function nextServer(i) {
	    self._servers[i].connect();
	    var next = nextServer.bind(this, ++i);
	    if (i < self._servers.length) {
	      setTimeout(next, self._connection_offset);
	    }
	  })(0);

	  return this;
	};

	/**
	 * Disconnect from the Ripple network.
	 *
	 * @param {Function} callback
	 * @api public
	 */

	Remote.prototype.disconnect = function(callback) {
	  if (!this._servers.length) {
	    throw new Error('No servers available, not disconnecting');
	  }

	  if (typeof callback === 'function') {
	    this.once('disconnect', callback);
	  }

	  this._servers.forEach(function(server) {
	    server.disconnect();
	  });

	  this._set_state('offline');

	  return this;
	};

	/**
	 * Reconnect to the Payshares network immediately.
	 *
	 * @api public
	 */

	Remote.prototype.forceReconnect = function() {
	  this._servers.forEach(function(server) {
	    if(!server.connected()) {
	      server.forceReconnect();
	    }
	  });
	};

	/**
	 * Handle server message. Server messages are proxied to
	 * the Remote, such that global events can be handled
	 *
	 * It is possible for messages to be dispatched after the
	 * connection is closed.
	 *
	 * @param {JSON} message
	 * @param {Server} server
	 */

	Remote.prototype._handleMessage = function(message, server) {
	  var self = this;

	  try {
	    message = JSON.parse(message);
	  } catch (e) {
	  }

	  if (!Remote.isValidMessage(message)) {
	    // Unexpected response from remote.
	    this.emit('error', new RippleError('remoteUnexpected', 'Unexpected response from remote'));
	    return;
	  }

	  switch (message.type) {
	    case 'ledgerClosed':
	      this._handleLedgerClosed(message);
	      break;
	    case 'serverStatus':
	      this._handleServerStatus(message);
	      break;
	    case 'transaction':
	      this._handleTransaction(message);
	      break;
	    case 'find_path':
	      this._handlePathFind(message);
	      break;
	    default:
	      if (this.trace) {
	        log.info(message.type + ': ', message);
	      }
	      break;
	  }
	};

	/**
	 * Handle server ledger_closed event
	 *
	 * @param {Object} message
	 */

	Remote.prototype._handleLedgerClosed = function(message) {
	  var self = this;

	  // XXX If not trusted, need to verify we consider ledger closed.
	  // XXX Also need to consider a slow server or out of order response.
	  // XXX Be more defensive fields could be missing or of wrong type.
	  // YYY Might want to do some cache management.
	  if (!Remote.isValidLedgerData(message)) {
	    return;
	  }

	  var ledgerAdvanced = message.ledger_index >= this._ledger_current_index;

	  if (ledgerAdvanced) {
	    this._ledger_time = message.ledger_time;
	    this._ledger_hash = message.ledger_hash;
	    this._ledger_current_index = message.ledger_index + 1;
	    this.emit('ledger_closed', message);
	  }
	};

	/**
	 * Handle server server_status event
	 *
	 * @param {Object} message
	 */

	Remote.prototype._handleServerStatus = function(message) {
	  this.emit('server_status', message);
	};

	/**
	 * Handle server transaction event
	 *
	 * @param {Object} message
	 */

	Remote.prototype._handleTransaction = function(message) {
	  var self = this;

	  // XXX If not trusted, need proof.

	  // De-duplicate transactions
	  var transactionHash = message.transaction.hash;

	  if (this._received_tx.get(transactionHash)) {
	    return;
	  }

	  if (message.validated) {
	    this._received_tx.set(transactionHash, true);
	  }

	  if (this.trace) {
	    log.info('tx:', message);
	  }

	  function notify(el) {
	    var item = this[el];
	    if (item && typeof item.notify === 'function') {
	      item.notify(message);
	    }
	  };

	  var metadata = message.meta || message.metadata;

	  if (metadata) {
	    // Process metadata
	    message.mmeta = new Meta(metadata);

	    // Pass the event on to any related Account objects
	    var affectedAccounts = message.mmeta.getAffectedAccounts();
	    affectedAccounts.forEach(notify.bind(this._accounts));

	    // Pass the event on to any related OrderBooks
	    var affectedBooks = message.mmeta.getAffectedBooks();
	    affectedBooks.forEach(notify.bind(this._books));
	  } else {
	    // Transaction could be from proposed transaction stream
	    [ 'Account', 'Destination' ].forEach(function(prop) {
	      notify.call(self._accounts, message.transaction[prop]);
	    });
	  }

	  this.emit('transaction', message);
	  this.emit('transaction_all', message);
	};

	/**
	 * Handle server find_path event
	 *
	 * @param {Object} message
	 */

	Remote.prototype._handlePathFind = function(message) {
	  var self = this;

	  // Pass the event to the currently open PathFind object
	  if (this._cur_path_find) {
	    this._cur_path_find.notify_update(message);
	  }

	  this.emit('path_find_all', message);
	};

	/**
	 * Returns the current ledger hash
	 *
	 * @return {String} ledger hash
	 */

	Remote.prototype.getLedgerHash = function() {
	  return this._ledger_hash;
	};

	/**
	 * Set primary server. Primary server will be selected
	 * to handle requested regardless of its internally-tracked
	 * priority score
	 *
	 * @param {Server} server
	 */

	Remote.prototype._setPrimaryServer =
	Remote.prototype.setPrimaryServer = function(server) {
	  if (this._primary_server) {
	    this._primary_server._primary = false;
	  }
	  this._primary_server = server;
	  this._primary_server._primary = true;
	};

	/**
	 * Select a server to handle a request. Servers are
	 * automatically prioritized
	 */

	Remote.prototype._getServer =
	Remote.prototype.getServer = function() {
	  if (this._primary_server && this._primary_server._connected) {
	    return this._primary_server;
	  }

	  function sortByScore(a, b) {
	    var aScore = a._score + a._fee;
	    var bScore = b._score + b._fee;
	    if (aScore > bScore) {
	      return 1;
	    } else if (aScore < bScore) {
	      return -1;
	    } else {
	      return 0;
	    }
	  };

	  // Sort servers by score
	  this._servers.sort(sortByScore);

	  var index = 0;
	  var server = this._servers[index];

	  while (!server._connected) {
	    server = this._servers[++index];
	  }

	  return server;
	};

	/**
	 * Send a request. This method is called internally by Request
	 * objects. Each Request contains a reference to Remote, and
	 * Request.request calls Request.remote.request
	 *
	 * @param {Request} request
	 */

	Remote.prototype.request = function(request) {
	  if (typeof request === 'string') {
	    if (!/^request_/.test(request)) {
	      request = 'request_' + request;
	    }
	    if (typeof this[request] === 'function') {
	      var args = Array.prototype.slice.call(arguments, 1);
	      return this[request].apply(this, args);
	    } else {
	      throw new Error('Command does not exist: ' + request);
	    }
	  }

	  if (!(request instanceof Request)) {
	    throw new Error('Argument is not a Request');
	  }

	  if (!this._servers.length) {
	    request.emit('error', new Error('No servers available'));
	  } else if (!this._connected) {
	    this.once('connect', this.request.bind(this, request));
	  } else if (request.server === null) {
	    request.emit('error', new Error('Server does not exist'));
	  } else {
	    var server = request.server || this.getServer();
	    if (server) {
	      server._request(request);
	    } else {
	      request.emit('error', new Error('No servers available'));
	    }
	  }
	};

	/**
	 * Request ping
	 *
	 * @param [String] server host
	 * @param [Function] callback
	 * @return {Request} request
	 */

	Remote.prototype.ping  =
	Remote.prototype.requestPing = function(host, callback) {
	  var request = new Request(this, 'ping');

	  switch (typeof host) {
	    case 'function':
	      callback = host;
	      break;
	    case 'string':
	      request.setServer(host);
	      break;
	  }

	  var then = Date.now();

	  request.once('success', function() {
	    request.emit('pong', Date.now() - then);
	  });

	  request.callback(callback, 'pong');

	  return request;
	};

	/**
	 * Request server_info
	 *
	 * @param [Function] callback
	 * @return {Request} request
	 */

	Remote.prototype.requestServerInfo = function(callback) {
	  return new Request(this, 'server_info').callback(callback);
	};

	/**
	 * Request ledger
	 *
	 * @return {Request} request
	 */

	Remote.prototype.requestLedger = function(ledger, options, callback) {
	  // XXX This is a bad command. Some variants don't scale.
	  // XXX Require the server to be trusted.
	  //utils.assert(this.trusted);

	  var request = new Request(this, 'ledger');

	  if (ledger) {
	    // DEPRECATED: use .ledger_hash() or .ledger_index()
	    //console.log('request_ledger: ledger parameter is deprecated');
	    request.message.ledger = ledger;
	  }

	  switch (typeof options) {
	    case 'object':
	      Object.keys(options).forEach(function(o) {
	        switch (o) {
	          case 'full':
	          case 'expand':
	          case 'transactions':
	          case 'accounts':
	            request.message[o] = true;
	            break;
	        }
	      }, options);
	      break;

	    case 'function':
	      callback = options;
	      options = void(0);
	      break;

	    default:
	      //DEPRECATED
	      if (this.trace) {
	        log.info('request_ledger: full parameter is deprecated');
	      }
	      request.message.full = true;
	      break;
	  }

	  request.callback(callback);

	  return request;
	};

	/**
	 * Request ledger_closed
	 *
	 * @param [Function] callback
	 * @return {Request} request
	 */

	Remote.prototype.requestLedgerClosed =
	Remote.prototype.requestLedgerHash = function(callback) {
	  //utils.assert(this.trusted);   // If not trusted, need to check proof.
	  return new Request(this, 'ledger_closed').callback(callback);
	};

	/**
	 * Request ledger_header
	 *
	 * @param [Function] callback
	 * @return {Request} request
	 */

	Remote.prototype.requestLedgerHeader = function(callback) {
	  return new Request(this, 'ledger_header').callback(callback);
	};

	/**
	 * Request ledger_current
	 *
	 * Get the current proposed ledger entry. May be closed (and revised)
	 * at any time (even before returning).
	 *
	 * Only for unit testing.
	 *
	 * @param [Function] callback
	 * @return {Request} request
	 */

	Remote.prototype.requestLedgerCurrent = function(callback) {
	  return new Request(this, 'ledger_current').callback(callback);
	};

	/**
	 * Request ledger_entry
	 *
	 * @param [String] type
	 * @param [Function] callback
	 * @return {Request} request
	 */

	Remote.prototype.requestLedgerEntry = function(type, callback) {
	  //utils.assert(this.trusted);   // If not trusted, need to check proof, maybe talk packet protocol.

	  var self = this;
	  var request = new Request(this, 'ledger_entry');

	  if (typeof type === 'function') {
	    callback = type;
	  }

	  // Transparent caching. When .request() is invoked, look in the Remote object for the result.
	  // If not found, listen, cache result, and emit it.
	  //
	  // Transparent caching:
	  if (type === 'account_root') {
	    request.request_default = request.request;

	    request.request = function() {                        // Intercept default request.
	      var bDefault  = true;
	      // .self = Remote
	      // this = Request

	      // console.log('request_ledger_entry: caught');

	      //if (self._ledger_hash) {
	        // A specific ledger is requested.
	        // XXX Add caching.
	        // else if (req.ledger_index)
	        // else if ('ripple_state' === request.type)         // YYY Could be cached per ledger.
	      //}

	      if (!self._ledger_hash && type === 'account_root') {
	        var cache = self.ledgers.current.account_root;

	        if (!cache) {
	          cache = self.ledgers.current.account_root = {};
	        }

	        var node = self.ledgers.current.account_root[request.message.account_root];

	        if (node) {
	          // Emulate fetch of ledger entry.
	          // console.log('request_ledger_entry: emulating');
	          // YYY Missing lots of fields.
	          request.emit('success', { node: node });
	          bDefault  = false;
	        } else { // Was not cached.
	          // XXX Only allow with trusted mode.  Must sync response with advance.
	          switch (type) {
	            case 'account_root':
	              request.once('success', function(message) {
	                // Cache node.
	                // console.log('request_ledger_entry: caching');
	                self.ledgers.current.account_root[message.node.Account] = message.node;
	              });
	              break;

	            default:
	              // This type not cached.
	              // console.log('request_ledger_entry: non-cached type');
	          }
	        }
	      }

	      if (bDefault) {
	        // console.log('request_ledger_entry: invoking');
	        request.request_default();
	      }
	    };
	  }

	  request.callback(callback);

	  return request;
	};

	/**
	 * Request subscribe
	 *
	 * @param {Array} streams
	 * @param [Function] callback
	 * @return {Request} request
	 */

	Remote.prototype.requestSubscribe = function(streams, callback) {
	  var request = new Request(this, 'subscribe');

	  if (streams) {
	    request.message.streams = Array.isArray(streams) ? streams : [ streams ];
	  }

	  request.callback(callback);

	  return request;
	};

	/**
	 * Request usubscribe
	 *
	 * @param {Array} streams
	 * @param [Function] callback
	 * @return {Request} request
	 */

	Remote.prototype.requestUnsubscribe = function(streams, callback) {
	  var request = new Request(this, 'unsubscribe');

	  if (streams) {
	    request.message.streams = Array.isArray(streams) ? streams : [ streams ];
	  }

	  request.callback(callback);

	  return request;
	};

	/**
	 * Request transaction_entry
	 *
	 * @param {String} transaction hash
	 * @param {String|Number} ledger hash or sequence
	 * @param [Function] callback
	 * @return {Request} request
	 */

	Remote.prototype.requestTransactionEntry = function(hash, ledgerHash, callback) {
	  //// If not trusted, need to check proof, maybe talk packet protocol.
	  //utils.assert(this.trusted);
	  var request = new Request(this, 'transaction_entry');

	  request.txHash(hash);

	  switch (typeof ledgerHash) {
	    case 'string':
	    case 'number':
	      request.ledgerSelect(ledgerHash);
	      break;

	    case 'undefined':
	    case 'function':
	      request.ledgerIndex('validated');
	      callback = ledgerHash;
	      break;

	    default:
	      throw new Error('Invalid ledger_hash type');
	  }

	  request.callback(callback);

	  return request;
	};

	/**
	 * Request tx
	 *
	 * @param {String} transaction hash
	 * @param [Function] callback
	 * @return {Request} request
	 */

	Remote.prototype.requestTransaction =
	Remote.prototype.requestTx = function(hash, callback) {
	  var request = new Request(this, 'tx');

	  request.message.transaction = hash;
	  request.callback(callback);

	  return request;
	};

	/**
	 * Account request abstraction
	 *
	 * @api private
	 */

	Remote.accountRequest = function(type, account, accountIndex, ledger, peer, callback) {
	  if (typeof account === 'object') {
	    var options  = account;
	    callback     = accountIndex;
	    ledger       = options.ledger;
	    accountIndex = options.account_index || options.accountIndex;
	    account      = options.accountID || options.account;
	    peer         = options.peer;
	  }

	  var lastArg = arguments[arguments.length - 1];

	  if (typeof lastArg === 'function') {
	    callback = lastArg;
	  }

	  var request = new Request(this, type);
	  var account = UInt160.json_rewrite(account);

	  request.message.ident   = account; //DEPRECATED;
	  request.message.account = account;

	  if (typeof accountIndex === 'number') {
	    request.message.index = accountIndex;
	  }

	  if (!/^(undefined|function)$/.test(typeof ledger)) {
	    request.ledgerChoose(ledger);
	  }

	  if (!/^(undefined|function)$/.test(typeof peer)) {
	    request.message.peer = UInt160.json_rewrite(peer);
	  }

	  request.callback(callback);

	  return request;
	};

	/**
	 * Request account_info
	 *
	 * @param {String} ripple address
	 * @param [Function] callback
	 * @return {Request}
	 */

	Remote.prototype.requestAccountInfo = function(account, callback) {
	  var args = Array.prototype.concat.apply(['account_info'], arguments);
	  return Remote.accountRequest.apply(this, args);
	};

	/**
	 * Request account_currencies
	 *
	 * @param {String} ripple address
	 * @param [Function] callback
	 * @return {Request}
	 */

	Remote.prototype.requestAccountCurrencies = function(account, callback) {
	  var args = Array.prototype.concat.apply(['account_currencies'], arguments);
	  return Remote.accountRequest.apply(this, args);
	};

	/**
	 * Request account_lines
	 *
	 * @param {String} ripple address
	 * @param {Number] sub-account index
	 * @param [String|Number] ledger
	 * @param [String] peer
	 * @param [Function] callback
	 * @return {Request}
	 */

	Remote.prototype.requestAccountLines = function(account, accountIndex, ledger, peer, callback) {
	  // XXX Does this require the server to be trusted?
	  //utils.assert(this.trusted);
	  var args = Array.prototype.concat.apply(['account_lines'], arguments);
	  return Remote.accountRequest.apply(this, args);
	};

	/**
	 * Request account_offers
	 *
	 * @param {String} ripple address
	 * @param {Number] sub-account index
	 * @param [String|Number] ledger
	 * @param [String] peer
	 * @param [Function] callback
	 * @return {Request}
	 */

	Remote.prototype.requestAccountOffers = function(account, accountIndex, ledger, callback) {
	  var args = Array.prototype.concat.apply(['account_offers'], arguments);
	  return Remote.accountRequest.apply(this, args);
	};


	/**
	 * Request account_tx
	 *
	 * @param {Object} options
	 *
	 *    @param {String} account
	 *    @param [Number] ledger_index_min defaults to -1 if ledger_index_max is specified.
	 *    @param [Number] ledger_index_max defaults to -1 if ledger_index_min is specified.
	 *    @param [Boolean] binary, defaults to false
	 *    @param [Boolean] parseBinary, defaults to true
	 *    @param [Boolean] count, defaults to false
	 *    @param [Boolean] descending, defaults to false
	 *    @param [Number] offset, defaults to 0
	 *    @param [Number] limit
	 *
	 * @param [Function] filter
	 * @param [Function] map
	 * @param [Function] reduce
	 * @param [Function] callback
	 * @return {Request}
	 */

	Remote.prototype.requestAccountTransactions =
	Remote.prototype.requestAccountTx = function(options, callback) {
	  // XXX Does this require the server to be trusted?
	  //utils.assert(this.trusted);

	  var request = new Request(this, 'account_tx');

	  if (options.min_ledger !== void(0)) {
	    options.ledger_index_min = options.min_ledger;
	  }

	  if (options.max_ledger !== void(0)) {
	    options.ledger_index_max = options.max_ledger;
	  }

	  Object.keys(options).forEach(function(o) {
	    switch (o) {
	      case 'account':
	      case 'ledger_index_min':  //earliest
	      case 'ledger_index_max':  //latest
	      case 'binary':            //false
	      case 'count':             //false
	      case 'descending':        //false
	      case 'offset':            //0
	      case 'limit':

	      //extended account_tx
	      case 'forward':           //false
	      case 'marker':
	        request.message[o] = this[o];
	      break;
	    }
	  }, options);

	  function propertiesFilter(obj, transaction) {
	    var properties = Object.keys(obj);
	    return function(transaction) {
	      var result = properties.every(function(property) {
	        return transaction.tx[property] === obj[property];
	      });
	      return result;
	    };
	  };

	  var SerializedObject = __webpack_require__(12).SerializedObject;

	  function parseBinaryTransaction(transaction) {
	    var tx = { validated: transaction.validated };
	    tx.meta = new SerializedObject(transaction.meta).to_json();
	    tx.tx = new SerializedObject(transaction.tx_blob).to_json();
	    tx.tx.ledger_index = transaction.ledger_index;
	    tx.tx.hash = Transaction.from_json(tx.tx).hash();
	    return tx;
	  };

	  function accountTxFilter(fn) {
	    if (typeof fn !== 'function') {
	      throw new Error('Missing filter function');
	    }

	    var self = this;

	    function filterHandler() {
	      var listeners = self.listeners('success');

	      self.removeAllListeners('success');

	      self.once('success', function(res) {
	        if (options.parseBinary) {
	          res.transactions = res.transactions.map(parseBinaryTransaction);
	        }

	        if (fn !== Boolean) {
	          res.transactions = res.transactions.filter(fn);
	        }

	        if (typeof options.map === 'function') {
	          res.transactions = res.transactions.map(options.map);
	        }

	        if (typeof options.reduce === 'function') {
	          res.transactions = res.transactions.reduce(options.reduce);
	        }

	        if (typeof options.pluck === 'string') {
	          res = res[options.pluck];
	        }

	        listeners.forEach(function(listener) {
	          listener.call(self, res);
	        });
	      });
	    };

	    this.once('request', filterHandler);

	    return this;
	  };

	  request.filter = accountTxFilter;

	  if (typeof options.parseBinary !== 'boolean') {
	    options.parseBinary = true;
	  }

	  if (options.binary || (options.map || options.reduce)) {
	    options.filter = options.filter || Boolean;
	  }

	  if (options.filter) {
	    switch (options.filter) {
	      case 'inbound':
	        request.filter(propertiesFilter({ Destination: options.account }));
	        break;
	      case 'outbound':
	        request.filter(propertiesFilter({ Account: options.account }));
	        break;
	      default:
	        if (typeof options.filter === 'object') {
	          options.filter = propertiesFilter(options.filter);
	        }

	        request.filter(options.filter);
	    }
	  }

	  request.callback(callback);

	  return request;
	};

	/**
	 * Request the overall transaction history.
	 *
	 * Returns a list of transactions that happened recently on the network. The
	 * default number of transactions to be returned is 20.
	 *
	 * @param [Number] start
	 * @param [Function] callback
	 * @return {Request}
	 */

	Remote.prototype.requestTxHistory = function(start, callback) {
	  // XXX Does this require the server to be trusted?
	  //utils.assert(this.trusted);

	  var request = new Request(this, 'tx_history');

	  request.message.start = start;
	  request.callback(callback);

	  return request;
	};

	/**
	 * Request book_offers
	 *
	 * @param {Object} gets
	 * @param {Object} pays
	 * @param {String} taker
	 * @param [Function] calback
	 * @return {Request}
	 */

	Remote.prototype.requestBookOffers = function(gets, pays, taker, callback) {
	  if (gets.hasOwnProperty('pays')) {
	    var options = gets;
	    callback = pays;
	    taker = options.taker;
	    pays = options.pays;
	    gets = options.gets;
	  }

	  var lastArg = arguments[arguments.length - 1];

	  if (typeof lastArg === 'function') {
	    callback = lastArg;
	  }

	  var request = new Request(this, 'book_offers');

	  request.message.taker_gets = {
	    currency: Currency.json_rewrite(gets.currency)
	  };

	  if (request.message.taker_gets.currency !== 'XPS') {
	    request.message.taker_gets.issuer = UInt160.json_rewrite(gets.issuer);
	  }

	  request.message.taker_pays = {
	    currency: Currency.json_rewrite(pays.currency)
	  };

	  if (request.message.taker_pays.currency !== 'XPS') {
	    request.message.taker_pays.issuer = UInt160.json_rewrite(pays.issuer);
	  }

	  request.message.taker = taker ? taker : UInt160.ACCOUNT_ONE;

	  request.callback(callback);

	  return request;
	};

	/**
	 * Request wallet_accounts
	 *
	 * @param {String} seed
	 * @param [Function] callback
	 * @return {Request}
	 */

	Remote.prototype.requestWalletAccounts = function(seed, callback) {
	  utils.assert(this.trusted); // Don't send secrets.

	  var request = new Request(this, 'wallet_accounts');
	  request.message.seed = seed;
	  request.callback(callback);

	  return request;
	};

	/**
	 * Request sign
	 *
	 * @param {String} secret
	 * @param {Object} tx_json
	 * @param [Function] callback
	 * @return {Request}
	 */

	Remote.prototype.requestSign = function(secret, tx_json, callback) {
	  utils.assert(this.trusted); // Don't send secrets.

	  var request = new Request(this, 'sign');
	  request.message.secret  = secret;
	  request.message.tx_json = tx_json;
	  request.callback(callback);

	  return request;
	};

	/**
	 * Request submit
	 *
	 * @param [Function] callback
	 * @return {Request}
	 */

	Remote.prototype.requestSubmit = function(callback) {
	  return new Request(this, 'submit').callback(callback);
	};

	/**
	 * Create a subscribe request with current subscriptions.
	 *
	 * Other classes can add their own subscriptions to this request by listening to
	 * the server_subscribe event.
	 *
	 * This function will create and return the request, but not submit it.
	 *
	 * @param [Function] callback
	 * @api private
	 */

	Remote.prototype._serverPrepareSubscribe = function(callback) {
	  var self  = this;
	  var feeds = [ 'ledger', 'server' ];

	  if (this._transaction_subs) {
	    feeds.push('transactions');
	  }

	  var request = this.requestSubscribe(feeds);

	  function serverSubscribed(message) {
	    self._stand_alone = !!message.stand_alone;
	    self._testnet = !!message.testnet;

	    if (typeof message.random === 'string') {
	      var rand = message.random.match(/[0-9A-F]{8}/ig);

	      while (rand && rand.length) {
	        sjcl.random.addEntropy(parseInt(rand.pop(), 16));
	      }

	      self.emit('random', utils.hexToArray(message.random));
	    }

	    if (message.ledger_hash && message.ledger_index) {
	      self._ledger_time = message.ledger_time;
	      self._ledger_hash = message.ledger_hash;
	      self._ledger_current_index = message.ledger_index+1;
	      self.emit('ledger_closed', message);
	    }

	    self.emit('subscribed');
	  };

	  request.once('success', serverSubscribed);

	  self.emit('prepare_subscribe', request);

	  request.callback(callback, 'subscribed');

	  return request;
	};

	/**
	 * For unit testing: ask the remote to accept the current ledger.
	 * To be notified when the ledger is accepted, server_subscribe() then listen to 'ledger_hash' events.
	 * A good way to be notified of the result of this is:
	 * remote.once('ledger_closed', function(ledger_closed, ledger_index) { ... } );
	 *
	 * @param [Function] callback
	 */

	Remote.prototype.ledgerAccept =
	Remote.prototype.requestLedgerAccept = function(callback) {
	  if (!this._stand_alone) {
	    this.emit('error', new RippleError('notStandAlone'));
	    return;
	  }

	  var request = new Request(this, 'ledger_accept');

	  this.once('ledger_closed', function(ledger) {
	    request.emit('ledger_closed', ledger);
	  });

	  request.callback(callback, 'ledger_closed');
	  request.request();

	  return this;
	};

	/**
	 * Account root request abstraction
	 *
	 * @api private
	 */

	Remote.accountRootRequest = function(type, responseFilter, account, ledger, callback) {
	  if (typeof account === 'object') {
	    callback = ledger;
	    ledger   = account.ledger;
	    account  = account.account;
	  }

	  var lastArg = arguments[arguments.length - 1];

	  if (typeof lastArg === 'function') {
	    callback = lastArg;
	  }

	  var request = this.requestLedgerEntry('account_root');

	  request.accountRoot(account);
	  request.ledgerChoose(ledger);

	  request.once('success', function(message) {
	    request.emit(type, responseFilter(message));
	  });

	  request.callback(callback, type);

	  return request;
	};

	/**
	 * Request account balance
	 *
	 * @param {String} account
	 * @param [String|Number] ledger
	 * @param [Function] callback
	 * @return {Request}
	 */

	Remote.prototype.requestAccountBalance = function(account, ledger, callback) {
	  function responseFilter(message) {
	    return Amount.from_json(message.node.Balance);
	  };

	  var args = Array.prototype.concat.apply(['account_balance', responseFilter], arguments);
	  var request = Remote.accountRootRequest.apply(this, args);

	  return request;
	};

	/**
	 * Request account flags
	 *
	 * @param {String} account
	 * @param [String|Number] ledger
	 * @param [Function] callback
	 * @return {Request}
	 */

	Remote.prototype.requestAccountFlags = function(account, ledger, callback) {
	  function responseFilter(message) {
	    return message.node.Flags;
	  };

	  var args = Array.prototype.concat.apply(['account_flags', responseFilter], arguments);
	  var request = Remote.accountRootRequest.apply(this, args);

	  return request;
	};

	/**
	 * Request owner count
	 *
	 * @param {String} account
	 * @param [String|Number] ledger
	 * @param [Function] callback
	 * @return {Request}
	 */

	Remote.prototype.requestOwnerCount = function(account, ledger, callback) {
	  function responseFilter(message) {
	    return message.node.OwnerCount;
	  };

	  var args = Array.prototype.concat.apply(['owner_count', responseFilter], arguments);
	  var request = Remote.accountRootRequest.apply(this, args);

	  return request;
	};

	/**
	 * Get an account by accountID (address)
	 *
	 *
	 * @param {String} account
	 * @return {Account}
	 */

	Remote.prototype.getAccount = function(accountID) {
	  return this._accounts[UInt160.json_rewrite(accountID)];
	};

	/**
	 * Add an account by accountID (address)
	 *
	 * @param {String} account
	 * @return {Account}
	 */

	Remote.prototype.addAccount = function(accountID) {
	  var account = new Account(this, accountID);

	  if (account.isValid()) {
	    this._accounts[accountID] = account;
	  }

	  return account;
	};

	/**
	 * Add an account if it does not exist, return the
	 * account by accountID (address)
	 *
	 * @param {String} account
	 * @return {Account}
	 */

	Remote.prototype.account =
	Remote.prototype.findAccount = function(accountID) {
	  var account = this.getAccount(accountID);
	  return account ? account : this.addAccount(accountID);
	};

	/**
	 * Create a pathfind
	 *
	 * @param {Object} options
	 * @return {PathFind}
	 */

	Remote.prototype.pathFind =
	Remote.prototype.createPathFind = function(src_account, dst_account, dst_amount, src_currencies) {
	  if (typeof src_account === 'object') {
	    var options = src_account;
	    src_currencies = options.src_currencies;
	    dst_amount     = options.dst_amount;
	    dst_account    = options.dst_account;
	    src_account    = options.src_account;
	  }

	  var pathFind = new PathFind(this, src_account, dst_account, dst_amount, src_currencies);

	  if (this._cur_path_find) {
	    this._cur_path_find.notify_superceded();
	  }

	  pathFind.create();

	  this._cur_path_find = pathFind;

	  return pathFind;
	};

	Remote.prepareTrade = function(currency, issuer) {
	  return currency + (currency === 'XPS' ? '' : ('/' + issuer));
	};

	/**
	 * Create an OrderBook if it does not exist, return
	 * the order book
	 *
	 * @param {Object} options
	 * @return {OrderBook}
	 */

	Remote.prototype.book =
	Remote.prototype.createOrderBook = function(currency_gets, issuer_gets, currency_pays, issuer_pays) {
	  if (typeof currency_gets === 'object') {
	    var options = currency_gets;
	    issuer_pays   = options.issuer_pays;
	    currency_pays = options.currency_pays;
	    issuer_gets   = options.issuer_gets;
	    currency_gets = options.currency_gets;
	  }

	  var gets = Remote.prepareTrade(currency_gets, issuer_gets);
	  var pays = Remote.prepareTrade(currency_pays, issuer_pays);
	  var key = gets + ':' + pays;

	  if (this._books.hasOwnProperty(key)) {
	    return this._books[key];
	  }

	  var book = new OrderBook(this, currency_gets, issuer_gets, currency_pays, issuer_pays, key);

	  if (book.is_valid()) {
	    this._books[key] = book;
	  }

	  return book;
	};

	/**
	 * Return the next account sequence
	 *
	 * @param {String} account
	 * @param {String} sequence modifier (ADVANCE or REWIND)
	 * @return {Number} sequence
	 */

	Remote.prototype.accountSeq =
	Remote.prototype.getAccountSequence = function(account, advance) {
	  var account     = UInt160.json_rewrite(account);
	  var accountInfo = this.accounts[account];

	  if (!accountInfo) {
	    return;
	  }

	  var seq = accountInfo.seq;
	  var change = { ADVANCE: 1, REWIND: -1 }[advance.toUpperCase()] || 0;

	  accountInfo.seq += change;

	  return seq;
	};

	/**
	 * Set account sequence
	 *
	 * @param {String} account
	 * @param {Number} sequence
	 */

	Remote.prototype.setAccountSeq = function(account, sequence) {
	  var account = UInt160.json_rewrite(account);

	  if (!this.accounts.hasOwnProperty(account)) {
	    this.accounts[account] = { };
	  }

	  this.accounts[account].seq = sequence;
	};

	/**
	 * Refresh an account's sequence from server
	 *
	 * @param {String} account
	 * @param [String|Number] ledger
	 * @param [Function] callback
	 * @return {Request}
	 */

	Remote.prototype.accountSeqCache = function(account, ledger, callback) {
	  if (typeof account === 'object') {
	    var options = account;
	    callback = ledger;
	    ledger   = options.ledger;
	    account  = options.account;
	  }

	  var self = this;

	  if (!this.accounts.hasOwnProperty(account)) {
	    this.accounts[account] = { };
	  }

	  var account_info = this.accounts[account];
	  var request      = account_info.caching_seq_request;

	  function accountRootSuccess(message) {
	    delete account_info.caching_seq_request;

	    var seq = message.node.Sequence;
	    account_info.seq  = seq;

	    // console.log('caching: %s %d', account, seq);
	    // If the caller also waits for 'success', they might run before this.
	    request.emit('success_account_seq_cache', message);
	  };

	  function accountRootError(message) {
	    // console.log('error: %s', account);
	    delete account_info.caching_seq_request;

	    request.emit('error_account_seq_cache', message);
	  };

	  if (!request) {
	    // console.log('starting: %s', account);
	    request = this.requestLedgerEntry('account_root');
	    request.accountRoot(account);
	    request.ledgerChoose(ledger);
	    request.once('success', accountRootSuccess);
	    request.once('error', accountRootError);

	    account_info.caching_seq_request = request;
	  }

	  request.callback(callback, 'success_account_seq_cache', 'error_account_seq_cache');

	  return request;
	};

	/**
	 * Mark an account's root node as dirty.
	 *
	 * @param {String} account
	 */

	Remote.prototype.dirtyAccountRoot = function(account) {
	  var account = UInt160.json_rewrite(account);
	  delete this.ledgers.current.account_root[account];
	};

	/**
	 * Get an account's balance
	 *
	 * @param {String} account
	 * @param [String] issuer
	 * @param [String] currency
	 * @param [String|Number] ledger
	 * @param [Function] callback
	 * @return {Request}
	 */

	Remote.prototype.requestRippleBalance = function(account, issuer, currency, ledger, callback) {
	  if (typeof account === 'object') {
	    var options = account;
	    callback = issuer;
	    ledger   = options.ledger;
	    currency = options.currency;
	    issuer   = options.issuer;
	    account  = options.account;
	  }

	  var request = this.requestLedgerEntry('ripple_state'); // YYY Could be cached per ledger.

	  request.rippleState(account, issuer, currency);
	  request.ledgerChoose(ledger);

	  function rippleState(message) {
	    var node            = message.node;
	    var lowLimit        = Amount.from_json(node.LowLimit);
	    var highLimit       = Amount.from_json(node.HighLimit);
	    // The amount the low account holds of issuer.
	    var balance         = Amount.from_json(node.Balance);
	    // accountHigh implies: for account: balance is negated, highLimit is the limit set by account.
	    var accountHigh     = UInt160.from_json(account).equals(highLimit.issuer());

	    request.emit('ripple_state', {
	      account_balance     : ( accountHigh ? balance.negate() : balance.clone()).parse_issuer(account),
	      peer_balance        : (!accountHigh ? balance.negate() : balance.clone()).parse_issuer(issuer),

	      account_limit       : ( accountHigh ? highLimit : lowLimit).clone().parse_issuer(issuer),
	      peer_limit          : (!accountHigh ? highLimit : lowLimit).clone().parse_issuer(account),

	      account_quality_in  : ( accountHigh ? node.HighQualityIn : node.LowQualityIn),
	      peer_quality_in     : (!accountHigh ? node.HighQualityIn : node.LowQualityIn),

	      account_quality_out : ( accountHigh ? node.HighQualityOut : node.LowQualityOut),
	      peer_quality_out    : (!accountHigh ? node.HighQualityOut : node.LowQualityOut),
	    });
	  };

	  request.once('success', rippleState);
	  request.callback(callback, 'ripple_state');

	  return request;
	};

	Remote.prepareCurrencies = function(currency) {
	  var newCurrency  = { };

	  if (currency.hasOwnProperty('issuer')) {
	    newCurrency.issuer = UInt160.json_rewrite(currency.issuer);
	  }

	  if (currency.hasOwnProperty('currency')) {
	    newCurrency.currency = Currency.json_rewrite(currency.currency);
	  }

	  return newCurrency;
	};

	/**
	 * Request static_path_find
	 *
	 * @param {Object} options
	 * @param [Function] callback
	 * @return {Request}
	 */

	Remote.prototype.requestRipplePathFind = function(src_account, dst_account, dst_amount, src_currencies, callback) {
	  if (typeof src_account === 'object') {
	    var options = src_account;
	    callback       = dst_account;
	    src_currencies = options.src_currencies;
	    dst_amount     = options.dst_amount;
	    dst_account    = options.dst_account;
	    src_account    = options.src_account;
	  }

	  var request = new Request(this, 'static_path_find');

	  request.message.source_account      = UInt160.json_rewrite(src_account);
	  request.message.destination_account = UInt160.json_rewrite(dst_account);
	  request.message.destination_amount  = Amount.json_rewrite(dst_amount);

	  if (src_currencies) {
	    request.message.source_currencies = src_currencies.map(Remote.prepareCurrencies);
	  }

	  request.callback(callback);

	  return request;
	};

	/**
	 * Request find_path/create
	 *
	 * @param {Object} options
	 * @param [Function] callback
	 * @return {Request}
	 */

	Remote.prototype.requestPathFindCreate = function(src_account, dst_account, dst_amount, src_currencies, callback) {
	  if (typeof src_account === 'object') {
	    var options = src_account;
	    callback       = dst_account;
	    src_currencies = options.src_currencies;
	    dst_amount     = options.dst_amount;
	    dst_account    = options.dst_account;
	    src_account    = options.src_account;
	  }

	  var request = new Request(this, 'find_path');

	  request.message.subcommand          = 'create';
	  request.message.source_account      = UInt160.json_rewrite(src_account);
	  request.message.destination_account = UInt160.json_rewrite(dst_account);
	  request.message.destination_amount  = Amount.json_rewrite(dst_amount);

	  if (src_currencies) {
	    request.message.source_currencies = src_currencies.map(Remote.prepareCurrencies);
	  }

	  request.callback(callback);

	  return request;
	};

	/**
	 * Request find_path/close
	 *
	 * @param [Function] callback
	 * @return {Request}
	 */

	Remote.prototype.requestPathFindClose = function(callback) {
	  var request = new Request(this, 'find_path');

	  request.message.subcommand = 'close';
	  request.callback(callback);

	  return request;
	};

	/**
	 * Request unl_list
	 *
	 * @param [Function] callback
	 * @return {Request}
	 */

	Remote.prototype.requestUnlList = function(callback) {
	  return new Request(this, 'unl_list').callback(callback);
	};

	/**
	 * Request unl_add
	 *
	 * @param {String} address
	 * @param {String} comment
	 * @param [Function] callback
	 * @return {Request}
	 */

	Remote.prototype.requestUnlAdd = function(address, comment, callback) {
	  var request = new Request(this, 'unl_add');

	  request.message.node = address;

	  if (comment) {
	    // note is not specified anywhere, should remove?
	    request.message.comment = void(0);
	  }

	  request.callback(callback);

	  return request;
	};

	/**
	 * Request unl_delete
	 *
	 * @param {String} node
	 * @param [Function] callback
	 * @return {Request}
	 */

	Remote.prototype.requestUnlDelete = function(node, callback) {
	  var request = new Request(this, 'unl_delete');

	  request.message.node = node;
	  request.callback(callback);

	  return request;
	};

	/**
	 * Request peers
	 *
	 * @param [Function] callback
	 * @return {Request}
	 */

	Remote.prototype.requestPeers = function(callback) {
	  return new Request(this, 'peers').callback(callback);
	};

	/**
	 * Request connect
	 *
	 * @param {String} ip
	 * @param {Number} port
	 * @param [Function] callback
	 * @return {Request}
	 */

	Remote.prototype.requestConnect = function(ip, port, callback) {
	  var request = new Request(this, 'connect');

	  request.message.ip = ip;

	  if (port) {
	    request.message.port = port;
	  }

	  request.callback(callback);

	  return request;
	};

	/**
	 * Create a Transaction
	 *
	 * @param {String} source
	 * @param {Object} options
	 * @param [Function] callback
	 * @return {Request}
	 */

	Remote.prototype.transaction =
	Remote.prototype.createTransaction = function(source, options, callback) {
	  var transaction = new Transaction(this);

	  var transactionTypes = {
	    payment:        'payment',
		inflation:      'inflation',
		accountmerge:   'accountMerge',
	    accountset:     'accountSet',
	    trustset:       'trustSet',
	    offercreate:    'offerCreate',
	    offercancel:    'offerCancel',
	    claim:          'claim',
	    passwordfund:   'passwordFund',
	    passwordset:    'passwordSet',
	    setregularkey:  'setRegularKey',
	    walletadd:      'walletAdd',
	    sign:           'sign'
	  };

	  var transactionType;

	  switch (typeof source) {
	    case 'object':
	      if (typeof source.type !== 'string') {
	        throw new Error('Missing transaction type');
	      }

	      transactionType = transactionTypes[source.type.toLowerCase()];

	      if (!transactionType) {
	        throw new Error('Invalid transaction type: ' + transactionType);
	      }

	      transaction = transaction[transactionType](source);
	      break;

	    case 'string':
	      transactionType = transactionTypes[source.toLowerCase()];

	      if (!transactionType) {
	        throw new Error('Invalid transaction type: ' + transactionType);
	      }

	      transaction = transaction[transactionType](options);
	      break;
	  }

	  var lastArg = arguments[arguments.length - 1];

	  if (typeof lastArg === 'function') {
	    transaction.submit(lastArg);
	  }

	  return transaction;
	};

	/**
	 * Calculate a transaction fee for a number of tx fee units.
	 *
	 * This takes into account the last known network and local load fees.
	 *
	 * @param {Number} fee units
	 * @return {Amount} Final fee in XRP for specified number of fee units.
	 */

	Remote.prototype.feeTx = function(units) {
	  var server = this._getServer();

	  if (!server) {
	    throw new Error('No connected servers');
	  }

	  return server._feeTx(units);
	};

	/**
	 * Get the current recommended transaction fee unit.
	 *
	 * Multiply this value with the number of fee units in order to calculate the
	 * recommended fee for the transaction you are trying to submit.
	 *
	 * @return {Number} Recommended amount for one fee unit as float.
	 */

	Remote.prototype.feeTxUnit = function() {
	  var server = this._getServer();

	  if (!server) {
	    throw new Error('No connected servers');
	  }

	  return server._feeTxUnit();
	};

	/**
	 * Get the current recommended reserve base.
	 *
	 * Returns the base reserve with load fees and safety margin applied.
	 *
	 * @param {Number} owner count
	 * @return {Amount}
	 */

	Remote.prototype.reserve = function(owner_count) {
	  var server = this._getServer();

	  if (!server) {
	    throw new Error('No connected servers');
	  }

	  return server._reserve(owner_count);
	};

	exports.Remote = Remote;

	// vim:sw=2:sts=2:ts=8:et


/***/ },
/* 2 */
/***/ function(module, exports, __webpack_require__) {

	var EventEmitter = __webpack_require__(35).EventEmitter;
	var util         = __webpack_require__(36);
	var UInt160      = __webpack_require__(8).UInt160;
	var Currency     = __webpack_require__(6).Currency;
	var RippleError  = __webpack_require__(13).RippleError;
	var Server       = __webpack_require__(20).Server;

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


/***/ },
/* 3 */
/***/ function(module, exports, __webpack_require__) {

	// Represent Ripple amounts and currencies.
	// - Numbers in hex are big-endian.

	var utils = __webpack_require__(19);
	var sjcl  = utils.sjcl;
	var bn    = sjcl.bn;

	var BigInteger = utils.jsbn.BigInteger;

	var UInt160  = __webpack_require__(8).UInt160;
	var Seed     = __webpack_require__(10).Seed;
	var Currency = __webpack_require__(6).Currency;

	var consts = exports.consts = {
	  currency_xns:      0,
	  currency_one:      1,
	  xns_precision:     6,

	  // BigInteger values prefixed with bi_.
	  bi_5:              new BigInteger('5'),
	  bi_7:              new BigInteger('7'),
	  bi_10:             new BigInteger('10'),
	  bi_1e14:           new BigInteger(String(1e14)),
	  bi_1e16:           new BigInteger(String(1e16)),
	  bi_1e17:           new BigInteger(String(1e17)),
	  bi_1e32:           new BigInteger('100000000000000000000000000000000'),
	  bi_man_max_value:  new BigInteger('9999999999999999'),
	  bi_man_min_value:  new BigInteger('1000000000000000'),
	  bi_xns_max:        new BigInteger('9000000000000000000'), // Json wire limit.
	  bi_xns_min:        new BigInteger('-9000000000000000000'),// Json wire limit.
	  bi_xns_unit:       new BigInteger('1000000'),

	  cMinOffset:        -96,
	  cMaxOffset:        80,
	};


	//
	// Amount class in the style of Java's BigInteger class
	// http://docs.oracle.com/javase/1.3/docs/api/java/math/BigInteger.html
	//

	function Amount() {
	  // Json format:
	  //  integer : XRP
	  //  { 'value' : ..., 'currency' : ..., 'issuer' : ...}

	  this._value       = new BigInteger(); // NaN for bad value. Always positive.
	  this._offset      = 0; // Always 0 for XRP.
	  this._is_native   = true; // Default to XRP. Only valid if value is not NaN.
	  this._is_negative = false;
	  this._currency    = new Currency();
	  this._issuer      = new UInt160();
	};

	// Given '100/USD/mtgox' return the a string with mtgox remapped.
	Amount.text_full_rewrite = function(j) {
	  return Amount.from_json(j).to_text_full();
	};

	// Given '100/USD/mtgox' return the json.
	Amount.json_rewrite = function(j) {
	  return Amount.from_json(j).to_json();
	};

	Amount.from_number = function(n) {
	  return (new Amount()).parse_number(n);
	};

	Amount.from_json = function(j) {
	  return (new Amount()).parse_json(j);
	};

	Amount.from_quality = function(quality, currency, issuer, opts) {
	  return (new Amount()).parse_quality(quality, currency, issuer, opts);
	};

	Amount.from_human = function(j, opts) {
	  return (new Amount()).parse_human(j, opts);
	};

	Amount.is_valid = function(j) {
	  return Amount.from_json(j).is_valid();
	};

	Amount.is_valid_full = function(j) {
	  return Amount.from_json(j).is_valid_full();
	};

	Amount.NaN = function() {
	  var result = new Amount();
	  result._value = NaN;
	  return result;
	};

	// Returns a new value which is the absolute value of this.
	Amount.prototype.abs = function() {
	  return this.clone(this.is_negative());
	};

	// Result in terms of this' currency and issuer.
	Amount.prototype.add = function(v) {
	  var result;

	  v = Amount.from_json(v);

	  if (!this.is_comparable(v)) {
	    result              = Amount.NaN();
	  } else if (v.is_zero()) {
	    result              = this;
	  } else if (this.is_zero()) {
	    result              = v.clone();
	    result._is_native   = this._is_native;
	    result._currency    = this._currency;
	    result._issuer      = this._issuer;
	  } else if (this._is_native) {
	    result              = new Amount();

	    var v1  = this._is_negative ? this._value.negate() : this._value;
	    var v2  = v._is_negative ? v._value.negate() : v._value;
	    var s   = v1.add(v2);

	    result._is_negative = s.compareTo(BigInteger.ZERO) < 0;
	    result._value       = result._is_negative ? s.negate() : s;
	    result._currency    = this._currency;
	    result._issuer      = this._issuer;
	  } else {
	    var v1  = this._is_negative ? this._value.negate() : this._value;
	    var o1  = this._offset;
	    var v2  = v._is_negative ? v._value.negate() : v._value;
	    var o2  = v._offset;

	    while (o1 < o2) {
	      v1  = v1.divide(consts.bi_10);
	      o1  += 1;
	    }

	    while (o2 < o1) {
	      v2  = v2.divide(consts.bi_10);
	      o2  += 1;
	    }

	    result = new Amount();
	    result._is_native = false;
	    result._offset = o1;
	    result._value = v1.add(v2);
	    result._is_negative = result._value.compareTo(BigInteger.ZERO) < 0;

	    if (result._is_negative) {
	      result._value = result._value.negate();
	    }

	    result._currency = this._currency;
	    result._issuer = this._issuer;

	    result.canonicalize();
	  }

	  return result;
	};

	/**
	 * Turn this amount into its inverse.
	 *
	 * @private
	 */
	Amount.prototype._invert = function() {
	  this._value = consts.bi_1e32.divide(this._value);
	  this._offset = -32 - this._offset;
	  this.canonicalize();

	  return this;
	};

	/**
	 * Return the inverse of this amount.
	 *
	 * @return {Amount} New Amount object with same currency and issuer, but the
	 *   inverse of the value.
	 */
	Amount.prototype.invert = function() {
	  return this.copy()._invert();
	};

	Amount.prototype.canonicalize = function() {
	  if (!(this._value instanceof BigInteger)) {
	    // NaN.
	    // nothing
	  } else if (this._is_native) {
	    // Native.
	    if (this._value.equals(BigInteger.ZERO)) {
	      this._offset      = 0;
	      this._is_negative = false;
	    } else {
	      // Normalize _offset to 0.

	      while (this._offset < 0) {
	        this._value  = this._value.divide(consts.bi_10);
	        this._offset += 1;
	      }

	      while (this._offset > 0) {
	        this._value  = this._value.multiply(consts.bi_10);
	        this._offset -= 1;
	      }
	    }

	    // XXX Make sure not bigger than supported. Throw if so.
	  } else if (this.is_zero()) {
	    this._offset      = -100;
	    this._is_negative = false;
	  } else {
	    // Normalize mantissa to valid range.

	    while (this._value.compareTo(consts.bi_man_min_value) < 0) {
	      this._value  = this._value.multiply(consts.bi_10);
	      this._offset -= 1;
	    }

	    while (this._value.compareTo(consts.bi_man_max_value) > 0) {
	      this._value  = this._value.divide(consts.bi_10);
	      this._offset += 1;
	    }
	  }

	  return this;
	};

	Amount.prototype.clone = function(negate) {
	  return this.copyTo(new Amount(), negate);
	};

	Amount.prototype.compareTo = function(v) {
	  var result;

	  if (!this.is_comparable(v)) {
	    result  = Amount.NaN();
	  } else if (this._is_negative !== v._is_negative) {
	    // Different sign.
	    result  = this._is_negative ? -1 : 1;
	  } else if (this._value.equals(BigInteger.ZERO)) {
	    // Same sign: positive.
	    result  = v._value.equals(BigInteger.ZERO) ? 0 : -1;
	  } else if (v._value.equals(BigInteger.ZERO)) {
	    // Same sign: positive.
	    result  = 1;
	  } else if (!this._is_native && this._offset > v._offset) {
	    result  = this._is_negative ? -1 : 1;
	  } else if (!this._is_native && this._offset < v._offset) {
	    result  = this._is_negative ? 1 : -1;
	  } else {
	    result  = this._value.compareTo(v._value);
	    if (result > 0) {
	      result  = this._is_negative ? -1 : 1;
	    } else if (result < 0) {
	      result  = this._is_negative ? 1 : -1;
	    }
	  }

	  return result;
	};

	// Make d a copy of this. Returns d.
	// Modification of objects internally refered to is not allowed.
	Amount.prototype.copyTo = function(d, negate) {
	  if (typeof this._value === 'object') {
	    this._value.copyTo(d._value);
	  } else {
	    d._value   = this._value;
	  }

	  d._offset = this._offset;
	  d._is_native = this._is_native;
	  d._is_negative  = negate
	    ? !this._is_negative    // Negating.
	    : this._is_negative;    // Just copying.

	  d._currency     = this._currency;
	  d._issuer       = this._issuer;

	  // Prevent negative zero
	  if (d.is_zero()) {
	    d._is_negative = false;
	  }

	  return d;
	};

	Amount.prototype.currency = function() {
	  return this._currency;
	};

	Amount.prototype.equals = function(d, ignore_issuer) {
	  if (typeof d === 'string') {
	    return this.equals(Amount.from_json(d));
	  }

	  var result = true;

	  result = !((!this.is_valid() || !d.is_valid())
	             || (this._is_native !== d._is_native)
	             || (!this._value.equals(d._value) || this._offset !== d._offset)
	             || (this._is_negative !== d._is_negative)
	             || (!this._is_native && (!this._currency.equals(d._currency) || !ignore_issuer && !this._issuer.equals(d._issuer))));

	  return result;
	};

	// Result in terms of this' currency and issuer.
	Amount.prototype.divide = function(d) {
	  var result;

	  if (d.is_zero()) {
	    throw new Error('divide by zero');
	  }

	  if (this.is_zero()) {
	    result = this;
	  } else if (!this.is_valid()) {
	    throw new Error('Invalid dividend');
	  } else if (!d.is_valid()) {
	    throw new Error('Invalid divisor');
	  } else {
	    var _n = this;

	    if (_n.is_native()) {
	      _n  = _n.clone();

	      while (_n._value.compareTo(consts.bi_man_min_value) < 0) {
	        _n._value  = _n._value.multiply(consts.bi_10);
	        _n._offset -= 1;
	      }
	    }

	    var _d = d;

	    if (_d.is_native()) {
	      _d = _d.clone();

	      while (_d._value.compareTo(consts.bi_man_min_value) < 0) {
	        _d._value  = _d._value.multiply(consts.bi_10);
	        _d._offset -= 1;
	      }
	    }

	    result              = new Amount();
	    result._offset      = _n._offset - _d._offset - 17;
	    result._value       = _n._value.multiply(consts.bi_1e17).divide(_d._value).add(consts.bi_5);
	    result._is_native   = _n._is_native;
	    result._is_negative = _n._is_negative !== _d._is_negative;
	    result._currency    = _n._currency;
	    result._issuer      = _n._issuer;

	    result.canonicalize();
	  }

	  return result;
	};

	/**
	 * Calculate a ratio between two amounts.
	 *
	 * This function calculates a ratio - such as a price - between two Amount
	 * objects.
	 *
	 * The return value will have the same type (currency) as the numerator. This is
	 * a simplification, which should be sane in most cases. For example, a USD/XRP
	 * price would be rendered as USD.
	 *
	 * @example
	 *   var price = buy_amount.ratio_human(sell_amount);
	 *
	 * @this {Amount} The numerator (top half) of the fraction.
	 * @param {Amount} denominator The denominator (bottom half) of the fraction.
	 * @param opts Options for the calculation.
	 * @param opts.reference_date {Date|Number} Date based on which demurrage/interest
	 *   should be applied. Can be given as JavaScript Date or int for Ripple epoch.
	 * @return {Amount} The resulting ratio. Unit will be the same as numerator.
	 */
	Amount.prototype.ratio_human = function(denominator, opts) {
	  opts = opts || {};

	  if (typeof denominator === 'number' && parseInt(denominator, 10) === denominator) {
	    // Special handling of integer arguments
	    denominator = Amount.from_json('' + denominator + '.0');
	  } else {
	    denominator = Amount.from_json(denominator);
	  }

	  var numerator = this;
	  denominator = Amount.from_json(denominator);

	  // If either operand is NaN, the result is NaN.
	  if (!numerator.is_valid() || !denominator.is_valid()) {
	    return Amount.NaN();
	  }

	  // Apply interest/demurrage
	  //
	  // We only need to apply it to the second factor, because the currency unit of
	  // the first factor will carry over into the result.
	  if (opts.reference_date) {
	    denominator = denominator.applyInterest(opts.reference_date);
	  }

	  // Special case: The denominator is a native (XRP) amount.
	  //
	  // In that case, it's going to be expressed as base units (1 XRP =
	  // 10^xns_precision base units).
	  //
	  // However, the unit of the denominator is lost, so when the resulting ratio
	  // is printed, the ratio is going to be too small by a factor of
	  // 10^xns_precision.
	  //
	  // To compensate, we multiply the numerator by 10^xns_precision.
	  if (denominator._is_native) {
	    numerator = numerator.clone();
	    numerator._value = numerator._value.multiply(consts.bi_xns_unit);
	    numerator.canonicalize();
	  }

	  return numerator.divide(denominator);
	};

	/**
	 * Calculate a product of two amounts.
	 *
	 * This function allows you to calculate a product between two amounts which
	 * retains XRPs human/external interpretation (i.e. 1 XRP = 1,000,000 base
	 * units).
	 *
	 * Intended use is to calculate something like: 10 USD * 10 XRP/USD = 100 XRP
	 *
	 * @example
	 *   var sell_amount = buy_amount.product_human(price);
	 *
	 * @see Amount#ratio_human
	 *
	 * @this {Amount} The first factor of the product.
	 * @param {Amount} factor The second factor of the product.
	 * @param opts Options for the calculation.
	 * @param opts.reference_date {Date|Number} Date based on which demurrage/interest
	 *   should be applied. Can be given as JavaScript Date or int for Ripple epoch.
	 * @return {Amount} The product. Unit will be the same as the first factor.
	 */
	Amount.prototype.product_human = function(factor, opts) {
	  opts = opts || {};

	  if (typeof factor === 'number' && parseInt(factor, 10) === factor) {
	    // Special handling of integer arguments
	    factor = Amount.from_json(String(factor) + '.0');
	  } else {
	    factor = Amount.from_json(factor);
	  }

	  // If either operand is NaN, the result is NaN.
	  if (!this.is_valid() || !factor.is_valid()) {
	    return Amount.NaN();
	  }

	  // Apply interest/demurrage
	  //
	  // We only need to apply it to the second factor, because the currency unit of
	  // the first factor will carry over into the result.
	  if (opts.reference_date) {
	    factor = factor.applyInterest(opts.reference_date);
	  }

	  var product = this.multiply(factor);

	  // Special case: The second factor is a native (XRP) amount expressed as base
	  // units (1 XRP = 10^xns_precision base units).
	  //
	  // See also Amount#ratio_human.
	  if (factor._is_native) {
	    product._value = product._value.divide(consts.bi_xns_unit);
	    product.canonicalize();
	  }

	  return product;
	};

	// True if Amounts are valid and both native or non-native.
	Amount.prototype.is_comparable = function(v) {
	  return this._value instanceof BigInteger
	    && v._value instanceof BigInteger
	    && this._is_native === v._is_native;
	};

	Amount.prototype.is_native = function() {
	  return this._is_native;
	};

	Amount.prototype.is_negative = function() {
	  return this._value instanceof BigInteger
	          ? this._is_negative
	          : false;                          // NaN is not negative
	};

	Amount.prototype.is_positive = function() {
	  return !this.is_zero() && !this.is_negative();
	};

	// Only checks the value. Not the currency and issuer.
	Amount.prototype.is_valid = function() {
	  return this._value instanceof BigInteger;
	};

	Amount.prototype.is_valid_full = function() {
	  return this.is_valid() && this._currency.is_valid() && this._issuer.is_valid();
	};

	Amount.prototype.is_zero = function() {
	  return this._value instanceof BigInteger ? this._value.equals(BigInteger.ZERO) : false;
	};

	Amount.prototype.issuer = function() {
	  return this._issuer;
	};

	// Result in terms of this' currency and issuer.
	// XXX Diverges from cpp.
	Amount.prototype.multiply = function(v) {
	  var result;

	  if (this.is_zero()) {
	    result = this;
	  } else if (v.is_zero()) {
	    result = this.clone();
	    result._value = BigInteger.ZERO;
	  } else {
	    var v1 = this._value;
	    var o1 = this._offset;
	    var v2 = v._value;
	    var o2 = v._offset;

	    if (this.is_native()) {
	      while (v1.compareTo(consts.bi_man_min_value) < 0) {
	        v1 = v1.multiply(consts.bi_10);
	        o1 -= 1;
	      }
	    }

	    if (v.is_native()) {
	      while (v2.compareTo(consts.bi_man_min_value) < 0) {
	        v2 = v2.multiply(consts.bi_10);
	        o2 -= 1;
	      }
	    }

	    result              = new Amount();
	    result._offset      = o1 + o2 + 14;
	    result._value       = v1.multiply(v2).divide(consts.bi_1e14).add(consts.bi_7);
	    result._is_native   = this._is_native;
	    result._is_negative = this._is_negative !== v._is_negative;
	    result._currency    = this._currency;
	    result._issuer      = this._issuer;

	    result.canonicalize();
	  }

	  return result;
	};

	// Return a new value.
	Amount.prototype.negate = function() {
	  return this.clone('NEGATE');
	};

	/**
	 * Invert this amount and return the new value.
	 *
	 * Creates a new Amount object as a copy of the current one (including the same
	 * unit (currency & issuer), inverts it (1/x) and returns the result.
	 */
	Amount.prototype.invert = function() {
	  var one          = this.clone();
	  one._value       = BigInteger.ONE;
	  one._offset      = 0;
	  one._is_negative = false;

	  one.canonicalize();

	  return one.ratio_human(this);
	};

	/**
	 * Tries to correctly interpret an amount as entered by a user.
	 *
	 * Examples:
	 *
	 *   XRP 250     => 250000000/XRP
	 *   25.2 XRP    => 25200000/XRP
	 *   USD 100.40  => 100.4/USD/?
	 *   100         => 100000000/XRP
	 *
	 *
	 * The regular expression below matches above cases, broken down for better understanding:
	 *
	 * ^\s*                         // start with any amount of whitespace
	 * ([a-zA-Z]{3}|[0-9]{3})       // either 3 letter alphabetic currency-code or 3 digit numeric currency-code. See ISO 4217
	 * \s*                          // any amount of whitespace
	 * (-)?                         // optional dash
	 * (\d+)                        // 1 or more digits
	 * (?:\.(\d*))?                 // optional . character with any amount of digits
	 * \s*                          // any amount of whitespace
	 * ([a-f0-9]{40}|[a-z0-9]{3})?  // optional 40 character hex string OR 3 letters
	 * \s*                          // any amount of whitespace
	 * $                            // end of string
	 *
	 */
	Amount.human_RE = /^\s*([a-z]{3})?\s*(-)?(\d*)(?:\.(\d*))?\s*([a-f0-9]{40}|[a-z0-9]{3})?\s*$/i;

	Amount.prototype.parse_human = function(j, opts) {
	  opts = opts || {};

	  var m = String(j).match(Amount.human_RE);

	  if (m) {
	    var currency   = m[1] || m[5] || 'XPS';
	    var integer    = m[3] || '0';
	    var fraction   = m[4] || '';
	    var precision  = null;

	    currency = currency.toUpperCase();

	    this._value = new BigInteger(integer);
	    this.set_currency(currency);

	    // XPS have exactly six digits of precision
	    if (currency === 'XPS') {
	      fraction = fraction.slice(0, 6);
	      while (fraction.length < 6) {
	        fraction += '0';
	      }
	      this._is_native = true;
	      this._value     = this._value.multiply(consts.bi_xns_unit).add(new BigInteger(fraction));
	    } else {
	      // Other currencies have arbitrary precision
	      fraction  = fraction.replace(/0+$/, '');
	      precision = fraction.length;

	      this._is_native = false;
	      var multiplier  = consts.bi_10.clone().pow(precision);
	      this._value     = this._value.multiply(multiplier).add(new BigInteger(fraction));
	      this._offset    = -precision;

	      this.canonicalize();
	    }

	    this._is_negative = !!m[2];

	    // Apply interest/demurrage
	    if (opts.reference_date && this._currency.has_interest()) {
	      var interest = this._currency.get_interest_at(opts.reference_date);

	      // XXX Because the Amount parsing routines don't support some of the things
	      //     that JavaScript can output when casting a float to a string, the
	      //     following call sometimes does not produce a valid Amount.
	      //
	      //     The correct way to solve this is probably to switch to a proper
	      //     BigDecimal for our internal representation and then use that across
	      //     the board instead of instantiating these dummy Amount objects.
	      var interestTempAmount = Amount.from_json(''+interest+'/1/1');

	      if (interestTempAmount.is_valid()) {
	        var ref = this.divide(interestTempAmount);
	        this._value = ref._value;
	        this._offset = ref._offset;
	      }
	    }
	  } else {
	    this._value = NaN;
	  }

	  return this;
	};

	Amount.prototype.parse_issuer = function(issuer) {
	  this._issuer  = UInt160.from_json(issuer);

	  return this;
	};

	/**
	 * Decode a price from a BookDirectory index.
	 *
	 * BookDirectory ledger entries each encode the offer price in their index. This
	 * method can decode that information and populate an Amount object with it.
	 *
	 * It is possible not to provide a currency or issuer, but be aware that Amount
	 * objects behave differently based on the currency, so you may get incorrect
	 * results.
	 *
	 * Prices involving demurraging currencies are tricky, since they depend on the
	 * base and counter currencies.
	 *
	 * @param quality {String} 8 hex bytes quality or 32 hex bytes BookDirectory
	 *   index.
	 * @param counterCurrency {Currency|String} Currency of the resulting Amount
	 *   object.
	 * @param counterIssuer {Issuer|String} Issuer of the resulting Amount object.
	 * @param opts Additional options
	 * @param opts.inverse {Boolean} If true, return the inverse of the price
	 *   encoded in the quality.
	 * @param opts.base_currency {Currency|String} The other currency. This plays a
	 *   role with interest-bearing or demurrage currencies. In that case the
	 *   demurrage has to be applied when the quality is decoded, otherwise the
	 *   price will be false.
	 * @param opts.reference_date {Date|Number} Date based on which demurrage/interest
	 *   should be applied. Can be given as JavaScript Date or int for Ripple epoch.
	 * @param opts.xrp_as_drops {Boolean} Whether XRP amount should be treated as
	 *   drops. When the base currency is XRP, the quality is calculated in drops.
	 *   For human use however, we want to think of 1000000 drops as 1 XRP and
	 *   prices as per-XRP instead of per-drop.
	 */
	Amount.prototype.parse_quality = function(quality, counterCurrency, counterIssuer, opts)
	{
	  opts = opts || {};

	  var baseCurrency = Currency.from_json(opts.base_currency);

	  this._is_negative = false;
	  this._value       = new BigInteger(quality.substring(quality.length-14), 16);
	  this._offset      = parseInt(quality.substring(quality.length-16, quality.length-14), 16)-100;
	  this._currency    = Currency.from_json(counterCurrency);
	  this._issuer      = UInt160.from_json(counterIssuer);
	  this._is_native   = this._currency.is_native();

	  // Correct offset if xrp_as_drops option is not set and base currency is XRP
	  if (!opts.xrp_as_drops &&
	      baseCurrency.is_valid() &&
	      baseCurrency.is_native()) {
	    if (opts.inverse) {
	      this._offset -= 6;
	    } else {
	      this._offset += 6;
	    }
	  }

	  if (opts.inverse) {
	    this._invert();
	  }

	  this.canonicalize();

	  if (opts.reference_date && baseCurrency.is_valid() && baseCurrency.has_interest()) {
	    var interest = baseCurrency.get_interest_at(opts.reference_date);

	    // XXX If we had better math utilities, we wouldn't need this hack.
	    var interestTempAmount = Amount.from_json(''+interest+'/1/1');

	    if (interestTempAmount.is_valid()) {
	      var v = this.divide(interestTempAmount);
	      this._value = v._value;
	      this._offset = v._offset;
	    }
	  }

	  return this;
	};

	Amount.prototype.parse_number = function(n) {
	  this._is_native   = false;
	  this._currency    = Currency.from_json(1);
	  this._issuer      = UInt160.from_json(1);
	  this._is_negative = n < 0 ? true : false;
	  this._value       = new BigInteger(String(this._is_negative ? -n : n));
	  this._offset      = 0;

	  this.canonicalize();

	  return this;
	};

	// <-> j
	Amount.prototype.parse_json = function(j) {
	  switch (typeof j) {
	    case 'string':
	      // .../.../... notation is not a wire format.  But allowed for easier testing.
	      var m = j.match(/^([^/]+)\/([^/]+)(?:\/(.+))?$/);

	      if (m) {
	        this._currency  = Currency.from_json(m[2]);
	        if (m[3]) {
	          this._issuer  = UInt160.from_json(m[3]);
	        } else {
	          this._issuer  = UInt160.from_json('1');
	        }
	        this.parse_value(m[1]);
	      } else {
	        this.parse_native(j);
	        this._currency  = Currency.from_json('0');
	        this._issuer    = UInt160.from_json('0');
	      }
	      break;

	    case 'number':
	      this.parse_json(String(j));
	      break;

	    case 'object':
	      if (j === null) {
	        break;
	      }

	      if (j instanceof Amount) {
	        j.copyTo(this);
	      } else if (j.hasOwnProperty('value')) {
	        // Parse the passed value to sanitize and copy it.
	        this._currency.parse_json(j.currency, true); // Never XPS.

	        if (typeof j.issuer === 'string') {
	          this._issuer.parse_json(j.issuer);
	        }

	        this.parse_value(j.value);
	      }
	      break;

	    default:
	      this._value = NaN;
	  }

	  return this;
	};

	// Parse a XPS value from untrusted input.
	// - integer = raw units
	// - float = with precision 6
	// XXX Improvements: disallow leading zeros.
	Amount.prototype.parse_native = function(j) {
	  var m;

	  if (typeof j === 'string') {
	    m = j.match(/^(-?)(\d*)(\.\d{0,6})?$/);
	  }

	  if (m) {
	    if (m[3] === void(0)) {
	      // Integer notation
	      this._value = new BigInteger(m[2]);
	    } else {
	      // Float notation : values multiplied by 1,000,000.
	      var int_part      = (new BigInteger(m[2])).multiply(consts.bi_xns_unit);
	      var fraction_part = (new BigInteger(m[3])).multiply(new BigInteger(String(Math.pow(10, 1+consts.xns_precision-m[3].length))));

	      this._value = int_part.add(fraction_part);
	    }

	    this._is_native   = true;
	    this._offset      = 0;
	    this._is_negative = !!m[1] && this._value.compareTo(BigInteger.ZERO) !== 0;

	    if (this._value.compareTo(consts.bi_xns_max) > 0) {
	      this._value = NaN;
	    }
	  } else {
	    this._value = NaN;
	  }

	  return this;
	};

	// Parse a non-native value for the json wire format.
	// Requires _currency to be set!
	Amount.prototype.parse_value = function(j) {
	  this._is_native    = false;

	  switch (typeof j) {
	    case 'number':
	      this._is_negative = j < 0;
	      this._value       = new BigInteger(Math.abs(j));
	      this._offset      = 0;

	      this.canonicalize();
	      break;

	    case 'string':
	      var i = j.match(/^(-?)(\d+)$/);
	      var d = !i && j.match(/^(-?)(\d*)\.(\d*)$/);
	      var e = !e && j.match(/^(-?)(\d*)e(-?\d+)$/);

	      if (e) {
	        // e notation
	        this._value       = new BigInteger(e[2]);
	        this._offset      = parseInt(e[3]);
	        this._is_negative = !!e[1];

	        this.canonicalize();
	      } else if (d) {
	        // float notation
	        var integer   = new BigInteger(d[2]);
	        var fraction  = new BigInteger(d[3]);
	        var precision = d[3].length;

	        this._value       = integer.multiply(consts.bi_10.clone().pow(precision)).add(fraction);
	        this._offset      = -precision;
	        this._is_negative = !!d[1];

	        this.canonicalize();
	      } else if (i) {
	        // integer notation
	        this._value       = new BigInteger(i[2]);
	        this._offset      = 0;
	        this._is_negative = !!i[1];

	        this.canonicalize();
	      } else {
	        this._value = NaN;
	      }
	      break;

	    default:
	      this._value = j instanceof BigInteger ? j : NaN;
	  }

	  return this;
	};

	Amount.prototype.set_currency = function(c) {
	  this._currency  = Currency.from_json(c);
	  this._is_native = this._currency.is_native();

	  return this;
	};

	Amount.prototype.set_issuer = function(issuer) {
	  if (issuer instanceof UInt160) {
	    this._issuer  = issuer;
	  } else {
	    this._issuer  = UInt160.from_json(issuer);
	  }

	  return this;
	};

	// Result in terms of this' currency and issuer.
	Amount.prototype.subtract = function(v) {
	  // Correctness over speed, less code has less bugs, reuse add code.
	  return this.add(Amount.from_json(v).negate());
	};

	Amount.prototype.to_number = function(allow_nan) {
	  var s = this.to_text(allow_nan);
	  return typeof s === 'string' ? Number(s) : s;
	};

	// Convert only value to JSON wire format.
	Amount.prototype.to_text = function(allow_nan) {
	  var result = NaN;

	  if (this._is_native) {
	    if (this.is_valid() && this._value.compareTo(consts.bi_xns_max) <= 0){
	      result = this._value.toString();
	    }
	  } else if (this.is_zero()) {
	    result = '0';
	  } else if (this._offset && (this._offset < -25 || this._offset > -4)) {
	    // Use e notation.
	    // XXX Clamp output.
	    result = this._value.toString() + 'e' + this._offset;
	  } else {
	    var val    = '000000000000000000000000000' + this._value.toString() + '00000000000000000000000';
	    var pre    = val.substring(0, this._offset + 43);
	    var post   = val.substring(this._offset + 43);
	    var s_pre  = pre.match(/[1-9].*$/);  // Everything but leading zeros.
	    var s_post = post.match(/[1-9]0*$/); // Last non-zero plus trailing zeros.

	    result = ''
	      + (s_pre ? s_pre[0] : '0')
	      + (s_post ? '.' + post.substring(0, 1 + post.length - s_post[0].length) : '');
	  }

	  if (!allow_nan && typeof result === 'number' && isNaN(result)) {
	    result = '0';
	  } else if (this._is_negative) {
	    result = '-' + result;
	  }

	  return result;
	};

	/**
	 * Calculate present value based on currency and a reference date.
	 *
	 * This only affects demurraging and interest-bearing currencies.
	 *
	 * User should not store amount objects after the interest is applied. This is
	 * intended by display functions such as toHuman().
	 *
	 * @param referenceDate {Date|Number} Date based on which demurrage/interest
	 *   should be applied. Can be given as JavaScript Date or int for Ripple epoch.
	 * @return {Amount} The amount with interest applied.
	 */
	Amount.prototype.applyInterest = function(referenceDate) {
	  if (this._currency.has_interest()) {
	    var interest = this._currency.get_interest_at(referenceDate);

	    // XXX Because the Amount parsing routines don't support some of the things
	    //     that JavaScript can output when casting a float to a string, the
	    //     following call sometimes does not produce a valid Amount.
	    //
	    //     The correct way to solve this is probably to switch to a proper
	    //     BigDecimal for our internal representation and then use that across
	    //     the board instead of instantiating these dummy Amount objects.
	    var interestTempAmount = Amount.from_json(String(interest) + '/1/1');

	    if (interestTempAmount.is_valid()) {
	      return this.multiply(interestTempAmount);
	    }
	  } else {
	    return this;
	  }
	};

	/**
	 * Format only value in a human-readable format.
	 *
	 * @example
	 *   var pretty = amount.to_human({precision: 2});
	 *
	 * @param opts Options for formatter.
	 * @param opts.precision {Number} Max. number of digits after decimal point.
	 * @param opts.min_precision {Number} Min. number of digits after dec. point.
	 * @param opts.skip_empty_fraction {Boolean} Don't show fraction if it is zero,
	 *   even if min_precision is set.
	 * @param opts.max_sig_digits {Number} Maximum number of significant digits.
	 *   Will cut fractional part, but never integer part.
	 * @param opts.group_sep {Boolean|String} Whether to show a separator every n
	 *   digits, if a string, that value will be used as the separator. Default: ','
	 * @param opts.group_width {Number} How many numbers will be grouped together,
	 *   default: 3.
	 * @param opts.signed {Boolean|String} Whether negative numbers will have a
	 *   prefix. If String, that string will be used as the prefix. Default: '-'
	 * @param opts.reference_date {Date|Number} Date based on which demurrage/interest
	 *   should be applied. Can be given as JavaScript Date or int for Ripple epoch.
	 */
	Amount.prototype.to_human = function(opts) {
	  opts = opts || {};

	  if (!this.is_valid()) {
	    return '';
	  }

	  // Default options
	  if (typeof opts.signed === 'undefined') {
	    opts.signed = true;
	  }
	  if (typeof opts.group_sep === 'undefined') {
	    opts.group_sep = true;
	  }

	  opts.group_width = opts.group_width || 3;

	  // Apply demurrage/interest
	  var ref = this;
	  if (opts.reference_date) {
	    ref = this.applyInterest(opts.reference_date);
	  }

	  var order         = ref._is_native ? consts.xns_precision : -ref._offset;
	  var denominator   = consts.bi_10.clone().pow(order);
	  var int_part      = ref._value.divide(denominator).toString();
	  var fraction_part = ref._value.mod(denominator).toString();

	  // Add leading zeros to fraction
	  while (fraction_part.length < order) {
	    fraction_part = '0' + fraction_part;
	  }

	  int_part = int_part.replace(/^0*/, '');
	  fraction_part = fraction_part.replace(/0*$/, '');

	  if (fraction_part.length || !opts.skip_empty_fraction) {
	    // Enforce the maximum number of decimal digits (precision)
	    if (typeof opts.precision === 'number') {
	      fraction_part = fraction_part.slice(0, opts.precision);
	    }

	    // Limit the number of significant digits (max_sig_digits)
	    if (typeof opts.max_sig_digits === 'number') {
	      // First, we count the significant digits we have.
	      // A zero in the integer part does not count.
	      var int_is_zero = +int_part === 0;
	      var digits = int_is_zero ? 0 : int_part.length;

	      // Don't count leading zeros in the fractional part if the integer part is
	      // zero.
	      var sig_frac = int_is_zero ? fraction_part.replace(/^0*/, '') : fraction_part;
	      digits += sig_frac.length;

	      // Now we calculate where we are compared to the maximum
	      var rounding = digits - opts.max_sig_digits;

	      // If we're under the maximum we want to cut no (=0) digits
	      rounding = Math.max(rounding, 0);

	      // If we're over the maximum we still only want to cut digits from the
	      // fractional part, not from the integer part.
	      rounding = Math.min(rounding, fraction_part.length);

	      // Now we cut `rounding` digits off the right.
	      if (rounding > 0) {
	        fraction_part = fraction_part.slice(0, -rounding);
	      }
	    }

	    // Enforce the minimum number of decimal digits (min_precision)
	    if (typeof opts.min_precision === 'number') {
	      while (fraction_part.length < opts.min_precision) {
	        fraction_part += '0';
	      }
	    }
	  }

	  if (opts.group_sep) {
	    if (typeof opts.group_sep !== 'string') {
	      opts.group_sep = ',';
	    }
	    int_part = utils.chunkString(int_part, opts.group_width, true).join(opts.group_sep);
	  }

	  var formatted = '';
	  if (opts.signed && this._is_negative) {
	    if (typeof opts.signed !== 'string') {
	      opts.signed = '-';
	    }
	    formatted += opts.signed;
	  }

	  formatted += int_part.length ? int_part : '0';
	  formatted += fraction_part.length ? '.' + fraction_part : '';

	  return formatted;
	};

	Amount.prototype.to_human_full = function(opts) {
	  opts = opts || {};
	  var a = this.to_human(opts);
	  var c = this._currency.to_human();
	  var i = this._issuer.to_json(opts);
	  var o = this.is_native ?  (o = a + '/' + c) : (o  = a + '/' + c + '/' + i);
	  return o;
	};

	Amount.prototype.to_json = function() {
	  var result;

	  if (this._is_native) {
	    result = this.to_text();
	  } else {
	    var amount_json = {
	      value : this.to_text(),
	      currency : this._currency.to_json()
	    };
	    if (this._issuer.is_valid()) {
	      amount_json.issuer = this._issuer.to_json();
	    }
	    result = amount_json;
	  }

	  return result;
	};

	Amount.prototype.to_text_full = function(opts) {
	  return this._value instanceof BigInteger
	    ? this._is_native
	      ? this.to_human() + '/XPS'
	      : this.to_text() + '/' + this._currency.to_json() + '/' + this._issuer.to_json(opts)
	    : NaN;
	};

	// For debugging.
	Amount.prototype.not_equals_why = function(d, ignore_issuer) {
	  if (typeof d === 'string') {
	    return this.not_equals_why(Amount.from_json(d));
	  }

	  if (!(d instanceof Amount)) {
	    return 'Not an Amount';
	  }

	  var result = false;

	  if (typeof d === 'string') {
	    result = this.not_equals_why(Amount.from_json(d));
	  } else if (d instanceof Amount) {
	    if (!this.is_valid() || !d.is_valid()) {
	      result = 'Invalid amount.';
	    } else if (this._is_native !== d._is_native) {
	      result = 'Native mismatch.';
	    } else {
	      var type = this._is_native ? 'XPS' : 'Non-XPS';

	      if (!this._value.equals(d._value) || this._offset !== d._offset) {
	        result = type + ' value differs.';
	      } else if (this._is_negative !== d._is_negative) {
	        result = type + ' sign differs.';
	      } else if (!this._is_native) {
	        if (!this._currency.equals(d._currency)) {
	          result = 'Non-XPS currency differs.';
	        } else if (!ignore_issuer && !this._issuer.equals(d._issuer)) {
	          result = 'Non-XPS issuer differs: ' + d._issuer.to_json() + '/' + this._issuer.to_json();
	        }
	      }
	    }
	  }

	  return result;
	};

	exports.Amount   = Amount;

	// DEPRECATED: Include the corresponding files instead.
	exports.Currency = Currency;
	exports.Seed     = Seed;
	exports.UInt160  = UInt160;

	// vim:sw=2:sts=2:ts=8:et


/***/ },
/* 4 */
/***/ function(module, exports, __webpack_require__) {

	// Routines for working with an account.
	//
	// You should not instantiate this class yourself, instead use Remote#account.
	//
	// Events:
	//   wallet_clean :  True, iff the wallet has been updated.
	//   wallet_dirty :  True, iff the wallet needs to be updated.
	//   balance:        The current stamp balance.
	//   balance_proposed
	//

	// var network = require('./network.js');
	var async              = __webpack_require__(48);
	var util               = __webpack_require__(36);
	var extend             = __webpack_require__(42);
	var EventEmitter       = __webpack_require__(35).EventEmitter;
	var Amount             = __webpack_require__(3).Amount;
	var UInt160            = __webpack_require__(8).UInt160;
	var TransactionManager = __webpack_require__(25).TransactionManager;
	var sjcl               = __webpack_require__(19).sjcl;
	var Base               = __webpack_require__(7).Base;
	var Crypt              = __webpack_require__(26).Crypt;

	/**
	 * @constructor Account
	 * @param {Remote} remote
	 * @param {String} account
	 */

	function Account(remote, account) {
	  EventEmitter.call(this);

	  var self = this;

	  this._remote = remote;
	  this._account = UInt160.from_json(account);
	  this._account_id = this._account.to_json();
	  this._subs = 0;

	  // Ledger entry object
	  // Important: This must never be overwritten, only extend()-ed
	  this._entry = { };

	  function listenerAdded(type, listener) {
	    if (~Account.subscribeEvents.indexOf(type)) {
	      if (!self._subs && self._remote._connected) {
	        self._remote.request_subscribe()
	        .add_account(self._account_id)
	        .broadcast();
	      }
	      self._subs += 1;
	    }
	  };

	  this.on('newListener', listenerAdded);

	  function listenerRemoved(type, listener) {
	    if (~Account.subscribeEvents.indexOf(type)) {
	      self._subs -= 1;
	      if (!self._subs && self._remote._connected) {
	        self._remote.request_unsubscribe()
	        .add_account(self._account_id)
	        .broadcast();
	      }
	    }
	  };

	  this.on('removeListener', listenerRemoved);

	  function attachAccount(request) {
	    if (self._account.is_valid() && self._subs) {
	      request.add_account(self._account_id);
	    }
	  };

	  this._remote.on('prepare_subscribe', attachAccount);

	  function handleTransaction(transaction) {
	    if (!transaction.mmeta) {
	      return;
	    }

	    var changed = false;

	    transaction.mmeta.each(function(an) {
	      var isAccount = an.fields.Account === self._account_id;
	      var isAccountRoot = isAccount && (an.entryType === 'AccountRoot');

	      if (isAccountRoot) {
	        extend(self._entry, an.fieldsNew, an.fieldsFinal);
	        changed = true;
	      }
	    });

	    if (changed) {
	      self.emit('entry', self._entry);
	    }
	  };

	  this.on('transaction', handleTransaction);

	  this._transactionManager = new TransactionManager(this);

	  return this;
	};

	util.inherits(Account, EventEmitter);

	/**
	 * List of events that require a remote subscription to the account.
	 */

	Account.subscribeEvents = [ 'transaction', 'entry' ];

	Account.prototype.toJson = function() {
	  return this._account.to_json();
	};

	/**
	 * Whether the AccountId is valid.
	 *
	 * Note: This does not tell you whether the account exists in the ledger.
	 */

	Account.prototype.isValid = function() {
	  return this._account.is_valid();
	};

	/**
	 * Request account info
	 *
	 * @param {Function} callback
	 */

	Account.prototype.getInfo = function(callback) {
	  return this._remote.request_account_info(this._account_id, callback);
	};

	/**
	 * Retrieve the current AccountRoot entry.
	 *
	 * To keep up-to-date with changes to the AccountRoot entry, subscribe to the
	 * 'entry' event.
	 *
	 * @param {Function} callback
	 */

	Account.prototype.entry = function(callback) {
	  var self = this;
	  var callback = typeof callback === 'function' ? callback : function(){};

	  function accountInfo(err, info) {
	    if (err) {
	      callback(err);
	    } else {
	      extend(self._entry, info.account_data);
	      self.emit('entry', self._entry);
	      callback(null, info);
	    }
	  };

	  this.getInfo(accountInfo);

	  return this;
	};

	Account.prototype.getNextSequence = function(callback) {
	  var callback = typeof callback === 'function' ? callback : function(){};

	  function isNotFound(err) {
	    return err && typeof err === 'object'
	    && typeof err.remote === 'object'
	    && err.remote.error === 'actNotFound';
	  };

	  function accountInfo(err, info) {
	    if (isNotFound(err)) {
	      // New accounts will start out as sequence one
	      callback(null, 1);
	    } else if (err) {
	      callback(err);
	    } else {
	      callback(null, info.account_data.Sequence);
	    }
	  };

	  this.getInfo(accountInfo);

	  return this;
	};

	/**
	 * Retrieve this account's Ripple trust lines.
	 *
	 * To keep up-to-date with changes to the AccountRoot entry, subscribe to the
	 * 'lines' event. (Not yet implemented.)
	 *
	 * @param {function(err, lines)} callback Called with the result
	 */

	Account.prototype.lines = function(callback) {
	  var self = this;
	  var callback = typeof callback === 'function' ? callback : function(){};

	  function accountLines(err, res) {
	    if (err) {
	      callback(err);
	    } else {
	      self._lines = res.lines;
	      self.emit('lines', self._lines);
	      callback(null, res);
	    }
	  }

	  this._remote.requestAccountLines(this._account_id, accountLines);

	  return this;
	};

	/**
	 * Retrieve this account's single trust line.
	 *
	 * @param {string} currency Currency
	 * @param {string} address Ripple address
	 * @param {function(err, line)} callback Called with the result
	 * @returns {Account}
	 */

	Account.prototype.line = function(currency, address, callback) {
	  var self = this;
	  var callback = typeof callback === 'function' ? callback : function(){};

	  self.lines(function(err, data) {
	    if (err) {
	      return callback(err);
	    }

	    var line;

	    top:
	    for (var i=0; i<data.lines.length; i++) {
	      var l = data.lines[i];
	      if (l.account === address && l.currency === currency) {
	        line = l;
	        break top;
	      }
	    }

	    callback(null, line);
	  });

	  return this;
	};

	/**
	 * Notify object of a relevant transaction.
	 *
	 * This is only meant to be called by the Remote class. You should never have to
	 * call this yourself.
	 *
	 * @param {Object} message
	 */

	Account.prototype.notify =
	Account.prototype.notifyTx = function(transaction) {
	  // Only trigger the event if the account object is actually
	  // subscribed - this prevents some weird phantom events from
	  // occurring.
	  if (!this._subs) {
	    return;
	  }

	  this.emit('transaction', transaction);

	  var account = transaction.transaction.Account;

	  if (!account) {
	    return;
	  }

	  var isThisAccount = (account === this._account_id);

	  this.emit(isThisAccount ? 'transaction-outbound' : 'transaction-inbound', transaction);
	};

	/**
	 * Submit a transaction to an account's
	 * transaction manager
	 *
	 * @param {Transaction} transaction
	 */

	Account.prototype.submit = function(transaction) {
	  this._transactionManager.submit(transaction);
	};


	/**
	 *  Check whether the given public key is valid for this account
	 *
	 *  @param {Hex-encoded String|RippleAddress} public_key
	 *  @param {Function} callback
	 *
	 *  @callback
	 *  @param {Error} err
	 *  @param {Boolean} true if the public key is valid and active, false otherwise
	 */
	Account.prototype.publicKeyIsActive = function(public_key, callback) {
	  var self = this;
	  var public_key_as_uint160;

	  try {
	    public_key_as_uint160 = Account._publicKeyToAddress(public_key);
	  } catch (err) {
	    return callback(err);
	  }

	  function getAccountInfo(async_callback) {
	    self.getInfo(function(err, account_info_res){

	      // If the remote responds with an Account Not Found error then the account
	      // is unfunded and thus we can assume that the master key is active
	      if (err && err.remote && err.remote.error === 'actNotFound') {
	        async_callback(null, null);
	      } else {
	        async_callback(err, account_info_res);
	      }
	    });
	  };

	  function publicKeyIsValid(account_info_res, async_callback) {
	    // Catch the case of unfunded accounts
	    if (!account_info_res) {

	      if (public_key_as_uint160 === self._account_id) {
	        async_callback(null, true);
	      } else {
	        async_callback(null, false);
	      }

	      return;
	    }

	    var account_info = account_info_res.account_data;

	    // Respond with true if the RegularKey is set and matches the given public key or
	    // if the public key matches the account address and the lsfDisableMaster is not set
	    if (account_info.RegularKey &&
	      account_info.RegularKey === public_key_as_uint160) {
	      async_callback(null, true);
	    } else if (account_info.Account === public_key_as_uint160 &&
	      ((account_info.Flags & 0x00100000) === 0)) {
	      async_callback(null, true);
	    } else {
	      async_callback(null, false);
	    }
	  };

	  var steps = [
	    getAccountInfo,
	    publicKeyIsValid
	  ];

	  async.waterfall(steps, callback);
	};

	/**
	 *  Convert a hex-encoded public key to a Ripple Address
	 *
	 *  @static
	 *
	 *  @param {Hex-encoded string|RippleAddress} public_key
	 *  @returns {RippleAddress}
	 */
	Account._publicKeyToAddress = function(public_key) {
	  // Based on functions in /src/js/ripple/keypair.js
	  function hexToUInt160(public_key) {
	    var bits = sjcl.codec.hex.toBits(public_key);
	    var hash = Crypt.ripemd160(sjcl.hash.sha256.hash(bits));
	    var address = UInt160.from_bits(hash);
	    address.set_version(Base.VER_ACCOUNT_ID);

	    return address.to_json();
	  };

	  if (UInt160.is_valid(public_key)) {
	    return public_key;
	  } else if (/^[0-9a-fA-F]+$/.test(public_key)) {
	    return hexToUInt160(public_key);
	  } else {
	    throw new Error('Public key is invalid. Must be a UInt160 or a hex string');
	  }
	};

	exports.Account = Account;

	// vim:sw=2:sts=2:ts=8:et


/***/ },
/* 5 */
/***/ function(module, exports, __webpack_require__) {

	// Transactions
	//
	//  Construction:
	//    remote.transaction()  // Build a transaction object.
	//     .offer_create(...)   // Set major parameters.
	//     .set_flags()         // Set optional parameters.
	//     .on()                // Register for events.
	//     .submit();           // Send to network.
	//
	//  Events:
	// 'success' : Transaction submitted without error.
	// 'error' : Error submitting transaction.
	// 'proposed' : Advisory proposed status transaction.
	// - A client should expect 0 to multiple results.
	// - Might not get back. The remote might just forward the transaction.
	// - A success could be reverted in final.
	// - local error: other remotes might like it.
	// - malformed error: local server thought it was malformed.
	// - The client should only trust this when talking to a trusted server.
	// 'final' : Final status of transaction.
	// - Only expect a final from dishonest servers after a tesSUCCESS or ter*.
	// 'lost' : Gave up looking for on ledger_closed.
	// 'pending' : Transaction was not found on ledger_closed.
	// 'state' : Follow the state of a transaction.
	//    'client_submitted'     - Sent to remote
	//     |- 'remoteError'      - Remote rejected transaction.
	//      \- 'client_proposed' - Remote provisionally accepted transaction.
	//       |- 'client_missing' - Transaction has not appeared in ledger as expected.
	//       | |\- 'client_lost' - No longer monitoring missing transaction.
	//       |/
	//       |- 'tesSUCCESS'     - Transaction in ledger as expected.
	//       |- 'ter...'         - Transaction failed.
	//       \- 'tec...'         - Transaction claimed fee only.
	//
	// Notes:
	// - All transactions including those with local and malformed errors may be
	//   forwarded anyway.
	// - A malicous server can:
	//   - give any proposed result.
	//     - it may declare something correct as incorrect or something incorrect as correct.
	//     - it may not communicate with the rest of the network.
	//   - may or may not forward.
	//

	var EventEmitter     = __webpack_require__(35).EventEmitter;
	var util             = __webpack_require__(36);
	var utils            = __webpack_require__(19);
	var sjcl             = __webpack_require__(19).sjcl;
	var Amount           = __webpack_require__(3).Amount;
	var Currency         = __webpack_require__(3).Currency;
	var UInt160          = __webpack_require__(3).UInt160;
	var Seed             = __webpack_require__(10).Seed;
	var SerializedObject = __webpack_require__(12).SerializedObject;
	var RippleError      = __webpack_require__(13).RippleError;
	var hashprefixes     = __webpack_require__(27);
	var config           = __webpack_require__(21);

	function Transaction(remote) {
	  EventEmitter.call(this);

	  var self = this;

	  var remote = remote || { };

	  this.remote = remote;

	  // Transaction data
	  this.tx_json = { Flags: 0 };

	  this._secret = void(0);
	  this._build_path = false;
	  this._maxFee = this.remote.max_fee;

	  this.state = 'unsubmitted';
	  this.finalized = false;
	  this.previousSigningHash = void(0);

	  // Index at which transaction was submitted
	  this.submitIndex = void(0);

	  // Canonical signing setting defaults to the Remote's configuration
	  this.canonical = (typeof remote === 'object') ? !!remote.canonical_signing : true;

	  // We aren't clever enough to eschew preventative measures so we keep an array
	  // of all submitted transactionIDs (which can change due to load_factor
	  // effecting the Fee amount). This should be populated with a transactionID
	  // any time it goes on the network
	  this.submittedIDs = [ ];

	  this.once('success', function(message) {
	    self.finalize(message);
	    self.setState('validated');
	    self.emit('cleanup', message);
	  });

	  this.once('error', function(message) {
	    self.finalize(message);
	    self.setState('failed');
	    self.emit('cleanup', message);
	  });

	  this.once('submitted', function() {
	    self.setState('submitted');
	  });

	  this.once('proposed', function() {
	    self.setState('pending');
	  });
	};

	util.inherits(Transaction, EventEmitter);

	// XXX This needs to be determined from the network.
	Transaction.fee_units = {
	  default: 10
	};

	Transaction.flags = {
	  // Universal flags can apply to any transaction type
	  Universal: {
	    FullyCanonicalSig:  0x80000000
	  },

	  AccountSet: {
	    RequireDestTag:     0x00010000,
	    OptionalDestTag:    0x00020000,
	    RequireAuth:        0x00040000,
	    OptionalAuth:       0x00080000,
	    DisallowXRP:        0x00100000,
	    AllowXRP:           0x00200000
	  },
	  
	  AccountMerge: {
	  },

	  Inflation:{
	  },

	  TrustSet: {
	    SetAuth:            0x00010000,
	    NoRipple:           0x00020000,
	    ClearNoRipple:      0x00040000,
	    ClearAuth:          0x00080000
	  },

	  OfferCreate: {
	    Passive:            0x00010000,
	    ImmediateOrCancel:  0x00020000,
	    FillOrKill:         0x00040000,
	    Sell:               0x00080000
	  },

	  Payment: {
	    NoRippleDirect:     0x00010000,
	    PartialPayment:     0x00020000,
	    LimitQuality:       0x00040000
	  }
	};

	// The following are integer (as opposed to bit) flags
	// that can be set for particular transactions in the
	// SetFlag or ClearFlag field
	Transaction.set_clear_flags = {
	  AccountSet: {
	    asfRequireDest:    1,
	    asfRequireAuth:    2,
	    asfDisallowXRP:    3,
	    asfDisableMaster:  4
	  }
	};

	Transaction.formats = __webpack_require__(18).tx;

	Transaction.prototype.consts = {
	  telLOCAL_ERROR:  -399,
	  temMALFORMED:    -299,
	  tefFAILURE:      -199,
	  terRETRY:        -99,
	  tesSUCCESS:      0,
	  tecCLAIMED:      100
	};

	Transaction.from_json = function(j) {
	  return (new Transaction()).parseJson(j);
	};

	Transaction.prototype.parseJson = function(v) {
	  this.tx_json = v;
	  return this;
	};

	Transaction.prototype.isTelLocal = function(ter) {
	  return ter >= this.consts.telLOCAL_ERROR && ter < this.consts.temMALFORMED;
	};

	Transaction.prototype.isTemMalformed = function(ter) {
	  return ter >= this.consts.temMALFORMED && ter < this.consts.tefFAILURE;
	};

	Transaction.prototype.isTefFailure = function(ter) {
	  return ter >= this.consts.tefFAILURE && ter < this.consts.terRETRY;
	};

	Transaction.prototype.isTerRetry = function(ter) {
	  return ter >= this.consts.terRETRY && ter < this.consts.tesSUCCESS;
	};

	Transaction.prototype.isTepSuccess = function(ter) {
	  return ter >= this.consts.tesSUCCESS;
	};

	Transaction.prototype.isTecClaimed = function(ter) {
	  return ter >= this.consts.tecCLAIMED;
	};

	Transaction.prototype.isRejected = function(ter) {
	  return this.isTelLocal(ter) || this.isTemMalformed(ter) || this.isTefFailure(ter);
	};

	Transaction.prototype.setState = function(state) {
	  if (this.state !== state) {
	    this.state = state;
	    this.emit('state', state);
	    this.emit('save');
	  }
	};

	Transaction.prototype.finalize = function(message) {
	  this.finalized = true;

	  if (this.result) {
	    this.result.ledger_index = message.ledger_index;
	    this.result.ledger_hash  = message.ledger_hash;
	  } else {
	    this.result = message;
	    this.result.tx_json = this.tx_json;
	  }

	  return this;
	};

	Transaction.prototype._accountSecret = function(account) {
	  return this.remote.secrets[account];
	};

	/**
	 * Returns the number of fee units this transaction will cost.
	 *
	 * Each Ripple transaction based on its type and makeup costs a certain number
	 * of fee units. The fee units are calculated on a per-server basis based on the
	 * current load on both the network and the server.
	 *
	 * @see https://ripple.com/wiki/Transaction_Fee
	 *
	 * @return {Number} Number of fee units for this transaction.
	 */

	Transaction.prototype._getFeeUnits =
	Transaction.prototype.feeUnits = function() {
	  return Transaction.fee_units['default'];
	};

	/**
	 * Compute median server fee
	 */

	Transaction.prototype._computeFee = function() {
	  var servers = this.remote._servers;
	  var fees = [ ];

	  for (var i=0; i<servers.length; i++) {
	    var server = servers[i];
	    if (server._connected) {
	      fees.push(Number(server._computeFee(this)));
	    }
	  }

	  switch (fees.length) {
	    case 0: return;
	    case 1: return String(fees[0]);
	  }

	  fees.sort(function ascending(a, b) {
	    if (a > b) {
	      return 1;
	    } else if (a < b) {
	      return -1;
	    } else {
	      return 0;
	    }
	  });

	  var midInd = Math.floor(fees.length / 2);

	  var median = fees.length % 2 === 0
	  ? Math.floor(0.5 + (fees[midInd] + fees[midInd - 1]) / 2)
	  : fees[midInd];

	  return String(median);
	};

	/**
	 * Attempts to complete the transaction for submission.
	 *
	 * This function seeks to fill out certain fields, such as Fee and
	 * SigningPubKey, which can be determined by the library based on network
	 * information and other fields.
	 */

	Transaction.prototype.complete = function() {
	  if (this.remote) {
	    if (!this.remote.trusted && !this.remote.local_signing) {
	      this.emit('error', new RippleError('tejServerUntrusted', 'Attempt to give secret to untrusted server'));
	      return false;
	    }
	  }

	  // Try to auto-fill the secret
	  if (!this._secret && !(this._secret = this._accountSecret(this.tx_json.Account))) {
	    this.emit('error', new RippleError('tejSecretUnknown', 'Missing secret'));
	    return false;
	  }

	  if (typeof this.tx_json.SigningPubKey === 'undefined') {
	    try {
	      var seed = Seed.from_json(this._secret);
	      var key  = seed.get_key();
	      this.tx_json.SigningPubKey = key.to_hex_pub();
	    } catch(e) {
	      this.emit('error', new RippleError('tejSecretInvalid', 'Invalid secret'));
	      return false;
	    }
	  }

	  // If the Fee hasn't been set, one needs to be computed by
	  // an assigned server
	  if (this.remote && typeof this.tx_json.Fee === 'undefined') {
	    if (this.remote.local_fee || !this.remote.trusted) {
	      if (!(this.tx_json.Fee = this._computeFee())) {
	        this.emit('error', new RippleError('tejUnconnected'));
	        return;
	      }
	    }
	  }

	  if (Number(this.tx_json.Fee) > this._maxFee) {
	    this.emit('error', new RippleError('tejMaxFeeExceeded', 'Max fee exceeded'));
	    return false;
	  }

	  // Set canonical flag - this enables canonicalized signature checking
	  if (this.remote && this.remote.local_signing && this.canonical) {
	    this.tx_json.Flags |= Transaction.flags.Universal.FullyCanonicalSig;

	    // JavaScript converts operands to 32-bit signed ints before doing bitwise
	    // operations. We need to convert it back to an unsigned int.
	    this.tx_json.Flags = this.tx_json.Flags >>> 0;
	  }

	  return this.tx_json;
	};

	Transaction.prototype.serialize = function() {
	  return SerializedObject.from_json(this.tx_json);
	};

	Transaction.prototype.signingHash = function() {
	  return this.hash(config.testnet ? 'HASH_TX_SIGN_TESTNET' : 'HASH_TX_SIGN');
	};

	Transaction.prototype.hash = function(prefix, as_uint256) {
	  if (typeof prefix === 'string') {
	    if (typeof hashprefixes[prefix] === 'undefined') {
	      throw new Error('Unknown hashing prefix requested.');
	    }
	    prefix = hashprefixes[prefix];
	  } else if (!prefix) {
	    prefix = hashprefixes.HASH_TX_ID;
	  }

	  var hash = SerializedObject.from_json(this.tx_json).hash(prefix);

	  return as_uint256 ? hash : hash.to_hex();
	};

	Transaction.prototype.sign = function(callback) {
	  var callback = typeof callback === 'function' ? callback : function(){};
	  var seed = Seed.from_json(this._secret);

	  var prev_sig = this.tx_json.TxnSignature;
	  delete this.tx_json.TxnSignature;

	  var hash = this.signingHash();

	  // If the hash is the same, we can re-use the previous signature
	  if (prev_sig && hash === this.previousSigningHash) {
	    this.tx_json.TxnSignature = prev_sig;
	    callback();
	    return this;
	  }

	  var key = seed.get_key();
	  var sig = key.sign(hash);
	  var hex = sjcl.codec.hex.fromBits(sig).toUpperCase();

	  this.tx_json.TxnSignature = hex;
	  this.previousSigningHash = hash;

	  callback();

	  return this;
	};

	/**
	 * Add a ID to list of submitted IDs for this transaction
	 */

	Transaction.prototype.addId = function(hash) {
	  if (this.submittedIDs.indexOf(hash) === -1) {
	    this.submittedIDs.unshift(hash);
	    this.emit('signed', hash);
	    this.emit('save');
	  }
	};

	/**
	 * Find ID within list of submitted IDs for this transaction
	 */

	Transaction.prototype.findId = function(cache) {
	  var result;

	  for (var i=0; i<this.submittedIDs.length; i++) {
	    var hash = this.submittedIDs[i];
	    if ((result = cache[hash])) {
	      break;
	    }
	  }

	  return result;
	};

	//
	// Set options for Transactions
	//

	// --> build: true, to have server blindly construct a path.
	//
	// "blindly" because the sender has no idea of the actual cost except that is must be less than send max.
	Transaction.prototype.buildPath = function(build) {
	  this._build_path = build;
	  return this;
	};

	// tag should be undefined or a 32 bit integer.
	// YYY Add range checking for tag.
	Transaction.prototype.destinationTag = function(tag) {
	  if (tag !== void(0)) {
	    this.tx_json.DestinationTag = tag;
	  }
	  return this;
	};

	Transaction.prototype.invoiceID = function(id) {
	  if (typeof id === 'string') {
	    while (id.length < 64) {
	      id += '0';
	    }
	    this.tx_json.InvoiceID = id;
	  }
	  return this;
	};

	Transaction.prototype.clientID = function(id) {
	  if (typeof id === 'string') {
	    this._clientID = id;
	  }
	  return this;
	};

	Transaction.prototype.lastLedger = function(sequence) {
	  if (typeof sequence === 'number') {
	    this.tx_json.LastLedgerSequence = sequence;
	    this.lastLedgerSequence = sequence;
	  }
	  return this;
	};

	Transaction._pathRewrite = function(path) {
	  if (!Array.isArray(path)) {
	    return;
	  }

	  var newPath = path.map(function(node) {
	    var newNode = { };

	    if (node.hasOwnProperty('account')) {
	      newNode.account = UInt160.json_rewrite(node.account);
	    }

	    if (node.hasOwnProperty('issuer')) {
	      newNode.issuer = UInt160.json_rewrite(node.issuer);
	    }

	    if (node.hasOwnProperty('currency')) {
	      newNode.currency = Currency.json_rewrite(node.currency);
	    }

	    if (node.hasOwnProperty('type_hex')) {
	      newNode.type_hex = node.type_hex;
	    }

	    return newNode;
	  });

	  return newPath;
	};

	Transaction.prototype.pathAdd = function(path) {
	  if (Array.isArray(path)) {
	    this.tx_json.Paths  = this.tx_json.Paths || [];
	    this.tx_json.Paths.push(Transaction._pathRewrite(path));
	  }
	  return this;
	};

	// --> paths: undefined or array of path
	// // A path is an array of objects containing some combination of: account, currency, issuer

	Transaction.prototype.paths = function(paths) {
	  if (Array.isArray(paths)) {
	    for (var i=0, l=paths.length; i<l; i++) {
	      this.pathAdd(paths[i]);
	    }
	  }
	  return this;
	};

	// If the secret is in the config object, it does not need to be provided.
	Transaction.prototype.secret = function(secret) {
	  this._secret = secret;
	  return this;
	};

	Transaction.prototype.sendMax = function(send_max) {
	  if (send_max) {
	    this.tx_json.SendMax = Amount.json_rewrite(send_max);
	  }
	  return this;
	};

	// tag should be undefined or a 32 bit integer.
	// YYY Add range checking for tag.
	Transaction.prototype.sourceTag = function(tag) {
	  if (tag) {
	    this.tx_json.SourceTag = tag;
	  }
	  return this;
	};

	// --> rate: In billionths.
	Transaction.prototype.transferRate = function(rate) {
	  this.tx_json.TransferRate = Number(rate);

	  if (this.tx_json.TransferRate < 1e9) {
	    throw new Error('invalidTransferRate');
	  }

	  return this;
	};

	// --> acc: Account
	Transaction.prototype.inflationDest = function(acc) {
	  this.tx_json.InflationDest = UInt160.json_rewrite(acc);

	  return this;
	};

	Transaction.prototype.setAuthKey = function(acc) {
	    this.tx_json.SetAuthKey = UInt160.json_rewrite(acc);

	    return this;
	};


	// Add flags to a transaction.
	// --> flags: undefined, _flag_, or [ _flags_ ]
	Transaction.prototype.setFlags = function(flags) {
	  if (flags === void(0)) {
	    return this;
	  }

	  if (typeof flags === 'number') {
	    this.tx_json.Flags = flags;
	    return this;
	  }

	  var flag_set = Array.isArray(flags) ? flags : Array.prototype.slice.call(arguments);
	  var transaction_flags = Transaction.flags[this.tx_json.TransactionType] || { };

	  for (var i=0, l=flag_set.length; i<l; i++) {
	    var flag = flag_set[i];

	    if (transaction_flags.hasOwnProperty(flag)) {
	      this.tx_json.Flags += transaction_flags[flag];
	    } else {
	      return this.emit('error', new RippleError('tejInvalidFlag'));
	    }
	  }

	  return this;
	};

	// Options:
	//  .domain()           NYI
	//  .flags()
	//  .message_key()      NYI
	//  .transfer_rate()
	//  .wallet_locator()   NYI
	//  .wallet_size()      NYI

	/**
	 *  Construct an 'AccountSet' transaction.
	 *
	 *  Note that bit flags can be set using the .setFlags() method
	 *  but for 'AccountSet' transactions there is an additional way to
	 *  modify AccountRoot flags. The values available for the SetFlag 
	 *  and ClearFlag are as follows:
	 *
	 *  "asfRequireDest"
	 *    Require a destination tag
	 *  "asfRequireAuth"
	 *    Authorization is required to extend trust
	 *  "asfDisallowXRP"
	 *    XRP should not be sent to this account
	 *  "asfDisableMaster"
	 *    Disallow use of the master key
	 */

	Transaction.prototype.accountSet = function(src, set_flag, clear_flag) {
	  if (typeof src === 'object') {
	    var options = src;
	    src = options.source || options.from || options.account;
	    set_flag = options.set_flag || options.set;
	    clear_flag = options.clear_flag || options.clear;
	  }

	  if (!UInt160.is_valid(src)) {
	    throw new Error('Source address invalid');
	  }

	  this.tx_json.TransactionType  = 'AccountSet';
	  this.tx_json.Account          = UInt160.json_rewrite(src);

	  var SetClearFlags = Transaction.set_clear_flags.AccountSet;

	  function prepareFlag(flag) {
	    return (typeof flag === 'number') ? flag : (SetClearFlags[flag] || SetClearFlags['asf' + flag]);
	  };

	  if (set_flag && (set_flag = prepareFlag(set_flag))) {
	    this.tx_json.SetFlag = set_flag;
	  }

	  if (clear_flag && (clear_flag = prepareFlag(clear_flag))) {
	    this.tx_json.ClearFlag = clear_flag;
	  }

	  return this;
	};


	Transaction.prototype.accountMerge = function(src, dst) {
	  if (typeof src === 'object') {
	    var options = src;
	    src  = options.source || options.from;
	    dst  = options.destination || options.to;
	  }

	  if (!UInt160.is_valid(src)) {
	    throw new Error('Source address invalid');
	  }

	  if (!UInt160.is_valid(dst)) {
	    throw new Error('Destination address invalid');
	  }
	  
	  this.tx_json.TransactionType  = 'AccountMerge';
	  this.tx_json.Account          = UInt160.json_rewrite(src);
	  this.tx_json.Destination      = UInt160.json_rewrite(dst);
	  return this;
	};


	Transaction.prototype.inflation = function(src, sequence) {
	  if (typeof src === 'object') {
	    var options = src;
	    src  = options.source || options.from;
	    sequence  = options.sequence;
	  }

	  if (!UInt160.is_valid(src)) {
	    throw new Error('Source address invalid');
	  }

	  this.tx_json.TransactionType  = 'Inflation';
	  this.tx_json.Account          = UInt160.json_rewrite(src);
	  this.tx_json.InflateSeq       = sequence;
	  return this;
	};

	Transaction.prototype.claim = function(src, generator, public_key, signature) {
	  if (typeof src === 'object') {
	    var options = src;
	    signature  = options.signature;
	    public_key = options.public_key;
	    generator  = options.generator;
	    src        = options.source || options.from || options.account;
	  }

	  this.tx_json.TransactionType = 'Claim';
	  this.tx_json.Generator       = generator;
	  this.tx_json.PublicKey       = public_key;
	  this.tx_json.Signature       = signature;

	  return this;
	};

	Transaction.prototype.offerCancel = function(src, sequence) {
	  if (typeof src === 'object') {
	    var options = src;
	    sequence = options.sequence;
	    src      = options.source || options.from || options.account;
	  }

	  if (!UInt160.is_valid(src)) {
	    throw new Error('Source address invalid');
	  }

	  this.tx_json.TransactionType = 'OfferCancel';
	  this.tx_json.Account         = UInt160.json_rewrite(src);
	  this.tx_json.OfferSequence   = Number(sequence);

	  return this;
	};

	// Options:
	//  .set_flags()
	// --> expiration : if not undefined, Date or Number
	// --> cancel_sequence : if not undefined, Sequence
	Transaction.prototype.offerCreate = function(src, taker_pays, taker_gets, expiration, cancel_sequence) {
	  if (typeof src === 'object') {
	    var options = src;
	    cancel_sequence = options.cancel_sequence;
	    expiration      = options.expiration;
	    taker_gets      = options.taker_gets || options.sell;
	    taker_pays      = options.taker_pays || options.buy;
	    src             = options.source || options.from || options.account;
	  }

	  if (!UInt160.is_valid(src)) {
	    throw new Error('Source address invalid');
	  }

	  this.tx_json.TransactionType = 'OfferCreate';
	  this.tx_json.Account         = UInt160.json_rewrite(src);
	  this.tx_json.TakerPays       = Amount.json_rewrite(taker_pays);
	  this.tx_json.TakerGets       = Amount.json_rewrite(taker_gets);

	  if (expiration) {
	    this.tx_json.Expiration = utils.time.toRipple(expiration);
	  }

	  if (cancel_sequence) {
	    this.tx_json.OfferSequence = Number(cancel_sequence);
	  }

	  return this;
	};

	/**
	 *  Construct a 'SetRegularKey' transaction.
	 *  If the RegularKey is set, the private key that corresponds to
	 *  it can be used to sign transactions instead of the master key
	 *
	 *  The RegularKey must be a valid Ripple Address, or a Hash160 of
	 *  the public key corresponding to the new private signing key.
	 */

	Transaction.prototype.setRegularKey = function(src, regular_key) {
	  if (typeof src === 'object') {
	    var options = src;
	    src = options.address || options.account || options.from;
	    regular_key = options.regular_key;
	  }

	  if (!UInt160.is_valid(src)) {
	    throw new Error('Source address invalid');
	  }

	  if (!UInt160.is_valid(regular_key)) {
	    throw new Error('RegularKey must be a valid Ripple Address (a Hash160 of the public key)');
	  }

	  this.tx_json.TransactionType = 'SetRegularKey';
	  this.tx_json.Account = UInt160.json_rewrite(src);
	  this.tx_json.RegularKey = UInt160.json_rewrite(regular_key);

	  return this;
	};

	// Construct a 'payment' transaction.
	//
	// When a transaction is submitted:
	// - If the connection is reliable and the server is not merely forwarding and is not malicious,
	// --> src : UInt160 or String
	// --> dst : UInt160 or String
	// --> deliver_amount : Amount or String.
	//
	// Options:
	//  .paths()
	//  .build_path()
	//  .destination_tag()
	//  .path_add()
	//  .secret()
	//  .send_max()
	//  .set_flags()
	//  .source_tag()
	Transaction.prototype.payment = function(src, dst, amount) {
	  if (typeof src === 'object') {
	    var options = src;
	    amount = options.amount;
	    dst    = options.destination || options.to;
	    src    = options.source || options.from || options.account;
	  }

	  if (!UInt160.is_valid(src)) {
	    throw new Error('Payment source address invalid');
	  }

	  if (!UInt160.is_valid(dst)) {
	    throw new Error('Payment destination address invalid');
	  }

	  this.tx_json.TransactionType = 'Payment';
	  this.tx_json.Account         = UInt160.json_rewrite(src);
	  this.tx_json.Amount          = Amount.json_rewrite(amount);
	  this.tx_json.Destination     = UInt160.json_rewrite(dst);

	  return this;
	};

	Transaction.prototype.trustSet =
	Transaction.prototype.rippleLineSet = function(src, limit, quality_in, quality_out) {
	  if (typeof src === 'object') {
	    var options = src;
	    quality_out = options.quality_out;
	    quality_in  = options.quality_in;
	    limit       = options.limit;
	    src         = options.source || options.from || options.account;
	  }

	  if (!UInt160.is_valid(src)) {
	    throw new Error('Source address invalid');
	  }

	  this.tx_json.TransactionType = 'TrustSet';
	  this.tx_json.Account         = UInt160.json_rewrite(src);

	  if (limit !== void(0)) {
	    this.tx_json.LimitAmount = Amount.json_rewrite(limit);
	  }

	  if (quality_in) {
	    this.tx_json.QualityIn = quality_in;
	  }

	  if (quality_out) {
	    this.tx_json.QualityOut = quality_out;
	  }

	  // XXX Throw an error if nothing is set.

	  return this;
	};

	// Submit a transaction to the network.
	Transaction.prototype.submit = function(callback) {
	  var self = this;

	  this.callback = (typeof callback === 'function') ? callback : function(){};

	  function transactionError(error, message) {
	    if (!(error instanceof RippleError)) {
	      error = new RippleError(error, message);
	    }
	    self.callback(error);
	  };

	  this._errorHandler = transactionError;

	  function transactionSuccess(message) {
	    self.callback(null, message);
	  };

	  this._successHandler = transactionSuccess;

	  this.on('error', function(){});

	  var account = this.tx_json.Account;

	  if (!UInt160.is_valid(account)) {
	    return this.emit('error', new RippleError('tejInvalidAccount', 'Account is missing or invalid'));
	  }

	  // YYY Might check paths for invalid accounts.
	  this.remote.account(account).submit(this);

	  return this;
	};

	Transaction.prototype.abort = function(callback) {
	  var callback = (typeof callback === 'function') ? callback : function(){};
	  if (!this.finalized) {
	    this.once('final', callback);
	    this.emit('abort');
	  }
	};

	Transaction.prototype.summary = function() {
	  return Transaction.summary.call(this);
	};

	Transaction.summary = function() {
	  var result = {
	    tx_json:             this.tx_json,
	    clientID:            this._clientID,
	    submittedIDs:        this.submittedIDs,
	    submissionAttempts:  this.attempts,
	    submitIndex:         this.submitIndex,
	    initialSubmitIndex:  this.initialSubmitIndex,
	    lastLedgerSequence:  this.lastLedgerSequence,
	    state:               this.state,
	    server:              this._server ? this._server._opts.url : void(0),
	    finalized:           this.finalized
	  };

	  if (this.result) {
	    result.result = {
	      engine_result        : this.result.engine_result,
	      engine_result_message: this.result.engine_result_message,
	      ledger_hash          : this.result.ledger_hash,
	      ledger_index         : this.result.ledger_index,
	      transaction_hash     : this.result.tx_json.hash
	    };
	  }

	  return result;
	};

	exports.Transaction = Transaction;

	// vim:sw=2:sts=2:ts=8:et


/***/ },
/* 6 */
/***/ function(module, exports, __webpack_require__) {

	var extend    = __webpack_require__(42);
	var UInt160 = __webpack_require__(8).UInt160;
	var utils = __webpack_require__(19);
	var Float = __webpack_require__(28).Float;

	//
	// Currency support
	//

	var Currency = extend(function() {
	  // Internal form: 0 = XPS. 3 letter-code.
	  // XXX Internal should be 0 or hex with three letter annotation when valid.

	  // Json form:
	  //  '', 'XPS', '0': 0
	  //  3-letter code: ...
	  // XXX Should support hex, C++ doesn't currently allow it.

	  this._value  = NaN;

	  this._update();
	}, UInt160);

	Currency.prototype = extend({}, UInt160.prototype);
	Currency.prototype.constructor = Currency;

	Currency.HEX_CURRENCY_BAD = '0000000000000000000000005852500000000000';

	/**
	 * Tries to correctly interpret a Currency as entered by a user.
	 *
	 * Examples:
	 *
	 *  USD                               => currency
	 *  USD - Dollar                      => currency with optional full currency name
	 *  XAU (-0.5%pa)                     => XAU with 0.5% effective demurrage rate per year
	 *  XAU - Gold (-0.5%pa)              => Optionally allowed full currency name
	 *  USD (1%pa)                        => US dollars with 1% effective interest per year
	 *  INR - Indian Rupees               => Optional full currency name with spaces
	 *  TYX - 30-Year Treasuries          => Optional full currency with numbers and a dash
	 *  TYX - 30-Year Treasuries (1.5%pa) => Optional full currency with numbers, dash and interest rate
	 *
	 *  The regular expression below matches above cases, broken down for better understanding:
	 *
	 *  ^\s*                      // start with any amount of whitespace
	 *  ([a-zA-Z]{3}|[0-9]{3})    // either 3 letter alphabetic currency-code or 3 digit numeric currency-code. See ISO 4217
	 *  (\s*-\s*[- \w]+)          // optional full currency name following the dash after currency code,
	 *                               full currency code can contain letters, numbers and dashes
	 *  (\s*\(-?\d+\.?\d*%pa\))?  // optional demurrage rate, has optional - and . notation (-0.5%pa)
	 *  \s*$                      // end with any amount of whitespace
	 *
	 */
	Currency.prototype.human_RE = /^\s*([a-zA-Z]{3}|[0-9]{3})(\s*-\s*[- \w]+)?(\s*\(-?\d+\.?\d*%pa\))?\s*$/;

	Currency.from_json = function(j, shouldInterpretXrpAsIou) {
	  if (j instanceof this) {
	    return j.clone();
	  } else {
	    return (new this()).parse_json(j, shouldInterpretXrpAsIou);
	  }
	};

	Currency.from_human = function(j, opts) {
	  return (new Currency().parse_human(j, opts));
	}

	// this._value = NaN on error.
	Currency.prototype.parse_json = function(j, shouldInterpretXrpAsIou) {
	  this._value = NaN;

	  switch (typeof j) {
	    case 'string':
	      if (!j || /^(0|XPS)$/.test(j)) {
	        if (shouldInterpretXrpAsIou) {
	          this.parse_hex(Currency.HEX_CURRENCY_BAD);
	        } else {
	          this.parse_hex(Currency.HEX_ZERO);
	        }
	        break;
	      }

	      // match the given string to see if it's in an allowed format
	      var matches = String(j).match(this.human_RE);

	      if (matches) {

	        var currencyCode = matches[1];
	        // the full currency is matched as it is part of the valid currency format, but not stored
	        // var full_currency = matches[2] || '';
	        var interest = matches[3] || '';

	        // interest is defined as interest per year, per annum (pa)
	        var percentage = interest.match(/(-?\d+\.?\d+)/);

	        currencyCode = currencyCode.toUpperCase();

	        var currencyData = utils.arraySet(20, 0);

	        if (percentage) {
	          /*
	           * 20 byte layout of a interest bearing currency
	           *
	           * 01 __ __ __ __ __ __ __ __ __ __ __ __ __ __ __ __ __ __ __
	           *    CURCODE- DATE------- RATE------------------- RESERVED---
	           */

	          // byte 1 for type, use '1' to denote demurrage currency
	          currencyData[0] = 1;

	          // byte 2-4 for currency code
	          currencyData[1] = currencyCode.charCodeAt(0) & 0xff;
	          currencyData[2] = currencyCode.charCodeAt(1) & 0xff;
	          currencyData[3] = currencyCode.charCodeAt(2) & 0xff;

	          // byte 5-8 are for reference date, but should always be 0 so we won't fill it

	          // byte 9-16 are for the interest
	          percentage = parseFloat(percentage[0]);

	          // the interest or demurrage is expressed as a yearly (per annum) value
	          var secondsPerYear = 31536000; // 60 * 60 * 24 * 365

	          // Calculating the interest e-fold
	          // 0.5% demurrage is expressed 0.995, 0.005 less than 1
	          // 0.5% interest is expressed as 1.005, 0.005 more than 1
	          var interestEfold = secondsPerYear / Math.log(1 + percentage/100);
	          var bytes = Float.toIEEE754Double(interestEfold);

	          for (var i=0; i<=bytes.length; i++) {
	            currencyData[8 + i] = bytes[i] & 0xff;
	          }

	          // the last 4 bytes are reserved for future use, so we won't fill those

	        } else {
	          currencyData[12] = currencyCode.charCodeAt(0) & 0xff;
	          currencyData[13] = currencyCode.charCodeAt(1) & 0xff;
	          currencyData[14] = currencyCode.charCodeAt(2) & 0xff;
	        }

	        this.parse_bytes(currencyData);
	      } else {
	        this.parse_hex(j);
	      }
	      break;

	    case 'number':
	      if (!isNaN(j)) {
	        this.parse_number(j);
	      }
	      break;

	    case 'object':
	      if (j instanceof Currency) {
	        this._value = j.copyTo({})._value;
	        this._update();
	      }
	      break;
	  }

	  return this;
	};


	Currency.prototype.parse_human = function(j) {
	  return this.parse_json(j);
	};

	/**
	 * Recalculate internal representation.
	 *
	 * You should never need to call this.
	 */
	Currency.prototype._update = function() {
	  var bytes = this.to_bytes();

	  // is it 0 everywhere except 12, 13, 14?
	  var isZeroExceptInStandardPositions = true;

	  if (!bytes) {
	    return "XPS";
	  }

	  this._native = false;
	  this._type = -1;
	  this._interest_start = NaN;
	  this._interest_period = NaN;
	  this._iso_code = '';

	  for (var i=0; i<20; i++) {
	    isZeroExceptInStandardPositions = isZeroExceptInStandardPositions && (i===12 || i===13 || i===14 || bytes[i]===0);
	  }

	  if (isZeroExceptInStandardPositions) {
	    this._iso_code = String.fromCharCode(bytes[12])
	                   + String.fromCharCode(bytes[13])
	                   + String.fromCharCode(bytes[14]);

	    if (this._iso_code === '\0\0\0') {
	      this._native = true;
	      this._iso_code = "XPS";
	    }

	    this._type = 0;
	  } else if (bytes[0] === 0x01) { // Demurrage currency
	    this._iso_code = String.fromCharCode(bytes[1])
	                   + String.fromCharCode(bytes[2])
	                   + String.fromCharCode(bytes[3]);

	    this._type = 1;
	    this._interest_start = (bytes[4] << 24) +
	                           (bytes[5] << 16) +
	                           (bytes[6] <<  8) +
	                           (bytes[7]      );
	    this._interest_period = Float.fromIEEE754Double(bytes.slice(8, 16));
	  }
	};

	// XXX Probably not needed anymore?
	/*
	Currency.prototype.parse_bytes = function(byte_array) {
	  if (Array.isArray(byte_array) && byte_array.length === 20) {
	    var result;
	    // is it 0 everywhere except 12, 13, 14?
	    var isZeroExceptInStandardPositions = true;

	    for (var i=0; i<20; i++) {
	      isZeroExceptInStandardPositions = isZeroExceptInStandardPositions && (i===12 || i===13 || i===14 || byte_array[0]===0)
	    }

	    if (isZeroExceptInStandardPositions) {
	      var currencyCode = String.fromCharCode(byte_array[12])
	      + String.fromCharCode(byte_array[13])
	      + String.fromCharCode(byte_array[14]);
	      if (/^[A-Z0-9]{3}$/.test(currencyCode) && currencyCode !== 'XRP' ) {
	        this._value = currencyCode;
	      } else if (currencyCode === '\0\0\0') {
	        this._value = 0;
	      } else {
	        this._value = NaN;
	      }
	    } else {
	      // XXX Should support non-standard currency codes
	      this._value = NaN;
	    }
	  } else {
	    this._value = NaN;
	  }
	  return this;
	};
	*/

	Currency.prototype.is_native = function() {
	  return this._native;
	};

	/**
	 * Whether this currency is an interest-bearing/demurring currency.
	 */
	Currency.prototype.has_interest = function() {
	  return this._type === 1 && !isNaN(this._interest_start) && !isNaN(this._interest_period);
	};

	/**
	 *
	 * @param referenceDate - number of seconds since the Ripple Epoch (0:00 on January 1, 2000 UTC)
	 *                        used to calculate the interest over provided interval
	 *                        pass in one years worth of seconds to ge the yearly interest
	 * @returns {number} - interest for provided interval, can be negative for demurred currencies
	 */
	Currency.prototype.get_interest_at = function(referenceDate, decimals) {
	  if (!this.has_interest) {
	    return 0;
	  }

	  // use one year as a default period
	  if (!referenceDate) {
	    referenceDate = this._interest_start + 3600 * 24 * 365;
	  }

	  if (referenceDate instanceof Date) {
	    referenceDate = utils.fromTimestamp(referenceDate.getTime());
	  }

	  // calculate interest by e-fold number
	  return Math.exp((referenceDate - this._interest_start) / this._interest_period);
	};

	Currency.prototype.get_interest_percentage_at = function(referenceDate, decimals) {
	  var interest = this.get_interest_at(referenceDate, decimals);

	  // convert to percentage
	  var interest = (interest*100)-100;
	  var decimalMultiplier = decimals ? Math.pow(10,decimals) : 100;

	  // round to two decimals behind the dot
	  return Math.round(interest*decimalMultiplier) / decimalMultiplier;
	};

	// XXX Currently we inherit UInt.prototype.is_valid, which is mostly fine.
	//
	//     We could be doing further checks into the internal format of the
	//     currency data, since there are some values that are invalid.
	//
	//Currency.prototype.is_valid = function() {
	//  return this._value instanceof BigInteger && ...;
	//};

	Currency.prototype.to_json = function(opts) {
	  if (!this.is_valid()) {
	    // XXX This is backwards compatible behavior, but probably not very good.
	    return "XPS";
	  }

	  var currency;
	  var fullName = opts && opts.full_name ? " - " + opts.full_name : "";

	  // Any currency with standard properties and a valid code can be abbreviated
	  // in the JSON wire format as the three character code.
	  if (/^[A-Z0-9]{3}$/.test(this._iso_code) && !this.has_interest()) {
	    currency = this._iso_code + fullName;

	  // If there is interest, append the annual interest to the full currency name
	  } else if (this.has_interest()) {
	    var decimals = opts ? opts.decimals : undefined;
	    currency = this._iso_code + fullName + " (" + this.get_interest_percentage_at(this._interest_start + 3600 * 24 * 365, decimals) + "%pa)";
	  } else {

	    // Fallback to returning the raw currency hex
	    currency = this.to_hex();

	    // XXX This is to maintain backwards compatibility, but it is very, very odd
	    //     behavior, so we should deprecate it and get rid of it as soon as
	    //     possible.
	    if (currency === Currency.HEX_ONE) {
	      currency = 1;
	    }
	  }

	  return currency;
	};

	Currency.prototype.to_human = function(opts) {
	  // to_human() will always print the human-readable currency code if available.
	  return this.to_json(opts);
	};

	Currency.prototype.get_iso = function() {
	  return this._iso_code;
	};

	exports.Currency = Currency;

	// vim:sw=2:sts=2:ts=8:et


/***/ },
/* 7 */
/***/ function(module, exports, __webpack_require__) {

	var sjcl    = __webpack_require__(19).sjcl;
	var utils   = __webpack_require__(19);
	var extend  = __webpack_require__(42);

	var BigInteger = utils.jsbn.BigInteger;

	var Base = {};

	var alphabets = Base.alphabets = {
	  ripple  :  "xsphnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCr65jkm8oFqi1tuvAgyz",
	  tipple  :  "GPShNAF39wBUDnERHJKLM4pQrsT7VWXYZ2bcdeCg65jkm8ofqi1tuvaxyz",
	  bitcoin :  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
	};

	extend(Base, {
	  VER_NONE              : 1,
	  VER_NODE_PUBLIC       : 122,
	  VER_NODE_PRIVATE      : 102,
	  VER_ACCOUNT_ID        : 0,
	  VER_ACCOUNT_PUBLIC    : 67,
	  VER_ACCOUNT_PRIVATE   : 101,
	  VER_SEED       : 33
	});

	function sha256(bytes) {
	  return sjcl.codec.bytes.fromBits(sjcl.hash.sha256.hash(sjcl.codec.bytes.toBits(bytes)));
	};

	function sha256hash(bytes) {
	  return sha256(sha256(bytes));
	};

	// --> input: big-endian array of bytes.
	// <-- string at least as long as input.
	Base.encode = function(input, alpha) {
	  var alphabet = alphabets[alpha || 'ripple'];
	  var bi_base  = new BigInteger(String(alphabet.length));
	  var bi_q     = new BigInteger();
	  var bi_r     = new BigInteger();
	  var bi_value = new BigInteger(input);
	  var buffer   = [];

	  while (bi_value.compareTo(BigInteger.ZERO) > 0) {
	    bi_value.divRemTo(bi_base, bi_q, bi_r);
	    bi_q.copyTo(bi_value);
	    buffer.push(alphabet[bi_r.intValue()]);
	  }

	  for (var i=0; i !== input.length && !input[i]; i += 1) {
	    buffer.push(alphabet[0]);
	  }

	  return buffer.reverse().join('');
	};

	// --> input: String
	// <-- array of bytes or undefined.
	Base.decode = function(input, alpha) {
	  if (typeof input !== 'string') {
	    return void(0);
	  }

	  var alphabet = alphabets[alpha || 'ripple'];
	  var bi_base  = new BigInteger(String(alphabet.length));
	  var bi_value = new BigInteger();
	  var i;

	  for (i = 0; i !== input.length && input[i] === alphabet[0]; i += 1) {
	  }

	  for (; i !== input.length; i += 1) {
	    var v = alphabet.indexOf(input[i]);

	    if (v < 0) {
	      return void(0);
	    }

	    var r = new BigInteger();
	    r.fromInt(v);
	    bi_value  = bi_value.multiply(bi_base).add(r);
	  }

	  // toByteArray:
	  // - Returns leading zeros!
	  // - Returns signed bytes!
	  var bytes =  bi_value.toByteArray().map(function(b) { return b ? b < 0 ? 256+b : b : 0; });
	  var extra = 0;

	  while (extra !== bytes.length && !bytes[extra]) {
	    extra += 1;
	  }

	  if (extra) {
	    bytes = bytes.slice(extra);
	  }

	  var zeros = 0;

	  while (zeros !== input.length && input[zeros] === alphabet[0]) {
	    zeros += 1;
	  }

	  return [].concat(utils.arraySet(zeros, 0), bytes);
	};

	Base.verify_checksum = function(bytes) {
	  var computed = sha256hash(bytes.slice(0, -4)).slice(0, 4);
	  var checksum = bytes.slice(-4);
	  var result = true;

	  for (var i=0; i<4; i++) {
	    if (computed[i] !== checksum[i]) {
	      result = false;
	      break;
	    }
	  }

	  return result;
	};

	// --> input: Array
	// <-- String
	Base.encode_check = function(version, input, alphabet) {
	  var buffer = [].concat(version, input);
	  var check  = sha256(sha256(buffer)).slice(0, 4);

	  return Base.encode([].concat(buffer, check), alphabet);
	};

	// --> input : String
	// <-- NaN || BigInteger
	Base.decode_check = function(version, input, alphabet) {
	  var buffer = Base.decode(input, alphabet);

	  if (!buffer || buffer.length < 5) {
	    return NaN;
	  }

	  // Single valid version
	  if (typeof version === 'number' && buffer[0] !== version) {
	    return NaN;
	  }

	  // Multiple allowed versions
	  if (Array.isArray(version)) {
	    var match = false;

	    for (var i=0, l=version.length; i<l; i++) {
	      match |= version[i] === buffer[0];
	    }

	    if (!match) {
	      return NaN;
	    }
	  }

	  if (!Base.verify_checksum(buffer)) {
	    return NaN;
	  }

	  // We'll use the version byte to add a leading zero, this ensures JSBN doesn't
	  // intrepret the value as a negative number
	  buffer[0] = 0;

	  return new BigInteger(buffer.slice(0, -4), 256);
	};

	exports.Base = Base;


/***/ },
/* 8 */
/***/ function(module, exports, __webpack_require__) {

	var utils   = __webpack_require__(19);
	var config  = __webpack_require__(21);
	var extend  = __webpack_require__(42);

	var BigInteger = utils.jsbn.BigInteger;

	var UInt = __webpack_require__(29).UInt;
	var Base = __webpack_require__(7).Base;

	//
	// UInt160 support
	//

	var UInt160 = extend(function() {
	  // Internal form: NaN or BigInteger
	  this._value  = NaN;
	  this._version_byte = void(0);
	  this._update();
	}, UInt);

	UInt160.width = 20;
	UInt160.prototype = extend({}, UInt.prototype);
	UInt160.prototype.constructor = UInt160;

	var ACCOUNT_ZERO = UInt160.ACCOUNT_ZERO = 'xxxxxxxxxxxxxxxxxxxxxhoLvTp';
	var ACCOUNT_ONE  = UInt160.ACCOUNT_ONE  = 'xxxxxxxxxxxxxxxxxxxxBZbvji';
	var HEX_ZERO     = UInt160.HEX_ZERO     = '0000000000000000000000000000000000000000';
	var HEX_ONE      = UInt160.HEX_ONE      = '0000000000000000000000000000000000000001';
	var XPS_ZERO     = UInt160.XPS_ZERO     = utils.hexToString(HEX_ZERO);
	var XPS_ONE      = UInt160.XPS_ONE      = utils.hexToString(HEX_ONE);

	UInt160.prototype.set_version = function(j) {
	  this._version_byte = j;
	  return this;
	};

	UInt160.prototype.get_version = function() {
	  return this._version_byte;
	};

	// value = NaN on error.
	UInt160.prototype.parse_json = function(j) {
	  // Canonicalize and validate

	    // TODO: this is gross. Inject test accounts a different way
	  if (config.accounts && j in config.accounts) {
	    j = config.accounts[j].account;
	  }

	  if (typeof j !== 'string') {
	    this._value = NaN;
	  } else if (j[0] === 'g') {
	    this._value = Base.decode_check(Base.VER_ACCOUNT_ID, j);
	    this._version_byte = Base.VER_ACCOUNT_ID;
	  } else {
	    this.parse_hex(j);
	  }

	  this._update();

	  return this;
	};

	UInt160.prototype.parse_generic = function(j) {
	  UInt.prototype.parse_generic.call(this, j);

	  if (isNaN(this._value)) {
	    if ("string" === typeof j && j[0] === 'g') {
	      this._value = Base.decode_check(Base.VER_ACCOUNT_ID, j);
	    }
	  }

	  this._update();

	  return this;
	};

	// XXX Json form should allow 0 and 1, C++ doesn't currently allow it.
	UInt160.prototype.to_json = function(opts) {
	  opts  = opts || {};

	  if (this._value instanceof BigInteger) {
	    // If this value has a type, return a Base58 encoded string.
	    if (typeof this._version_byte === 'number') {
	      var output = Base.encode_check(this._version_byte, this.to_bytes());

	      if (opts.gateways && output in opts.gateways) {
	        output = opts.gateways[output];
	      }

	      return output;
	    } else {
	      return this.to_hex();
	    }
	  }
	  return NaN;
	};

	exports.UInt160 = UInt160;

	// vim:sw=2:sts=2:ts=8:et


/***/ },
/* 9 */
/***/ function(module, exports, __webpack_require__) {

	var utils  = __webpack_require__(19);
	var extend = __webpack_require__(42);
	var UInt   = __webpack_require__(29).UInt;

	//
	// UInt256 support
	//

	var UInt256 = extend(function() {
	  // Internal form: NaN or BigInteger
	  this._value = NaN;
	}, UInt);

	UInt256.width = 32;
	UInt256.prototype = extend({}, UInt.prototype);
	UInt256.prototype.constructor = UInt256;

	var HEX_ZERO = UInt256.HEX_ZERO = '00000000000000000000000000000000' + '00000000000000000000000000000000';
	var HEX_ONE  = UInt256.HEX_ONE  = '00000000000000000000000000000000' + '00000000000000000000000000000001';
	var XPS_ZERO = UInt256.XPS_ZERO = utils.hexToString(HEX_ZERO);
	var XPS_ONE  = UInt256.XPS_ONE  = utils.hexToString(HEX_ONE);

	exports.UInt256 = UInt256;


/***/ },
/* 10 */
/***/ function(module, exports, __webpack_require__) {

	//
	// Seed support
	//

	var extend = __webpack_require__(42);
	var utils  = __webpack_require__(19);
	var sjcl   = utils.sjcl;

	var BigInteger = utils.jsbn.BigInteger;

	var Base    = __webpack_require__(7).Base;
	var UInt    = __webpack_require__(29).UInt;
	var UInt256 = __webpack_require__(9).UInt256;
	var UInt160 = __webpack_require__(8).UInt160;
	var KeyPair = __webpack_require__(30).KeyPair;
	var Crypt   = __webpack_require__(26).Crypt;

	var Seed = extend(function () {
	  // Internal form: NaN or BigInteger
	  this._value = NaN;
	}, UInt);

	Seed.width = 32;
	Seed.prototype = extend({}, UInt.prototype);
	Seed.prototype.constructor = Seed;

	// value = NaN on error.
	// One day this will support rfc1751 too.
	Seed.prototype.parse_json = function (j) {
	  if (typeof j === 'string') {
	    if (!j.length) {
	      this._value = NaN;
	    // XXX Should actually always try and continue if it failed.
	    } else if (j[0] === 's') {
	      this._value = Base.decode_check(Base.VER_SEED, j);
	    } else if (j.length === 32) {
	      this._value = this.parse_hex(j);
	    // XXX Should also try 1751
	    } else {
	      this.parse_passphrase(j);
	    }
	  } else {
	    this._value = NaN;
	  }

	  return this;
	};

	Seed.prototype.parse_passphrase = function (j) {
	  if (typeof j !== 'string') {
	    throw new Error('Passphrase must be a string');
	  }

	  var hash = sjcl.hash.sha512.hash(sjcl.codec.utf8String.toBits(j));
	  var bits = sjcl.bitArray.bitSlice(hash, 0, 256);

	  this.parse_bits(bits);

	  return this;
	};

	Seed.prototype.random = function () {
	  this.parse_bits(sjcl.random.randomWords(8));

	  return this;
	};

	Seed.prototype.to_json = function () {
	  if (!(this._value instanceof BigInteger)) {
	    return NaN;
	  }

	  var output = Base.encode_check(Base.VER_SEED, this.to_bytes());

	  return output;
	};

	function append_int(a, i) {
	  return [].concat(a, i >> 24, (i >> 16) & 0xff, (i >> 8) & 0xff, i & 0xff);
	};

	function firstHalfOfSHA512(bytes) {
	  return sjcl.bitArray.bitSlice(
	    sjcl.hash.sha512.hash(sjcl.codec.bytes.toBits(bytes)),
	    0, 256
	  );
	};

	function SHA256_RIPEMD160(bits) {
	  return Crypt.ripemd160(sjcl.hash.sha256.hash(bits));
	};

	/**
	 * Generates an ED25519 signing key pair.
	 */
	Seed.prototype.get_key = function () {
	  if (!this.is_valid()) {
	    throw new Error('Cannot generate keys from invalid seed!');
	  }

	  return KeyPair.from_seed_bytes(this.to_bytes());
	};

	Seed.prototype.get_key_tnacl = function () {
	  if (!this.is_valid()) {
	    throw new Error('Cannot generate keys from invalid seed!');
	  }

	  return KeyPair.from_seed_bytes_tnacl(this.to_bytes());
	};

	exports.Seed = Seed;


/***/ },
/* 11 */
/***/ function(module, exports, __webpack_require__) {

	var extend  = __webpack_require__(42);
	var utils   = __webpack_require__(19);
	var UInt160 = __webpack_require__(8).UInt160;
	var Amount  = __webpack_require__(3).Amount;

	/**
	 * Meta data processing facility
	 */

	function Meta(raw_data) {
	  var self = this;

	  this.nodes = [ ];

	  raw_data.AffectedNodes.forEach(function(an) {
	    var result = { };

	    if ((result.diffType = self.diffType(an))) {
	      an = an[result.diffType];

	      result.entryType   = an.LedgerEntryType;
	      result.ledgerIndex = an.LedgerIndex;
	      result.fields      = extend({}, an.PreviousFields, an.NewFields, an.FinalFields);
	      result.fieldsPrev  = an.PreviousFields || {};
	      result.fieldsNew   = an.NewFields || {};
	      result.fieldsFinal = an.FinalFields || {};

	      // getAffectedBooks will set this
	      // result.bookKey   = undefined;

	      self.nodes.push(result);
	    }
	  });
	};

	Meta.node_types = [
	  'CreatedNode',
	  'ModifiedNode',
	  'DeletedNode'
	];

	Meta.prototype.diffType = function(an) {
	  var result = false;

	  for (var i=0; i<Meta.node_types.length; i++) {
	    var x = Meta.node_types[i];
	    if (an.hasOwnProperty(x)) {
	      result = x;
	      break;
	    }
	  }

	  return result;
	};

	/**
	 * Execute a function on each affected node.
	 *
	 * The callback is passed two parameters. The first is a node object which looks
	 * like this:
	 *
	 *   {
	 *     // Type of diff, e.g. CreatedNode, ModifiedNode
	 *     diffType: 'CreatedNode'
	 *
	 *     // Type of node affected, e.g. RippleState, AccountRoot
	 *     entryType: 'RippleState',
	 *
	 *     // Index of the ledger this change occurred in
	 *     ledgerIndex: '01AB01AB...',
	 *
	 *     // Contains all fields with later versions taking precedence
	 *     //
	 *     // This is a shorthand for doing things like checking which account
	 *     // this affected without having to check the diffType.
	 *     fields: {...},
	 *
	 *     // Old fields (before the change)
	 *     fieldsPrev: {...},
	 *
	 *     // New fields (that have been added)
	 *     fieldsNew: {...},
	 *
	 *     // Changed fields
	 *     fieldsFinal: {...}
	 *   }
	 *
	 * The second parameter to the callback is the index of the node in the metadata
	 * (first entry is index 0).
	 */
	Meta.prototype.each = function(fn) {
	  for (var i = 0, l = this.nodes.length; i < l; i++) {
	    fn(this.nodes[i], i);
	  }
	};

	([
	 'forEach',
	 'map',
	 'filter',
	 'every',
	 'reduce'
	]).forEach(function(fn) {
	  Meta.prototype[fn] = function() {
	    return Array.prototype[fn].apply(this.nodes, arguments);
	  };
	});

	var amountFieldsAffectingIssuer = [
	  'LowLimit',
	  'HighLimit',
	  'TakerPays',
	  'TakerGets'
	];

	Meta.prototype.getAffectedAccounts = function() {
	  var accounts = [ ];

	  // This code should match the behavior of the C++ method:
	  // TransactionMetaSet::getAffectedAccounts
	  this.nodes.forEach(function(an) {
	    var fields = (an.diffType === 'CreatedNode') ? an.fieldsNew : an.fieldsFinal;
	    for (var i in fields) {
	      var field = fields[i];
	      if (typeof field === 'string' && UInt160.is_valid(field)) {
	        accounts.push(field);
	      } else if (amountFieldsAffectingIssuer.indexOf(i) !== -1) {
	        var amount = Amount.from_json(field);
	        var issuer = amount.issuer();
	        if (issuer.is_valid() && !issuer.is_zero()) {
	          accounts.push(issuer.to_json());
	        }
	      }
	    }
	  });

	  return utils.arrayUnique(accounts);
	};

	Meta.prototype.getAffectedBooks = function() {
	  var books = [ ];

	  this.nodes.forEach(function(an) {
	    if (an.entryType !== 'Offer') {
	      return;
	    }

	    var gets = Amount.from_json(an.fields.TakerGets);
	    var pays = Amount.from_json(an.fields.TakerPays);

	    var getsKey = gets.currency().to_json();
	    if (getsKey !== 'XPS') getsKey += '/' + gets.issuer().to_json();

	    var paysKey = pays.currency().to_json();
	    if (paysKey !== 'XPS') paysKey += '/' + pays.issuer().to_json();

	    var key = [ getsKey, paysKey ].join(':');

	    // Hell of a lot of work, so we are going to cache this. We can use this
	    // later to good effect in OrderBook.notify to make sure we only process
	    // pertinent offers.
	    an.bookKey = key;

	    books.push(key);
	  });

	  return utils.arrayUnique(books);
	};

	exports.Meta = Meta;


/***/ },
/* 12 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(Buffer) {var assert    = __webpack_require__(38);
	var extend    = __webpack_require__(42);
	var binformat = __webpack_require__(18);
	var stypes    = __webpack_require__(31);
	var UInt256   = __webpack_require__(9).UInt256;
	var Crypt     = __webpack_require__(26).Crypt;
	var utils     = __webpack_require__(19);

	var sjcl = utils.sjcl;
	var BigInteger = utils.jsbn.BigInteger;

	var TRANSACTION_TYPES = { };

	Object.keys(binformat.tx).forEach(function(key) {
	  TRANSACTION_TYPES[binformat.tx[key][0]] = key;
	});

	var LEDGER_ENTRY_TYPES = {};

	Object.keys(binformat.ledger).forEach(function(key) {
	  LEDGER_ENTRY_TYPES[binformat.ledger[key][0]] = key;
	});

	var TRANSACTION_RESULTS = {};

	Object.keys(binformat.ter).forEach(function(key) {
	  TRANSACTION_RESULTS[binformat.ter[key]] = key;
	});

	function SerializedObject(buf) {
	  if (Array.isArray(buf) || (Buffer && Buffer.isBuffer(buf)) ) {
	    this.buffer = buf;
	  } else if (typeof buf === 'string') {
	    this.buffer = sjcl.codec.bytes.fromBits(sjcl.codec.hex.toBits(buf));
	  } else if (!buf) {
	    this.buffer = [];
	  } else {
	    throw new Error('Invalid buffer passed.');
	  }
	  this.pointer = 0;
	};

	SerializedObject.from_json = function(obj) {
	  // Create a copy of the object so we don't modify it
	  var obj = extend({}, obj);
	  var so  = new SerializedObject();
	  var typedef;

	  if (typeof obj.TransactionType === 'number') {
	    obj.TransactionType = SerializedObject.lookup_type_tx(obj.TransactionType);
	    if (!obj.TransactionType) {
	      throw new Error('Transaction type ID is invalid.');
	    }
	  }

	  if (typeof obj.LedgerEntryType === 'number') {
	    obj.LedgerEntryType = SerializedObject.lookup_type_le(obj.LedgerEntryType);

	    if (!obj.LedgerEntryType) {
	      throw new Error('LedgerEntryType ID is invalid.');
	    }
	  }

	  if (typeof obj.TransactionType === 'string') {
	    typedef = binformat.tx[obj.TransactionType];
	    if (!Array.isArray(typedef)) {
	      throw new Error('Transaction type is invalid');
	    }

	    typedef = typedef.slice();
	    obj.TransactionType = typedef.shift();
	  } else if (typeof obj.LedgerEntryType === 'string') {
	    typedef = binformat.ledger[obj.LedgerEntryType];

	    if (!Array.isArray(typedef)) {
	      throw new Error('LedgerEntryType is invalid');
	    }

	    typedef = typedef.slice();
	    obj.LedgerEntryType = typedef.shift();

	  } else if (typeof obj.AffectedNodes === 'object') {
	    typedef = binformat.metadata;
	  } else {
	    throw new Error('Object to be serialized must contain either' +
	                    ' TransactionType, LedgerEntryType or AffectedNodes.');
	  }

	  // ND: This from_*json* seems a reasonable place to put validation of `json`
	  SerializedObject.check_no_missing_fields(typedef, obj);
	  so.serialize(typedef, obj);

	  return so;
	};

	SerializedObject.check_no_missing_fields = function(typedef, obj) {
	  var missing_fields = [];

	  for (var i = typedef.length - 1; i >= 0; i--) {
	    var spec = typedef[i];
	    var field = spec[0];
	    var requirement = spec[1];

	    if (binformat.REQUIRED === requirement && obj[field] === void(0)) {
	      missing_fields.push(field);
	    };
	  };

	  if (missing_fields.length > 0) {
	    var object_name;

	    if (obj.TransactionType !== void(0)) {
	      object_name = SerializedObject.lookup_type_tx(obj.TransactionType);
	    } else if (obj.LedgerEntryType != null){
	      object_name = SerializedObject.lookup_type_le(obj.LedgerEntryType);
	    } else {
	      object_name = "TransactionMetaData";
	    }

	    throw new Error(object_name + " is missing fields: " +
	                    JSON.stringify(missing_fields));
	  };
	};

	SerializedObject.prototype.append = function(bytes) {
	  if (bytes instanceof SerializedObject) {
	    bytes = bytes.buffer;
	  }

	  this.buffer = this.buffer.concat(bytes);
	  this.pointer += bytes.length;
	};

	SerializedObject.prototype.resetPointer = function() {
	  this.pointer = 0;
	};

	function readOrPeek(advance) {
	  return function(bytes) {
	    var start = this.pointer;
	    var end = start + bytes;

	    if (end > this.buffer.length) {
	      throw new Error('Buffer length exceeded');
	    }

	    var result = this.buffer.slice(start, end);

	    if (advance) {
	      this.pointer = end;
	    }

	    return result;
	  };
	};

	SerializedObject.prototype.read = readOrPeek(true);

	SerializedObject.prototype.peek = readOrPeek(false);

	SerializedObject.prototype.to_bits = function() {
	  return sjcl.codec.bytes.toBits(this.buffer);
	};

	SerializedObject.prototype.to_hex = function() {
	  return sjcl.codec.hex.fromBits(this.to_bits()).toUpperCase();
	};

	SerializedObject.prototype.to_json = function() {
	  var old_pointer = this.pointer;
	  this.resetPointer();
	  var output = { };

	  while (this.pointer < this.buffer.length) {
	    var key_and_value = stypes.parse(this);
	    var key = key_and_value[0];
	    var value = key_and_value[1];
	    output[key] = SerializedObject.jsonify_structure(value, key);
	  }

	  this.pointer = old_pointer;

	  return output;
	};

	SerializedObject.jsonify_structure = function(structure, field_name) {
	  var output;

	  switch (typeof structure) {
	    case 'number':
	      switch (field_name) {
	        case 'LedgerEntryType':
	          output = LEDGER_ENTRY_TYPES[structure];
	          break;
	        case 'TransactionResult':
	          output = TRANSACTION_RESULTS[structure];
	          break;
	        case 'TransactionType':
	          output = TRANSACTION_TYPES[structure];
	          break;
	        default:
	          output = structure;
	      }
	      break;
	    case 'object':
	      if (structure === null) {
	        break;
	      }

	      if (typeof structure.to_json === 'function') {
	        output = structure.to_json();
	      } else if (structure instanceof BigInteger) {
	        output = structure.toString(16).toUpperCase();
	      } else {
	        //new Array or Object
	        output = new structure.constructor();

	        var keys = Object.keys(structure);

	        for (var i=0, l=keys.length; i<l; i++) {
	          var key = keys[i];
	          output[key] = SerializedObject.jsonify_structure(structure[key], key);
	        }
	      }
	      break;
	    default:
	      output = structure;
	  }

	  return output;
	};

	SerializedObject.prototype.serialize = function(typedef, obj) {
	  // Serialize object without end marker
	  stypes.Object.serialize(this, obj, true);

	  // ST: Old serialization
	  /*
	  // Ensure canonical order
	  typedef = SerializedObject.sort_typedef(typedef);

	  // Serialize fields
	  for (var i=0, l=typedef.length; i<l; i++) {
	    this.serialize_field(typedef[i], obj);
	  }
	  */
	};

	SerializedObject.prototype.hash = function(prefix) {
	  var sign_buffer = new SerializedObject();
	  
	  // Add hashing prefix
	  if ("undefined" !== typeof prefix) {
	    stypes.Int32.serialize(sign_buffer, prefix);
	  }

	  // Copy buffer to temporary buffer
	  sign_buffer.append(this.buffer);
	  
	  // XXX We need a proper Buffer class then Crypt could accept that
	  var bits = sjcl.codec.bytes.toBits(sign_buffer.buffer);
	  return Crypt.hashSha512Half(bits);
	};

	// DEPRECATED
	SerializedObject.prototype.signing_hash = SerializedObject.prototype.hash;

	SerializedObject.prototype.serialize_field = function(spec, obj) {
	  var name     = spec[0];
	  var presence = spec[1];
	  var field_id = spec[2];
	  var Type     = stypes[spec[3]];

	  if (typeof obj[name] !== 'undefined') {
	    // ST: Old serialization code
	    //this.append(SerializedObject.get_field_header(Type.id, field_id));
	    try {
	      // ST: Old serialization code
	      //Type.serialize(this, obj[name]);
	      stypes.serialize(this, name, obj[name]);
	    } catch (e) {
	      // Add field name to message and rethrow
	      e.message = 'Error serializing "' + name + '": ' + e.message;
	      throw e;
	    }
	  } else if (presence === binformat.REQUIRED) {
	    throw new Error('Missing required field ' + name);
	  }
	};

	SerializedObject.get_field_header = function(type_id, field_id) {
	  var buffer = [ 0 ];

	  if (type_id > 0xF) {
	    buffer.push(type_id & 0xFF);
	  } else {
	    buffer[0] += (type_id & 0xF) << 4;
	  }

	  if (field_id > 0xF) {
	    buffer.push(field_id & 0xFF);
	  } else {
	    buffer[0] += field_id & 0xF;
	  }

	  return buffer;
	};

	SerializedObject.sort_typedef = function(typedef) {
	  assert(Array.isArray(typedef));

	  function sort_field_compare(a, b) {
	    // Sort by type id first, then by field id
	    return a[3] !== b[3] ? stypes[a[3]].id - stypes[b[3]].id : a[2] - b[2];
	  };

	  return typedef.sort(sort_field_compare);
	};

	SerializedObject.lookup_type_tx = function(id) {
	  assert.strictEqual(typeof id, 'number');
	  return TRANSACTION_TYPES[id];
	};

	SerializedObject.lookup_type_le = function (id) {
	  assert(typeof id === 'number');
	  return LEDGER_ENTRY_TYPES[id];
	};

	exports.SerializedObject = SerializedObject;
	
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(39).Buffer))

/***/ },
/* 13 */
/***/ function(module, exports, __webpack_require__) {

	var util   = __webpack_require__(36);
	var extend = __webpack_require__(42);

	function RippleError(code, message) {
	  switch (typeof code) {
	    case 'object':
	      extend(this, code);
	      break;

	    case 'string':
	      this.result = code;
	      this.result_message = message;
	      break;
	  }

	  this.engine_result = this.result = (this.result || this.engine_result || this.error || 'Error');
	  this.engine_result_message = this.result_message = (this.result_message || this.engine_result_message || this.error_message || 'Error');
	  this.result_message = this.message = (this.result_message);

	  var stack;

	  if (!!Error.captureStackTrace) {
	    Error.captureStackTrace(this, code || this);
	  } else if ((stack = new Error().stack)) {
	    this.stack = stack;
	  }
	};

	util.inherits(RippleError, Error);

	RippleError.prototype.name = 'RippleError';

	exports.RippleError = RippleError;


/***/ },
/* 14 */
/***/ function(module, exports, __webpack_require__) {

	var async              = __webpack_require__(48);
	var crypto             = __webpack_require__(40);
	var sjcl               = __webpack_require__(19).sjcl;
	var Remote             = __webpack_require__(1).Remote;
	var Seed               = __webpack_require__(10).Seed;
	var KeyPair            = __webpack_require__(30).KeyPair;
	var Account            = __webpack_require__(4).Account;
	var UInt160            = __webpack_require__(8).UInt160;

	// Message class (static)
	var Message = {};

	Message.HASH_FUNCTION  = sjcl.hash.sha512.hash;
	Message.MAGIC_BYTES    = 'Ripple Signed Message:\n';

	var REGEX_HEX = /^[0-9a-fA-F]+$/;
	var REGEX_BASE64 = /^([A-Za-z0-9\+]{4})*([A-Za-z0-9\+]{2}==)|([A-Za-z0-9\+]{3}=)?$/;

	/**
	 *  Produce a Base64-encoded signature on the given message with
	 *  the string 'Ripple Signed Message:\n' prepended.
	 *
	 *  Note that this signature uses the signing function that includes
	 *  a recovery_factor to be able to extract the public key from the signature
	 *  without having to pass the public key along with the signature.
	 *
	 *  @static
	 *
	 *  @param {String} message
	 *  @param {sjcl.ecc.ecdsa.secretKey|Any format accepted by Seed.from_json} secret_key
	 *  @param {RippleAddress} [The first key] account Field to specify the signing account. 
	 *    If this is omitted the first account produced by the secret generator will be used.
	 *  @returns {Base64-encoded String} signature
	 */
	Message.signMessage = function(message, secret_key, account) {

	  return Message.signHash(Message.HASH_FUNCTION(Message.MAGIC_BYTES + message), secret_key, account);

	};

	/**
	 *  Produce a Base64-encoded signature on the given hex-encoded hash.
	 *
	 *  Note that this signature uses the signing function that includes
	 *  a recovery_factor to be able to extract the public key from the signature
	 *  without having to pass the public key along with the signature.
	 *
	 *  @static
	 *
	 *  @param {bitArray|Hex-encoded String} hash
	 *  @param {sjcl.ecc.ecdsa.secretKey|Any format accepted by Seed.from_json} secret_key
	 *  @param {RippleAddress} [The first key] account Field to specify the signing account. 
	 *    If this is omitted the first account produced by the secret generator will be used.
	 *  @returns {Base64-encoded String} signature
	 */
	Message.signHash = function(hash, secret_key, account) {

	  if (typeof hash === 'string' && /^[0-9a-fA-F]+$/.test(hash)) {
	    hash = sjcl.codec.hex.toBits(hash);
	  }

	  if (typeof hash !== 'object' || hash.length <= 0 || typeof hash[0] !== 'number') {
	    throw new Error('Hash must be a bitArray or hex-encoded string');
	  }

	  if (!(secret_key instanceof sjcl.ecc.ecdsa.secretKey)) {
	    secret_key = Seed.from_json(secret_key).get_key(account)._secret;
	  }

	  var signature_bits = secret_key.signWithRecoverablePublicKey(hash);
	  var signature_base64 = sjcl.codec.base64.fromBits(signature_bits);

	  return signature_base64;

	};


	/**
	 *  Verify the signature on a given message.
	 *
	 *  Note that this function is asynchronous. 
	 *  The ripple-lib remote is used to check that the public
	 *  key extracted from the signature corresponds to one that is currently
	 *  active for the given account.
	 *
	 *  @static
	 *
	 *  @param {String} data.message
	 *  @param {RippleAddress} data.account
	 *  @param {Base64-encoded String} data.signature
	 *  @param {ripple-lib Remote} remote
	 *  @param {Function} callback
	 *
	 *  @callback callback
	 *  @param {Error} error
	 *  @param {boolean} is_valid true if the signature is valid, false otherwise
	 */
	Message.verifyMessageSignature = function(data, remote, callback) {

	  if (typeof data.message === 'string') {
	    data.hash = Message.HASH_FUNCTION(Message.MAGIC_BYTES + data.message);
	  } else {
	    return callback(new Error('Data object must contain message field to verify signature'));
	  }

	  return Message.verifyHashSignature(data, remote, callback);

	};


	/**
	 *  Verify the signature on a given hash.
	 *
	 *  Note that this function is asynchronous. 
	 *  The ripple-lib remote is used to check that the public
	 *  key extracted from the signature corresponds to one that is currently
	 *  active for the given account.
	 *
	 *  @static
	 *
	 *  @param {bitArray|Hex-encoded String} data.hash
	 *  @param {RippleAddress} data.account
	 *  @param {Base64-encoded String} data.signature
	 *  @param {ripple-lib Remote} remote
	 *  @param {Function} callback
	 *
	 *  @callback callback
	 *  @param {Error} error
	 *  @param {boolean} is_valid true if the signature is valid, false otherwise
	 */
	Message.verifyHashSignature = function(data, remote, callback) {

	  var hash,
	    account,
	    signature;

	  if(typeof callback !== 'function') {
	    throw new Error('Must supply callback function');
	  }

	  hash = data.hash;
	  if (hash && typeof hash === 'string' && REGEX_HEX.test(hash)) {
	    hash = sjcl.codec.hex.toBits(hash);
	  }

	  if (typeof hash !== 'object' || hash.length <= 0 || typeof hash[0] !== 'number') {
	    return callback(new Error('Hash must be a bitArray or hex-encoded string'));
	  }

	  account = data.account || data.address;
	  if (!account || !UInt160.from_json(account).is_valid()) {
	    return callback(new Error('Account must be a valid ripple address'));
	  }

	  signature = data.signature;
	  if (typeof signature !== 'string' || !REGEX_BASE64.test(signature)) {
	    return callback(new Error('Signature must be a Base64-encoded string'));
	  }
	  signature = sjcl.codec.base64.toBits(signature);

	  if (!(remote instanceof Remote) || remote.state !== 'online') {
	    return callback(new Error('Must supply connected Remote to verify signature'));
	  }

	  function recoverPublicKey (async_callback) {

	    var public_key;
	    try {
	      public_key = sjcl.ecc.ecdsa.publicKey.recoverFromSignature(hash, signature);
	    } catch (err) {
	      return async_callback(err);
	    }

	    if (public_key) {
	      async_callback(null, public_key);
	    } else {
	      async_callback(new Error('Could not recover public key from signature'));
	    }

	  };

	  function checkPublicKeyIsValid (public_key, async_callback) {

	    // Get hex-encoded public key
	    var key_pair = new KeyPair();
	    key_pair._pubkey = public_key;
	    var public_key_hex = key_pair.to_hex_pub();

	    var account_class_instance = new Account(remote, account);
	    account_class_instance.publicKeyIsActive(public_key_hex, async_callback);

	  };

	  var steps = [
	    recoverPublicKey,
	    checkPublicKeyIsValid
	  ];

	  async.waterfall(steps, callback);

	};

	exports.Message = Message;


/***/ },
/* 15 */
/***/ function(module, exports, __webpack_require__) {

	var async      = __webpack_require__(48);
	var blobClient = __webpack_require__(32).BlobClient;
	var AuthInfo   = __webpack_require__(16).AuthInfo;
	var crypt      = __webpack_require__(26).Crypt;
	var log        = __webpack_require__(24).sub('vault');
	function VaultClient(opts) {
	  
	  var self = this;
	  
	  if (!opts) {
	    opts = { };
	  }

	  if (typeof opts === 'string') {
	    opts = { domain: opts };
	  }

	  this.domain   = opts.domain || 'ripple.com';
	  this.infos    = { };
	};

	/**
	 * getAuthInfo
	 * gets auth info for a username. returns authinfo
	 * even if user does not exists (with exist set to false)
	 * @param {string} username
	 * @param {function} callback
	 */
	VaultClient.prototype.getAuthInfo = function (username, callback) {

	  AuthInfo.get(this.domain, username, function(err, authInfo) {
	    if (err) {
	      return callback(err);
	    }

	    if (authInfo.version !== 3) {
	      return callback(new Error('This wallet is incompatible with this version of the vault-client.'));
	    }

	    if (!authInfo.pakdf) {
	      return callback(new Error('No settings for PAKDF in auth packet.'));
	    }

	    if (typeof authInfo.blobvault !== 'string') {
	      return callback(new Error('No blobvault specified in the authinfo.'));
	    }

	    callback(null, authInfo);
	  });  
	};

	/**
	 * _deriveLoginKeys
	 * method designed for asnyc waterfall
	 */

	VaultClient.prototype._deriveLoginKeys = function (authInfo, password, callback) {

	  //derive login keys
	  crypt.derive(authInfo.pakdf, 'login', authInfo.username.toLowerCase(), password, function(err, keys) {
	    if (err) {
	      callback(err);
	    } else {
	      callback(null, authInfo, password, keys);
	    }
	  });
	};



	/**
	 * _deriveUnlockKey
	 * method designed for asnyc waterfall
	 */

	VaultClient.prototype._deriveUnlockKey = function (authInfo, password, keys, callback) {
	  //derive unlock key
	  crypt.derive(authInfo.pakdf, 'unlock', authInfo.username.toLowerCase(), password, function(err, unlock) {
	    if (err) {
	      log.error('derive:', err);
	      return callback(err);
	    }

	    if (!keys) {
	      keys = { };
	    }
	    
	    keys.unlock = unlock.unlock;
	    callback(null, authInfo, keys);
	  });
	};
	  
	/**
	 * Get a ripple name from a given account address, if it has one
	 * @param {string} address - Account address to query
	 * @param {string} url     - Url of blob vault
	 */

	VaultClient.prototype.getRippleName = function(address, url, callback) {
	  //use the url from previously retrieved authInfo, if necessary
	  if (!url) {
	    callback(new Error('Blob vault URL is required'));
	  } else {
	    blobClient.getRippleName(url, address, callback);
	  }
	};

	/**
	 * Authenticate and retrieve a decrypted blob using a ripple name and password
	 *
	 * @param {string}    username
	 * @param {string}    password
	 * @param {function}  fn - Callback function
	 */

	VaultClient.prototype.login = function(username, password, callback) {
	  var self = this;
	  
	  var steps = [
	    getAuthInfo,
	    self._deriveLoginKeys,
	    getBlob
	  ];

	  async.waterfall(steps, callback);
	    
	  function getAuthInfo(callback) {
	    self.getAuthInfo(username, function(err, authInfo){
	      
	      if (authInfo && !authInfo.exists) {
	        return callback(new Error('User does not exist.'));
	      }
	            
	      return callback (err, authInfo, password);
	    });  
	  }
	  
	  function getBlob(authInfo, password, keys, callback) {
	    blobClient.get(authInfo.blobvault, keys.id, keys.crypt, function(err, blob) {
	      if (err) {
	        return callback(err);
	      }

	      //save for relogin
	      self.infos[keys.id] = authInfo;

	      //migrate missing fields
	      if (blob.missing_fields) {
	        if (blob.missing_fields.encrypted_blobdecrypt_key) {     
	          log.info('migration: saving encrypted blob decrypt key');
	          authInfo.blob = blob;
	          //get the key to unlock the secret, then update the blob keys          
	          self._deriveUnlockKey(authInfo, password, keys, updateKeys);
	        }
	      }
	         
	      callback(null, {
	        blob      : blob,
	        username  : authInfo.username,
	        verified  : authInfo.emailVerified
	      });
	    });
	  };
	  
	  function updateKeys (err, params, keys) {
	    if (err || !keys.unlock) {
	      return; //unable to unlock
	    }
	    
	    var secret;
	    try {
	      secret = crypt.decrypt(keys.unlock, params.blob.encrypted_secret);
	    } catch (error) {
	      return log.error('decrypt:', error);
	    } 
	    
	    options = {
	      username  : params.username,
	      blob      : params.blob,
	      masterkey : secret,
	      keys      : keys
	    };
	    
	    blobClient.updateKeys(options, function(err, resp){
	      if (err) {
	        log.error('updateKeys:', err);
	      }
	    });     
	  } 
	};

	/**
	 * Retreive and decrypt blob using a blob url, id and crypt derived previously.
	 *
	 * @param {string}   url - Blob vault url
	 * @param {string}   id  - Blob id from previously retreived blob
	 * @param {string}   key - Blob decryption key
	 * @param {function} fn  - Callback function
	 */

	VaultClient.prototype.relogin = function(url, id, key, callback) {
	  //use the url from previously retrieved authInfo, if necessary
	  if (!url && this.infos[id]) {
	    url = this.infos[id].blobvault;
	  }

	  if (!url) {
	    return callback(new Error('Blob vault URL is required'));
	  }

	  blobClient.get(url, id, key, function(err, blob) {
	    if (err) {
	      callback(err);
	    } else {
	      callback (null, { blob: blob });
	    }
	  });
	};

	/**
	 * Decrypt the secret key using a username and password
	 *
	 * @param {string}    username
	 * @param {string}    password
	 * @param {string}    encryptSecret
	 * @param {function}  fn - Callback function
	 */

	VaultClient.prototype.unlock = function(username, password, encryptSecret, fn) {
	  var self = this;
	  
	  var steps = [
	    getAuthInfo,
	    self._deriveUnlockKey,
	    unlockSecret
	  ];

	  async.waterfall(steps, fn);
	  
	  function getAuthInfo(callback) {
	    self.getAuthInfo(username, function(err, authInfo){
	      
	      if (authInfo && !authInfo.exists) {
	        return callback(new Error('User does not exist.'));
	      }
	            
	      return callback (err, authInfo, password, {});
	    });  
	  }
	  
	  function unlockSecret (authinfo, keys, callback) {

	    var secret;
	    try {
	      secret = crypt.decrypt(keys.unlock, encryptSecret);
	    } catch (error) {
	      return callback(error);
	    }  
	    
	    callback(null, {
	      keys   : keys,
	      secret : secret
	    });      
	  }
	};

	/**
	 * Retrieve the decrypted blob and secret key in one step using
	 * the username and password
	 *
	 * @param {string}    username
	 * @param {string}    password
	 * @param {function}  fn - Callback function
	 */

	VaultClient.prototype.loginAndUnlock = function(username, password, fn) {
	  var self = this;

	  var steps = [
	    login,
	    deriveUnlockKey,
	    unlockSecret
	  ];

	  async.waterfall(steps, fn);  
	  
	  function login (callback) {
	    self.login(username, password, function(err, resp) {

	      if (err) {
	        return callback(err);
	      }
	  
	      if (!resp.blob || !resp.blob.encrypted_secret) {
	        return callback(new Error('Unable to retrieve blob and secret.'));
	      }
	  
	      if (!resp.blob.id || !resp.blob.key) {
	        return callback(new Error('Unable to retrieve keys.'));
	      }
	  
	      //get authInfo via id - would have been saved from login
	      var authInfo = self.infos[resp.blob.id];
	  
	      if (!authInfo) {
	        return callback(new Error('Unable to find authInfo'));
	      }
	    
	      callback(null, authInfo, password, resp.blob);
	    });    
	  };

	  function deriveUnlockKey (authInfo, password, blob, callback) {
	    self._deriveUnlockKey(authInfo, password, null, function(err, authInfo, keys){
	      callback(err, keys.unlock, authInfo, blob);
	    });
	  };
	  
	  function unlockSecret (unlock, authInfo, blob, callback) {
	    var secret;
	    try {
	      secret = crypt.decrypt(unlock, blob.encrypted_secret);
	    } catch (error) {
	      return callback(error);
	    }     
	    
	    callback(null, {
	      blob      : blob,
	      unlock    : unlock,
	      secret    : secret,
	      username  : authInfo.username,
	      verified  : authInfo.emailVerified
	    });    
	  };  
	};

	/**
	 * Check blobvault for existance of username
	 *
	 * @param {string}    username
	 * @param {function}  fn - Callback function
	 */

	VaultClient.prototype.exists = function(username, callback) {
	  AuthInfo.get(this.domain, username.toLowerCase(), function(err, authInfo) {
	    if (err) {
	      callback(err);
	    } else {
	      callback(null, !!authInfo.exists);
	    }
	  });
	};

	/**
	 * Verify an email address for an existing user
	 *
	 * @param {string}    username
	 * @param {string}    token - Verification token
	 * @param {function}  fn - Callback function
	 */

	VaultClient.prototype.verify = function(username, token, callback) {
	  var self = this;

	  self.getAuthInfo(username, function (err, authInfo){
	    if (err) {
	      return callback(err);
	    }
	    
	    blobClient.verify(authInfo.blobvault, username.toLowerCase(), token, callback);     
	  });
	};

	/**
	 * resendEmail
	 * send a new verification email
	 * @param {object}   options
	 * @param {string}   options.id
	 * @param {string}   options.username
	 * @param {string}   options.account_id
	 * @param {string}   options.email
	 * @param {string}   options.activateLink
	 * @param {function} fn - Callback
	 */

	VaultClient.prototype.resendEmail = function (options, fn) {
	  blobClient.resendEmail(options, fn);  
	};

	/**
	 * recoverBlob
	 * recover blob with account secret
	 * @param {object} options
	 * @param {string} options.url
	 * @param {string} options.username
	 * @param {string} options.masterkey
	 * @param {function} 
	 */

	VaultClient.prototype.recoverBlob = function (options, fn) {
	  blobClient.recoverBlob(options, fn);    
	};

	/*
	 * changePassword
	 * @param {object} options
	 * @param {string} options.username
	 * @param {string} options.password
	 * @param {string} options.masterkey
	 * @param {object} options.blob
	 */

	VaultClient.prototype.changePassword = function (options, fn) {
	  var self     = this;
	  var password = String(options.password).trim();
	  
	  var steps = [
	    getAuthInfo,
	    self._deriveLoginKeys,
	    self._deriveUnlockKey,
	    changePassword
	  ];
	  
	  async.waterfall(steps, fn);
	    
	  function getAuthInfo(callback) {
	    self.getAuthInfo(options.username, function(err, authInfo) { 
	      return callback (err, authInfo, password);      
	    });
	  };
	  
	  function changePassword (authInfo, keys, callback) {
	    options.keys = keys;
	    blobClient.updateKeys(options, callback); 
	  };
	};

	/**
	 * rename
	 * rename a ripple account
	 * @param {object} options
	 * @param {string} options.username
	 * @param {string} options.new_username
	 * @param {string} options.password
	 * @param {string} options.masterkey
	 * @param {object} options.blob
	 * @param {function} fn
	 */

	VaultClient.prototype.rename = function (options, fn) {
	  var self         = this;
	  var new_username = String(options.new_username).trim();
	  var password     = String(options.password).trim();
	  
	  var steps = [
	    getAuthInfo,
	    self._deriveLoginKeys,
	    self._deriveUnlockKey,
	    renameBlob
	  ];

	  async.waterfall(steps, fn);
	    
	  function getAuthInfo(callback) {
	    self.getAuthInfo(new_username, function(err, authInfo){
	      
	      if (authInfo && authInfo.exists) {
	        return callback(new Error('username already taken.'));
	      } else {
	        authInfo.username = new_username;
	      }
	            
	      return callback (err, authInfo, password);
	    });  
	  };
	  
	  function renameBlob (authInfo, keys, callback) {
	    options.keys = keys;
	    blobClient.rename(options, callback);    
	  };
	};

	/**
	 * Register a new user and save to the blob vault
	 *
	 * @param {object} options
	 * @param {string} options.username
	 * @param {string} options.password
	 * @param {string} options.masterkey   //optional, will create if absent
	 * @param {string} options.email
	 * @param {string} options.activateLink
	 * @param {object} options.oldUserBlob //optional
	 * @param {function} fn
	 */

	VaultClient.prototype.register = function(options, fn) {
	  var self     = this;
	  var username = String(options.username).trim();
	  var password = String(options.password).trim();
	  var result   = self.validateUsername(username);
	  
	  if (!result.valid) {
	    return fn(new Error('invalid username.'));  
	  }
	  
	  var steps = [
	    getAuthInfo,
	    self._deriveLoginKeys,
	    self._deriveUnlockKey,
	    create
	  ];
	  
	  async.waterfall(steps, fn);
	  
	  function getAuthInfo(callback) {
	    self.getAuthInfo(username, function(err, authInfo){      
	      return callback (err, authInfo, password);
	    });  
	  };

	  function create(authInfo, keys, callback) {
	    var params = {
	      url          : authInfo.blobvault,
	      id           : keys.id,
	      crypt        : keys.crypt,
	      unlock       : keys.unlock,
	      username     : username,
	      email        : options.email,
	      masterkey    : options.masterkey || crypt.createMaster(),
	      activateLink : options.activateLink,
	      oldUserBlob  : options.oldUserBlob,
	      domain       : options.domain
	    };
	        
	    blobClient.create(params, function(err, blob) {
	      if (err) {
	        callback(err);
	      } else {
	        callback(null, {
	          blob     : blob, 
	          username : username
	        });
	      }
	    });
	  };
	};

	VaultClient.prototype.validateUsername = function (username) {
	  username   = String(username).trim();
	  var result = {
	    valid  : false,
	    reason : ''
	  };
	  
	  if (username.length < 2) {
	    result.reason = 'tooshort';
	  } else if (username.length > 20) {
	    result.reason = 'toolong'; 
	  } else if (!/^[a-zA-Z0-9\-]+$/.exec(username)) {
	    result.reason = 'charset'; 
	  } else if (/^-/.exec(username)) {
	    result.reason = 'starthyphen'; 
	  } else if (/-$/.exec(username)) {
	    result.reason = 'endhyphen'; 
	  } else if (/--/.exec(username)) {
	    result.reason = 'multhyphen'; 
	  } else {
	    result.valid = true;
	  }
	  
	  return result;
	};

	exports.VaultClient = VaultClient;


/***/ },
/* 16 */
/***/ function(module, exports, __webpack_require__) {

	var async      = __webpack_require__(48);
	var superagent = __webpack_require__(49);
	var RippleTxt  = __webpack_require__(17).RippleTxt;

	var AuthInfo = { };

	AuthInfo._getRippleTxt = function(domain, callback) {
	  RippleTxt.get(domain, callback);
	};

	AuthInfo._getUser = function(url, callback) {
	  superagent.get(url, callback);
	};


	/**
	 * Get auth info for a given username
	 *
	 * @param {string}    domain - Domain which hosts the user's info
	 * @param {string}    username - Username who's info we are retreiving
	 * @param {function}  fn - Callback function
	 */

	AuthInfo.get = function(domain, username, callback) {
	  var self = this;
	  username = username.toLowerCase();
	  
	  function getRippleTxt(callback) {
	    self._getRippleTxt(domain, function(err, txt) {
	      if (err) {
	        return callback(err);
	      }

	      if (!txt.authinfo_url) {
	        return callback(new Error('Authentication is not supported on ' + domain));
	      }

	      var url = Array.isArray(txt.authinfo_url) ? txt.authinfo_url[0] : txt.authinfo_url;

	      url += '?domain=' + domain + '&username=' + username;

	      callback(null, url);
	    });
	  };

	  function getUser(url, callback) {
	    self._getUser(url, function(err, res) {
	      if (err || res.error) {
	        callback(new Error('Authentication info server unreachable'));
	      } else {
	        callback(null, res.body);
	      }
	    });
	  };

	  async.waterfall([ getRippleTxt, getUser ], callback);
	};

	exports.AuthInfo = AuthInfo;


/***/ },
/* 17 */
/***/ function(module, exports, __webpack_require__) {

	var request   = __webpack_require__(49);
	var Currency  = __webpack_require__(6).Currency;

	var RippleTxt = {
	  txts : { }
	};

	RippleTxt.urlTemplates = [
	  'https://{{domain}}/ripple.txt',
	  'https://www.{{domain}}/ripple.txt',
	  'https://ripple.{{domain}}/ripple.txt',
	  'http://{{domain}}/ripple.txt',
	  'http://www.{{domain}}/ripple.txt',
	  'http://ripple.{{domain}}/ripple.txt'
	];

	/**
	 * Gets the ripple.txt file for the given domain
	 * @param {string}    domain - Domain to retrieve file from
	 * @param {function}  fn - Callback function
	 */

	RippleTxt.get = function(domain, fn) {
	  var self = this;

	  if (self.txts[domain]) {
	    return fn(null, self.txts[domain]);
	  }

	  ;(function nextUrl(i) {
	    var url = RippleTxt.urlTemplates[i];
	    
	    if (!url) {
	      return fn(new Error('No ripple.txt found'));
	    }

	    url = url.replace('{{domain}}', domain);
	    
	    request.get(url, function(err, resp) {
	      if (err || !resp.text) {
	        return nextUrl(++i);
	      }

	      var sections = self.parse(resp.text);
	      self.txts[domain] = sections;

	      fn(null, sections);
	    });
	  })(0);
	};

	/**
	 * Parse a ripple.txt file
	 * @param {string}  txt - Unparsed ripple.txt data
	 */

	RippleTxt.parse = function(txt) {
	  var currentSection = '';
	  var sections = { };
	  
	  txt = txt.replace(/\r?\n/g, '\n').split('\n');

	  for (var i = 0, l = txt.length; i < l; i++) {
	    var line = txt[i];

	    if (!line.length || line[0] === '#') {
	      continue;
	    }

	    if (line[0] === '[' && line[line.length - 1] === ']') {
	      currentSection = line.slice(1, line.length - 1);
	      sections[currentSection] = [];
	    } else {
	      line = line.replace(/^\s+|\s+$/g, '');
	      if (sections[currentSection]) {
	        sections[currentSection].push(line);
	      }
	    }
	  }

	  return sections;
	};

	/**
	 * extractDomain
	 * attempt to extract the domain from a given url
	 * returns the url if unsuccessful
	 * @param {Object} url
	 */

	RippleTxt.extractDomain = function (url) {
	  match = /[^.]*\.[^.]{2,3}(?:\.[^.]{2,3})?([^.\?][^\?.]+?)?$/.exec(url);
	  return match && match[0] ? match[0] : url;
	};

	/**
	 * getCurrencies
	 * returns domain, issuer account and currency object
	 * for each currency found in the domain's ripple.txt file
	 * @param {Object} domain
	 * @param {Object} fn
	 */

	RippleTxt.getCurrencies = function(domain, fn) {
	  domain = RippleTxt.extractDomain(domain);
	  this.get(domain, function(err, txt) {
	    if (err) {
	      return fn(err);  
	    }
	    
	    if (err || !txt.currencies || !txt.accounts) {
	      return fn(null, []);
	    }
	    
	    //NOTE: this won't be accurate if there are
	    //multiple issuer accounts with different 
	    //currencies associated with each.
	    var issuer     = txt.accounts[0];
	    var currencies = [];
	    
	    txt.currencies.forEach(function(currency) {
	      currencies.push({
	        issuer   : issuer,
	        currency : Currency.from_json(currency),
	        domain   : domain
	      });
	    });
	    
	    fn(null, currencies);
	  });
	}; 

	exports.RippleTxt = RippleTxt;


/***/ },
/* 18 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Data type map.
	 *
	 * Mapping of type ids to data types. The type id is specified by the high
	 */
	var TYPES_MAP = exports.types = [
	  void(0),

	  // Common
	  'Int16',    // 1
	  'Int32',    // 2
	  'Int64',    // 3
	  'Hash128',  // 4
	  'Hash256',  // 5
	  'Amount',   // 6
	  'VL',       // 7
	  'Account',  // 8

	  // 9-13 reserved
	  void(0),    // 9
	  void(0),    // 10
	  void(0),    // 11
	  void(0),    // 12
	  void(0),    // 13

	  'Object',   // 14
	  'Array',    // 15

	  // Uncommon
	  'Int8',     // 16
	  'Hash160',  // 17
	  'PathSet',  // 18
	  'Vector256' // 19
	];

	/**
	 * Field type map.
	 *
	 * Mapping of field type id to field type name.
	 */

	var FIELDS_MAP = exports.fields = {
	  // Common types
	  1: { // Int16
	    1: 'LedgerEntryType',
	    2: 'TransactionType'
	  },
	  2: { // Int32
	    2: 'Flags',
	    3: 'SourceTag',
	    4: 'Sequence',
	    5: 'PreviousTxnLgrSeq',
	    6: 'LedgerSequence',
	    7: 'CloseTime',
	    8: 'ParentCloseTime',
	    9: 'SigningTime',
	    10: 'Expiration',
	    11: 'TransferRate',
	    12: 'WalletSize',
	    13: 'OwnerCount',
	    14: 'DestinationTag',
	    // Skip 15
	    16: 'HighQualityIn',
	    17: 'HighQualityOut',
	    18: 'LowQualityIn',
	    19: 'LowQualityOut',
	    20: 'QualityIn',
	    21: 'QualityOut',
	    22: 'StampEscrow',
	    23: 'BondAmount',
	    24: 'LoadFee',
	    25: 'OfferSequence',
	    26: 'InflateSeq',
	    27: 'LastLedgerSequence',
	    28: 'TransactionIndex',
	    29: 'OperationLimit',
	    30: 'ReferenceFeeUnits',
	    31: 'ReserveBase',
	    32: 'ReserveIncrement',
	    33: 'SetFlag',
	    34: 'ClearFlag'
	  },
	  3: { // Int64
	    1: 'IndexNext',
	    2: 'IndexPrevious',
	    3: 'BookNode',
	    4: 'OwnerNode',
	    5: 'BaseFee',
	    6: 'ExchangeRate',
	    7: 'LowNode',
	    8: 'HighNode'
	  },
	  4: { // Hash128
	    1: 'EmailHash'
	  },
	  5: { // Hash256
	    1: 'LedgerHash',
	    2: 'ParentHash',
	    3: 'TransactionHash',
	    4: 'AccountHash',
	    5: 'PreviousTxnID',
	    6: 'LedgerIndex',
	    7: 'WalletLocator',
	    8: 'RootIndex',
	    9: 'AccountTxnID',
	    16: 'BookDirectory',
	    17: 'InvoiceID',
	    18: 'Nickname',
	    19: 'Feature'
	  },
	  6: { // Amount
	    1: 'Amount',
	    2: 'Balance',
	    3: 'LimitAmount',
	    4: 'TakerPays',
	    5: 'TakerGets',
	    6: 'LowLimit',
	    7: 'HighLimit',
	    8: 'Fee',
	    9: 'SendMax',
	    16: 'MinimumOffer',
	    17: 'RippleEscrow',
	    18: 'DeliveredAmount'
	  },
	  7: { // VL
	    1: 'PublicKey',
	    2: 'MessageKey',
	    3: 'SigningPubKey',
	    4: 'TxnSignature',
	    5: 'Generator',
	    6: 'Signature',
	    7: 'Domain',
	    8: 'FundCode',
	    9: 'RemoveCode',
	    10: 'ExpireCode',
	    11: 'CreateCode',
	    12: 'MemoType',
	    13: 'MemoData'
	  },
	  8: { // Account
	    1: 'Account',
	    2: 'Owner',
	    3: 'Destination',
	    4: 'Issuer',
	    7: 'Target',
	    8: 'RegularKey',
	    9: 'InflationDest',
	    10: 'SetAuthKey'
	  },
	  14: { // Object
	    1: void(0),  //end of Object
	    2: 'TransactionMetaData',
	    3: 'CreatedNode',
	    4: 'DeletedNode',
	    5: 'ModifiedNode',
	    6: 'PreviousFields',
	    7: 'FinalFields',
	    8: 'NewFields',
	    9: 'TemplateEntry',
	    10: 'Memo'
	  },
	  15: { // Array
	    1: void(0),  //end of Array
	    2: 'SigningAccounts',
	    3: 'TxnSignatures',
	    4: 'Signatures',
	    5: 'Template',
	    6: 'Necessary',
	    7: 'Sufficient',
	    8: 'AffectedNodes',
	    9: 'Memos'
	  },

	  // Uncommon types
	  16: { // Int8
	    1: 'CloseResolution',
	    2: 'TemplateEntryType',
	    3: 'TransactionResult'
	  },
	  17: { // Hash160
	    1: 'TakerPaysCurrency',
	    2: 'TakerPaysIssuer',
	    3: 'TakerGetsCurrency',
	    4: 'TakerGetsIssuer'
	  },
	  18: { // PathSet
	    1: 'Paths'
	  },
	  19: { // Vector256
	    1: 'Indexes',
	    2: 'Hashes',
	    3: 'Features'
	  }
	};

	var INVERSE_FIELDS_MAP = exports.fieldsInverseMap = { };

	Object.keys(FIELDS_MAP).forEach(function(k1) {
	  Object.keys(FIELDS_MAP[k1]).forEach(function(k2) {
	    INVERSE_FIELDS_MAP[FIELDS_MAP[k1][k2]] = [ Number(k1), Number(k2) ];
	  });
	});


	var REQUIRED = exports.REQUIRED = 0,
	    OPTIONAL = exports.OPTIONAL = 1,
	    DEFAULT  = exports.DEFAULT  = 2;

	var base = [
	  [ 'TransactionType'    , REQUIRED ],
	  [ 'Flags'              , OPTIONAL ],
	  [ 'SourceTag'          , OPTIONAL ],
	  [ 'LastLedgerSequence' , OPTIONAL ],
	  [ 'Account'            , REQUIRED ],
	  [ 'Sequence'           , REQUIRED ],
	  [ 'Fee'                , REQUIRED ],
	  [ 'OperationLimit'     , OPTIONAL ],
	  [ 'SigningPubKey'      , REQUIRED ],
	  [ 'TxnSignature'       , OPTIONAL ]
	];

	exports.tx = {
	  AccountSet: [3].concat(base, [
	    [ 'EmailHash'          , OPTIONAL ],
	    [ 'WalletLocator'      , OPTIONAL ],
	    [ 'WalletSize'         , OPTIONAL ],
	    [ 'MessageKey'         , OPTIONAL ],
	    [ 'Domain'             , OPTIONAL ],
	    [ 'TransferRate'       , OPTIONAL ],
	    [ 'InflationDest'      , OPTIONAL ],
	    [ 'SetAuthKey'         , OPTIONAL ]
	  ]),
	  AccountMerge: [4].concat(base, [
	    [ 'Destination'        , REQUIRED ]
	  ]),
	  TrustSet: [20].concat(base, [
	    [ 'LimitAmount'        , OPTIONAL ],
	    [ 'QualityIn'          , OPTIONAL ],
	    [ 'QualityOut'         , OPTIONAL ]
	  ]),
	  OfferCreate: [7].concat(base, [
	    [ 'TakerPays'          , REQUIRED ],
	    [ 'TakerGets'          , REQUIRED ],
	    [ 'Expiration'         , OPTIONAL ]
	  ]),
	  OfferCancel: [8].concat(base, [
	    [ 'OfferSequence'      , REQUIRED ]
	  ]),
	  SetRegularKey: [5].concat(base, [
	    [ 'RegularKey'         , REQUIRED ]
	  ]),
	  Payment: [0].concat(base, [
	    [ 'Destination'        , REQUIRED ],
	    [ 'Amount'             , REQUIRED ],
	    [ 'SendMax'            , OPTIONAL ],
	    [ 'Paths'              , DEFAULT  ],
	    [ 'InvoiceID'          , OPTIONAL ],
	    [ 'DestinationTag'     , OPTIONAL ]
	  ]),
	  Inflation: [1].concat(base, [
	    [ 'InflateSeq'         , REQUIRED ]
	  ]),
	  Contract: [9].concat(base, [
	    [ 'Expiration'         , REQUIRED ],
	    [ 'BondAmount'         , REQUIRED ],
	    [ 'StampEscrow'        , REQUIRED ],
	    [ 'RippleEscrow'       , REQUIRED ],
	    [ 'CreateCode'         , OPTIONAL ],
	    [ 'FundCode'           , OPTIONAL ],
	    [ 'RemoveCode'         , OPTIONAL ],
	    [ 'ExpireCode'         , OPTIONAL ]
	  ]),
	  RemoveContract: [10].concat(base, [
	    [ 'Target'             , REQUIRED ]
	  ]),
	  EnableFeature: [100].concat(base, [
	    [ 'Feature'            , REQUIRED ]
	  ]),
	  SetFee: [101].concat(base, [
	    [ 'Features'           , REQUIRED ],
	    [ 'BaseFee'            , REQUIRED ],
	    [ 'ReferenceFeeUnits'  , REQUIRED ],
	    [ 'ReserveBase'        , REQUIRED ],
	    [ 'ReserveIncrement'   , REQUIRED ]
	  ])
	};

	var sleBase = [
	  ['LedgerIndex',          OPTIONAL],
	  ['LedgerEntryType',      REQUIRED],
	  ['Flags',                REQUIRED]
	];

	exports.ledger = {
	  AccountRoot: [97].concat(sleBase,[
	    ['Sequence',           REQUIRED],
	    ['PreviousTxnLgrSeq',  REQUIRED],
	    ['TransferRate',       OPTIONAL],
	    ['WalletSize',         OPTIONAL],
	    ['OwnerCount',         REQUIRED],
	    ['EmailHash',          OPTIONAL],
	    ['PreviousTxnID',      REQUIRED],
	    ['AccountTxnID',       OPTIONAL],
	    ['WalletLocator',      OPTIONAL],
	    ['Balance',            REQUIRED],
	    ['MessageKey',         OPTIONAL],
	    ['Domain',             OPTIONAL],
	    ['Account',            REQUIRED],
	    ['RegularKey',         OPTIONAL]]),
	  Contract: [99].concat(sleBase,[
	    ['PreviousTxnLgrSeq',  REQUIRED],
	    ['Expiration',         REQUIRED],
	    ['BondAmount',         REQUIRED],
	    ['PreviousTxnID',      REQUIRED],
	    ['Balance',            REQUIRED],
	    ['FundCode',           OPTIONAL],
	    ['RemoveCode',         OPTIONAL],
	    ['ExpireCode',         OPTIONAL],
	    ['CreateCode',         OPTIONAL],
	    ['Account',            REQUIRED],
	    ['Owner',              REQUIRED],
	    ['Issuer',             REQUIRED]]),
	  DirectoryNode: [100].concat(sleBase,[
	    ['IndexNext',          OPTIONAL],
	    ['IndexPrevious',      OPTIONAL],
	    ['ExchangeRate',       OPTIONAL],
	    ['RootIndex',          REQUIRED],
	    ['Owner',              OPTIONAL],
	    ['TakerPaysCurrency',  OPTIONAL],
	    ['TakerPaysIssuer',    OPTIONAL],
	    ['TakerGetsCurrency',  OPTIONAL],
	    ['TakerGetsIssuer',    OPTIONAL],
	    ['Indexes',            REQUIRED]]),
	  EnabledFeatures: [102].concat(sleBase,[
	    ['Features',           REQUIRED]]),
	  FeeSettings: [115].concat(sleBase,[
	    ['ReferenceFeeUnits',  REQUIRED],
	    ['ReserveBase',        REQUIRED],
	    ['ReserveIncrement',   REQUIRED],
	    ['BaseFee',            REQUIRED],
	    ['LedgerIndex',        OPTIONAL]]),
	  GeneratorMap: [103].concat(sleBase,[
	    ['Generator',          REQUIRED]]),
	  LedgerHashes: [104].concat(sleBase,[
	    ['LedgerEntryType',      REQUIRED],
	    ['Flags',                REQUIRED],
	    ['FirstLedgerSequence',  OPTIONAL],
	    ['LastLedgerSequence',   OPTIONAL],
	    ['LedgerIndex',          OPTIONAL],
	    ['Hashes',               REQUIRED]]),
	  Nickname: [110].concat(sleBase,[
	    ['LedgerEntryType',     REQUIRED],
	    ['Flags',               REQUIRED],
	    ['LedgerIndex',         OPTIONAL],
	    ['MinimumOffer',        OPTIONAL],
	    ['Account',             REQUIRED]]),
	  Offer: [111].concat(sleBase,[
	    ['LedgerEntryType',     REQUIRED],
	    ['Flags',               REQUIRED],
	    ['Sequence',            REQUIRED],
	    ['PreviousTxnLgrSeq',   REQUIRED],
	    ['Expiration',          OPTIONAL],
	    ['BookNode',            REQUIRED],
	    ['OwnerNode',           REQUIRED],
	    ['PreviousTxnID',       REQUIRED],
	    ['LedgerIndex',         OPTIONAL],
	    ['BookDirectory',       REQUIRED],
	    ['TakerPays',           REQUIRED],
	    ['TakerGets',           REQUIRED],
	    ['Account',             REQUIRED]]),
	  RippleState: [114].concat(sleBase,[
	    ['LedgerEntryType',     REQUIRED],
	    ['Flags',               REQUIRED],
	    ['PreviousTxnLgrSeq',   REQUIRED],
	    ['HighQualityIn',       OPTIONAL],
	    ['HighQualityOut',      OPTIONAL],
	    ['LowQualityIn',        OPTIONAL],
	    ['LowQualityOut',       OPTIONAL],
	    ['LowNode',             OPTIONAL],
	    ['HighNode',            OPTIONAL],
	    ['PreviousTxnID',       REQUIRED],
	    ['LedgerIndex',         OPTIONAL],
	    ['Balance',             REQUIRED],
	    ['LowLimit',            REQUIRED],
	    ['HighLimit',           REQUIRED]])
	}

	exports.metadata = [
	  [ 'TransactionIndex'     , REQUIRED ],
	  [ 'TransactionResult'    , REQUIRED ],
	  [ 'AffectedNodes'        , REQUIRED ]
	];

	exports.ter = {
	  tesSUCCESS: 0,
	  tecCLAIM: 100,
	  tecPATH_PARTIAL: 101,
	  tecUNFUNDED_ADD: 102,
	  tecUNFUNDED_OFFER: 103,
	  tecUNFUNDED_PAYMENT: 104,
	  tecFAILED_PROCESSING: 105,
	  tecDIR_FULL: 121,
	  tecINSUF_RESERVE_LINE: 122,
	  tecINSUF_RESERVE_OFFER: 123,
	  tecNO_DST: 124,
	  tecNO_DST_INSUF_XPR: 125,
	  tecNO_LINE_INSUF_RESERVE: 126,
	  tecNO_LINE_REDUNDANT: 127,
	  tecPATH_DRY: 128,
	  tecUNFUNDED: 129,
	  tecMASTER_DISABLED: 130,
	  tecNO_REGULAR_KEY: 131,
	  tecOWNERS: 132
	};


/***/ },
/* 19 */
/***/ function(module, exports, __webpack_require__) {

	function filterErr(code, done) {
	  return function(e) {
	    done(e.code !== code ? e : void(0));
	  };
	};

	function throwErr(done) {
	  return function(e) {
	    if (e) {
	      throw e;
	    }
	    done();
	  };
	};

	function trace(comment, func) {
	  return function() {
	    console.log('%s: %s', trace, arguments.toString);
	    func(arguments);
	  };
	};

	function arraySet(count, value) {
	  var a = new Array(count);

	  for (var i=0; i<count; i++) {
	    a[i] = value;
	  }

	  return a;
	};

	function hexToString(h) {
	  var a = [];
	  var i = 0;

	  if (h.length % 2) {
	    a.push(String.fromCharCode(parseInt(h.substring(0, 1), 16)));
	    i = 1;
	  }

	  for (; i<h.length; i+=2) {
	    a.push(String.fromCharCode(parseInt(h.substring(i, i+2), 16)));
	  }

	  return a.join('');
	};

	function stringToHex(s) {
	  var result = '';
	  for (var i=0; i<s.length; i++) {
	    var b = s.charCodeAt(i);
	    result += b < 16 ? '0' + b.toString(16) : b.toString(16);
	  }
	  return result;
	};

	function stringToArray(s) {
	  var a = new Array(s.length);

	  for (var i=0; i<a.length; i+=1) {
	    a[i] = s.charCodeAt(i);
	  }

	  return a;
	};

	function hexToArray(h) {
	  return stringToArray(hexToString(h));
	};

	function chunkString(str, n, leftAlign) {
	  var ret = [];
	  var i=0, len=str.length;

	  if (leftAlign) {
	    i = str.length % n;
	    if (i) {
	      ret.push(str.slice(0, i));
	    }
	  }

	  for(; i<len; i+=n) {
	    ret.push(str.slice(i, n + i));
	  }

	  return ret;
	};

	function assert(assertion, msg) {
	  if (!assertion) {
	    throw new Error('Assertion failed' + (msg ? ': ' + msg : '.'));
	  }
	};

	/**
	 * Return unique values in array.
	 */
	function arrayUnique(arr) {
	  var u = {}, a = [];

	  for (var i=0, l=arr.length; i<l; i++){
	    var k = arr[i];
	    if (u[k]) {
	      continue;
	    }
	    a.push(k);
	    u[k] = true;
	  }

	  return a;
	};

	/**
	 *  Exponentially increases the average time between tries.
	 *
	 * @param {Number} tries The number of times that an action was tried, but failed.
	 * @param {Number} [gain] The constant used to linearly transform (multiply to) the time.
	 * @param {Number} [offset] The constant used to linearly offset (add to) the time.
	 */
	function expBackoff(tries, gain, offset) {
	  gain = gain || 1;
	  offset = offset || 0;

	  // http://en.wikipedia.org/wiki/Exponential_backoff
	  var t = Math.random() * (Math.pow(2, tries) - 1);

	  // https://code.google.com/p/google-http-java-client/wiki/ExponentialBackoff
	  return offset + gain * t;
	}

	/**
	 * Convert a ripple epoch to a JavaScript timestamp.
	 *
	 * JavaScript timestamps are unix epoch in milliseconds.
	 */
	function toTimestamp(rpepoch) {
	  return (rpepoch + 0x386D4380) * 1000;
	};

	/**
	 * Convert a JavaScript timestamp or Date to a Ripple epoch.
	 *
	 * JavaScript timestamps are unix epoch in milliseconds.
	 */
	function fromTimestamp(rpepoch) {
	  if (rpepoch instanceof Date) {
	    rpepoch = rpepoch.getTime();
	  }

	  return Math.round(rpepoch / 1000) - 0x386D4380;
	};

	exports.time = {
	  fromRipple: toTimestamp,
	  toRipple: fromTimestamp
	};

	exports.trace         = trace;
	exports.arraySet      = arraySet;
	exports.hexToString   = hexToString;
	exports.hexToArray    = hexToArray;
	exports.stringToArray = stringToArray;
	exports.stringToHex   = stringToHex;
	exports.chunkString   = chunkString;
	exports.assert        = assert;
	exports.arrayUnique   = arrayUnique;
	exports.toTimestamp   = toTimestamp;
	exports.fromTimestamp = fromTimestamp;
	exports.expBackoff    = expBackoff;

	// Going up three levels is needed to escape the src-cov folder used for the
	// test coverage stuff.
	exports.sjcl = __webpack_require__(46);
	exports.jsbn = __webpack_require__(33);

	// vim:sw=2:sts=2:ts=8:et


/***/ },
/* 20 */
/***/ function(module, exports, __webpack_require__) {

	var util         = __webpack_require__(36);
	var rippleUtil   = __webpack_require__(19);
	var url          = __webpack_require__(41);
	var EventEmitter = __webpack_require__(35).EventEmitter;
	var Amount       = __webpack_require__(3).Amount;
	var Transaction  = __webpack_require__(5).Transaction;
	var log          = __webpack_require__(24).internal.sub('server');

	/**
	 *  @constructor Server
	 *
	 *  @param {Remote} Reference to a Remote object
	 *  @param {Object} Options
	 *    @param {String} host
	 *    @param {Number|String} port
	 *    @param [Boolean] securec
	 */

	function Server(remote, opts) {
	  EventEmitter.call(this);

	  var self = this;

	  if (typeof opts === 'string') {
	    var parsedUrl = url.parse(opts);
	    opts = {
	      host: parsedUrl.hostname,
	      port: parsedUrl.port,
	      secure: (parsedUrl.protocol === 'ws:') ? false : true
	    };
	  }

	  if (typeof opts !== 'object') {
	    throw new TypeError('Server configuration is not an Object');
	  }

	  if (!Server.domainRE.test(opts.host)) {
	    throw new Error('Server host is malformed, use "host" and "port" server configuration');
	  }

	  // We want to allow integer strings as valid port numbers for backward compatibility
	  if (!(opts.port = Number(opts.port))) {
	    throw new TypeError('Server port must be a number');
	  }

	  if (opts.port < 1 || opts.port > 65535) {
	    throw new TypeError('Server "port" must be an integer in range 1-65535');
	  }

	  if (typeof opts.secure !== 'boolean') {
	    opts.secure = true;
	  }

	  this._remote = remote;
	  this._opts   = opts;
	  this._ws     = void(0);

	  this._connected     = false;
	  this._shouldConnect = false;
	  this._state         = 'offline';

	  this._id       = 0;
	  this._retry    = 0;
	  this._requests = { };

	  this._load_base   = 256;
	  this._load_factor = 256;

	  this._fee          = 10;
	  this._fee_ref      = 10;
	  this._fee_base     = 10;
	  this._reserve_base = void(0);
	  this._reserve_inc  = void(0);
	  this._fee_cushion  = this._remote.fee_cushion;

	  this._lastLedgerIndex = NaN;
	  this._lastLedgerClose = NaN;

	  this._score = 0;

	  this._scoreWeights = {
	    ledgerclose: 5,
	    response: 1
	  };

	  this._url = this._opts.url = (this._opts.secure ? 'wss://' : 'ws://')
	      + this._opts.host + ':' + this._opts.port;

	  this.on('message', onMessage);

	  function onMessage(message) {
	    self._handleMessage(message);
	  };

	  this.on('response_subscribe', onSubscribeResponse);

	  function onSubscribeResponse(message) {
	    self._handleResponseSubscribe(message);
	  };

	  function setActivityInterval() {
	    var interval = self._checkActivity.bind(self);
	    self._activityInterval = setInterval(interval, 1000);
	  };

	  this.on('disconnect', function onDisconnect() {
	    clearInterval(self._activityInterval);
	    self.once('ledger_closed', setActivityInterval);
	  });

	  this.once('ledger_closed', setActivityInterval);

	  this._remote.on('ledger_closed', function(ledger) {
	    self._updateScore('ledgerclose', ledger);
	  });

	  this.on('response_ping', function(message, request) {
	    self._updateScore('response', request);
	  });

	  this.on('load_changed', function(load) {
	    self._updateScore('loadchange', load);
	  });
	};

	util.inherits(Server, EventEmitter);

	Server.domainRE = /^(?=.{1,255}$)[0-9A-Za-z](?:(?:[0-9A-Za-z]|[-_]){0,61}[0-9A-Za-z])?(?:\.[0-9A-Za-z](?:(?:[0-9A-Za-z]|[-_]){0,61}[0-9A-Za-z])?)*\.?$/;

	/**
	 * Server states that we will treat as the server being online.
	 *
	 * Our requirements are that the server can process transactions and notify
	 * us of changes.
	 */

	Server.onlineStates = [
	  'syncing',
	  'tracking',
	  'proposing',
	  'validating',
	  'full'
	];

	/**
	 * This is the final interface between client code and a socket connection to a
	 * `rippled` server. As such, this is a decent hook point to allow a WebSocket
	 * interface conforming object to be used as a basis to mock rippled. This
	 * avoids the need to bind a websocket server to a port and allows a more
	 * synchronous style of code to represent a client <-> server message sequence.
	 * We can also use this to log a message sequence to a buffer.
	 *
	 * @api private
	 */

	Server.websocketConstructor = function() {
	  // We require this late, because websocket shims may be loaded after
	  // ripple-lib in the browser
	  return __webpack_require__(34);
	};

	/**
	 * Set server state
	 *
	 * @param {String} state
	 * @api private
	 */

	Server.prototype._setState = function(state) {
	  if (state !== this._state) {
	    if (this._remote.trace) {
	      log.info('set_state:', state);
	    }

	    this._state = state;
	    this.emit('state', state);

	    switch (state) {
	      case 'online':
	        this._connected = true;
	        this.emit('connect');
	        break;
	      case 'offline':
	        this._connected = false;
	        this.emit('disconnect');
	        break;
	    }
	  }
	};

	/**
	 * Check that server is still active.
	 *
	 * Server activity is determined by ledger_closed events.
	 * Maximum delay to receive a ledger_closed event is 20s.
	 *
	 * If server is inactive, reconnect
	 *
	 * @api private
	 */

	Server.prototype._checkActivity = function() {
	  if (!this._connected) {
	    return;
	  }

	  if (isNaN(this._lastLedgerClose)) {
	    return;
	  }

	  var delta = (Date.now() - this._lastLedgerClose);

	  if (delta > (1000 * 60)) {
	    this._lastLedgerClose = NaN;
	    this.reconnect();
	  }
	};

	/**
	 * Server maintains a score for request prioritization.
	 *
	 * The score is determined by various data including
	 * this server's lag to receive ledger_closed events,
	 * ping response time, and load(fee) change
	 *
	 * @param {String} type
	 * @param {Object} data
	 * @api private
	 */

	Server.prototype._updateScore = function(type, data) {
	  if (!this._connected) {
	    return;
	  }

	  var weight = this._scoreWeights[type] || 1;

	  switch (type) {
	    case 'ledgerclose':
	      // Ledger lag
	      var delta = data.ledger_index - this._lastLedgerIndex;
	      if (delta > 0) {
	        this._score += weight * delta;
	      }
	      break;
	    case 'response':
	      // Ping lag
	      var delta = Math.floor((Date.now() - data.time) / 200);
	      this._score += weight * delta;
	      break;
	    case 'loadchange':
	      // Load/fee change
	      this._fee = Number(this._computeFee(10));
	      break;
	  }

	  if (this._score > 1e3) {
	    this.reconnect();
	  }
	};

	/**
	 * Get the remote address for a server.
	 * Incompatible with ripple-lib client build
	 */

	Server.prototype._remoteAddress = function() {
	  var address;
	  try {
	    address = this._ws._socket.remoteAddress;
	  } catch (e) {
	  }
	  return address;
	};

	/**
	 * Disconnect from rippled WebSocket server
	 *
	 * @api public
	 */

	Server.prototype.disconnect = function() {
	  this._shouldConnect = false;
	  this._setState('offline');
	  if (this._ws) {
	    this._ws.close();
	  }
	};

	/**
	 * Reconnect to rippled WebSocket server
	 *
	 * @api public
	 */

	Server.prototype.reconnect = function() {
	  var self = this;

	  function disconnected() {
	    self.connect();
	  };

	  if (this._ws) {
	    this.once('disconnect', disconnected);
	    this.disconnect();
	  }
	};

	/**
	 * Connect to rippled WebSocket server and subscribe to events that are
	 * internally requisite. Automatically retry connections with a gradual
	 * back-off
	 *
	 * @api public
	 */

	Server.prototype.connect = function() {
	  var self = this;

	  // We don't connect if we believe we're already connected. This means we have
	  // recently received a message from the server and the WebSocket has not
	  // reported any issues either. If we do fail to ping or the connection drops,
	  // we will automatically reconnect.
	  if (this._connected) {
	    return;
	  }

	  if (this._remote.trace) {
	    log.info('connect:', this._opts.url);
	  }

	  // Ensure any existing socket is given the command to close first.
	  if (this._ws) {
	    this._ws.close();
	  }

	  var WebSocket = Server.websocketConstructor();

	  if (!WebSocket) {
	    throw new Error('No websocket support detected!');
	  }

	  var ws = this._ws = new WebSocket(this._opts.url);

	  this._shouldConnect = true;

	  self.emit('connecting');

	  ws.onmessage = function onMessage(msg) {
	    self.emit('message', msg.data);
	  };

	  ws.onopen = function onOpen() {
	    if (ws === self._ws) {
	      self.emit('socket_open');
	      // Subscribe to events
	      self._request(self._remote._serverPrepareSubscribe());
	    }
	  };

	  ws.onerror = function onError(e) {
	    if (ws === self._ws) {
	      self.emit('socket_error');

	      if (self._remote.trace) {
	        log.info('onerror:', self._opts.url, e.data || e);
	      }

	      // Most connection errors for WebSockets are conveyed as 'close' events with
	      // code 1006. This is done for security purposes and therefore unlikely to
	      // ever change.

	      // This means that this handler is hardly ever called in practice. If it is,
	      // it probably means the server's WebSocket implementation is corrupt, or
	      // the connection is somehow producing corrupt data.

	      // Most WebSocket applications simply log and ignore this error. Once we
	      // support for multiple servers, we may consider doing something like
	      // lowering this server's quality score.

	      // However, in Node.js this event may be triggered instead of the close
	      // event, so we need to handle it.
	      self._handleClose();
	    }
	  };

	  ws.onclose = function onClose() {
	    if (ws === self._ws) {
	      if (self._remote.trace) {
	        log.info('onclose:', self._opts.url, ws.readyState);
	      }
	      self._handleClose();
	    }
	  };
	};

	/**
	 * Return the status of the server's connection
	 *
	 * @api public
	 */

	Server.prototype.connected = function() {
	  return this._connected;
	};

	/**
	 * Retry connection to rippled server
	 *
	 * @api private
	 */

	Server.prototype._retryConnect = function() {
	  var self = this;

	  this._retry += 1;

	  var retryTimeout = rippleUtil.expBackoff(this._retry, 100, 1000);

	  function connectionRetry() {
	    if (self._shouldConnect) {
	      if (self._remote.trace) {
	        log.info('retry', self._opts.url);
	      }
	      self.connect();
	    }
	  };

	  this._retryTimer = setTimeout(connectionRetry, retryTimeout);

	  this.emit('reconnecting', retryTimeout);
	};

	/**
	 * Reset the retry counter and try reconnecting immediately
	 *
	 * @api public
	 */

	Server.prototype.forceReconnect = function() {
	  this._retry = 0;
	  clearTimeout(this._retryTimer);
	  this.connect();
	};

	/**
	 * Handle connection closes
	 *
	 * @api private
	 */

	Server.prototype._handleClose = function() {
	  var self = this;
	  var ws = this._ws;

	  this.emit('socket_close');
	  this._setState('offline');

	  function noOp(){};

	  // Prevent additional events from this socket
	  ws.onopen = ws.onerror = ws.onclose = ws.onmessage = noOp;

	  if (self._shouldConnect) {
	    this._retryConnect();
	  }
	};

	/**
	 * Handle incoming messages from rippled WebSocket server
	 *
	 * @param {JSON-parseable} message
	 * @api private
	 */

	Server.prototype._handleMessage = function(message) {
	  var self = this;

	  try {
	    message = JSON.parse(message);
	  } catch(e) {
	  }

	  if (!Server.isValidMessage(message)) {
	    this.emit('unexpected', message);
	    return;
	  }

	  switch (message.type) {
	    case 'ledgerClosed':
	      this._handleLedgerClosed(message);
	      break;
	    case 'serverStatus':
	      this._handleServerStatus(message);
	      break;
	    case 'response':
	      this._handleResponse(message);
	      break;
	    case 'find_path':
	      this._handlePathFind(message);
	      break;
	  }
	};

	Server.prototype._handleLedgerClosed = function(message) {
	  this._lastLedgerIndex = message.ledger_index;
	  this._lastLedgerClose = Date.now();
	  this.emit('ledger_closed', message);
	};

	Server.prototype._handleServerStatus = function(message) {
	  // This message is only received when online.
	  // As we are connected, it is the definitive final state.
	  var isOnline = ~Server.onlineStates.indexOf(message.server_status);
	  this._setState(isOnline ? 'online' : 'offline');

	  if (!Server.isLoadStatus(message)) {
	    return;
	  }

	  this.emit('load', message, this);
	  this._remote.emit('load', message, this);

	  var loadChanged = message.load_base !== this._load_base
	  || message.load_factor !== this._load_factor

	  if (loadChanged) {
	    this._load_base = message.load_base;
	    this._load_factor = message.load_factor;
	    this.emit('load_changed', message, this);
	    this._remote.emit('load_changed', message, this);
	  }
	};

	Server.prototype._handleResponse = function(message) {
	  // A response to a request.
	  var request = this._requests[message.id];

	  delete this._requests[message.id];

	  if (!request) {
	    if (this._remote.trace) {
	      log.info('UNEXPECTED:', this._opts.url, message);
	    }
	    return;
	  }

	  if (message.status === 'success') {
	    if (this._remote.trace) {
	      log.info('response:', this._opts.url, message);
	    }

	    var command = request.message.command;
	    var result = message.result;
	    var responseEvent = 'response_' + command;

	    request.emit('success', result);

	    [ this, this._remote ].forEach(function(emitter) {
	      emitter.emit(responseEvent, result, request, message);
	    });
	  } else if (message.error) {
	    if (this._remote.trace) {
	      log.info('error:', this._opts.url, message);
	    }

	    var error = {
	      error: 'remoteError',
	      error_message: 'Remote reported an error.',
	      remote: message
	    };

	    request.emit('error', error);
	  }
	};

	Server.prototype._handlePathFind = function(message) {
	  if (this._remote.trace) {
	    log.info('find_path:', this._opts.url, message);
	  }
	};

	/**
	 * Handle subscription response messages. Subscription response
	 * messages indicate that a connection to the server is ready
	 *
	 * @api private
	 */

	Server.prototype._handleResponseSubscribe = function(message) {
	  if (~(Server.onlineStates.indexOf(message.server_status))) {
	    this._setState('online');
	  }
	  if (Server.isLoadStatus(message)) {
	    this._load_base    = message.load_base || 256;
	    this._load_factor  = message.load_factor || 256;
	    this._fee_ref      = message.fee_ref;
	    this._fee_base     = message.fee_base;
	    this._reserve_base = message.reserve_base;
	    this._reserve_inc  = message.reserve_inc;
	  }
	};

	/**
	 * Check that received message from rippled is valid
	 *
	 * @api private
	 */

	Server.isValidMessage = function(message) {
	  return (typeof message === 'object')
	      && (typeof message.type === 'string');
	};

	/**
	 * Check that received serverStatus message contains
	 * load status information
	 *
	 * @api private
	 */

	Server.isLoadStatus = function(message) {
	  return (typeof message.load_base === 'number')
	      && (typeof message.load_factor === 'number');
	};

	/**
	 * Send JSON message to rippled WebSocket server
	 *
	 * @param {JSON-Stringifiable} message
	 * @api private
	 */

	Server.prototype._sendMessage = function(message) {
	  if (this._ws) {
	    if (this._remote.trace) {
	      log.info('request:', this._opts.url, message);
	    }
	    this._ws.send(JSON.stringify(message));
	  }
	};

	/**
	 * Submit a Request object.
	 *
	 * Requests are indexed by message ID, which is repeated
	 * in the response from rippled WebSocket server
	 *
	 * @param {Request} request
	 * @api private
	 */

	Server.prototype._request = function(request) {
	  var self  = this;

	  // Only bother if we are still connected.
	  if (!this._ws) {
	    if (this._remote.trace) {
	      log.info('request: DROPPING:', self._opts.url, request.message);
	    }
	    return;
	  }

	  request.server = this;
	  request.message.id = this._id;
	  request.time = Date.now();

	  this._requests[request.message.id] = request;

	  // Advance message ID
	  this._id++;

	  function sendRequest() {
	    self._sendMessage(request.message);
	  };

	  if (this._isConnected(request)) {
	    sendRequest();
	  } else {
	    // XXX There are many ways to make this smarter.
	    this.once('connect', sendRequest);
	  }
	};

	Server.prototype._isConnected = function(request) {
	  var isSubscribeRequest = request
	    && request.message.command === 'subscribe'
	    && this._ws.readyState === 1;

	  return this._connected || (this._ws && isSubscribeRequest);
	};

	/**
	 * Calculate transaction fee
	 *
	 * @param {Transaction|Number} Fee units for a provided transaction
	 * @return {Number} Final fee in XRP for specified number of fee units
	 * @api private
	 */

	Server.prototype._computeFee = function(transaction) {
	  var units;

	  if (transaction instanceof Transaction) {
	    units = transaction._getFeeUnits();
	  } else if (typeof transaction === 'number') {
	    units = transaction;
	  } else {
	    throw new Error('Invalid argument');
	  }

	  return this._feeTx(units).to_json();
	};

	/**
	 * Calculate a transaction fee for a number of tx fee units.
	 *
	 * This takes into account the last known network and local load fees.
	 *
	 * @param {Number} Fee units for a provided transaction
	 * @return {Amount} Final fee in XRP for specified number of fee units.
	 */

	Server.prototype._feeTx = function(units) {
	  var fee_unit = this._feeTxUnit();
	  return Amount.from_json(String(Math.ceil(units * fee_unit)));
	};

	/**
	 * Get the current recommended transaction fee unit.
	 *
	 * Multiply this value with the number of fee units in order to calculate the
	 * recommended fee for the transaction you are trying to submit.
	 *
	 * @return {Number} Recommended amount for one fee unit as float.
	 */

	Server.prototype._feeTxUnit = function() {
	  var fee_unit = this._fee_base / this._fee_ref;

	  // Apply load fees
	  fee_unit *= this._load_factor / this._load_base;

	  // Apply fee cushion (a safety margin in case fees rise since we were last updated)
	  fee_unit *= this._fee_cushion;

	  return fee_unit;
	};

	/**
	 * Get the current recommended reserve base.
	 *
	 * Returns the base reserve with load fees and safety margin applied.
	 */

	Server.prototype._reserve = function(ownerCount) {
	  var reserve_base = Amount.from_json(String(this._reserve_base));
	  var reserve_inc  = Amount.from_json(String(this._reserve_inc));
	  var owner_count  = ownerCount || 0;

	  if (owner_count < 0) {
	    throw new Error('Owner count must not be negative.');
	  }

	  return reserve_base.add(reserve_inc.product_human(owner_count));
	};

	exports.Server = Server;

	// vim:sw=2:sts=2:ts=8:et


/***/ },
/* 21 */
/***/ function(module, exports, __webpack_require__) {

	// This object serves as a singleton to store config options

	var extend = __webpack_require__(42);

	var config = module.exports = {
	  load: function (newOpts) {
	    extend(config, newOpts);
	    return config;
	  }
	};


/***/ },
/* 22 */
/***/ function(module, exports, __webpack_require__) {

	// Routines for working with an orderbook.
	//
	// One OrderBook object represents one half of an order book. (i.e. bids OR
	// asks) Which one depends on the ordering of the parameters.
	//
	// Events:
	//  - transaction   A transaction that affects the order book.

	// var network = require("./network.js");

	var util         = __webpack_require__(36);
	var EventEmitter = __webpack_require__(35).EventEmitter;
	var extend       = __webpack_require__(42);
	var Amount       = __webpack_require__(3).Amount;
	var UInt160      = __webpack_require__(8).UInt160;
	var Currency     = __webpack_require__(6).Currency;

	function OrderBook(remote, currency_gets, issuer_gets, currency_pays, issuer_pays, key) {
	  EventEmitter.call(this);

	  var self = this;

	  this._remote        = remote;
	  this._currency_gets = currency_gets;
	  this._issuer_gets   = issuer_gets;
	  this._currency_pays = currency_pays;
	  this._issuer_pays   = issuer_pays;
	  this._subs          = 0;
	  this._key           = key;

	  // We consider ourselves synchronized if we have a current copy of the offers,
	  // we are online and subscribed to updates.
	  this._sync = false;

	  // Offers
	  this._offers = [ ];

	  function listenerAdded(type, listener) {
	    if (~OrderBook.subscribe_events.indexOf(type)) {
	      self._subs += 1;
	      if (self._subs === 1 && self._remote._connected) {
	        self._subscribe();
	      }
	    }
	  };

	  this.on('newListener', listenerAdded);

	  function listenerRemoved(type, listener) {
	    if (~OrderBook.subscribe_events.indexOf(type)) {
	      self._subs -= 1;
	      if (!self._subs && self._remote._connected) {
	        self._sync = false;
	        self._remote.request_unsubscribe()
	        .books([self.to_json()])
	        .request();
	      }
	    }
	  };

	  this.on('removeListener', listenerRemoved);

	  // ST: This *should* call _prepareSubscribe.
	  this._remote.on('prepare_subscribe', function(request) {
	    self._subscribe(request);
	  });

	  function remoteDisconnected() {
	    self._sync = false;
	  };

	  this._remote.on('disconnect', remoteDisconnected);

	  return this;
	};

	util.inherits(OrderBook, EventEmitter);

	/**
	 * List of events that require a remote subscription to the orderbook.
	 */
	OrderBook.subscribe_events = ['transaction', 'model', 'trade'];

	/**
	 * Subscribes to orderbook.
	 *
	 * @private
	 */
	OrderBook.prototype._subscribe = function (request) {
	  var self = this;

	  if (self.is_valid() && self._subs) {
	    var request = this._remote.request_subscribe();
	    request.addBook(self.to_json(), true);

	    request.once('success', function(res) {
	      self._sync   = true;
	      self._offers = res.offers;
	      self.emit('model', self._offers);
	    });

	    request.once('error', function(err) {
	      // XXX What now?
	    });

	    request.request();
	  }
	};

	/**
	 * Adds this orderbook to a subscription request.

	// ST: Currently this is not working because the server cannot give snapshots
	//     for more than one order book in the same subscribe message.

	OrderBook.prototype._prepareSubscribe = function (request) {
	  var self = this;
	  if (self.is_valid() && self._subs) {
	    request.addBook(self.to_json(), true);
	    request.once('success', function(res) {
	      self._sync   = true;
	      self._offers = res.offers;
	      self.emit('model', self._offers);
	    });
	    request.once('error', function(err) {
	      // XXX What now?
	    });
	  }
	};
	 */

	OrderBook.prototype.to_json = function () {
	  var json = {
	    taker_gets: {
	      currency: this._currency_gets
	    },
	    taker_pays: {
	      currency: this._currency_pays
	    }
	  };

	  if (this._currency_gets !== 'XPS') {
	    json.taker_gets.issuer = this._issuer_gets;
	  }

	  if (this._currency_pays !== 'XPS') {
	    json.taker_pays.issuer = this._issuer_pays;
	  }

	  return json;
	};

	/**
	 * Whether the OrderBook is valid.
	 *
	 * Note: This only checks whether the parameters (currencies and issuer) are
	 *       syntactically valid. It does not check anything against the ledger.
	 */
	OrderBook.prototype.is_valid = function () {
	  // XXX Should check for same currency (non-native) && same issuer
	  return (
	    Currency.is_valid(this._currency_pays) &&
	    (this._currency_pays === 'XPS' || UInt160.is_valid(this._issuer_pays)) &&
	    Currency.is_valid(this._currency_gets) &&
	    (this._currency_gets === 'XPS' || UInt160.is_valid(this._issuer_gets)) &&
	    !(this._currency_pays === 'XPS' && this._currency_gets === 'XPS')
	  );
	};

	OrderBook.prototype.trade = function(type) {
	  var tradeXpr = '0'
	  + ((this['_currency_' + type] === 'XPS') ? '' : '/'
	     + this['_currency_' + type ] + '/'
	     + this['_issuer_' + type]);
	  return Amount.from_json(tradeXpr);
	};

	/**
	 * Notify object of a relevant transaction.
	 *
	 * This is only meant to be called by the Remote class. You should never have to
	 * call this yourself.
	 */
	OrderBook.prototype.notify = function (message) {
	  var self       = this;
	  var changed    = false;
	  var trade_gets = this.trade('gets');
	  var trade_pays = this.trade('pays');

	  function handleTransaction(an) {
	    if (an.entryType !== 'Offer' || an.bookKey !== self._key) {
	      return;
	    }

	    var i, l, offer;

	    switch(an.diffType) {
	      case 'DeletedNode':
	      case 'ModifiedNode':
	        var deletedNode = an.diffType === 'DeletedNode';

	        for (i=0, l=self._offers.length; i<l; i++) {
	          offer = self._offers[i];

	          if (offer.index === an.ledgerIndex) {
	            if (deletedNode) {
	              self._offers.splice(i, 1);
	            } else {
	              // TODO: This assumes no fields are deleted, which is probably a
	              // safe assumption, but should be checked.
	              extend(offer, an.fieldsFinal);
	            }

	            changed = true;
	            break;
	          }
	        }

	        // We don't want to count a OfferCancel as a trade
	        if (message.transaction.TransactionType === 'OfferCancel') {
	          return;
	        }

	        trade_gets = trade_gets.add(an.fieldsPrev.TakerGets);
	        trade_pays = trade_pays.add(an.fieldsPrev.TakerPays);

	        if (!deletedNode) {
	          trade_gets = trade_gets.subtract(an.fieldsFinal.TakerGets);
	          trade_pays = trade_pays.subtract(an.fieldsFinal.TakerPays);
	        }
	        break;

	      case 'CreatedNode':
	        // XXX Should use Amount#from_quality
	        var price = Amount.from_json(an.fields.TakerPays).ratio_human(an.fields.TakerGets, {reference_date: new Date()});

	        for (i = 0, l = self._offers.length; i < l; i++) {
	          offer = self._offers[i];
	          var priceItem = Amount.from_json(offer.TakerPays).ratio_human(offer.TakerGets, {reference_date: new Date()});

	          if (price.compareTo(priceItem) <= 0) {
	            var obj   = an.fields;
	            obj.index = an.ledgerIndex;
	            self._offers.splice(i, 0, an.fields);
	            changed = true;
	            break;
	          }
	        }
	        break;
	    }
	  };

	  message.mmeta.each(handleTransaction);

	  // Only trigger the event if the account object is actually
	  // subscribed - this prevents some weird phantom events from
	  // occurring.
	  if (this._subs) {
	    this.emit('transaction', message);
	    if (changed) {
	      this.emit('model', this._offers);
	    }
	    if (!trade_gets.is_zero()) {
	      this.emit('trade', trade_pays, trade_gets);
	    }
	  }
	};

	OrderBook.prototype.notifyTx = OrderBook.prototype.notify;

	/**
	 * Get offers model asynchronously.
	 *
	 * This function takes a callback and calls it with an array containing the
	 * current set of offers in this order book.
	 *
	 * If the data is available immediately, the callback may be called synchronously.
	 */
	OrderBook.prototype.offers = function (callback) {
	  var self = this;

	  if (typeof callback === 'function') {
	    if (this._sync) {
	      callback(this._offers);
	    } else {
	      this.once('model', callback);
	    }
	  }

	  return this;
	};

	/**
	 * Return latest known offers.
	 *
	 * Usually, this will just be an empty array if the order book hasn't been
	 * loaded yet. But this accessor may be convenient in some circumstances.
	 */
	OrderBook.prototype.offersSync = function () {
	  return this._offers;
	};

	exports.OrderBook = OrderBook;

	// vim:sw=2:sts=2:ts=8:et


/***/ },
/* 23 */
/***/ function(module, exports, __webpack_require__) {

	var EventEmitter = __webpack_require__(35).EventEmitter;
	var util         = __webpack_require__(36);
	var Amount       = __webpack_require__(3).Amount;
	var extend       = __webpack_require__(42);

	/**
	 * Represents a persistent path finding request.
	 *
	 * Only one path find request is allowed per connection, so when another path
	 * find request is triggered it will supercede the existing one, making it emit
	 * the 'end' and 'superceded' events.
	 */
	function PathFind(remote, src_account, dst_account, dst_amount, src_currencies) {
	  EventEmitter.call(this);

	  this.remote = remote;

	  this.src_account    = src_account;
	  this.dst_account    = dst_account;
	  this.dst_amount     = dst_amount;
	  this.src_currencies = src_currencies;
	};

	util.inherits(PathFind, EventEmitter);

	/**
	 * Submits a path_find_create request to the network.
	 *
	 * This starts a path find request, superceding all previous path finds.
	 *
	 * This will be called automatically by Remote when this object is instantiated,
	 * so you should only have to call it if the path find was closed or superceded
	 * and you wish to restart it.
	 */
	PathFind.prototype.create = function () {
	  var self = this;

	  var req = this.remote.request_path_find_create(this.src_account,
	                                                 this.dst_account,
	                                                 this.dst_amount,
	                                                 this.src_currencies,
	                                                 handleInitialPath);

	  function handleInitialPath(err, msg) {
	    if (err) {
	      self.emit('error', err);
	    } else {
	      self.notify_update(msg);
	    }
	  }

	  // XXX We should add ourselves to prepare_subscribe or a similar mechanism so
	  // that we can resubscribe after a reconnection.

	  req.request();
	};

	PathFind.prototype.close = function () {
	  this.remote.request_path_find_close().request();
	  this.emit('end');
	  this.emit('close');
	};

	PathFind.prototype.notify_update = function (message) {
	  var src_account = message.source_account;
	  var dst_account = message.destination_account;
	  var dst_amount  = Amount.from_json(message.destination_amount);

	  // Only pass the event along if this path find response matches what we were
	  // looking for.
	  if (this.src_account === src_account &&
	      this.dst_account === dst_account &&
	      this.dst_amount.equals(dst_amount)) {
	    this.emit('update', message);
	  }
	};

	PathFind.prototype.notify_superceded = function () {
	  // XXX If we're set to re-subscribe whenever we connect to a new server, then
	  // we should cancel that behavior here. See PathFind#create.

	  this.emit('end');
	  this.emit('superceded');
	};

	exports.PathFind = PathFind;


/***/ },
/* 24 */
/***/ function(module, exports, __webpack_require__) {

	var exports = module.exports = __webpack_require__(37);

	/**
	 * Log engine for browser consoles.
	 *
	 * Browsers tend to have better consoles that support nicely formatted
	 * JavaScript objects. This connector passes objects through to the logging
	 * function without any stringification.
	 */
	var InteractiveLogEngine = {
	  logObject: function (msg, obj) {
	    var args = Array.prototype.slice.call(arguments, 1);

	    args = args.map(function(arg) {
	      if (/MSIE/.test(navigator.userAgent)) {
	        return JSON.stringify(arg, null, 2);
	      } else {
	        return arg;
	      }
	    });

	    args.unshift(msg);

	    console.log.apply(console, args);
	  }
	};

	if (window.console && window.console.log) {
	  exports.Log.engine = InteractiveLogEngine;
	}


/***/ },
/* 25 */
/***/ function(module, exports, __webpack_require__) {

	var util         = __webpack_require__(36);
	var EventEmitter = __webpack_require__(35).EventEmitter;
	var Transaction  = __webpack_require__(5).Transaction;
	var RippleError  = __webpack_require__(13).RippleError;
	var PendingQueue = __webpack_require__(43).TransactionQueue;
	var log          = __webpack_require__(24).internal.sub('transactionmanager');

	/**
	 * @constructor TransactionManager
	 * @param {Account} account
	 */

	function TransactionManager(account) {
	  EventEmitter.call(this);

	  var self = this;

	  this._account           = account;
	  this._accountID         = account._account_id;
	  this._remote            = account._remote;
	  this._nextSequence      = void(0);
	  this._maxFee            = this._remote.max_fee;
	  this._submissionTimeout = this._remote._submission_timeout;
	  this._pending           = new PendingQueue();

	  // Query remote server for next account sequence number
	  this._loadSequence();

	  function transactionReceived(res) {
	    var transaction = TransactionManager.normalizeTransaction(res);
	    var sequence    = transaction.tx_json.Sequence;
	    var hash        = transaction.tx_json.hash;

	    if (!transaction.validated) {
	      return;
	    }

	    self._pending.addReceivedSequence(sequence);

	    // ND: we need to check against all submissions IDs
	    var submission = self._pending.getSubmission(hash);

	    if (self._remote.trace) {
	      log.info('transaction received:', transaction.tx_json);
	    }

	    if (submission instanceof Transaction) {
	      // ND: A `success` handler will `finalize` this later
	      submission.emit('success', transaction);
	    } else {
	      self._pending.addReceivedId(hash, transaction);
	    }
	  };

	  this._account.on('transaction-outbound', transactionReceived);

	  this._remote.on('load_changed', this._adjustFees.bind(this));

	  function updatePendingStatus(ledger) {
	    self._pending.forEach(function(pending) {
	      switch (ledger.ledger_index - pending.submitIndex) {
	        case 8:
	          pending.emit('lost', ledger);
	          break;
	        case 4:
	          pending.emit('missing', ledger);
	          break;
	      }
	    });
	  };

	  this._remote.on('ledger_closed', updatePendingStatus);

	  function remoteReconnected(callback) {
	    var callback = (typeof callback === 'function') ? callback : function(){};

	    if (!self._pending.length) {
	      return callback();
	    }

	    //Load account transaction history
	    var options = {
	      account: self._accountID,
	      ledger_index_min: -1,
	      ledger_index_max: -1,
	      binary: true,
	      parseBinary: true,
	      limit: 100,
	      filter: 'outbound'
	    };

	    function accountTx(err, transactions) {
	      if (!err && Array.isArray(transactions.transactions)) {
	        transactions.transactions.forEach(transactionReceived);
	      }

	      self._remote.on('ledger_closed', updatePendingStatus);

	      //Load next transaction sequence
	      self._loadSequence(self._resubmit.bind(self));

	      callback();
	    };

	    self._remote.requestAccountTx(options, accountTx);

	    self.emit('reconnect');
	  };

	  function remoteDisconnected() {
	    self._remote.once('connect', remoteReconnected);
	    self._remote.removeListener('ledger_closed', updatePendingStatus);
	  };

	  this._remote.on('disconnect', remoteDisconnected);

	  function saveTransaction(transaction) {
	    self._remote.storage.saveTransaction(transaction.summary());
	  };

	  if (this._remote.storage) {
	    this.on('save', saveTransaction);
	  }
	};

	util.inherits(TransactionManager, EventEmitter);

	//Normalize transactions received from account
	//transaction stream and account_tx
	TransactionManager.normalizeTransaction = function(tx) {
	  var transaction = { };

	  Object.keys(tx).forEach(function(key) {
	    transaction[key] = tx[key];
	  });

	  if (!tx.engine_result) {
	    // account_tx
	    transaction = {
	      engine_result:  tx.meta.TransactionResult,
	      tx_json:        tx.tx,
	      hash:           tx.tx.hash,
	      ledger_index:   tx.tx.ledger_index,
	      meta:           tx.meta,
	      type:           'transaction',
	      validated:      true
	    };

	    transaction.result = transaction.engine_result;
	    transaction.result_message = transaction.engine_result_message;
	  }

	  if (!transaction.metadata) {
	    transaction.metadata = transaction.meta;
	  }

	  if (!transaction.tx_json) {
	    transaction.tx_json = transaction.transaction;
	  }

	  delete transaction.transaction;
	  delete transaction.mmeta;
	  delete transaction.meta;

	  return transaction;
	};

	// Transaction fees are adjusted in real-time
	TransactionManager.prototype._adjustFees = function(loadData) {
	  // ND: note, that `Fee` is a component of a transactionID
	  var self = this;

	  if (!this._remote.local_fee) {
	    return;
	  }

	  this._pending.forEach(function(pending) {
	    var oldFee = pending.tx_json.Fee;
	    var newFee = pending._computeFee();

	    function maxFeeExceeded() {
	      pending.once('presubmit', function() {
	        pending.emit('error', 'tejMaxFeeExceeded');
	      });
	    };

	    if (Number(newFee) > self._maxFee) {
	      return maxFeeExceeded();
	    }

	    pending.tx_json.Fee = newFee;
	    pending.emit('fee_adjusted', oldFee, newFee);

	    if (self._remote.trace) {
	      log.info('fee adjusted:', pending.tx_json, oldFee, newFee);
	    }
	  });
	};

	//Fill an account transaction sequence
	TransactionManager.prototype._fillSequence = function(tx, callback) {
	  var self = this;

	  function submitFill(sequence, callback) {
	    var fill = self._remote.transaction();
	    fill.account_set(self._accountID);
	    fill.tx_json.Sequence = sequence;
	    fill.once('submitted', callback);

	    // Secrets may be set on a per-transaction basis
	    if (tx._secret) {
	      fill.secret(tx._secret);
	    }

	    fill.submit();
	  };

	  function sequenceLoaded(err, sequence) {
	    if (typeof sequence !== 'number') {
	      return callback(new Error('Failed to fetch account transaction sequence'));
	    }

	    var sequenceDif = tx.tx_json.Sequence - sequence;
	    var submitted = 0;

	    ;(function nextFill(sequence) {
	      if (sequence >= tx.tx_json.Sequence) {
	        return;
	      }

	      submitFill(sequence, function() {
	        if (++submitted === sequenceDif) {
	          callback();
	        } else {
	          nextFill(sequence + 1);
	        }
	      });
	    })(sequence);
	  };

	  this._loadSequence(sequenceLoaded);
	};

	TransactionManager.prototype._loadSequence = function(callback) {
	  var self = this;

	  function sequenceLoaded(err, sequence) {
	    if (typeof sequence === 'number') {
	      self._nextSequence = sequence;
	      self.emit('sequence_loaded', sequence);
	      if (typeof callback === 'function') {
	        callback(err, sequence);
	      }
	    } else {
	      setTimeout(function() {
	        self._loadSequence(callback);
	      }, 1000 * 3);
	    }
	  };

	  this._account.getNextSequence(sequenceLoaded);
	};

	TransactionManager.prototype._resubmit = function(ledgers, pending) {
	  var self = this;
	  var pending = pending ? [ pending ] : this._pending;
	  var ledgers = Number(ledgers) || 0;

	  function resubmitTransaction(pending) {
	    if (!pending || pending.finalized) {
	      // Transaction has been finalized, nothing to do
	      return;
	    }

	    var hashCached = pending.findId(self._pending._idCache);

	    if (self._remote.trace) {
	      log.info('resubmit:', pending.tx_json);
	    }

	    if (hashCached) {
	      return pending.emit('success', hashCached);
	    }

	    while (self._pending.hasSequence(pending.tx_json.Sequence)) {
	      //Sequence number has been consumed by another transaction
	      pending.tx_json.Sequence += 1;

	      if (self._remote.trace) {
	        log.info('incrementing sequence:', pending.tx_json);
	      }
	    }

	    self._request(pending);
	  };

	  function resubmitTransactions() {
	    ;(function nextTransaction(i) {
	      var transaction = pending[i];

	      if (!(transaction instanceof Transaction)) {
	        return;
	      }

	      transaction.once('submitted', function(m) {
	        transaction.emit('resubmitted', m);

	        self._loadSequence();

	        if (++i < pending.length) {
	          nextTransaction(i);
	        }
	      });

	      resubmitTransaction(transaction);
	    })(0);
	  };

	  this._waitLedgers(ledgers, resubmitTransactions);
	};

	TransactionManager.prototype._waitLedgers = function(ledgers, callback) {
	  if (ledgers < 1) {
	    return callback();
	  }

	  var self = this;
	  var closes = 0;

	  function ledgerClosed() {
	    if (++closes < ledgers) {
	      return;
	    }

	    self._remote.removeListener('ledger_closed', ledgerClosed);

	    callback();
	  };

	  this._remote.on('ledger_closed', ledgerClosed);
	};

	TransactionManager.prototype._request = function(tx) {
	  var self   = this;
	  var remote = this._remote;

	  if (tx.attempts > 10) {
	    return tx.emit('error', new RippleError('tejAttemptsExceeded'));
	  }

	  if (tx.attempts > 0 && !remote.local_signing) {
	    var message = ''
	    + 'It is not possible to resubmit transactions automatically safely without '
	    + 'synthesizing the transactionID locally. See `local_signing` config option';

	    return tx.emit('error', new RippleError('tejLocalSigningRequired', message));
	  }

	  tx.emit('presubmit');

	  if (tx.finalized) {
	    return;
	  }

	  if (remote.trace) {
	    log.info('submit transaction:', tx.tx_json);
	  }

	  function transactionProposed(message) {
	    if (tx.finalized) {
	      return;
	    }

	    // If server is honest, don't expect a final if rejected.
	    message.rejected = tx.isRejected(message.engine_result_code);

	    tx.emit('proposed', message);
	  };

	  function transactionFailed(message) {
	    if (tx.finalized) {
	      return;
	    }

	    switch (message.engine_result) {
	      case 'tefPAST_SEQ':
	        self._resubmit(1, tx);
	        break;
	      default:
	        tx.emit('error', message);
	    }
	  };

	  function transactionRetry(message) {
	    if (tx.finalized) {
	      return;
	    }

	    self._fillSequence(tx, function() {
	      self._resubmit(1, tx);
	    });
	  };

	  function transactionFeeClaimed(message) {
	    if (tx.finalized) {
	      return;
	    }

	    tx.emit('error', message);
	  };

	  function transactionFailedLocal(message) {
	    if (tx.finalized) {
	      return;
	    }

	    if (self._remote.local_fee && (message.engine_result === 'telINSUF_FEE_P')) {
	      self._resubmit(2, tx);
	    } else {
	      submissionError(message);
	    }
	  };

	  function submissionError(error) {
	    // Finalized (e.g. aborted) transactions must stop all activity
	    if (tx.finalized) {
	      return;
	    }

	    if (TransactionManager._isTooBusy(error)) {
	      self._resubmit(1, tx);
	    } else {
	      self._nextSequence--;
	      tx.emit('error', error);
	    }
	  };

	  function submitted(message) {
	    // Finalized (e.g. aborted) transactions must stop all activity
	    if (tx.finalized) {
	      return;
	    }

	    // ND: If for some unknown reason our hash wasn't computed correctly this is
	    // an extra measure.
	    if (message.tx_json && message.tx_json.hash) {
	      tx.addId(message.tx_json.hash);
	    }

	    message.result = message.engine_result || '';

	    tx.result = message;

	    if (remote.trace) {
	      log.info('submit response:', message);
	    }

	    tx.emit('submitted', message);

	    switch (message.result.slice(0, 3)) {
	      case 'tes':
	        transactionProposed(message);
	        break;
	      case 'tec':
	        transactionFeeClaimed(message);
	        break;
	      case 'ter':
	        if (message.result == 'terRETRY') {
	          transactionRetry(message);
	        } else {
	          transactionFailed(message);
	        }
	        break;
	      case 'tef':
	        transactionFailed(message);
	        break;
	      case 'tel':
	        transactionFailedLocal(message);
	        break;
	      default:
	        // tem
	        submissionError(message);
	    }
	  };

	  var submitRequest = remote.requestSubmit();

	  submitRequest.once('error', submitted);
	  submitRequest.once('success', submitted);

	  function prepareSubmit() {
	    if (remote.local_signing) {
	      // TODO: We are serializing twice, when we could/should be feeding the
	      // tx_blob to `tx.hash()` which rebuilds it to sign it.
	      submitRequest.tx_blob(tx.serialize().to_hex());

	      // ND: ecdsa produces a random `TxnSignature` field value, a component of
	      // the hash. Attempting to identify a transaction via a hash synthesized
	      // locally while using remote signing is inherently flawed.
	      tx.addId(tx.hash());
	    } else {
	      // ND: `build_path` is completely ignored when doing local signing as
	      // `Paths` is a component of the signed blob, the `tx_blob` is signed,
	      // sealed and delivered, and the txn unmodified.
	      // TODO: perhaps an exception should be raised if build_path is attempted
	      // while local signing
	      submitRequest.build_path(tx._build_path);
	      submitRequest.secret(tx._secret);
	      submitRequest.tx_json(tx.tx_json);
	    }

	    if (tx._server) {
	      submitRequest.server = tx._server;
	    }

	    submitTransaction();
	  };

	  function requestTimeout() {
	    // ND: What if the response is just slow and we get a response that
	    // `submitted` above will cause to have concurrent resubmit logic streams?
	    // It's simpler to just mute handlers and look out for finalized
	    // `transaction` messages.

	    // ND: We should audit the code for other potential multiple resubmit
	    // streams. Connection/reconnection could be one? That's why it's imperative
	    // that ALL transactionIDs sent over network are tracked.

	    // Finalized (e.g. aborted) transactions must stop all activity
	    if (tx.finalized) {
	      return;
	    }

	    tx.emit('timeout');

	    if (remote._connected) {
	      if (remote.trace) {
	        log.info('timeout:', tx.tx_json);
	      }
	      self._resubmit(3, tx);
	    }
	  };

	  function submitTransaction() {
	    if (tx.finalized) {
	      return;
	    }

	    submitRequest.timeout(self._submissionTimeout, requestTimeout);
	    submitRequest.broadcast();

	    tx.attempts++;
	    tx.emit('postsubmit');
	  };

	  tx.submitIndex = this._remote._ledger_current_index;

	  if (tx.attempts === 0) {
	    tx.initialSubmitIndex = tx.submitIndex;
	  }

	  if (remote.local_signing) {
	    tx.sign(prepareSubmit);
	  } else {
	    prepareSubmit();
	  }

	  return submitRequest;
	};

	TransactionManager._isNoOp = function(transaction) {
	  return (typeof transaction === 'object')
	      && (typeof transaction.tx_json === 'object')
	      && (transaction.tx_json.TransactionType === 'AccountSet')
	      && (transaction.tx_json.Flags === 0);
	};

	TransactionManager._isRemoteError = function(error) {
	  return (typeof error === 'object')
	      && (error.error === 'remoteError')
	      && (typeof error.remote === 'object');
	};

	TransactionManager._isNotFound = function(error) {
	  return TransactionManager._isRemoteError(error)
	      && /^(txnNotFound|transactionNotFound)$/.test(error.remote.error);
	};

	TransactionManager._isTooBusy = function(error) {
	  return TransactionManager._isRemoteError(error)
	      && (error.remote.error === 'tooBusy');
	};

	/**
	 * Entry point for TransactionManager submission
	 *
	 * @param {Transaction} tx
	 */

	TransactionManager.prototype.submit = function(tx) {
	  var self = this;
	  var remote = this._remote;

	  // If sequence number is not yet known, defer until it is.
	  if (typeof this._nextSequence !== 'number') {
	    this.once('sequence_loaded', this.submit.bind(this, tx));
	    return;
	  }

	  // Finalized (e.g. aborted) transactions must stop all activity
	  if (tx.finalized) {
	    return;
	  }

	  function cleanup(message) {
	    // ND: We can just remove this `tx` by identity
	    self._pending.remove(tx);
	    tx.emit('final', message);
	    if (remote.trace) {
	      log.info('transaction finalized:', tx.tx_json, self._pending.getLength());
	    }
	  };

	  tx.once('cleanup', cleanup);

	  tx.on('save', function() {
	    self.emit('save', tx);
	  });

	  tx.once('error', function(message) {
	    tx._errorHandler(message);
	  });

	  tx.once('success', function(message) {
	    tx._successHandler(message);
	  });

	  tx.once('abort', function() {
	    tx.emit('error', new RippleError('tejAbort', 'Transaction aborted'));
	  });

	  if (typeof tx.tx_json.Sequence !== 'number') {
	    tx.tx_json.Sequence = this._nextSequence++;
	  }

	  // Attach secret, associate transaction with a server, attach fee.
	  // If the transaction can't complete, decrement sequence so that
	  // subsequent transactions
	  if (!tx.complete()) {
	    this._nextSequence--;
	    return;
	  }

	  tx.attempts = 0;

	  // ND: this is the ONLY place we put the tx into the queue. The
	  // TransactionQueue queue is merely a list, so any mutations to tx._hash
	  // will cause subsequent look ups (eg. inside 'transaction-outbound'
	  // validated transaction clearing) to fail.
	  this._pending.push(tx);
	  this._request(tx);
	};

	exports.TransactionManager = TransactionManager;


/***/ },
/* 26 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(Buffer) {var sjcl        = __webpack_require__(19).sjcl;
	var base        = __webpack_require__(7).Base;
	var Seed        = __webpack_require__(10).Seed;
	var UInt160     = __webpack_require__(8).UInt160;
	var UInt256     = __webpack_require__(9).UInt256;
	var request     = __webpack_require__(49);
	var querystring = __webpack_require__(50);
	var extend      = __webpack_require__(42);
	var parser      = __webpack_require__(41);
	var ripemd160   = __webpack_require__(57);
	var Crypt       = { };

	var cryptConfig = {
	  cipher : 'aes',
	  mode   : 'ccm',
	  ts     : 64,   // tag length
	  ks     : 256,  // key size
	  iter   : 1000  // iterations (key derivation)
	};

	/**
	 * Full domain hash based on SHA512
	 */

	function fdh(data, bytelen) {
	  var bitlen = bytelen << 3;

	  if (typeof data === 'string') {
	    data = sjcl.codec.utf8String.toBits(data);
	  }

	  // Add hashing rounds until we exceed desired length in bits
	  var counter = 0, output = [];

	  while (sjcl.bitArray.bitLength(output) < bitlen) {
	    var hash = sjcl.hash.sha512.hash(sjcl.bitArray.concat([counter], data));
	    output = sjcl.bitArray.concat(output, hash);
	    counter++;
	  }

	  // Truncate to desired length
	  output = sjcl.bitArray.clamp(output, bitlen);

	  return output;
	};

	/**
	 * This is a function to derive different hashes from the same key. 
	 * Each hash is derived as HMAC-SHA512HALF(key, token).
	 *
	 * @param {string} key
	 * @param {string} hash
	 */

	function keyHash(key, token) {
	  var hmac = new sjcl.misc.hmac(key, sjcl.hash.sha512);
	  return sjcl.codec.hex.fromBits(sjcl.bitArray.bitSlice(hmac.encrypt(token), 0, 256));
	};

	/****** exposed functions ******/

	/**
	 * KEY DERIVATION FUNCTION
	 *
	 * This service takes care of the key derivation, i.e. converting low-entropy
	 * secret into higher entropy secret via either computationally expensive
	 * processes or peer-assisted key derivation (PAKDF).
	 *
	 * @param {object}    opts
	 * @param {string}    purpose - Key type/purpose
	 * @param {string}    username
	 * @param {string}    secret - Also known as passphrase/password
	 * @param {function}  fn
	 */

	Crypt.derive = function(opts, purpose, username, secret, fn) {
	  var tokens;

	  if (purpose === 'login') {
	    tokens = ['id', 'crypt'];
	  } else {
	    tokens = ['unlock'];
	  }

	  var iExponent = new sjcl.bn(String(opts.exponent));
	  var iModulus  = new sjcl.bn(String(opts.modulus));
	  var iAlpha    = new sjcl.bn(String(opts.alpha));

	  var publicInfo = [ 'PAKDF_1_0_0', opts.host.length, opts.host, username.length, username, purpose.length, purpose ].join(':') + ':';
	  var publicSize = Math.ceil(Math.min((7 + iModulus.bitLength()) >>> 3, 256) / 8);
	  var publicHash = fdh(publicInfo, publicSize);
	  var publicHex  = sjcl.codec.hex.fromBits(publicHash);
	  var iPublic    = new sjcl.bn(String(publicHex)).setBitM(0);
	  var secretInfo = [ publicInfo, secret.length, secret ].join(':') + ':';
	  var secretSize = (7 + iModulus.bitLength()) >>> 3;
	  var secretHash = fdh(secretInfo, secretSize);
	  var secretHex  = sjcl.codec.hex.fromBits(secretHash);
	  var iSecret    = new sjcl.bn(String(secretHex)).mod(iModulus);

	  if (iSecret.jacobi(iModulus) !== 1) {
	    iSecret = iSecret.mul(iAlpha).mod(iModulus);
	  }

	  var iRandom;

	  for (;;) {
	    iRandom = sjcl.bn.random(iModulus, 0);
	    if (iRandom.jacobi(iModulus) === 1) {
	      break;
	    }
	  }

	  var iBlind   = iRandom.powermodMontgomery(iPublic.mul(iExponent), iModulus);
	  var iSignreq = iSecret.mulmod(iBlind, iModulus);
	  var signreq  = sjcl.codec.hex.fromBits(iSignreq.toBits());

	  request.post(opts.url)
	    .send({ info: publicInfo, signreq: signreq })
	    .end(function(err, resp) {
	      if (err || !resp) {
	        return fn(new Error('Could not query PAKDF server ' + opts.host));
	      }

	      var data = resp.body || resp.text ? JSON.parse(resp.text) : {};

	      if (data.result !== 'success') {
	        return fn(new Error('Could not query PAKDF server '+opts.host));
	      }

	      var iSignres = new sjcl.bn(String(data.signres));
	      var iRandomInv = iRandom.inverseMod(iModulus);
	      var iSigned    = iSignres.mulmod(iRandomInv, iModulus);
	      var key        = iSigned.toBits();
	      var result     = { };

	      tokens.forEach(function(token) {
	        result[token] = keyHash(key, token);
	      });

	      fn(null, result);
	    });
	};

	/**
	 * Imported from ripple-client
	 */



	/**
	 * Encrypt data
	 *
	 * @param {string} key
	 * @param {string} data
	 */

	Crypt.encrypt = function(key, data) {
	  key = sjcl.codec.hex.toBits(key);

	  var opts = extend(true, {}, cryptConfig);

	  var encryptedObj = JSON.parse(sjcl.encrypt(key, data, opts));
	  var version = [sjcl.bitArray.partial(8, 0)];
	  var initVector = sjcl.codec.base64.toBits(encryptedObj.iv);
	  var ciphertext = sjcl.codec.base64.toBits(encryptedObj.ct);

	  var encryptedBits = sjcl.bitArray.concat(version, initVector);
	  encryptedBits = sjcl.bitArray.concat(encryptedBits, ciphertext);

	  return sjcl.codec.base64.fromBits(encryptedBits);
	};

	/**
	 * Decrypt data
	 *
	 * @param {string} key
	 * @param {string} data
	 */

	Crypt.decrypt = function (key, data) {
	  
	  key = sjcl.codec.hex.toBits(key);
	  var encryptedBits = sjcl.codec.base64.toBits(data);

	  var version = sjcl.bitArray.extract(encryptedBits, 0, 8);

	  if (version !== 0) {
	    throw new Error('Unsupported encryption version: '+version);
	  }

	  var encrypted = extend(true, {}, cryptConfig, {
	    iv: sjcl.codec.base64.fromBits(sjcl.bitArray.bitSlice(encryptedBits, 8, 8+128)),
	    ct: sjcl.codec.base64.fromBits(sjcl.bitArray.bitSlice(encryptedBits, 8+128))
	  });

	  return sjcl.decrypt(key, JSON.stringify(encrypted));
	};


	/**
	 * Validate a ripple address
	 *
	 * @param {string} address
	 */

	Crypt.isValidAddress = function (address) {
	  return UInt160.is_valid(address);
	};

	/**
	 * Create an encryption key
	 *
	 * @param {integer} nWords - number of words
	 */

	Crypt.createSecret = function (nWords) {
	  return sjcl.codec.hex.fromBits(sjcl.random.randomWords(nWords));
	};

	/**
	 * Create a new master key
	 */

	Crypt.createMaster = function () {
	  return base.encode_check(33, sjcl.codec.bytes.fromBits(sjcl.random.randomWords(4)));
	};


	/**
	 * Create a ripple address from a master key
	 *
	 * @param {string} masterkey
	 */

	Crypt.getAddress = function (masterkey) {
	  return Seed.from_json(masterkey).get_key().get_address().to_json();
	};

	/**
	 * Hash data using SHA-512.
	 *
	 * @param {string|bitArray} data
	 * @return {string} Hash of the data
	 */

	Crypt.hashSha512 = function (data) {
	  // XXX Should return a UInt512
	  return sjcl.codec.hex.fromBits(sjcl.hash.sha512.hash(data)); 
	};

	/**
	 * Hash data using SHA-512 and return the first 256 bits.
	 *
	 * @param {string|bitArray} data
	 * @return {UInt256} Hash of the data
	 */
	Crypt.hashSha512Half = function (data) {
	  return UInt256.from_hex(Crypt.hashSha512(data).substr(0, 64));
	};


	/**
	 * Sign a data string with a secret key
	 *
	 * @param {string} secret
	 * @param {string} data
	 */

	Crypt.signString = function(secret, data) {
	  var hmac = new sjcl.misc.hmac(sjcl.codec.hex.toBits(secret), sjcl.hash.sha512);
	  return sjcl.codec.hex.fromBits(hmac.mac(data));
	};

	/**
	 * Create an an accout recovery key
	 *
	 * @param {string} secret
	 */

	Crypt.deriveRecoveryEncryptionKeyFromSecret = function(secret) {
	  var seed = Seed.from_json(secret).to_bits();
	  var hmac = new sjcl.misc.hmac(seed, sjcl.hash.sha512);
	  var key  = hmac.mac('ripple/hmac/recovery_encryption_key/v1');
	  key      = sjcl.bitArray.bitSlice(key, 0, 256);
	  return sjcl.codec.hex.fromBits(key);
	};

	/**
	 * Convert base64 encoded data into base64url encoded data.
	 *
	 * @param {String} base64 Data
	 */

	Crypt.base64ToBase64Url = function(encodedData) {
	  return encodedData.replace(/\+/g, '-').replace(/\//g, '_').replace(/[=]+$/, '');
	};

	/**
	 * Convert base64url encoded data into base64 encoded data.
	 *
	 * @param {String} base64 Data
	 */

	Crypt.base64UrlToBase64 = function(encodedData) {
	  encodedData = encodedData.replace(/-/g, '+').replace(/_/g, '/');

	  while (encodedData.length % 4) {
	    encodedData += '=';
	  }

	  return encodedData;
	};

	/**
	 * ripemd160 buffer hash wrapper for bit arrays.
	 *
	 * @param {bitArray} bits The bit array to hash
	 *
	 * @return {bitArray} THe resulting hash
	 */

	Crypt.ripemd160 = function(bits) {
	  var buffer = new Buffer(sjcl.codec.hex.fromBits(bits), 'hex');
	  var result = ripemd160(buffer);
	  return sjcl.codec.hex.toBits(result.toString('hex'));
	};

	exports.Crypt = Crypt;
	
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(39).Buffer))

/***/ },
/* 27 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Prefix for hashing functions.
	 *
	 * These prefixes are inserted before the source material used to
	 * generate various hashes. This is done to put each hash in its own
	 * "space." This way, two different types of objects with the
	 * same binary data will produce different hashes.
	 *
	 * Each prefix is a 4-byte value with the last byte set to zero
	 * and the first three bytes formed from the ASCII equivalent of
	 * some arbitrary string. For example "TXN".
	 */

	// transaction plus signature to give transaction ID
	exports.HASH_TX_ID           = 0x54584E00; // 'TXN'
	// transaction plus metadata
	exports.HASH_TX_NODE         = 0x534E4400; // 'TND'
	// inner node in tree
	exports.HASH_INNER_NODE      = 0x4D494E00; // 'MIN'
	// leaf node in tree
	exports.HASH_LEAF_NODE       = 0x4D4C4E00; // 'MLN'
	// inner transaction to sign
	exports.HASH_TX_SIGN         = 0x53545800; // 'STX'
	// inner transaction to sign (TESTNET)
	exports.HASH_TX_SIGN_TESTNET = 0x73747800; // 'stx'


/***/ },
/* 28 */
/***/ function(module, exports, __webpack_require__) {

	// Convert a JavaScript number to IEEE-754 Double Precision
	// value represented as an array of 8 bytes (octets)
	//
	// Based on:
	// http://cautionsingularityahead.blogspot.com/2010/04/javascript-and-ieee754-redux.html
	//
	// Found and modified from:
	// https://gist.github.com/bartaz/1119041

	var Float = exports.Float = {};

	Float.toIEEE754 = function(v, ebits, fbits) {

	  var bias = (1 << (ebits - 1)) - 1;

	  // Compute sign, exponent, fraction
	  var s, e, f;
	  if (isNaN(v)) {
	    e = (1 << bias) - 1; f = 1; s = 0;
	  }
	  else if (v === Infinity || v === -Infinity) {
	    e = (1 << bias) - 1; f = 0; s = (v < 0) ? 1 : 0;
	  }
	  else if (v === 0) {
	    e = 0; f = 0; s = (1 / v === -Infinity) ? 1 : 0;
	  }
	  else {
	    s = v < 0;
	    v = Math.abs(v);

	    if (v >= Math.pow(2, 1 - bias)) {
	      var ln = Math.min(Math.floor(Math.log(v) / Math.LN2), bias);
	      e = ln + bias;
	      f = v * Math.pow(2, fbits - ln) - Math.pow(2, fbits);
	    }
	    else {
	      e = 0;
	      f = v / Math.pow(2, 1 - bias - fbits);
	    }
	  }

	  // Pack sign, exponent, fraction
	  var i, bits = [];
	  for (i = fbits; i; i -= 1) { bits.push(f % 2 ? 1 : 0); f = Math.floor(f / 2); }
	  for (i = ebits; i; i -= 1) { bits.push(e % 2 ? 1 : 0); e = Math.floor(e / 2); }
	  bits.push(s ? 1 : 0);
	  bits.reverse();
	  var str = bits.join('');

	  // Bits to bytes
	  var bytes = [];
	  while (str.length) {
	    bytes.push(parseInt(str.substring(0, 8), 2));
	    str = str.substring(8);
	  }
	  return bytes;
	}

	Float.fromIEEE754 = function(bytes, ebits, fbits) {

	  // Bytes to bits
	  var bits = [];
	  for (var i = bytes.length; i; i -= 1) {
	    var byte = bytes[i - 1];
	    for (var j = 8; j; j -= 1) {
	      bits.push(byte % 2 ? 1 : 0); byte = byte >> 1;
	    }
	  }
	  bits.reverse();
	  var str = bits.join('');

	  // Unpack sign, exponent, fraction
	  var bias = (1 << (ebits - 1)) - 1;
	  var s = parseInt(str.substring(0, 1), 2) ? -1 : 1;
	  var e = parseInt(str.substring(1, 1 + ebits), 2);
	  var f = parseInt(str.substring(1 + ebits), 2);

	  // Produce number
	  if (e === (1 << ebits) - 1) {
	    return f !== 0 ? NaN : s * Infinity;
	  }
	  else if (e > 0) {
	    return s * Math.pow(2, e - bias) * (1 + f / Math.pow(2, fbits));
	  }
	  else if (f !== 0) {
	    return s * Math.pow(2, -(bias-1)) * (f / Math.pow(2, fbits));
	  }
	  else {
	    return s * 0;
	  }
	}

	Float.fromIEEE754Double = function(b) { return Float.fromIEEE754(b, 11, 52); }
	Float.toIEEE754Double = function(v) { return   Float.toIEEE754(v, 11, 52); }
	Float.fromIEEE754Single = function(b) { return Float.fromIEEE754(b,  8, 23); }
	Float.toIEEE754Single = function(v) { return   Float.toIEEE754(v,  8, 23); }


	// Convert array of octets to string binary representation
	// by bartaz

	Float.toIEEE754DoubleString = function(v) {
	  return exports.toIEEE754Double(v)
	    .map(function(n){ for(n = n.toString(2);n.length < 8;n="0"+n); return n })
	    .join('')
	    .replace(/(.)(.{11})(.{52})/, "$1 $2 $3")
	}

/***/ },
/* 29 */
/***/ function(module, exports, __webpack_require__) {

	var utils   = __webpack_require__(19);
	var sjcl    = utils.sjcl;
	var config  = __webpack_require__(21);

	var BigInteger = utils.jsbn.BigInteger;

	//
	// Abstract UInt class
	//
	// Base class for UInt classes
	//

	var UInt = function() {
	  // Internal form: NaN or BigInteger
	  this._value  = NaN;

	  this._update();
	};

	UInt.json_rewrite = function(j, opts) {
	  return this.from_json(j).to_json(opts);
	};

	// Return a new UInt from j.
	UInt.from_generic = function(j) {
	  if (j instanceof this) {
	    return j.clone();
	  } else {
	    return (new this()).parse_generic(j);
	  }
	};

	// Return a new UInt from j.
	UInt.from_hex = function(j) {
	  if (j instanceof this) {
	    return j.clone();
	  } else {
	    return (new this()).parse_hex(j);
	  }
	};

	// Return a new UInt from j.
	UInt.from_json = function(j) {
	  if (j instanceof this) {
	    return j.clone();
	  } else {
	    return (new this()).parse_json(j);
	  }
	};

	// Return a new UInt from j.
	UInt.from_bits = function(j) {
	  if (j instanceof this) {
	    return j.clone();
	  } else {
	    return (new this()).parse_bits(j);
	  }
	};

	// Return a new UInt from j.
	UInt.from_bytes = function(j) {
	  if (j instanceof this) {
	    return j.clone();
	  } else {
	    return (new this()).parse_bytes(j);
	  }
	};

	// Return a new UInt from j.
	UInt.from_bn = function(j) {
	  if (j instanceof this) {
	    return j.clone();
	  } else {
	    return (new this()).parse_bn(j);
	  }
	};

	// Return a new UInt from j.
	UInt.from_number = function(j) {
	  if (j instanceof this) {
	    return j.clone();
	  } else {
	    return (new this()).parse_number(j);
	  }
	};

	UInt.is_valid = function(j) {
	  return this.from_json(j).is_valid();
	};

	UInt.prototype.clone = function() {
	  return this.copyTo(new this.constructor());
	};

	// Returns copy.
	UInt.prototype.copyTo = function(d) {
	  d._value = this._value;

	  if (typeof d._update === 'function') {
	    d._update();
	  }

	  return d;
	};

	UInt.prototype.equals = function(d) {
	  return this._value instanceof BigInteger && d._value instanceof BigInteger && this._value.equals(d._value);
	};

	UInt.prototype.is_valid = function() {
	  return this._value instanceof BigInteger;
	};

	UInt.prototype.is_zero = function() {
	  return this._value.equals(BigInteger.ZERO);
	};

	/**
	 * Update any derivative values.
	 *
	 * This allows subclasses to maintain caches of any data that they derive from
	 * the main _value. For example, the Currency class keeps the currency type, the
	 * currency code and other information about the currency cached.
	 *
	 * The reason for keeping this mechanism in this class is so every subclass can
	 * call it whenever it modifies the internal state.
	 */
	UInt.prototype._update = function() {
	  // Nothing to do by default. Subclasses will override this.
	};

	// value = NaN on error.
	UInt.prototype.parse_generic = function(j) {
	  // Canonicalize and validate
	  if (config.accounts && (j in config.accounts)) {
	    j = config.accounts[j].account;
	  }

	  switch (j) {
	    case undefined:
	      case '0':
	      case this.constructor.XPS_ZERO:
	      case this.constructor.ACCOUNT_ZERO:
	      case this.constructor.HEX_ZERO:
	      this._value  = BigInteger.valueOf();
	      break;

	    case '1':
	      case this.constructor.XPS_ONE:
	      case this.constructor.ACCOUNT_ONE:
	      case this.constructor.HEX_ONE:
	      this._value  = new BigInteger([1]);
	      break;

	    default:
	        if (typeof j !== 'string') {
	          this._value  = NaN;
	        } else if (this.constructor.width === j.length) {
	          this._value  = new BigInteger(utils.stringToArray(j), 256);
	        } else if ((this.constructor.width * 2) === j.length) {
	          // XXX Check char set!
	          this._value  = new BigInteger(j, 16);
	        } else {
	          this._value  = NaN;
	        }
	  }

	  this._update();

	  return this;
	};

	UInt.prototype.parse_hex = function(j) {
	  if (typeof j === 'string' && j.length === (this.constructor.width * 2)) {
	    this._value = new BigInteger(j, 16);
	  } else {
	    this._value = NaN;
	  }

	  this._update();

	  return this;
	};

	UInt.prototype.parse_bits = function(j) {
	  if (sjcl.bitArray.bitLength(j) !== this.constructor.width * 8) {
	    this._value = NaN;
	  } else {
	    var bytes = sjcl.codec.bytes.fromBits(j);
	    this.parse_bytes(bytes);
	  }

	  this._update();

	  return this;
	};


	UInt.prototype.parse_bytes = function(j) {
	  if (!Array.isArray(j) || j.length !== this.constructor.width) {
	    this._value = NaN;
	  } else {
	    this._value  = new BigInteger([0].concat(j), 256);
	  }

	  this._update();

	  return this;
	};


	UInt.prototype.parse_json = UInt.prototype.parse_hex;

	UInt.prototype.parse_bn = function(j) {
	  if ((j instanceof sjcl.bn) && j.bitLength() <= this.constructor.width * 8) {
	    var bytes = sjcl.codec.bytes.fromBits(j.toBits());
	    this._value  = new BigInteger(bytes, 256);
	  } else {
	    this._value = NaN;
	  }

	  this._update();

	  return this;
	};

	UInt.prototype.parse_number = function(j) {
	  this._value = NaN;

	  if (typeof j === 'number' && isFinite(j) && j >= 0) {
	    this._value = new BigInteger(String(j));
	  }

	  this._update();

	  return this;
	};

	// Convert from internal form.
	UInt.prototype.to_bytes = function() {
	  if (!(this._value instanceof BigInteger)) {
	    return null;
	  }

	  var bytes  = this._value.toByteArray();

	  bytes = bytes.map(function(b) {
	    return (b + 256) % 256;
	  });

	  var target = this.constructor.width;

	  // XXX Make sure only trim off leading zeros.
	  bytes = bytes.slice(-target);

	  while (bytes.length < target) {
	    bytes.unshift(0);
	  }

	  return bytes;
	};

	UInt.prototype.to_hex = function() {
	  if (!(this._value instanceof BigInteger)) {
	    return null;
	  }

	  var bytes = this.to_bytes();
	  return sjcl.codec.hex.fromBits(sjcl.codec.bytes.toBits(bytes)).toUpperCase();
	};

	UInt.prototype.to_json = UInt.prototype.to_hex;

	UInt.prototype.to_bits = function() {
	  if (!(this._value instanceof BigInteger)) {
	    return null;
	  }

	  var bytes = this.to_bytes();

	  return sjcl.codec.bytes.toBits(bytes);
	};

	UInt.prototype.to_bn = function() {
	  if (!(this._value instanceof BigInteger)) {
	    return null;
	  }

	  var bits = this.to_bits();

	  return sjcl.bn.fromBits(bits);
	};

	exports.UInt = UInt;

	// vim:sw=2:sts=2:ts=8:et


/***/ },
/* 30 */
/***/ function(module, exports, __webpack_require__) {

	var sjcl = __webpack_require__(19).sjcl;
	var tnacl = __webpack_require__(55);

	var UInt160 = __webpack_require__(8).UInt160;
	var UInt256 = __webpack_require__(9).UInt256;
	var Base    = __webpack_require__(7).Base;
	var Crypt   = __webpack_require__(26).Crypt;

	/**
	 * Creates an ED25519 key pair for signing.
	 *
	 * @param {object} naclSigningKeys
	 * @constructor
	 */
	function KeyPair() {

	}

	KeyPair.from_seed_bytes = function(bytes) {
	  var keys = tnacl.sign.keyPair.fromSeed(new Uint8Array(bytes));

	  var result = new KeyPair();
	  result._secret = keys.secretKey;
	  result._pubkey = keys.publicKey;
	  return result;
	}

	/**
	 * Returns public key as a byte array.
	 *
	 * @private
	 */
	KeyPair.prototype._pub = function() {
	  return this._pubkey;
	};

	/**
	 * Returns public key in compressed format as bit array.
	 *
	 * @private
	 */
	KeyPair.prototype._pub_bits = function() {
	  var pub = this._pub();

	  if (!pub) {
	    return null;
	  }

	  return sjcl.codec.bytes.toBits(pub);
	};

	/**
	 * Returns public key as hex.
	 *
	 */
	KeyPair.prototype.to_hex_pub = function() {
	  var bits = this._pub_bits();

	  if (!bits) {
	    return null;
	  }

	  return sjcl.codec.hex.fromBits(bits).toUpperCase();
	};

	function SHA256_RIPEMD160(bits) {
	  return Crypt.ripemd160(sjcl.hash.sha256.hash(bits));
	}

	KeyPair.prototype.get_address = function() {
	  var bits = this._pub_bits();

	  if (!bits) {
	    return null;
	  }

	  var hash = SHA256_RIPEMD160(bits);

	  var address = UInt160.from_bits(hash);
	  address.set_version(Base.VER_ACCOUNT_ID);
	  return address;
	};

	KeyPair.prototype.sign = function(hash) {
	  hash = UInt256.from_json(hash);
	  var sig = tnacl.sign(new Uint8Array(hash.to_bytes()), this._secret);

	  return sjcl.codec.bytes.toBits(sig);
	};

	exports.KeyPair = KeyPair;


/***/ },
/* 31 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Type definitions for binary format.
	 *
	 * This file should not be included directly. Instead, find the format you're
	 * trying to parse or serialize in binformat.js and pass that to
	 * SerializedObject.parse() or SerializedObject.serialize().
	 */

	var assert    = __webpack_require__(38);
	var extend    = __webpack_require__(42);
	var binformat = __webpack_require__(18);
	var utils     = __webpack_require__(19);
	var sjcl      = utils.sjcl;

	var UInt128   = __webpack_require__(44).UInt128;
	var UInt160   = __webpack_require__(8).UInt160;
	var UInt256   = __webpack_require__(9).UInt256;
	var Base      = __webpack_require__(7).Base;

	var amount    = __webpack_require__(3);
	var Amount    = amount.Amount;
	var Currency  = amount.Currency;

	// Shortcuts
	var hex = sjcl.codec.hex;
	var bytes = sjcl.codec.bytes;

	var BigInteger = utils.jsbn.BigInteger;


	var SerializedType = function (methods) {
	  extend(this, methods);
	};

	function isNumber(val) {
	  return typeof val === 'number' && isFinite(val);
	};

	function isString(val) {
	  return typeof val === 'string';
	};

	function isHexInt64String(val) {
	  return isString(val) && /^[0-9A-F]{0,16}$/i.test(val);
	};

	function isCurrencyString(val) {
	  return isString(val) && /^[A-Z0-9]{3}$/.test(val);
	};

	function isBigInteger(val) {
	  return val instanceof BigInteger;
	};

	function serialize_hex(so, hexData, noLength) {
	  var byteData = bytes.fromBits(hex.toBits(hexData));
	  if (!noLength) {
	    SerializedType.serialize_varint(so, byteData.length);
	  }
	  so.append(byteData);
	};

	/**
	 * parses bytes as hex
	 */
	function convert_bytes_to_hex (byte_array) {
	  return sjcl.codec.hex.fromBits(sjcl.codec.bytes.toBits(byte_array)).toUpperCase();
	};

	SerializedType.serialize_varint = function (so, val) {
	  if (val < 0) {
	    throw new Error('Variable integers are unsigned.');
	  }

	  if (val <= 192) {
	    so.append([val]);
	  } else if (val <= 12480) {
	    val -= 193;
	    so.append([193 + (val >>> 8), val & 0xff]);
	  } else if (val <= 918744) {
	    val -= 12481;
	    so.append([ 241 + (val >>> 16), val >>> 8 & 0xff, val & 0xff ]);
	  } else {
	    throw new Error('Variable integer overflow.');
	  }
	};

	SerializedType.prototype.parse_varint = function (so) {
	  var b1 = so.read(1)[0], b2, b3;
	  var result;

	  if (b1 > 254) {
	    throw new Error('Invalid varint length indicator');
	  }

	  if (b1 <= 192) {
	    result = b1;
	  } else if (b1 <= 240) {
	    b2 = so.read(1)[0];
	    result = 193 + (b1 - 193) * 256 + b2;
	  } else if (b1 <= 254) {
	    b2 = so.read(1)[0];
	    b3 = so.read(1)[0];
	    result = 12481 + (b1 - 241) * 65536 + b2 * 256 + b3;
	  }

	  return result;
	};

	// In the following, we assume that the inputs are in the proper range. Is this correct?
	// Helper functions for 1-, 2-, and 4-byte integers.

	/**
	 * Convert an integer value into an array of bytes.
	 *
	 * The result is appended to the serialized object ('so').
	 */
	function append_byte_array(so, val, bytes) {
	  if (!isNumber(val)) {
	    throw new Error('Value is not a number');
	  }

	  if (val < 0 || val >= Math.pow(256, bytes)) {
	    throw new Error('Value out of bounds');
	  }

	  var newBytes = [ ];

	  for (var i=0; i<bytes; i++) {
	    newBytes.unshift(val >>> (i * 8) & 0xff);
	  }

	  so.append(newBytes);
	};

	// Convert a certain number of bytes from the serialized object ('so') into an integer.
	function readAndSum(so, bytes) {
	  var sum = 0;

	  if (bytes > 4) {
	    throw new Error('This function only supports up to four bytes.');
	  }

	  for (var i=0; i<bytes; i++) {
	    var byte = so.read(1)[0];
	    sum += (byte << (8 * (bytes - i - 1)));
	  }

	  // Convert to unsigned integer
	  return sum >>> 0;
	};

	var STInt8 = exports.Int8 = new SerializedType({
	  serialize: function (so, val) {
	    append_byte_array(so, val, 1);
	  },
	  parse: function (so) {
	    return readAndSum(so, 1);
	  }
	});

	STInt8.id = 16;

	var STInt16 = exports.Int16 = new SerializedType({
	  serialize: function (so, val) {
	    append_byte_array(so, val, 2);
	  },
	  parse: function (so) {
	    return readAndSum(so, 2);
	  }
	});

	STInt16.id = 1;

	var STInt32 = exports.Int32 = new SerializedType({
	  serialize: function (so, val) {
	    append_byte_array(so, val, 4);
	  },
	  parse: function (so) {
	    return readAndSum(so, 4);
	  }
	});

	STInt32.id = 2;

	var STInt64 = exports.Int64 = new SerializedType({
	  serialize: function (so, val) {
	    var bigNumObject;

	    if (isNumber(val)) {
	      val = Math.floor(val);
	      if (val < 0) {
	        throw new Error('Negative value for unsigned Int64 is invalid.');
	      }
	      bigNumObject = new BigInteger(String(val), 10);
	    } else if (isString(val)) {
	      if (!isHexInt64String(val)) {
	        throw new Error('Not a valid hex Int64.');
	      }
	      bigNumObject = new BigInteger(val, 16);
	    } else if (isBigInteger(val)) {
	      if (val.compareTo(BigInteger.ZERO) < 0) {
	        throw new Error('Negative value for unsigned Int64 is invalid.');
	      }
	      bigNumObject = val;
	    } else {
	      throw new Error('Invalid type for Int64');
	    }

	    var hex = bigNumObject.toString(16);

	    if (hex.length > 16) {
	      throw new Error('Int64 is too large');
	    }

	    while (hex.length < 16) {
	      hex = '0' + hex;
	    }

	    serialize_hex(so, hex, true); //noLength = true
	  },
	  parse: function (so) {
	    var bytes = so.read(8);
	    // We need to add a 0, so if the high bit is set it won't think it's a
	    // pessimistic numeric fraek. What doth lief?
	    var result = new BigInteger([0].concat(bytes), 256);
	    assert(result instanceof BigInteger);
	    return result;
	  }
	});

	STInt64.id = 3;

	var STHash128 = exports.Hash128 = new SerializedType({
	  serialize: function (so, val) {
	    var hash = UInt128.from_json(val);
	    if (!hash.is_valid()) {
	      throw new Error('Invalid Hash128');
	    }
	    serialize_hex(so, hash.to_hex(), true); //noLength = true
	  },
	  parse: function (so) {
	    return UInt128.from_bytes(so.read(16));
	  }
	});

	STHash128.id = 4;

	var STHash256 = exports.Hash256 = new SerializedType({
	  serialize: function (so, val) {
	    var hash = UInt256.from_json(val);
	    if (!hash.is_valid()) {
	      throw new Error('Invalid Hash256');
	    }
	    serialize_hex(so, hash.to_hex(), true); //noLength = true
	  },
	  parse: function (so) {
	    return UInt256.from_bytes(so.read(32));
	  }
	});

	STHash256.id = 5;

	var STHash160 = exports.Hash160 = new SerializedType({
	  serialize: function (so, val) {
	    var hash = UInt160.from_json(val);
	    if (!hash.is_valid()) {
	      throw new Error('Invalid Hash160');
	    }
	    serialize_hex(so, hash.to_hex(), true); //noLength = true
	  },
	  parse: function (so) {
	    return UInt160.from_bytes(so.read(20));
	  }
	});

	STHash160.id = 17;

	// Internal
	var STCurrency = new SerializedType({
	  serialize: function (so, val, xrp_as_ascii) {
	    var currencyData = val.to_bytes();

	    if (!currencyData) {
	      throw new Error('Tried to serialize invalid/unimplemented currency type.');
	    }

	    so.append(currencyData);
	  },
	  parse: function (so) {
	    var bytes = so.read(20);
	    var currency = Currency.from_bytes(bytes);
	    // XXX Disabled check. Theoretically, the Currency class should support any
	    //     UInt160 value and consider it valid. But it doesn't, so for the
	    //     deserialization to be usable, we need to allow invalid results for now.
	    //if (!currency.is_valid()) {
	    //  throw new Error('Invalid currency: '+convert_bytes_to_hex(bytes));
	    //}
	    return currency;
	  }
	});

	var STAmount = exports.Amount = new SerializedType({
	  serialize: function (so, val) {
	    var amount = Amount.from_json(val);
	    if (!amount.is_valid()) {
	      throw new Error('Not a valid Amount object.');
	    }

	    // Amount (64-bit integer)
	    var valueBytes = utils.arraySet(8, 0);

	    if (amount.is_native()) {
	      var valueHex = amount._value.toString(16);

	      // Enforce correct length (64 bits)
	      if (valueHex.length > 16) {
	        throw new Error('Value out of bounds');
	      }

	      while (valueHex.length < 16) {
	        valueHex = '0' + valueHex;
	      }

	      valueBytes = bytes.fromBits(hex.toBits(valueHex));
	      // Clear most significant two bits - these bits should already be 0 if
	      // Amount enforces the range correctly, but we'll clear them anyway just
	      // so this code can make certain guarantees about the encoded value.
	      valueBytes[0] &= 0x3f;

	      if (!amount.is_negative()) {
	        valueBytes[0] |= 0x40;
	      }
	    } else {
	      var hi = 0, lo = 0;

	      // First bit: non-native
	      hi |= 1 << 31;

	      if (!amount.is_zero()) {
	        // Second bit: non-negative?
	        if (!amount.is_negative()) {
	          hi |= 1 << 30;
	        }

	        // Next eight bits: offset/exponent
	        hi |= ((97 + amount._offset) & 0xff) << 22;
	        // Remaining 52 bits: mantissa
	        hi |= amount._value.shiftRight(32).intValue() & 0x3fffff;
	        lo = amount._value.intValue() & 0xffffffff;
	      }

	      valueBytes = sjcl.codec.bytes.fromBits([hi, lo]);
	    }

	    so.append(valueBytes);

	    if (!amount.is_native()) {
	      // Currency (160-bit hash)
	      var currency = amount.currency();
	      STCurrency.serialize(so, currency, true);

	      // Issuer (160-bit hash)
	      so.append(amount.issuer().to_bytes());
	    }
	  },
	  parse: function (so) {
	    var amount = new Amount();
	    var value_bytes = so.read(8);
	    var is_zero = !(value_bytes[0] & 0x7f);

	    for (var i=1; i<8; i++) {
	      is_zero = is_zero && !value_bytes[i];
	    }

	    if (value_bytes[0] & 0x80) {
	      //non-native
	      var currency = STCurrency.parse(so);
	      var issuer_bytes = so.read(20);
	      var issuer = UInt160.from_bytes(issuer_bytes);
	      issuer.set_version(Base.VER_ACCOUNT_ID);
	      var offset = ((value_bytes[0] & 0x3f) << 2) + (value_bytes[1] >>> 6) - 97;
	      var mantissa_bytes = value_bytes.slice(1);
	      mantissa_bytes[0] &= 0x3f;
	      var value = new BigInteger(mantissa_bytes, 256);

	      if (value.equals(BigInteger.ZERO) && !is_zero ) {
	        throw new Error('Invalid zero representation');
	      }

	      amount._value = value;
	      amount._offset = offset;
	      amount._currency    = currency;
	      amount._issuer      = issuer;
	      amount._is_native   = false;
	    } else {
	      //native
	      var integer_bytes = value_bytes.slice();
	      integer_bytes[0] &= 0x3f;
	      amount._value = new BigInteger(integer_bytes, 256);
	      amount._is_native   = true;
	    }
	    amount._is_negative = !is_zero && !(value_bytes[0] & 0x40);
	    return amount;
	  }
	});

	STAmount.id = 6;

	var STVL = exports.VariableLength = exports.VL = new SerializedType({
	  serialize: function (so, val) {
	    if (typeof val === 'string') {
	      serialize_hex(so, val);
	    } else {
	      throw new Error('Unknown datatype.');
	    }
	  },
	  parse: function (so) {
	    var len = this.parse_varint(so);
	    return convert_bytes_to_hex(so.read(len));
	  }
	});

	STVL.id = 7;

	var STAccount = exports.Account = new SerializedType({
	  serialize: function (so, val) {
	    var account = UInt160.from_json(val);
	    if (!account.is_valid()) {
	      throw new Error('Invalid account!');
	    }
	    serialize_hex(so, account.to_hex());
	  },
	  parse: function (so) {
	    var len = this.parse_varint(so);

	    if (len !== 20) {
	      throw new Error('Non-standard-length account ID');
	    }

	    var result = UInt160.from_bytes(so.read(len));
	    result.set_version(Base.VER_ACCOUNT_ID);

	    //console.log('PARSED 160:', result.to_json());
	    if (false) {
	      throw new Error('Invalid Account');
	    }

	    return result;
	  }
	});

	STAccount.id = 8;

	var STPathSet = exports.PathSet = new SerializedType({
	  typeBoundary:  0xff,
	  typeEnd:       0x00,
	  typeAccount:   0x01,
	  typeCurrency:  0x10,
	  typeIssuer:    0x20,
	  serialize: function (so, val) {
	    for (var i=0, l=val.length; i<l; i++) {
	      // Boundary
	      if (i) {
	        STInt8.serialize(so, this.typeBoundary);
	      }

	      for (var j=0, l2=val[i].length; j<l2; j++) {
	        var entry = val[i][j];
	        //if (entry.hasOwnProperty('_value')) {entry = entry._value;}
	        var type = 0;

	        if (entry.account) {
	          type |= this.typeAccount;
	        }
	        if (entry.currency) {
	          type |= this.typeCurrency;
	        }
	        if (entry.issuer) {
	          type |= this.typeIssuer;
	        }

	        STInt8.serialize(so, type);

	        if (entry.account) {
	          so.append(UInt160.from_json(entry.account).to_bytes());
	        }

	        if (entry.currency) {
	          var currency = Currency.from_json(entry.currency, entry.non_native);
	          STCurrency.serialize(so, currency);
	        }

	        if (entry.issuer) {
	          so.append(UInt160.from_json(entry.issuer).to_bytes());
	        }
	      }
	    }

	    STInt8.serialize(so, this.typeEnd);
	  },
	  parse: function (so) {
	    // should return a list of lists:
	    /*
	       [
	       [entry, entry],
	       [entry, entry, entry],
	       [entry],
	       []
	       ]

	       each entry has one or more of the following attributes: amount, currency, issuer.
	       */

	    var path_list    = [];
	    var current_path = [];
	    var tag_byte;

	    while ((tag_byte = so.read(1)[0]) !== this.typeEnd) {
	      //TODO: try/catch this loop, and catch when we run out of data without reaching the end of the data structure.
	      //Now determine: is this an end, boundary, or entry-begin-tag?
	      //console.log('Tag byte:', tag_byte);
	      if (tag_byte === this.typeBoundary) {
	        //console.log('Boundary');
	        if (current_path) { //close the current path, if there is one,
	          path_list.push(current_path);
	        }
	        current_path = [ ]; //and start a new one.
	        continue;
	      }

	      //It's an entry-begin tag.
	      //console.log('It's an entry-begin tag.');
	      var entry = {};

	      if (tag_byte & this.typeAccount) {
	        //console.log('entry.account');
	        /*var bta = so.read(20);
	          console.log('BTA:', bta);*/
	        entry.account = STHash160.parse(so);
	        entry.account.set_version(Base.VER_ACCOUNT_ID);
	      }
	      if (tag_byte & this.typeCurrency) {
	        //console.log('entry.currency');
	        entry.currency = STCurrency.parse(so);
	        if (entry.currency.to_json() === 'XRP' && !entry.currency.is_native()) {
	          entry.non_native = true;
	        }
	      }
	      if (tag_byte & this.typeIssuer) {
	        //console.log('entry.issuer');
	        entry.issuer = STHash160.parse(so);
	        // Enable and set correct type of base-58 encoding
	        entry.issuer.set_version(Base.VER_ACCOUNT_ID);
	        //console.log('DONE WITH ISSUER!');
	      }

	      if (entry.account || entry.currency || entry.issuer) {
	        current_path.push(entry);
	      } else {
	        throw new Error('Invalid path entry'); //It must have at least something in it.
	      }
	    }

	    if (current_path) {
	      //close the current path, if there is one,
	      path_list.push(current_path);
	    }

	    return path_list;
	  }
	});

	STPathSet.id = 18;

	var STVector256 = exports.Vector256 = new SerializedType({
	  serialize: function (so, val) { //Assume val is an array of STHash256 objects.
	    var length_as_varint = SerializedType.serialize_varint(so, val.length * 32);
	    for (var i=0, l=val.length; i<l; i++) {
	      STHash256.serialize(so, val[i]);
	    }
	  },
	  parse: function (so) {
	    var length = this.parse_varint(so);
	    var output = [];
	    // length is number of bytes not number of Hash256
	    for (var i=0; i<length / 32; i++) {
	      output.push(STHash256.parse(so));
	    }
	    return output;
	  }
	});

	STVector256.id = 19;

	exports.serialize = exports.serialize_whatever = serialize;

	function serialize(so, field_name, value) {
	  //so: a byte-stream to serialize into.
	  //field_name: a string for the field name ('LedgerEntryType' etc.)
	  //value: the value of that field.
	  var field_coordinates = binformat.fieldsInverseMap[field_name];
	  var type_bits         = field_coordinates[0];
	  var field_bits        = field_coordinates[1];
	  var tag_byte          = (type_bits < 16 ? type_bits << 4 : 0) | (field_bits < 16 ? field_bits : 0);

	  if (field_name === 'LedgerEntryType' && 'string' === typeof value) {
	    value = binformat.ledger[value][0];
	  }

	  if (field_name === 'TransactionResult' && 'string' === typeof value) {
	    value = binformat.ter[value];
	  }

	  STInt8.serialize(so, tag_byte);

	  if (type_bits >= 16) {
	    STInt8.serialize(so, type_bits);
	  }

	  if (field_bits >= 16) {
	    STInt8.serialize(so, field_bits);
	  }

	  // Get the serializer class (ST...) for a field based on the type bits.
	  var serialized_object_type = exports[binformat.types[type_bits]];
	  //do something with val[keys] and val[keys[i]];
	  try {
	    serialized_object_type.serialize(so, value);
	  } catch (e) {
	    throw new Error("Error (" + e.message + ") serializing field_name: " +
	      field_name + " with value: " + value + ".)");
	  }
	}

	//Take the serialized object, figure out what type/field it is, and return the parsing of that.
	exports.parse = exports.parse_whatever = parse;

	function parse(so) {
	  var tag_byte   = so.read(1)[0];
	  var type_bits  = tag_byte >> 4;

	  if (type_bits === 0) {
	    type_bits = so.read(1)[0];
	  }

	  // Get the parser class (ST...) for a field based on the type bits.
	  var type = exports[binformat.types[type_bits]];

	  assert(type, 'Unknown type - header byte is 0x' + tag_byte.toString(16));

	  var field_bits = tag_byte & 0x0f;
	  var field_name = (field_bits === 0)
	  ? field_name = binformat.fields[type_bits][so.read(1)[0]]
	  : field_name = binformat.fields[type_bits][field_bits];

	  assert(field_name, 'Unknown field - header byte is 0x' + tag_byte.toString(16));

	  return [ field_name, type.parse(so) ]; //key, value
	};

	function sort_fields(keys) {
	  function sort_field_compare(a, b) {
	    var a_field_coordinates = binformat.fieldsInverseMap[a];
	    var a_type_bits         = a_field_coordinates[0];
	    var a_field_bits        = a_field_coordinates[1];
	    var b_field_coordinates = binformat.fieldsInverseMap[b];
	    var b_type_bits         = b_field_coordinates[0];
	    var b_field_bits        = b_field_coordinates[1];

	    // Sort by type id first, then by field id
	    return a_type_bits !== b_type_bits ? a_type_bits - b_type_bits : a_field_bits - b_field_bits;
	  };

	  return keys.sort(sort_field_compare);
	}

	var STObject = exports.Object = new SerializedType({
	  serialize: function (so, val, no_marker) {
	    var keys = Object.keys(val);

	    // Ignore lowercase field names - they're non-serializable fields by
	    // convention.
	    keys = keys.filter(function (key) {
	      return key[0] !== key[0].toLowerCase();
	    });

	    keys.forEach(function (key) {
	      if (typeof binformat.fieldsInverseMap[key] === 'undefined') {
	        throw new Error('JSON contains unknown field: "' + key + '"');
	      }
	    });

	    // Sort fields
	    keys = sort_fields(keys);

	    for (var i=0; i<keys.length; i++) {
	      serialize(so, keys[i], val[keys[i]]);
	    }

	    if (!no_marker) {
	      //Object ending marker
	      STInt8.serialize(so, 0xe1);
	    }
	  },

	  parse: function (so) {
	    var output = {};
	    while (so.peek(1)[0] !== 0xe1) {
	      var keyval = parse(so);
	      output[keyval[0]] = keyval[1];
	    }
	    so.read(1);
	    return output;
	  }
	});

	STObject.id = 14;

	var STArray = exports.Array = new SerializedType({
	  serialize: function (so, val) {
	    for (var i=0, l=val.length; i<l; i++) {
	      var keys = Object.keys(val[i]);

	      if (keys.length !== 1) {
	        throw Error('Cannot serialize an array containing non-single-key objects');
	      }

	      var field_name = keys[0];
	      var value = val[i][field_name];
	      serialize(so, field_name, value);
	    }

	    //Array ending marker
	    STInt8.serialize(so, 0xf1);
	  },

	  parse: function (so) {
	    var output = [ ];

	    while (so.peek(1)[0] !== 0xf1) {
	      var keyval = parse(so);
	      var obj = { };
	      obj[keyval[0]] = keyval[1];
	      output.push(obj);
	    }

	    so.read(1);

	    return output;
	  }
	});

	STArray.id = 15;


/***/ },
/* 32 */
/***/ function(module, exports, __webpack_require__) {

	var crypt   = __webpack_require__(26).Crypt;
	var SignedRequest = __webpack_require__(45).SignedRequest;
	var request  = __webpack_require__(49);
	var extend   = __webpack_require__(42);
	var async    = __webpack_require__(48);

	var BlobClient = {};

	//Blob object class
	function BlobObj(url, id, key) {
	  this.url      = url;
	  this.id       = id;
	  this.key      = key; 
	  this.identity = new Identity(this);
	  this.data     = { };
	};

	// Blob operations
	// Do NOT change the mapping of existing ops
	BlobObj.ops = {
	  // Special
	  noop: 0,

	  // Simple ops
	  set: 16,
	  unset: 17,
	  extend: 18,

	  // Meta ops
	  push: 32,
	  pop: 33,
	  shift: 34,
	  unshift: 35,
	  filter: 36
	};


	BlobObj.opsReverseMap = [ ];
	for (var name in BlobObj.ops) {
	  BlobObj.opsReverseMap[BlobObj.ops[name]] = name;
	}

	//Identity fields
	var identityRoot   = 'identityVault';
	var identityFields = [
	  'name',
	  'entityType',
	  'email',
	  'phone',
	  'address',
	  'nationalID',
	  'birthday',
	  'birthplace'
	];

	var entityTypes = [
	  'individual',
	  'organization',
	  'corporation'
	];

	var addressFields = [
	  'contact',
	  'line1',
	  'line2',
	  'city',
	  'region',  //state/province/region
	  'postalCode',
	  'country'
	];

	var nationalIDFields = [
	  'number',
	  'type',
	  'country',
	];

	var idTypeFields = [
	  'ssn',
	  'taxID',
	  'passport',
	  'driversLicense',
	  'other'
	];

	/**
	 * Initialize a new blob object
	 *
	 * @param {function} fn - Callback function
	 */

	BlobObj.prototype.init = function(fn) {
	  var self = this, url;

	  if (self.url.indexOf('://') === -1) {
	    self.url = 'http://' + url;
	  }

	  url = self.url + '/v1/blob/' + self.id;

	  request.get(url, function(err, resp) {
	    if (err || !resp.body || resp.body.result !== 'success') {
	      return fn(new Error('Could not retrieve blob'));
	    }
	    
	    self.revision         = resp.body.revision;
	    self.encrypted_secret = resp.body.encrypted_secret;
	    self.missing_fields   = resp.body.missing_fields;
	    
	    if (!self.decrypt(resp.body.blob)) {
	      return fn(new Error('Error while decrypting blob'));
	    }

	    //Apply patches
	    if (resp.body.patches && resp.body.patches.length) {
	      var successful = true;
	      resp.body.patches.forEach(function(patch) {
	        successful = successful && self.applyEncryptedPatch(patch);
	      });

	      if (successful) {
	        self.consolidate();
	      }
	    }

	    //return with newly decrypted blob
	    fn(null, self);
	  }).timeout(8000);
	};

	/**
	 * Consolidate -
	 * Consolidate patches as a new revision
	 *
	 * @param {function} fn - Callback function
	 */

	BlobObj.prototype.consolidate = function(fn) {
	  // Callback is optional
	  if (typeof fn !== 'function') {
	    fn = function(){};
	  }

	  //console.log('client: blob: consolidation at revision', this.revision);
	  var encrypted = this.encrypt();

	  var config = {
	    method: 'POST',
	    url: this.url + '/v1/blob/consolidate',
	    dataType: 'json',
	    data: {
	      blob_id: this.id,
	      data: encrypted,
	      revision: this.revision
	    },
	  };

	  var signedRequest = new SignedRequest(config);

	  var signed = signedRequest.signHmac(this.data.auth_secret, this.id);

	  request.post(signed.url)
	    .send(signed.data)
	    .end(function(err, resp) {
	      // XXX Add better error information to exception
	      if (err) {
	        fn(new Error('Failed to consolidate blob - XHR error'));
	      } else if (resp.body && resp.body.result === 'success') {
	        fn(null, resp.body);
	      } else {
	        fn(new Error('Failed to consolidate blob'));
	      }
	  });
	};

	/**
	 * ApplyEncryptedPatch -
	 * save changes from a downloaded patch to the blob
	 *
	 * @param {string} patch - encrypted patch string
	 */

	BlobObj.prototype.applyEncryptedPatch = function(patch) {
	  try {
	    var args = JSON.parse(crypt.decrypt(this.key, patch));
	    var op   = args.shift();
	    var path = args.shift();

	    this.applyUpdate(op, path, args);
	    this.revision++;

	    return true;
	  } catch (err) {
	    //console.log('client: blob: failed to apply patch:', err.toString());
	    //console.log(err.stack);
	    return false;
	  }
	};

	/**
	 * Encrypt secret with unlock key
	 *
	 * @param {string} secretUnlockkey
	 */
	BlobObj.prototype.encryptSecret = function (secretUnlockKey, secret) {
	  return crypt.encrypt(secretUnlockKey, secret);
	};

	/**
	 * Decrypt secret with unlock key
	 *
	 * @param {string} secretUnlockkey
	 */

	BlobObj.prototype.decryptSecret = function(secretUnlockKey) {
	  return crypt.decrypt(secretUnlockKey, this.encrypted_secret);
	};

	/**
	 * Decrypt blob with crypt key
	 *
	 * @param {string} data - encrypted blob data
	 */

	BlobObj.prototype.decrypt = function(data) {
	  try {
	    this.data = JSON.parse(crypt.decrypt(this.key, data));
	    return this;
	  } catch (e) {
	    //console.log('client: blob: decryption failed', e.toString());
	    //console.log(e.stack);
	    return false;
	  }
	};

	/**
	 * Encrypt blob with crypt key
	 */

	BlobObj.prototype.encrypt = function() {
	// Filter Angular metadata before encryption
	//  if ('object' === typeof this.data &&
	//      'object' === typeof this.data.contacts)
	//    this.data.contacts = angular.fromJson(angular.toJson(this.data.contacts));

	  return crypt.encrypt(this.key, JSON.stringify(this.data));
	};

	/**
	 * Encrypt recovery key
	 *
	 * @param {string} secret
	 * @param {string} blobDecryptKey
	 */

	BlobObj.prototype.encryptBlobCrypt = function(secret, blobDecryptKey) {
	  var recoveryEncryptionKey = crypt.deriveRecoveryEncryptionKeyFromSecret(secret);
	  return crypt.encrypt(recoveryEncryptionKey, blobDecryptKey);
	};

	/**
	 * Decrypt recovery key
	 *
	 * @param {string} secret
	 * @param {string} encryptedKey
	 */

	function decryptBlobCrypt (secret, encryptedKey) {
	  var recoveryEncryptionKey = crypt.deriveRecoveryEncryptionKeyFromSecret(secret);
	  return crypt.decrypt(recoveryEncryptionKey, encryptedKey);
	};

	/**** Blob updating functions ****/

	/**
	 * Set blob element
	 */

	BlobObj.prototype.set = function(pointer, value, fn) {
	  if (pointer == "/" + identityRoot && this.data[identityRoot]) {
	    return fn(new Error('Cannot overwrite Identity Vault')); 
	  }
	    
	  this.applyUpdate('set', pointer, [value]);
	  this.postUpdate('set', pointer, [value], fn);
	};

	/**
	 * Remove blob element
	 */

	BlobObj.prototype.unset = function(pointer, fn) {
	  if (pointer == "/" + identityRoot) {
	    return fn(new Error('Cannot remove Identity Vault')); 
	  }
	  
	  this.applyUpdate('unset', pointer, []);
	  this.postUpdate('unset', pointer, [], fn);
	};

	/**
	 * Extend blob object
	 */

	BlobObj.prototype.extend = function(pointer, value, fn) {
	  this.applyUpdate('extend', pointer, [value]);
	  this.postUpdate('extend', pointer, [value], fn);
	};

	/**
	 * Prepend blob array
	 */

	BlobObj.prototype.unshift = function(pointer, value, fn) {    
	  this.applyUpdate('unshift', pointer, [value]);
	  this.postUpdate('unshift', pointer, [value], fn);
	};

	/**
	 * Filter the row(s) from an array.
	 *
	 * This method will find any entries from the array stored under `pointer` and
	 * apply the `subcommands` to each of them.
	 *
	 * The subcommands can be any commands with the pointer parameter left out.
	 */

	BlobObj.prototype.filter = function(pointer, field, value, subcommands, callback) {
	  var args = Array.prototype.slice.apply(arguments);

	  if (typeof args[args.length - 1] === 'function') {
	    callback = args.pop();
	  }

	  args.shift();

	  // Normalize subcommands to minimize the patch size
	  args = args.slice(0, 2).concat(normalizeSubcommands(args.slice(2), true));

	  this.applyUpdate('filter', pointer, args);
	  this.postUpdate('filter', pointer, args, callback);
	};

	/**
	 * Apply udpdate to the blob
	 */

	BlobObj.prototype.applyUpdate = function(op, path, params) {
	  // Exchange from numeric op code to string
	  if (typeof op === 'number') {
	    op = BlobObj.opsReverseMap[op];
	  }

	  if (typeof op !== 'string') {
	    throw new Error('Blob update op code must be a number or a valid op id string');
	  }

	  // Separate each step in the 'pointer'
	  var pointer = path.split('/');
	  var first = pointer.shift();

	  if (first !== '') {
	    throw new Error('Invalid JSON pointer: '+path);
	  }

	  this._traverse(this.data, pointer, path, op, params);
	};

	//for applyUpdate function
	BlobObj.prototype._traverse = function(context, pointer, originalPointer, op, params) {
	  var _this = this;
	  var part = _this.unescapeToken(pointer.shift());

	  if (Array.isArray(context)) {
	    if (part === '-') {
	      part = context.length;
	    } else if (part % 1 !== 0 && part >= 0) {
	      throw new Error('Invalid pointer, array element segments must be a positive integer, zero or '-'');
	    }
	  } else if (typeof context !== 'object') {
	    return null;
	  } else if (!context.hasOwnProperty(part)) {
	    // Some opcodes create the path as they're going along
	    if (op === 'set') {
	      context[part] = {};
	    } else if (op === 'unshift') {
	      context[part] = [];
	    } else {
	      return null;
	    }
	  }

	  if (pointer.length !== 0) {
	    return this._traverse(context[part], pointer, originalPointer, op, params);
	  }

	  switch (op) {
	    case 'set':
	      context[part] = params[0];
	      break;
	    case 'unset':
	      if (Array.isArray(context)) {
	        context.splice(part, 1);
	      } else {
	        delete context[part];
	      }
	      break;
	    case 'extend':
	      if (typeof context[part] !== 'object') {
	        throw new Error('Tried to extend a non-object');
	      }
	      extend(true, context[part], params[0]);
	      break;
	    case 'unshift':
	      if (typeof context[part] === 'undefined') {
	        context[part] = [ ];
	      } else if (!Array.isArray(context[part])) {
	        throw new Error('Operator "unshift" must be applied to an array.');
	      }
	      context[part].unshift(params[0]);
	      break;
	    case 'filter':
	      if (Array.isArray(context[part])) {
	        context[part].forEach(function(element, i) {
	          if (typeof element === 'object' && element.hasOwnProperty(params[0]) && element[params[0]] === params[1]) {
	            var subpointer = originalPointer + '/' + i;
	            var subcommands = normalizeSubcommands(params.slice(2));

	            subcommands.forEach(function(subcommand) {
	              var op = subcommand[0];
	              var pointer = subpointer + subcommand[1];
	              _this.applyUpdate(op, pointer, subcommand.slice(2));
	            });
	          }
	        });
	      }
	      break;
	    default:
	      throw new Error('Unsupported op '+op);
	  }
	};

	BlobObj.prototype.escapeToken = function(token) {
	  return token.replace(/[~\/]/g, function(key) {
	    return key === '~' ? '~0' : '~1';
	  });
	};

	BlobObj.prototype.unescapeToken = function(str) {
	  return str.replace(/~./g, function(m) {
	    switch (m) {
	      case '~0':
	        return '~';
	      case '~1':
	        return '/';
	    }
	    throw new Error('Invalid tilde escape: ' + m);
	  });
	};

	/**
	 * Sumbit update to blob vault
	 */

	BlobObj.prototype.postUpdate = function(op, pointer, params, fn) {
	  // Callback is optional
	  if (typeof fn !== 'function') {
	    fn = function(){};
	  }

	  if (typeof op === 'string') {
	    op = BlobObj.ops[op];
	  }

	  if (typeof op !== 'number') {
	    throw new Error('Blob update op code must be a number or a valid op id string');
	  }

	  if (op < 0 || op > 255) {
	    throw new Error('Blob update op code out of bounds');
	  }

	  //console.log('client: blob: submitting update', BlobObj.opsReverseMap[op], pointer, params);

	  params.unshift(pointer);
	  params.unshift(op);

	  var config = {
	    method: 'POST',
	    url: this.url + '/v1/blob/patch',
	    dataType: 'json',
	    data: {
	      blob_id: this.id,
	      patch: crypt.encrypt(this.key, JSON.stringify(params))
	    }
	  };


	  var signedRequest = new SignedRequest(config);

	  var signed = signedRequest.signHmac(this.data.auth_secret, this.id);

	  request.post(signed.url)
	  .send(signed.data)
	  .end(function(err, resp) {
	    if (err) {
	      fn(new Error('Patch could not be saved - XHR error'));
	    } else if (!resp.body || resp.body.result !== 'success') {
	      fn(new Error('Patch could not be saved - bad result')); 
	    } else {
	      fn(null, resp.body);
	    }
	  });
	};

	/***** helper functions *****/

	function normalizeSubcommands(subcommands, compress) {
	  // Normalize parameter structure
	  if (/(number|string)/.test(typeof subcommands[0])) {
	    // Case 1: Single subcommand inline
	    subcommands = [subcommands];
	  } else if (subcommands.length === 1 && Array.isArray(subcommands[0]) && /(number|string)/.test(typeof subcommands[0][0])) {
	    // Case 2: Single subcommand as array
	    // (nothing to do)
	  } else if (Array.isArray(subcommands[0])) {
	    // Case 3: Multiple subcommands as array of arrays
	    subcommands = subcommands[0];
	  }

	  // Normalize op name and convert strings to numeric codes
	  subcommands = subcommands.map(function(subcommand) {
	    if (typeof subcommand[0] === 'string') {
	      subcommand[0] = BlobObj.ops[subcommand[0]];
	    }

	    if (typeof subcommand[0] !== 'number') {
	      throw new Error('Invalid op in subcommand');
	    }

	    if (typeof subcommand[1] !== 'string') {
	      throw new Error('Invalid path in subcommand');
	    }

	    return subcommand;
	  });

	  if (compress) {
	    // Convert to the minimal possible format
	    if (subcommands.length === 1) {
	      return subcommands[0];
	    } else {
	      return [subcommands];
	    }
	  } else {
	    return subcommands;
	  }
	}


	/***** identity ****/

	/** 
	 * Identity class
	 * 
	 */

	var Identity = function (blob) {
	  this._getBlob = function() {
	    return blob;
	  };
	}; 

	/**
	 * getFullAddress
	 * returns the address formed into a text string
	 * @param {string} key - Encryption key
	 */

	Identity.prototype.getFullAddress = function (key) {
	  var blob = this._getBlob();
	  if (!blob || 
	      !blob.data || 
	      !blob.data[identityRoot] ||
	      !blob.data[identityRoot].address) {
	    return "";
	  }     
	  
	  var address = this.get('address', key);
	  var text    = "";
	  
	  if (address.value.contact)    text += address.value.contact;
	  if (address.value.line1)      text += " " + address.value.line1;
	  if (address.value.line2)      text += " " + address.value.line2;
	  if (address.value.city)       text += " " + address.value.city;
	  if (address.value.region)     text += " " + address.value.region;
	  if (address.value.postalCode) text += " " + address.value.postalCode;
	  if (address.value.country)    text += " " + address.value.country;
	  return text;
	};

	/**
	 * getAll
	 * get and decrypt all identity fields
	 * @param {string} key  - Encryption key
	 * @param {function} fn - Callback function
	 */

	Identity.prototype.getAll = function (key) {
	  var blob = this._getBlob();
	  if (!blob || !blob.data || !blob.data[identityRoot]) {
	    return {};
	  }   
	  
	  var result = {}, identity = blob.data[identityRoot];
	  for (var i in identity) {
	    result[i] = this.get(i, key);
	  }
	  
	  return result;
	};

	/**
	 * get
	 * get and decrypt a single identity field
	 * @param {string} pointer - Field to retrieve
	 * @param {string} key     - Encryption key
	 */

	Identity.prototype.get = function (pointer, key) {
	  var blob = this._getBlob();
	  if (!blob || !blob.data || !blob.data[identityRoot]) {
	    return null;
	  }
	  
	  var data = blob.data[identityRoot][pointer];
	  if (data && data.encrypted) {
	    return decrypt(key, data);
	    
	  } else if (data) {
	    return data;
	    
	  } else {
	    return null;
	  }
	  
	  function decrypt (key, data) {
	    var value;
	    var result = {encrypted : true};
	    
	    try {
	      value = crypt.decrypt(key, data.value);
	    } catch (e) {
	      result.value  = data.value;
	      result.error  = e; 
	      return result;
	    }
	    
	    try {
	      result.value = JSON.parse(value);
	    } catch (e) {
	      result.value = value;
	    }
	    
	    return result;
	  }
	};

	/**
	 * set
	 * set and encrypt a single identity field.
	 * @param {string} pointer - Field to set
	 * @param {string} key     - Encryption key
	 * @param {string} value   - Unencrypted data
	 * @param {function} fn    - Callback function
	 */

	Identity.prototype.set = function (pointer, key, value, fn) {
	  var self = this, blob = this._getBlob();
	  
	  if (!fn) fn = function(){ };
	  
	  //check fields for validity
	  if (identityFields.indexOf(pointer) === -1) {
	    return fn(new Error("invalid identity field"));   
	  
	  //validate address fields  
	  } else if (pointer === 'address') {
	    if (typeof value !== 'object') {
	      return fn(new Error("address must be an object"));   
	    }
	    
	    for (var addressField in value) {
	      if (addressFields.indexOf(addressField) === -1) {
	        return fn(new Error("invalid address field"));   
	      }
	    }
	  
	  //validate nationalID fields  
	  } else if (pointer === 'nationalID') {
	    if (typeof value !== 'object') {
	      return fn(new Error("nationalID must be an object"));   
	    }
	    
	    for (var idField in value) {
	      if (nationalIDFields.indexOf(idField) === -1) {
	        return fn(new Error("invalid nationalID field"));   
	      }
	      
	      if (idField === 'type') {
	        if (idTypeFields.indexOf(value[idField]) === -1) {
	          return fn(new Error("invalid nationalID type"));   
	        }      
	      }
	    }   
	    
	  //validate entity type   
	  } else if (pointer === 'entityType') {
	    if (entityTypes.indexOf(value) === -1) {
	      return fn(new Error("invalid entity type"));   
	    }     
	  }

	  async.waterfall([ validate, set ], fn);
	    
	  //make sure the identity setup is valid
	  function validate (callback) {
	   
	    if (!blob) return fn(new Error("Identity must be associated with a blob"));
	    else if (!blob.data) return fn(new Error("Invalid Blob"));  
	    else if (!blob.data[identityRoot]) {
	      blob.set("/" + identityRoot, {}, function(err, res){
	        if (err) return callback (err);
	        else     return callback (null);
	      }); 
	    } else return callback (null);
	  };
	    
	  function set (callback) {

	    //NOTE: currently we will overwrite if it already exists
	    //the other option would be to require decrypting with the
	    //existing key as a form of authorization
	    //var current = self.get(pointer, key);  
	    //if (current && current.error) {
	    //  return fn ? fn(current.error) : undefined;
	    //}
	    
	    var data = {};
	    data[pointer] = {
	      encrypted : key ? true : false,
	      value     : key ? encrypt(key, value) : value  
	    };
	    
	    self._getBlob().extend("/" + identityRoot, data, callback);
	  };
	  
	  function encrypt (key, value) {
	    if (typeof value === 'object') value = JSON.stringify(value);
	    return crypt.encrypt(key, value);
	  }
	};

	/**
	 * unset
	 * remove a single identity field - will only be removed
	 * with a valid decryption key
	 * @param {string} pointer - Field to remove
	 * @param {string} key     - Encryption key
	 * @param {function} fn    - Callback function
	 */

	Identity.prototype.unset = function (pointer, key, fn) {
	  
	  if (!fn) fn = function(){ };
	  
	  //NOTE: this is rather useless since you can overwrite
	  //without an encryption key
	  var data = this.get(pointer, key);
	  if (data && data.error) {
	    return fn(data.error);
	  }
	  
	  this._getBlob().unset("/" + identityRoot+"/" + pointer, fn);
	};

	/***** blob client methods ****/

	/**
	 * Blob object class
	 */ 
	 
	exports.Blob = BlobObj;

	/**
	 * Get ripple name for a given address
	 */

	exports.getRippleName = function(url, address, fn) {
	  if (!crypt.isValidAddress(address)) {
	    return fn (new Error('Invalid ripple address'));
	  }

	  if (!crypt.isValidAddress(address)) return fn (new Error("Invalid ripple address"));
	  request.get(url + '/v1/user/' + address, function(err, resp){
	    if (err) {
	      fn(new Error('Unable to access vault sever'));
	    } else if (resp.body && resp.body.username) {
	      fn(null, resp.body.username);
	    } else if (resp.body && resp.body.exists === false) {
	      fn (new Error('No ripple name for this address'));
	    } else {
	      fn(new Error('Unable to determine if ripple name exists'));
	    }
	  });
	};

	/**
	 * Retrive a blob with url, id and key
	 */

	BlobClient.get = function (url, id, crypt, fn) {
	  var blob = new BlobObj(url, id, crypt);
	  blob.init(fn);
	};

	/**
	 * Verify email address
	 */

	BlobClient.verify = function(url, username, token, fn) {
	  url += '/v1/user/' + username + '/verify/' + token;
	  request.get(url, function(err, resp) {
	    if (err) {    
	      fn(new Error("Failed to verify the account - XHR error"));
	    } else if (resp.body && resp.body.result === 'success') {
	      fn(null, resp.body);
	    } else {
	      fn(new Error('Failed to verify the account'));
	    }
	  });
	};

	/**
	 * ResendEmail
	 * resend verification email
	 */

	BlobClient.resendEmail = function (opts, fn) {
	  var config = {
	    method : 'POST',
	    url    : opts.url + '/v1/user/email',
	    data   : {
	      blob_id  : opts.id,
	      username : opts.username,
	      email    : opts.email,
	      hostlink : opts.activateLink
	    }
	  };

	  var signedRequest = new SignedRequest(config);
	  var signed = signedRequest.signAsymmetric(opts.masterkey, opts.account_id, opts.id);

	  request.post(signed.url)
	    .send(signed.data)
	    .end(function(err, resp) {
	      if (err) {
	        console.log("blob: could not resend the token:", err);
	        fn(new Error("Failed to resend the token"));
	      } else if (resp.body && resp.body.result === 'success') {
	        fn(null, resp.body);
	      } else if (resp.body && resp.body.result === 'error') {
	        console.log("blob: could not resend the token:", resp.body.message);
	        fn(new Error("Failed to resend the token"));
	      } else {
	        fn(new Error("Failed to resend the token")); 
	      }
	    });
	};

	/**
	 * RecoverBlob
	 * recover a blob using the account secret
	 * @param {object} opts
	 * @param {string} opts.url
	 * @param {string} opts.username
	 * @param {string} opts.masterkey
	 * @param {function} fn
	 */

	BlobClient.recoverBlob = function (opts, fn) {
	  var username = String(opts.username).trim();
	  var config   = {
	    method : 'GET',
	    url    : opts.url + '/v1/user/recov/' + username,
	  };

	  var signedRequest = new SignedRequest(config);
	  var signed = signedRequest.signAsymmetricRecovery(opts.masterkey, username);  

	  request.get(signed.url)
	    .end(function(err, resp) {
	      if (err) {
	        fn(err);
	      } else if (resp.body && resp.body.result === 'success') {
	        if (!resp.body.encrypted_blobdecrypt_key) {
	          fn(new Error('Missing encrypted blob decrypt key.'));      
	        } else {
	          handleRecovery(resp);  
	        }       
	      } else if (resp.body && resp.body.result === 'error') {
	        fn(new Error(resp.body.message)); 
	      } else {
	        fn(new Error('Could not recover blob'));
	      }
	    });
	    
	  function handleRecovery (resp) {
	    //decrypt crypt key
	    var crypt = decryptBlobCrypt(opts.masterkey, resp.body.encrypted_blobdecrypt_key);
	    var blob  = new BlobObj(opts.url, resp.body.blob_id, crypt);
	    
	    blob.revision = resp.body.revision;
	    blob.encrypted_secret = resp.body.encrypted_secret;

	    if (!blob.decrypt(resp.body.blob)) {
	      return fn(new Error('Error while decrypting blob'));
	    }

	    //Apply patches
	    if (resp.body.patches && resp.body.patches.length) {
	      var successful = true;
	      resp.body.patches.forEach(function(patch) {
	        successful = successful && blob.applyEncryptedPatch(patch);
	      });

	      if (successful) {
	        blob.consolidate();
	      }
	    }

	    //return with newly decrypted blob
	    fn(null, blob);
	  };
	};

	/**
	 * updateKeys
	 * Change the blob encryption keys
	 * @param {object} opts
	 * @param {string} opts.username
	 * @param {object} opts.keys
	 * @param {object} opts.blob
	 * @param {string} masterkey
	 */

	BlobClient.updateKeys = function (opts, fn) {
	  var old_id    = opts.blob.id;
	  opts.blob.id  = opts.keys.id;
	  opts.blob.key = opts.keys.crypt;
	  opts.blob.encrypted_secret = opts.blob.encryptSecret(opts.keys.unlock, opts.masterkey);
	  
	  var config = {
	    method : 'POST',
	    url    : opts.blob.url + '/v1/user/' + opts.username + '/updatekeys',
	    data   : {
	      blob_id  : opts.blob.id,
	      data     : opts.blob.encrypt(),
	      revision : opts.blob.revision,
	      encrypted_secret : opts.blob.encrypted_secret,
	      encrypted_blobdecrypt_key : opts.blob.encryptBlobCrypt(opts.masterkey, opts.keys.crypt),
	    }
	  };

	  var signedRequest = new SignedRequest(config);
	  var signed = signedRequest.signAsymmetric(opts.masterkey, opts.blob.data.account_id, old_id); 

	  request.post(signed.url)
	    .send(signed.data)
	    .end(function(err, resp) {
	      if (err) {
	        console.log("blob: could not update blob:", err);
	        fn(new Error('Failed to update blob - XHR error'));
	      } else if (!resp.body || resp.body.result !== 'success') {
	        console.log("blob: could not update blob:", resp.body ? resp.body.message : null);
	        fn(new Error('Failed to update blob - bad result')); 
	      } else {
	        fn(null, resp.body);
	      }
	    });     
	}; 
	 
	/**
	 * rename
	 * Change the username
	 * @param {object} opts
	 * @param {string} opts.username
	 * @param {string} opts.new_username
	 * @param {object} opts.keys
	 * @param {object} opts.blob
	 * @param {string} masterkey
	 */

	BlobClient.rename = function (opts, fn) {
	  var old_id    = opts.blob.id;
	  opts.blob.id  = opts.keys.id;
	  opts.blob.key = opts.keys.crypt;
	  opts.blob.encryptedSecret = opts.blob.encryptSecret(opts.keys.unlock, opts.masterkey);

	  var config = {
	    method: 'POST',
	    url: opts.blob.url + '/v1/user/' + opts.username + '/rename',
	    data: {
	      blob_id  : opts.blob.id,
	      username : opts.new_username,
	      data     : opts.blob.encrypt(),
	      revision : opts.blob.revision,
	      encrypted_secret : opts.blob.encryptedSecret,
	      encrypted_blobdecrypt_key : opts.blob.encryptBlobCrypt(opts.masterkey, opts.keys.crypt)
	    }
	  };

	  var signedRequest = new SignedRequest(config);
	  var signed = signedRequest.signAsymmetric(opts.masterkey, opts.blob.data.account_id, old_id);

	  request.post(signed.url)
	    .send(signed.data)
	    .end(function(err, resp) {
	      if (err) {
	        console.log("blob: could not rename:", err);
	        fn(new Error("Failed to rename"));
	      } else if (resp.body && resp.body.result === 'success') {
	        fn(null, resp.body);
	      } else if (resp.body && resp.body.result === 'error') {
	        console.log("blob: could not rename:", resp.body.message);
	        fn(new Error("Failed to rename"));
	      } else {
	        fn(new Error("Failed to rename"));
	      }
	    });
	};

	/**
	 * Create a blob object
	 *
	 * @param {object} options
	 * @param {string} options.url
	 * @param {string} options.id
	 * @param {string} options.crypt
	 * @param {string} options.unlock
	 * @param {string} options.username
	 * @param {string} options.masterkey
	 * @param {object} options.oldUserBlob
	 * @param {function} fn
	 */

	BlobClient.create = function(options, fn) {
	  var blob = new BlobObj(options.url, options.id, options.crypt);

	  blob.revision = 0;

	  blob.data = {
	    auth_secret : crypt.createSecret(8),
	    account_id  : crypt.getAddress(options.masterkey),
	    email       : options.email,
	    contacts    : [],
	    created     : (new Date()).toJSON()
	  };

	  blob.encrypted_secret = blob.encryptSecret(options.unlock, options.masterkey);

	  // Migration
	  if (options.oldUserBlob) {
	    blob.data.contacts = options.oldUserBlob.data.contacts;
	  }

	  //post to the blob vault to create
	  var config = {
	    method : 'POST',
	    url    : options.url + '/v1/user',
	    data   : {
	      blob_id     : options.id,
	      username    : options.username,
	      address     : blob.data.account_id,
	      auth_secret : blob.data.auth_secret,
	      data        : blob.encrypt(),
	      email       : options.email,
	      hostlink    : options.activateLink,
	      domain      : options.domain,
	      encrypted_blobdecrypt_key : blob.encryptBlobCrypt(options.masterkey, options.crypt),
	      encrypted_secret : blob.encrypted_secret
	    }
	  };

	  var signedRequest = new SignedRequest(config);
	  var signed = signedRequest.signAsymmetric(options.masterkey, blob.data.account_id, options.id);

	  request.post(signed.url)
	    .send(signed.data)
	    .end(function(err, resp) {
	      if (err) {
	        fn(err);
	      } else if (resp.body && resp.body.result === 'success') {
	        fn(null, blob, resp.body);
	      } else if (resp.body && resp.body.result === 'error') {
	        fn(new Error(resp.body.message)); 
	      } else {
	        fn(new Error('Could not create blob'));
	      }
	    });
	};

	exports.BlobClient = BlobClient;


/***/ },
/* 33 */
/***/ function(module, exports, __webpack_require__) {

	// Copyright (c) 2005  Tom Wu
	// All Rights Reserved.
	// See "LICENSE" for details.

	// Basic JavaScript BN library - subset useful for RSA encryption.

	// Bits per digit
	var dbits;

	// JavaScript engine analysis
	var canary = 0xdeadbeefcafe;
	var j_lm = ((canary&0xffffff)==0xefcafe);

	// (public) Constructor
	function BigInteger(a,b,c) {
	  if(a != null)
	    if("number" == typeof a) this.fromNumber(a,b,c);
	    else if(b == null && "string" != typeof a) this.fromString(a,256);
	    else this.fromString(a,b);
	}

	// return new, unset BigInteger
	function nbi() { return new BigInteger(null); }

	// am: Compute w_j += (x*this_i), propagate carries,
	// c is initial carry, returns final carry.
	// c < 3*dvalue, x < 2*dvalue, this_i < dvalue
	// We need to select the fastest one that works in this environment.

	// am1: use a single mult and divide to get the high bits,
	// max digit bits should be 26 because
	// max internal value = 2*dvalue^2-2*dvalue (< 2^53)
	function am1(i,x,w,j,c,n) {
	  while(--n >= 0) {
	    var v = x*this[i++]+w[j]+c;
	    c = Math.floor(v/0x4000000);
	    w[j++] = v&0x3ffffff;
	  }
	  return c;
	}
	// am2 avoids a big mult-and-extract completely.
	// Max digit bits should be <= 30 because we do bitwise ops
	// on values up to 2*hdvalue^2-hdvalue-1 (< 2^31)
	function am2(i,x,w,j,c,n) {
	  var xl = x&0x7fff, xh = x>>15;
	  while(--n >= 0) {
	    var l = this[i]&0x7fff;
	    var h = this[i++]>>15;
	    var m = xh*l+h*xl;
	    l = xl*l+((m&0x7fff)<<15)+w[j]+(c&0x3fffffff);
	    c = (l>>>30)+(m>>>15)+xh*h+(c>>>30);
	    w[j++] = l&0x3fffffff;
	  }
	  return c;
	}
	// Alternately, set max digit bits to 28 since some
	// browsers slow down when dealing with 32-bit numbers.
	function am3(i,x,w,j,c,n) {
	  var xl = x&0x3fff, xh = x>>14;
	  while(--n >= 0) {
	    var l = this[i]&0x3fff;
	    var h = this[i++]>>14;
	    var m = xh*l+h*xl;
	    l = xl*l+((m&0x3fff)<<14)+w[j]+c;
	    c = (l>>28)+(m>>14)+xh*h;
	    w[j++] = l&0xfffffff;
	  }
	  return c;
	}
	if(j_lm && 'undefined' !== typeof navigator && (navigator.appName == "Microsoft Internet Explorer")) {
	  BigInteger.prototype.am = am2;
	  dbits = 30;
	}
	else if(j_lm && 'undefined' !== typeof navigator && (navigator.appName != "Netscape")) {
	  BigInteger.prototype.am = am1;
	  dbits = 26;
	}
	else { // Mozilla/Netscape seems to prefer am3
	  BigInteger.prototype.am = am3;
	  dbits = 28;
	}

	BigInteger.prototype.DB = dbits;
	BigInteger.prototype.DM = ((1<<dbits)-1);
	BigInteger.prototype.DV = (1<<dbits);

	var BI_FP = 52;
	BigInteger.prototype.FV = Math.pow(2,BI_FP);
	BigInteger.prototype.F1 = BI_FP-dbits;
	BigInteger.prototype.F2 = 2*dbits-BI_FP;

	// Digit conversions
	var BI_RM = "0123456789abcdefghijklmnopqrstuvwxyz";
	var BI_RC = new Array();
	var rr,vv;
	rr = "0".charCodeAt(0);
	for(vv = 0; vv <= 9; ++vv) BI_RC[rr++] = vv;
	rr = "a".charCodeAt(0);
	for(vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;
	rr = "A".charCodeAt(0);
	for(vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;

	function int2char(n) { return BI_RM.charAt(n); }
	function intAt(s,i) {
	  var c = BI_RC[s.charCodeAt(i)];
	  return (c==null)?-1:c;
	}

	// (protected) copy this to r
	function bnpCopyTo(r) {
	  for(var i = this.t-1; i >= 0; --i) r[i] = this[i];
	  r.t = this.t;
	  r.s = this.s;
	}

	// (protected) set from integer value x, -DV <= x < DV
	function bnpFromInt(x) {
	  this.t = 1;
	  this.s = (x<0)?-1:0;
	  if(x > 0) this[0] = x;
	  else if(x < -1) this[0] = x+this.DV;
	  else this.t = 0;
	}

	// return bigint initialized to value
	function nbv(i) { var r = nbi(); r.fromInt(i); return r; }

	// (protected) set from string and radix
	function bnpFromString(s,b) {
	  var k;
	  if(b == 16) k = 4;
	  else if(b == 8) k = 3;
	  else if(b == 256) k = 8; // byte array
	  else if(b == 2) k = 1;
	  else if(b == 32) k = 5;
	  else if(b == 4) k = 2;
	  else { this.fromRadix(s,b); return; }
	  this.t = 0;
	  this.s = 0;
	  var i = s.length, mi = false, sh = 0;
	  while(--i >= 0) {
	    var x = (k==8)?s[i]&0xff:intAt(s,i);
	    if(x < 0) {
	      if(s.charAt(i) == "-") mi = true;
	      continue;
	    }
	    mi = false;
	    if(sh == 0)
	      this[this.t++] = x;
	    else if(sh+k > this.DB) {
	      this[this.t-1] |= (x&((1<<(this.DB-sh))-1))<<sh;
	      this[this.t++] = (x>>(this.DB-sh));
	    }
	    else
	      this[this.t-1] |= x<<sh;
	    sh += k;
	    if(sh >= this.DB) sh -= this.DB;
	  }
	  if(k == 8 && (s[0]&0x80) != 0) {
	    this.s = -1;
	    if(sh > 0) this[this.t-1] |= ((1<<(this.DB-sh))-1)<<sh;
	  }
	  this.clamp();
	  if(mi) BigInteger.ZERO.subTo(this,this);
	}

	// (protected) clamp off excess high words
	function bnpClamp() {
	  var c = this.s&this.DM;
	  while(this.t > 0 && this[this.t-1] == c) --this.t;
	}

	// (public) return string representation in given radix
	function bnToString(b) {
	  if(this.s < 0) return "-"+this.negate().toString(b);
	  var k;
	  if(b == 16) k = 4;
	  else if(b == 8) k = 3;
	  else if(b == 2) k = 1;
	  else if(b == 32) k = 5;
	  else if(b == 4) k = 2;
	  else return this.toRadix(b);
	  var km = (1<<k)-1, d, m = false, r = "", i = this.t;
	  var p = this.DB-(i*this.DB)%k;
	  if(i-- > 0) {
	    if(p < this.DB && (d = this[i]>>p) > 0) { m = true; r = int2char(d); }
	    while(i >= 0) {
	      if(p < k) {
	        d = (this[i]&((1<<p)-1))<<(k-p);
	        d |= this[--i]>>(p+=this.DB-k);
	      }
	      else {
	        d = (this[i]>>(p-=k))&km;
	        if(p <= 0) { p += this.DB; --i; }
	      }
	      if(d > 0) m = true;
	      if(m) r += int2char(d);
	    }
	  }
	  return m?r:"0";
	}

	// (public) -this
	function bnNegate() { var r = nbi(); BigInteger.ZERO.subTo(this,r); return r; }

	// (public) |this|
	function bnAbs() { return (this.s<0)?this.negate():this; }

	// (public) return + if this > a, - if this < a, 0 if equal
	function bnCompareTo(a) {
	  var r = this.s-a.s;
	  if(r != 0) return r;
	  var i = this.t;
	  r = i-a.t;
	  if(r != 0) return (this.s<0)?-r:r;
	  while(--i >= 0) if((r=this[i]-a[i]) != 0) return r;
	  return 0;
	}

	// returns bit length of the integer x
	function nbits(x) {
	  var r = 1, t;
	  if((t=x>>>16) != 0) { x = t; r += 16; }
	  if((t=x>>8) != 0) { x = t; r += 8; }
	  if((t=x>>4) != 0) { x = t; r += 4; }
	  if((t=x>>2) != 0) { x = t; r += 2; }
	  if((t=x>>1) != 0) { x = t; r += 1; }
	  return r;
	}

	// (public) return the number of bits in "this"
	function bnBitLength() {
	  if(this.t <= 0) return 0;
	  return this.DB*(this.t-1)+nbits(this[this.t-1]^(this.s&this.DM));
	}

	// (protected) r = this << n*DB
	function bnpDLShiftTo(n,r) {
	  var i;
	  for(i = this.t-1; i >= 0; --i) r[i+n] = this[i];
	  for(i = n-1; i >= 0; --i) r[i] = 0;
	  r.t = this.t+n;
	  r.s = this.s;
	}

	// (protected) r = this >> n*DB
	function bnpDRShiftTo(n,r) {
	  for(var i = n; i < this.t; ++i) r[i-n] = this[i];
	  r.t = Math.max(this.t-n,0);
	  r.s = this.s;
	}

	// (protected) r = this << n
	function bnpLShiftTo(n,r) {
	  var bs = n%this.DB;
	  var cbs = this.DB-bs;
	  var bm = (1<<cbs)-1;
	  var ds = Math.floor(n/this.DB), c = (this.s<<bs)&this.DM, i;
	  for(i = this.t-1; i >= 0; --i) {
	    r[i+ds+1] = (this[i]>>cbs)|c;
	    c = (this[i]&bm)<<bs;
	  }
	  for(i = ds-1; i >= 0; --i) r[i] = 0;
	  r[ds] = c;
	  r.t = this.t+ds+1;
	  r.s = this.s;
	  r.clamp();
	}

	// (protected) r = this >> n
	function bnpRShiftTo(n,r) {
	  r.s = this.s;
	  var ds = Math.floor(n/this.DB);
	  if(ds >= this.t) { r.t = 0; return; }
	  var bs = n%this.DB;
	  var cbs = this.DB-bs;
	  var bm = (1<<bs)-1;
	  r[0] = this[ds]>>bs;
	  for(var i = ds+1; i < this.t; ++i) {
	    r[i-ds-1] |= (this[i]&bm)<<cbs;
	    r[i-ds] = this[i]>>bs;
	  }
	  if(bs > 0) r[this.t-ds-1] |= (this.s&bm)<<cbs;
	  r.t = this.t-ds;
	  r.clamp();
	}

	// (protected) r = this - a
	function bnpSubTo(a,r) {
	  var i = 0, c = 0, m = Math.min(a.t,this.t);
	  while(i < m) {
	    c += this[i]-a[i];
	    r[i++] = c&this.DM;
	    c >>= this.DB;
	  }
	  if(a.t < this.t) {
	    c -= a.s;
	    while(i < this.t) {
	      c += this[i];
	      r[i++] = c&this.DM;
	      c >>= this.DB;
	    }
	    c += this.s;
	  }
	  else {
	    c += this.s;
	    while(i < a.t) {
	      c -= a[i];
	      r[i++] = c&this.DM;
	      c >>= this.DB;
	    }
	    c -= a.s;
	  }
	  r.s = (c<0)?-1:0;
	  if(c < -1) r[i++] = this.DV+c;
	  else if(c > 0) r[i++] = c;
	  r.t = i;
	  r.clamp();
	}

	// (protected) r = this * a, r != this,a (HAC 14.12)
	// "this" should be the larger one if appropriate.
	function bnpMultiplyTo(a,r) {
	  var x = this.abs(), y = a.abs();
	  var i = x.t;
	  r.t = i+y.t;
	  while(--i >= 0) r[i] = 0;
	  for(i = 0; i < y.t; ++i) r[i+x.t] = x.am(0,y[i],r,i,0,x.t);
	  r.s = 0;
	  r.clamp();
	  if(this.s != a.s) BigInteger.ZERO.subTo(r,r);
	}

	// (protected) r = this^2, r != this (HAC 14.16)
	function bnpSquareTo(r) {
	  var x = this.abs();
	  var i = r.t = 2*x.t;
	  while(--i >= 0) r[i] = 0;
	  for(i = 0; i < x.t-1; ++i) {
	    var c = x.am(i,x[i],r,2*i,0,1);
	    if((r[i+x.t]+=x.am(i+1,2*x[i],r,2*i+1,c,x.t-i-1)) >= x.DV) {
	      r[i+x.t] -= x.DV;
	      r[i+x.t+1] = 1;
	    }
	  }
	  if(r.t > 0) r[r.t-1] += x.am(i,x[i],r,2*i,0,1);
	  r.s = 0;
	  r.clamp();
	}

	// (protected) divide this by m, quotient and remainder to q, r (HAC 14.20)
	// r != q, this != m.  q or r may be null.
	function bnpDivRemTo(m,q,r) {
	  var pm = m.abs();
	  if(pm.t <= 0) return;
	  var pt = this.abs();
	  if(pt.t < pm.t) {
	    if(q != null) q.fromInt(0);
	    if(r != null) this.copyTo(r);
	    return;
	  }
	  if(r == null) r = nbi();
	  var y = nbi(), ts = this.s, ms = m.s;
	  var nsh = this.DB-nbits(pm[pm.t-1]);	// normalize modulus
	  if(nsh > 0) { pm.lShiftTo(nsh,y); pt.lShiftTo(nsh,r); }
	  else { pm.copyTo(y); pt.copyTo(r); }
	  var ys = y.t;
	  var y0 = y[ys-1];
	  if(y0 == 0) return;
	  var yt = y0*(1<<this.F1)+((ys>1)?y[ys-2]>>this.F2:0);
	  var d1 = this.FV/yt, d2 = (1<<this.F1)/yt, e = 1<<this.F2;
	  var i = r.t, j = i-ys, t = (q==null)?nbi():q;
	  y.dlShiftTo(j,t);
	  if(r.compareTo(t) >= 0) {
	    r[r.t++] = 1;
	    r.subTo(t,r);
	  }
	  BigInteger.ONE.dlShiftTo(ys,t);
	  t.subTo(y,y);	// "negative" y so we can replace sub with am later
	  while(y.t < ys) y[y.t++] = 0;
	  while(--j >= 0) {
	    // Estimate quotient digit
	    var qd = (r[--i]==y0)?this.DM:Math.floor(r[i]*d1+(r[i-1]+e)*d2);
	    if((r[i]+=y.am(0,qd,r,j,0,ys)) < qd) {	// Try it out
	      y.dlShiftTo(j,t);
	      r.subTo(t,r);
	      while(r[i] < --qd) r.subTo(t,r);
	    }
	  }
	  if(q != null) {
	    r.drShiftTo(ys,q);
	    if(ts != ms) BigInteger.ZERO.subTo(q,q);
	  }
	  r.t = ys;
	  r.clamp();
	  if(nsh > 0) r.rShiftTo(nsh,r);	// Denormalize remainder
	  if(ts < 0) BigInteger.ZERO.subTo(r,r);
	}

	// (public) this mod a
	function bnMod(a) {
	  var r = nbi();
	  this.abs().divRemTo(a,null,r);
	  if(this.s < 0 && r.compareTo(BigInteger.ZERO) > 0) a.subTo(r,r);
	  return r;
	}

	// Modular reduction using "classic" algorithm
	function Classic(m) { this.m = m; }
	function cConvert(x) {
	  if(x.s < 0 || x.compareTo(this.m) >= 0) return x.mod(this.m);
	  else return x;
	}
	function cRevert(x) { return x; }
	function cReduce(x) { x.divRemTo(this.m,null,x); }
	function cMulTo(x,y,r) { x.multiplyTo(y,r); this.reduce(r); }
	function cSqrTo(x,r) { x.squareTo(r); this.reduce(r); }

	Classic.prototype.convert = cConvert;
	Classic.prototype.revert = cRevert;
	Classic.prototype.reduce = cReduce;
	Classic.prototype.mulTo = cMulTo;
	Classic.prototype.sqrTo = cSqrTo;

	// (protected) return "-1/this % 2^DB"; useful for Mont. reduction
	// justification:
	//         xy == 1 (mod m)
	//         xy =  1+km
	//   xy(2-xy) = (1+km)(1-km)
	// x[y(2-xy)] = 1-k^2m^2
	// x[y(2-xy)] == 1 (mod m^2)
	// if y is 1/x mod m, then y(2-xy) is 1/x mod m^2
	// should reduce x and y(2-xy) by m^2 at each step to keep size bounded.
	// JS multiply "overflows" differently from C/C++, so care is needed here.
	function bnpInvDigit() {
	  if(this.t < 1) return 0;
	  var x = this[0];
	  if((x&1) == 0) return 0;
	  var y = x&3;		// y == 1/x mod 2^2
	  y = (y*(2-(x&0xf)*y))&0xf;	// y == 1/x mod 2^4
	  y = (y*(2-(x&0xff)*y))&0xff;	// y == 1/x mod 2^8
	  y = (y*(2-(((x&0xffff)*y)&0xffff)))&0xffff;	// y == 1/x mod 2^16
	  // last step - calculate inverse mod DV directly;
	  // assumes 16 < DB <= 32 and assumes ability to handle 48-bit ints
	  y = (y*(2-x*y%this.DV))%this.DV;		// y == 1/x mod 2^dbits
	  // we really want the negative inverse, and -DV < y < DV
	  return (y>0)?this.DV-y:-y;
	}

	// Montgomery reduction
	function Montgomery(m) {
	  this.m = m;
	  this.mp = m.invDigit();
	  this.mpl = this.mp&0x7fff;
	  this.mph = this.mp>>15;
	  this.um = (1<<(m.DB-15))-1;
	  this.mt2 = 2*m.t;
	}

	// xR mod m
	function montConvert(x) {
	  var r = nbi();
	  x.abs().dlShiftTo(this.m.t,r);
	  r.divRemTo(this.m,null,r);
	  if(x.s < 0 && r.compareTo(BigInteger.ZERO) > 0) this.m.subTo(r,r);
	  return r;
	}

	// x/R mod m
	function montRevert(x) {
	  var r = nbi();
	  x.copyTo(r);
	  this.reduce(r);
	  return r;
	}

	// x = x/R mod m (HAC 14.32)
	function montReduce(x) {
	  while(x.t <= this.mt2)	// pad x so am has enough room later
	    x[x.t++] = 0;
	  for(var i = 0; i < this.m.t; ++i) {
	    // faster way of calculating u0 = x[i]*mp mod DV
	    var j = x[i]&0x7fff;
	    var u0 = (j*this.mpl+(((j*this.mph+(x[i]>>15)*this.mpl)&this.um)<<15))&x.DM;
	    // use am to combine the multiply-shift-add into one call
	    j = i+this.m.t;
	    x[j] += this.m.am(0,u0,x,i,0,this.m.t);
	    // propagate carry
	    while(x[j] >= x.DV) { x[j] -= x.DV; x[++j]++; }
	  }
	  x.clamp();
	  x.drShiftTo(this.m.t,x);
	  if(x.compareTo(this.m) >= 0) x.subTo(this.m,x);
	}

	// r = "x^2/R mod m"; x != r
	function montSqrTo(x,r) { x.squareTo(r); this.reduce(r); }

	// r = "xy/R mod m"; x,y != r
	function montMulTo(x,y,r) { x.multiplyTo(y,r); this.reduce(r); }

	Montgomery.prototype.convert = montConvert;
	Montgomery.prototype.revert = montRevert;
	Montgomery.prototype.reduce = montReduce;
	Montgomery.prototype.mulTo = montMulTo;
	Montgomery.prototype.sqrTo = montSqrTo;

	// (protected) true iff this is even
	function bnpIsEven() { return ((this.t>0)?(this[0]&1):this.s) == 0; }

	// (protected) this^e, e < 2^32, doing sqr and mul with "r" (HAC 14.79)
	function bnpExp(e,z) {
	  if(e > 0xffffffff || e < 1) return BigInteger.ONE;
	  var r = nbi(), r2 = nbi(), g = z.convert(this), i = nbits(e)-1;
	  g.copyTo(r);
	  while(--i >= 0) {
	    z.sqrTo(r,r2);
	    if((e&(1<<i)) > 0) z.mulTo(r2,g,r);
	    else { var t = r; r = r2; r2 = t; }
	  }
	  return z.revert(r);
	}

	// (public) this^e % m, 0 <= e < 2^32
	function bnModPowInt(e,m) {
	  var z;
	  if(e < 256 || m.isEven()) z = new Classic(m); else z = new Montgomery(m);
	  return this.exp(e,z);
	}

	// (public)
	function bnClone() { var r = nbi(); this.copyTo(r); return r; }

	// (public) return value as integer
	function bnIntValue() {
	  if(this.s < 0) {
	    if(this.t == 1) return this[0]-this.DV;
	    else if(this.t == 0) return -1;
	  }
	  else if(this.t == 1) return this[0];
	  else if(this.t == 0) return 0;
	  // assumes 16 < DB < 32
	  return ((this[1]&((1<<(32-this.DB))-1))<<this.DB)|this[0];
	}

	// (public) return value as byte
	function bnByteValue() { return (this.t==0)?this.s:(this[0]<<24)>>24; }

	// (public) return value as short (assumes DB>=16)
	function bnShortValue() { return (this.t==0)?this.s:(this[0]<<16)>>16; }

	// (protected) return x s.t. r^x < DV
	function bnpChunkSize(r) { return Math.floor(Math.LN2*this.DB/Math.log(r)); }

	// (public) 0 if this == 0, 1 if this > 0
	function bnSigNum() {
	  if(this.s < 0) return -1;
	  else if(this.t <= 0 || (this.t == 1 && this[0] <= 0)) return 0;
	  else return 1;
	}

	// (protected) convert to radix string
	function bnpToRadix(b) {
	  if(b == null) b = 10;
	  if(this.signum() == 0 || b < 2 || b > 36) return "0";
	  var cs = this.chunkSize(b);
	  var a = Math.pow(b,cs);
	  var d = nbv(a), y = nbi(), z = nbi(), r = "";
	  this.divRemTo(d,y,z);
	  while(y.signum() > 0) {
	    r = (a+z.intValue()).toString(b).substr(1) + r;
	    y.divRemTo(d,y,z);
	  }
	  return z.intValue().toString(b) + r;
	}

	// (protected) convert from radix string
	function bnpFromRadix(s,b) {
	  this.fromInt(0);
	  if(b == null) b = 10;
	  var cs = this.chunkSize(b);
	  var d = Math.pow(b,cs), mi = false, j = 0, w = 0;
	  for(var i = 0; i < s.length; ++i) {
	    var x = intAt(s,i);
	    if(x < 0) {
	      if(s.charAt(i) == "-" && this.signum() == 0) mi = true;
	      continue;
	    }
	    w = b*w+x;
	    if(++j >= cs) {
	      this.dMultiply(d);
	      this.dAddOffset(w,0);
	      j = 0;
	      w = 0;
	    }
	  }
	  if(j > 0) {
	    this.dMultiply(Math.pow(b,j));
	    this.dAddOffset(w,0);
	  }
	  if(mi) BigInteger.ZERO.subTo(this,this);
	}

	// (protected) alternate constructor
	function bnpFromNumber(a,b,c) {
	  if("number" == typeof b) {
	    // new BigInteger(int,int,RNG)
	    if(a < 2) this.fromInt(1);
	    else {
	      this.fromNumber(a,c);
	      if(!this.testBit(a-1))	// force MSB set
	        this.bitwiseTo(BigInteger.ONE.shiftLeft(a-1),op_or,this);
	      if(this.isEven()) this.dAddOffset(1,0); // force odd
	      while(!this.isProbablePrime(b)) {
	        this.dAddOffset(2,0);
	        if(this.bitLength() > a) this.subTo(BigInteger.ONE.shiftLeft(a-1),this);
	      }
	    }
	  }
	  else {
	    // new BigInteger(int,RNG)
	    var x = new Array(), t = a&7;
	    x.length = (a>>3)+1;
	    b.nextBytes(x);
	    if(t > 0) x[0] &= ((1<<t)-1); else x[0] = 0;
	    this.fromString(x,256);
	  }
	}

	// (public) convert to bigendian byte array
	function bnToByteArray() {
	  var i = this.t, r = new Array();
	  r[0] = this.s;
	  var p = this.DB-(i*this.DB)%8, d, k = 0;
	  if(i-- > 0) {
	    if(p < this.DB && (d = this[i]>>p) != (this.s&this.DM)>>p)
	      r[k++] = d|(this.s<<(this.DB-p));
	    while(i >= 0) {
	      if(p < 8) {
	        d = (this[i]&((1<<p)-1))<<(8-p);
	        d |= this[--i]>>(p+=this.DB-8);
	      }
	      else {
	        d = (this[i]>>(p-=8))&0xff;
	        if(p <= 0) { p += this.DB; --i; }
	      }
	      if((d&0x80) != 0) d |= -256;
	      if(k == 0 && (this.s&0x80) != (d&0x80)) ++k;
	      if(k > 0 || d != this.s) r[k++] = d;
	    }
	  }
	  return r;
	}

	function bnEquals(a) { return(this.compareTo(a)==0); }
	function bnMin(a) { return(this.compareTo(a)<0)?this:a; }
	function bnMax(a) { return(this.compareTo(a)>0)?this:a; }

	// (protected) r = this op a (bitwise)
	function bnpBitwiseTo(a,op,r) {
	  var i, f, m = Math.min(a.t,this.t);
	  for(i = 0; i < m; ++i) r[i] = op(this[i],a[i]);
	  if(a.t < this.t) {
	    f = a.s&this.DM;
	    for(i = m; i < this.t; ++i) r[i] = op(this[i],f);
	    r.t = this.t;
	  }
	  else {
	    f = this.s&this.DM;
	    for(i = m; i < a.t; ++i) r[i] = op(f,a[i]);
	    r.t = a.t;
	  }
	  r.s = op(this.s,a.s);
	  r.clamp();
	}

	// (public) this & a
	function op_and(x,y) { return x&y; }
	function bnAnd(a) { var r = nbi(); this.bitwiseTo(a,op_and,r); return r; }

	// (public) this | a
	function op_or(x,y) { return x|y; }
	function bnOr(a) { var r = nbi(); this.bitwiseTo(a,op_or,r); return r; }

	// (public) this ^ a
	function op_xor(x,y) { return x^y; }
	function bnXor(a) { var r = nbi(); this.bitwiseTo(a,op_xor,r); return r; }

	// (public) this & ~a
	function op_andnot(x,y) { return x&~y; }
	function bnAndNot(a) { var r = nbi(); this.bitwiseTo(a,op_andnot,r); return r; }

	// (public) ~this
	function bnNot() {
	  var r = nbi();
	  for(var i = 0; i < this.t; ++i) r[i] = this.DM&~this[i];
	  r.t = this.t;
	  r.s = ~this.s;
	  return r;
	}

	// (public) this << n
	function bnShiftLeft(n) {
	  var r = nbi();
	  if(n < 0) this.rShiftTo(-n,r); else this.lShiftTo(n,r);
	  return r;
	}

	// (public) this >> n
	function bnShiftRight(n) {
	  var r = nbi();
	  if(n < 0) this.lShiftTo(-n,r); else this.rShiftTo(n,r);
	  return r;
	}

	// return index of lowest 1-bit in x, x < 2^31
	function lbit(x) {
	  if(x == 0) return -1;
	  var r = 0;
	  if((x&0xffff) == 0) { x >>= 16; r += 16; }
	  if((x&0xff) == 0) { x >>= 8; r += 8; }
	  if((x&0xf) == 0) { x >>= 4; r += 4; }
	  if((x&3) == 0) { x >>= 2; r += 2; }
	  if((x&1) == 0) ++r;
	  return r;
	}

	// (public) returns index of lowest 1-bit (or -1 if none)
	function bnGetLowestSetBit() {
	  for(var i = 0; i < this.t; ++i)
	    if(this[i] != 0) return i*this.DB+lbit(this[i]);
	  if(this.s < 0) return this.t*this.DB;
	  return -1;
	}

	// return number of 1 bits in x
	function cbit(x) {
	  var r = 0;
	  while(x != 0) { x &= x-1; ++r; }
	  return r;
	}

	// (public) return number of set bits
	function bnBitCount() {
	  var r = 0, x = this.s&this.DM;
	  for(var i = 0; i < this.t; ++i) r += cbit(this[i]^x);
	  return r;
	}

	// (public) true iff nth bit is set
	function bnTestBit(n) {
	  var j = Math.floor(n/this.DB);
	  if(j >= this.t) return(this.s!=0);
	  return((this[j]&(1<<(n%this.DB)))!=0);
	}

	// (protected) this op (1<<n)
	function bnpChangeBit(n,op) {
	  var r = BigInteger.ONE.shiftLeft(n);
	  this.bitwiseTo(r,op,r);
	  return r;
	}

	// (public) this | (1<<n)
	function bnSetBit(n) { return this.changeBit(n,op_or); }

	// (public) this & ~(1<<n)
	function bnClearBit(n) { return this.changeBit(n,op_andnot); }

	// (public) this ^ (1<<n)
	function bnFlipBit(n) { return this.changeBit(n,op_xor); }

	// (protected) r = this + a
	function bnpAddTo(a,r) {
	  var i = 0, c = 0, m = Math.min(a.t,this.t);
	  while(i < m) {
	    c += this[i]+a[i];
	    r[i++] = c&this.DM;
	    c >>= this.DB;
	  }
	  if(a.t < this.t) {
	    c += a.s;
	    while(i < this.t) {
	      c += this[i];
	      r[i++] = c&this.DM;
	      c >>= this.DB;
	    }
	    c += this.s;
	  }
	  else {
	    c += this.s;
	    while(i < a.t) {
	      c += a[i];
	      r[i++] = c&this.DM;
	      c >>= this.DB;
	    }
	    c += a.s;
	  }
	  r.s = (c<0)?-1:0;
	  if(c > 0) r[i++] = c;
	  else if(c < -1) r[i++] = this.DV+c;
	  r.t = i;
	  r.clamp();
	}

	// (public) this + a
	function bnAdd(a) { var r = nbi(); this.addTo(a,r); return r; }

	// (public) this - a
	function bnSubtract(a) { var r = nbi(); this.subTo(a,r); return r; }

	// (public) this * a
	function bnMultiply(a) { var r = nbi(); this.multiplyTo(a,r); return r; }

	// (public) this^2
	function bnSquare() { var r = nbi(); this.squareTo(r); return r; }

	// (public) this / a
	function bnDivide(a) { var r = nbi(); this.divRemTo(a,r,null); return r; }

	// (public) this % a
	function bnRemainder(a) { var r = nbi(); this.divRemTo(a,null,r); return r; }

	// (public) [this/a,this%a]
	function bnDivideAndRemainder(a) {
	  var q = nbi(), r = nbi();
	  this.divRemTo(a,q,r);
	  return new Array(q,r);
	}

	// (protected) this *= n, this >= 0, 1 < n < DV
	function bnpDMultiply(n) {
	  this[this.t] = this.am(0,n-1,this,0,0,this.t);
	  ++this.t;
	  this.clamp();
	}

	// (protected) this += n << w words, this >= 0
	function bnpDAddOffset(n,w) {
	  if(n == 0) return;
	  while(this.t <= w) this[this.t++] = 0;
	  this[w] += n;
	  while(this[w] >= this.DV) {
	    this[w] -= this.DV;
	    if(++w >= this.t) this[this.t++] = 0;
	    ++this[w];
	  }
	}

	// A "null" reducer
	function NullExp() {}
	function nNop(x) { return x; }
	function nMulTo(x,y,r) { x.multiplyTo(y,r); }
	function nSqrTo(x,r) { x.squareTo(r); }

	NullExp.prototype.convert = nNop;
	NullExp.prototype.revert = nNop;
	NullExp.prototype.mulTo = nMulTo;
	NullExp.prototype.sqrTo = nSqrTo;

	// (public) this^e
	function bnPow(e) { return this.exp(e,new NullExp()); }

	// (protected) r = lower n words of "this * a", a.t <= n
	// "this" should be the larger one if appropriate.
	function bnpMultiplyLowerTo(a,n,r) {
	  var i = Math.min(this.t+a.t,n);
	  r.s = 0; // assumes a,this >= 0
	  r.t = i;
	  while(i > 0) r[--i] = 0;
	  var j;
	  for(j = r.t-this.t; i < j; ++i) r[i+this.t] = this.am(0,a[i],r,i,0,this.t);
	  for(j = Math.min(a.t,n); i < j; ++i) this.am(0,a[i],r,i,0,n-i);
	  r.clamp();
	}

	// (protected) r = "this * a" without lower n words, n > 0
	// "this" should be the larger one if appropriate.
	function bnpMultiplyUpperTo(a,n,r) {
	  --n;
	  var i = r.t = this.t+a.t-n;
	  r.s = 0; // assumes a,this >= 0
	  while(--i >= 0) r[i] = 0;
	  for(i = Math.max(n-this.t,0); i < a.t; ++i)
	    r[this.t+i-n] = this.am(n-i,a[i],r,0,0,this.t+i-n);
	  r.clamp();
	  r.drShiftTo(1,r);
	}

	// Barrett modular reduction
	function Barrett(m) {
	  // setup Barrett
	  this.r2 = nbi();
	  this.q3 = nbi();
	  BigInteger.ONE.dlShiftTo(2*m.t,this.r2);
	  this.mu = this.r2.divide(m);
	  this.m = m;
	}

	function barrettConvert(x) {
	  if(x.s < 0 || x.t > 2*this.m.t) return x.mod(this.m);
	  else if(x.compareTo(this.m) < 0) return x;
	  else { var r = nbi(); x.copyTo(r); this.reduce(r); return r; }
	}

	function barrettRevert(x) { return x; }

	// x = x mod m (HAC 14.42)
	function barrettReduce(x) {
	  x.drShiftTo(this.m.t-1,this.r2);
	  if(x.t > this.m.t+1) { x.t = this.m.t+1; x.clamp(); }
	  this.mu.multiplyUpperTo(this.r2,this.m.t+1,this.q3);
	  this.m.multiplyLowerTo(this.q3,this.m.t+1,this.r2);
	  while(x.compareTo(this.r2) < 0) x.dAddOffset(1,this.m.t+1);
	  x.subTo(this.r2,x);
	  while(x.compareTo(this.m) >= 0) x.subTo(this.m,x);
	}

	// r = x^2 mod m; x != r
	function barrettSqrTo(x,r) { x.squareTo(r); this.reduce(r); }

	// r = x*y mod m; x,y != r
	function barrettMulTo(x,y,r) { x.multiplyTo(y,r); this.reduce(r); }

	Barrett.prototype.convert = barrettConvert;
	Barrett.prototype.revert = barrettRevert;
	Barrett.prototype.reduce = barrettReduce;
	Barrett.prototype.mulTo = barrettMulTo;
	Barrett.prototype.sqrTo = barrettSqrTo;

	// (public) this^e % m (HAC 14.85)
	function bnModPow(e,m) {
	  var i = e.bitLength(), k, r = nbv(1), z;
	  if(i <= 0) return r;
	  else if(i < 18) k = 1;
	  else if(i < 48) k = 3;
	  else if(i < 144) k = 4;
	  else if(i < 768) k = 5;
	  else k = 6;
	  if(i < 8)
	    z = new Classic(m);
	  else if(m.isEven())
	    z = new Barrett(m);
	  else
	    z = new Montgomery(m);

	  // precomputation
	  var g = new Array(), n = 3, k1 = k-1, km = (1<<k)-1;
	  g[1] = z.convert(this);
	  if(k > 1) {
	    var g2 = nbi();
	    z.sqrTo(g[1],g2);
	    while(n <= km) {
	      g[n] = nbi();
	      z.mulTo(g2,g[n-2],g[n]);
	      n += 2;
	    }
	  }

	  var j = e.t-1, w, is1 = true, r2 = nbi(), t;
	  i = nbits(e[j])-1;
	  while(j >= 0) {
	    if(i >= k1) w = (e[j]>>(i-k1))&km;
	    else {
	      w = (e[j]&((1<<(i+1))-1))<<(k1-i);
	      if(j > 0) w |= e[j-1]>>(this.DB+i-k1);
	    }

	    n = k;
	    while((w&1) == 0) { w >>= 1; --n; }
	    if((i -= n) < 0) { i += this.DB; --j; }
	    if(is1) {	// ret == 1, don't bother squaring or multiplying it
	      g[w].copyTo(r);
	      is1 = false;
	    }
	    else {
	      while(n > 1) { z.sqrTo(r,r2); z.sqrTo(r2,r); n -= 2; }
	      if(n > 0) z.sqrTo(r,r2); else { t = r; r = r2; r2 = t; }
	      z.mulTo(r2,g[w],r);
	    }

	    while(j >= 0 && (e[j]&(1<<i)) == 0) {
	      z.sqrTo(r,r2); t = r; r = r2; r2 = t;
	      if(--i < 0) { i = this.DB-1; --j; }
	    }
	  }
	  return z.revert(r);
	}

	// (public) gcd(this,a) (HAC 14.54)
	function bnGCD(a) {
	  var x = (this.s<0)?this.negate():this.clone();
	  var y = (a.s<0)?a.negate():a.clone();
	  if(x.compareTo(y) < 0) { var t = x; x = y; y = t; }
	  var i = x.getLowestSetBit(), g = y.getLowestSetBit();
	  if(g < 0) return x;
	  if(i < g) g = i;
	  if(g > 0) {
	    x.rShiftTo(g,x);
	    y.rShiftTo(g,y);
	  }
	  while(x.signum() > 0) {
	    if((i = x.getLowestSetBit()) > 0) x.rShiftTo(i,x);
	    if((i = y.getLowestSetBit()) > 0) y.rShiftTo(i,y);
	    if(x.compareTo(y) >= 0) {
	      x.subTo(y,x);
	      x.rShiftTo(1,x);
	    }
	    else {
	      y.subTo(x,y);
	      y.rShiftTo(1,y);
	    }
	  }
	  if(g > 0) y.lShiftTo(g,y);
	  return y;
	}

	// (protected) this % n, n < 2^26
	function bnpModInt(n) {
	  if(n <= 0) return 0;
	  var d = this.DV%n, r = (this.s<0)?n-1:0;
	  if(this.t > 0)
	    if(d == 0) r = this[0]%n;
	    else for(var i = this.t-1; i >= 0; --i) r = (d*r+this[i])%n;
	  return r;
	}

	// (public) 1/this % m (HAC 14.61)
	function bnModInverse(m) {
	  var ac = m.isEven();
	  if((this.isEven() && ac) || m.signum() == 0) return BigInteger.ZERO;
	  var u = m.clone(), v = this.clone();
	  var a = nbv(1), b = nbv(0), c = nbv(0), d = nbv(1);
	  while(u.signum() != 0) {
	    while(u.isEven()) {
	      u.rShiftTo(1,u);
	      if(ac) {
	        if(!a.isEven() || !b.isEven()) { a.addTo(this,a); b.subTo(m,b); }
	        a.rShiftTo(1,a);
	      }
	      else if(!b.isEven()) b.subTo(m,b);
	      b.rShiftTo(1,b);
	    }
	    while(v.isEven()) {
	      v.rShiftTo(1,v);
	      if(ac) {
	        if(!c.isEven() || !d.isEven()) { c.addTo(this,c); d.subTo(m,d); }
	        c.rShiftTo(1,c);
	      }
	      else if(!d.isEven()) d.subTo(m,d);
	      d.rShiftTo(1,d);
	    }
	    if(u.compareTo(v) >= 0) {
	      u.subTo(v,u);
	      if(ac) a.subTo(c,a);
	      b.subTo(d,b);
	    }
	    else {
	      v.subTo(u,v);
	      if(ac) c.subTo(a,c);
	      d.subTo(b,d);
	    }
	  }
	  if(v.compareTo(BigInteger.ONE) != 0) return BigInteger.ZERO;
	  if(d.compareTo(m) >= 0) return d.subtract(m);
	  if(d.signum() < 0) d.addTo(m,d); else return d;
	  if(d.signum() < 0) return d.add(m); else return d;
	}

	var lowprimes = [2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97,101,103,107,109,113,127,131,137,139,149,151,157,163,167,173,179,181,191,193,197,199,211,223,227,229,233,239,241,251,257,263,269,271,277,281,283,293,307,311,313,317,331,337,347,349,353,359,367,373,379,383,389,397,401,409,419,421,431,433,439,443,449,457,461,463,467,479,487,491,499,503,509,521,523,541,547,557,563,569,571,577,587,593,599,601,607,613,617,619,631,641,643,647,653,659,661,673,677,683,691,701,709,719,727,733,739,743,751,757,761,769,773,787,797,809,811,821,823,827,829,839,853,857,859,863,877,881,883,887,907,911,919,929,937,941,947,953,967,971,977,983,991,997];
	var lplim = (1<<26)/lowprimes[lowprimes.length-1];

	// (public) test primality with certainty >= 1-.5^t
	function bnIsProbablePrime(t) {
	  var i, x = this.abs();
	  if(x.t == 1 && x[0] <= lowprimes[lowprimes.length-1]) {
	    for(i = 0; i < lowprimes.length; ++i)
	      if(x[0] == lowprimes[i]) return true;
	    return false;
	  }
	  if(x.isEven()) return false;
	  i = 1;
	  while(i < lowprimes.length) {
	    var m = lowprimes[i], j = i+1;
	    while(j < lowprimes.length && m < lplim) m *= lowprimes[j++];
	    m = x.modInt(m);
	    while(i < j) if(m%lowprimes[i++] == 0) return false;
	  }
	  return x.millerRabin(t);
	}

	// (protected) true if probably prime (HAC 4.24, Miller-Rabin)
	function bnpMillerRabin(t) {
	  var n1 = this.subtract(BigInteger.ONE);
	  var k = n1.getLowestSetBit();
	  if(k <= 0) return false;
	  var r = n1.shiftRight(k);
	  t = (t+1)>>1;
	  if(t > lowprimes.length) t = lowprimes.length;
	  var a = nbi();
	  for(var i = 0; i < t; ++i) {
	    //Pick bases at random, instead of starting at 2
	    a.fromInt(lowprimes[Math.floor(Math.random()*lowprimes.length)]);
	    var y = a.modPow(r,this);
	    if(y.compareTo(BigInteger.ONE) != 0 && y.compareTo(n1) != 0) {
	      var j = 1;
	      while(j++ < k && y.compareTo(n1) != 0) {
	        y = y.modPowInt(2,this);
	        if(y.compareTo(BigInteger.ONE) == 0) return false;
	      }
	      if(y.compareTo(n1) != 0) return false;
	    }
	  }
	  return true;
	}


	// protected
	BigInteger.prototype.chunkSize = bnpChunkSize;
	BigInteger.prototype.toRadix = bnpToRadix;
	BigInteger.prototype.fromRadix = bnpFromRadix;
	BigInteger.prototype.fromNumber = bnpFromNumber;
	BigInteger.prototype.bitwiseTo = bnpBitwiseTo;
	BigInteger.prototype.changeBit = bnpChangeBit;
	BigInteger.prototype.addTo = bnpAddTo;
	BigInteger.prototype.dMultiply = bnpDMultiply;
	BigInteger.prototype.dAddOffset = bnpDAddOffset;
	BigInteger.prototype.multiplyLowerTo = bnpMultiplyLowerTo;
	BigInteger.prototype.multiplyUpperTo = bnpMultiplyUpperTo;
	BigInteger.prototype.modInt = bnpModInt;
	BigInteger.prototype.millerRabin = bnpMillerRabin;

	BigInteger.prototype.copyTo = bnpCopyTo;
	BigInteger.prototype.fromInt = bnpFromInt;
	BigInteger.prototype.fromString = bnpFromString;
	BigInteger.prototype.clamp = bnpClamp;
	BigInteger.prototype.dlShiftTo = bnpDLShiftTo;
	BigInteger.prototype.drShiftTo = bnpDRShiftTo;
	BigInteger.prototype.lShiftTo = bnpLShiftTo;
	BigInteger.prototype.rShiftTo = bnpRShiftTo;
	BigInteger.prototype.subTo = bnpSubTo;
	BigInteger.prototype.multiplyTo = bnpMultiplyTo;
	BigInteger.prototype.squareTo = bnpSquareTo;
	BigInteger.prototype.divRemTo = bnpDivRemTo;
	BigInteger.prototype.invDigit = bnpInvDigit;
	BigInteger.prototype.isEven = bnpIsEven;
	BigInteger.prototype.exp = bnpExp;

	// public
	BigInteger.prototype.toString = bnToString;
	BigInteger.prototype.negate = bnNegate;
	BigInteger.prototype.abs = bnAbs;
	BigInteger.prototype.compareTo = bnCompareTo;
	BigInteger.prototype.bitLength = bnBitLength;
	BigInteger.prototype.mod = bnMod;
	BigInteger.prototype.modPowInt = bnModPowInt;

	BigInteger.prototype.clone = bnClone;
	BigInteger.prototype.intValue = bnIntValue;
	BigInteger.prototype.byteValue = bnByteValue;
	BigInteger.prototype.shortValue = bnShortValue;
	BigInteger.prototype.signum = bnSigNum;
	BigInteger.prototype.toByteArray = bnToByteArray;
	BigInteger.prototype.equals = bnEquals;
	BigInteger.prototype.min = bnMin;
	BigInteger.prototype.max = bnMax;
	BigInteger.prototype.and = bnAnd;
	BigInteger.prototype.or = bnOr;
	BigInteger.prototype.xor = bnXor;
	BigInteger.prototype.andNot = bnAndNot;
	BigInteger.prototype.not = bnNot;
	BigInteger.prototype.shiftLeft = bnShiftLeft;
	BigInteger.prototype.shiftRight = bnShiftRight;
	BigInteger.prototype.getLowestSetBit = bnGetLowestSetBit;
	BigInteger.prototype.bitCount = bnBitCount;
	BigInteger.prototype.testBit = bnTestBit;
	BigInteger.prototype.setBit = bnSetBit;
	BigInteger.prototype.clearBit = bnClearBit;
	BigInteger.prototype.flipBit = bnFlipBit;
	BigInteger.prototype.add = bnAdd;
	BigInteger.prototype.subtract = bnSubtract;
	BigInteger.prototype.multiply = bnMultiply;
	BigInteger.prototype.divide = bnDivide;
	BigInteger.prototype.remainder = bnRemainder;
	BigInteger.prototype.divideAndRemainder = bnDivideAndRemainder;
	BigInteger.prototype.modPow = bnModPow;
	BigInteger.prototype.modInverse = bnModInverse;
	BigInteger.prototype.pow = bnPow;
	BigInteger.prototype.gcd = bnGCD;
	BigInteger.prototype.isProbablePrime = bnIsProbablePrime;

	// JSBN-specific extension
	BigInteger.prototype.square = bnSquare;

	// "constants"
	BigInteger.ZERO = nbv(0);
	BigInteger.ONE = nbv(1);

	// BigInteger interfaces not implemented in jsbn:

	// BigInteger(int signum, byte[] magnitude)
	// double doubleValue()
	// float floatValue()
	// int hashCode()
	// long longValue()
	// static BigInteger valueOf(long val)

	BigInteger.valueOf = nbi;

	exports.BigInteger = BigInteger;


/***/ },
/* 34 */
/***/ function(module, exports, __webpack_require__) {

	// If there is no WebSocket, try MozWebSocket (support for some old browsers)
	try {
	  module.exports = WebSocket;
	} catch(err) {
	  module.exports = MozWebSocket;
	}

	// Some versions of Safari Mac 5 and Safari iOS 4 seem to support websockets,
	// but can't communicate with websocketpp, which is what rippled uses.
	//
	// Note that we check for both the WebSocket protocol version the browser seems
	// to implement as well as the user agent etc. The reason is that we want to err
	// on the side of trying to connect since we don't want to accidentally disable
	// a browser that would normally work fine.
	var match, versionRegexp = /Version\/(\d+)\.(\d+)(?:\.(\d+))?.*Safari\//;
	if (
	  // Is browser
	  "object" === typeof navigator &&
	  "string" === typeof navigator.userAgent &&
	  // Is Safari
	  (match = versionRegexp.exec(navigator.userAgent)) &&
	  // And uses the old websocket protocol
	  2 === window.WebSocket.CLOSED
	) {
	  // Is iOS
	  if (/iP(hone|od|ad)/.test(navigator.platform)) {
	    // Below version 5 is broken
	    if (+match[1] < 5) {
	      module.exports = void(0);
	    }
	  // Is any other Mac OS
	  // If you want to refactor this code, be careful, iOS user agents contain the
	  // string "like Mac OS X".
	  } else if (navigator.appVersion.indexOf("Mac") !== -1) {
	    // Below version 6 is broken
	    if (+match[1] < 6) {
	      module.exports = void(0);
	    }
	  }
	}


/***/ },
/* 35 */
/***/ function(module, exports, __webpack_require__) {

	// Copyright Joyent, Inc. and other Node contributors.
	//
	// Permission is hereby granted, free of charge, to any person obtaining a
	// copy of this software and associated documentation files (the
	// "Software"), to deal in the Software without restriction, including
	// without limitation the rights to use, copy, modify, merge, publish,
	// distribute, sublicense, and/or sell copies of the Software, and to permit
	// persons to whom the Software is furnished to do so, subject to the
	// following conditions:
	//
	// The above copyright notice and this permission notice shall be included
	// in all copies or substantial portions of the Software.
	//
	// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
	// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
	// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
	// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
	// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
	// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
	// USE OR OTHER DEALINGS IN THE SOFTWARE.

	function EventEmitter() {
	  this._events = this._events || {};
	  this._maxListeners = this._maxListeners || undefined;
	}
	module.exports = EventEmitter;

	// Backwards-compat with node 0.10.x
	EventEmitter.EventEmitter = EventEmitter;

	EventEmitter.prototype._events = undefined;
	EventEmitter.prototype._maxListeners = undefined;

	// By default EventEmitters will print a warning if more than 10 listeners are
	// added to it. This is a useful default which helps finding memory leaks.
	EventEmitter.defaultMaxListeners = 10;

	// Obviously not all Emitters should be limited to 10. This function allows
	// that to be increased. Set to zero for unlimited.
	EventEmitter.prototype.setMaxListeners = function(n) {
	  if (!isNumber(n) || n < 0 || isNaN(n))
	    throw TypeError('n must be a positive number');
	  this._maxListeners = n;
	  return this;
	};

	EventEmitter.prototype.emit = function(type) {
	  var er, handler, len, args, i, listeners;

	  if (!this._events)
	    this._events = {};

	  // If there is no 'error' event listener then throw.
	  if (type === 'error') {
	    if (!this._events.error ||
	        (isObject(this._events.error) && !this._events.error.length)) {
	      er = arguments[1];
	      if (er instanceof Error) {
	        throw er; // Unhandled 'error' event
	      }
	      throw TypeError('Uncaught, unspecified "error" event.');
	    }
	  }

	  handler = this._events[type];

	  if (isUndefined(handler))
	    return false;

	  if (isFunction(handler)) {
	    switch (arguments.length) {
	      // fast cases
	      case 1:
	        handler.call(this);
	        break;
	      case 2:
	        handler.call(this, arguments[1]);
	        break;
	      case 3:
	        handler.call(this, arguments[1], arguments[2]);
	        break;
	      // slower
	      default:
	        len = arguments.length;
	        args = new Array(len - 1);
	        for (i = 1; i < len; i++)
	          args[i - 1] = arguments[i];
	        handler.apply(this, args);
	    }
	  } else if (isObject(handler)) {
	    len = arguments.length;
	    args = new Array(len - 1);
	    for (i = 1; i < len; i++)
	      args[i - 1] = arguments[i];

	    listeners = handler.slice();
	    len = listeners.length;
	    for (i = 0; i < len; i++)
	      listeners[i].apply(this, args);
	  }

	  return true;
	};

	EventEmitter.prototype.addListener = function(type, listener) {
	  var m;

	  if (!isFunction(listener))
	    throw TypeError('listener must be a function');

	  if (!this._events)
	    this._events = {};

	  // To avoid recursion in the case that type === "newListener"! Before
	  // adding it to the listeners, first emit "newListener".
	  if (this._events.newListener)
	    this.emit('newListener', type,
	              isFunction(listener.listener) ?
	              listener.listener : listener);

	  if (!this._events[type])
	    // Optimize the case of one listener. Don't need the extra array object.
	    this._events[type] = listener;
	  else if (isObject(this._events[type]))
	    // If we've already got an array, just append.
	    this._events[type].push(listener);
	  else
	    // Adding the second element, need to change to array.
	    this._events[type] = [this._events[type], listener];

	  // Check for listener leak
	  if (isObject(this._events[type]) && !this._events[type].warned) {
	    var m;
	    if (!isUndefined(this._maxListeners)) {
	      m = this._maxListeners;
	    } else {
	      m = EventEmitter.defaultMaxListeners;
	    }

	    if (m && m > 0 && this._events[type].length > m) {
	      this._events[type].warned = true;
	      console.error('(node) warning: possible EventEmitter memory ' +
	                    'leak detected. %d listeners added. ' +
	                    'Use emitter.setMaxListeners() to increase limit.',
	                    this._events[type].length);
	      if (typeof console.trace === 'function') {
	        // not supported in IE 10
	        console.trace();
	      }
	    }
	  }

	  return this;
	};

	EventEmitter.prototype.on = EventEmitter.prototype.addListener;

	EventEmitter.prototype.once = function(type, listener) {
	  if (!isFunction(listener))
	    throw TypeError('listener must be a function');

	  var fired = false;

	  function g() {
	    this.removeListener(type, g);

	    if (!fired) {
	      fired = true;
	      listener.apply(this, arguments);
	    }
	  }

	  g.listener = listener;
	  this.on(type, g);

	  return this;
	};

	// emits a 'removeListener' event iff the listener was removed
	EventEmitter.prototype.removeListener = function(type, listener) {
	  var list, position, length, i;

	  if (!isFunction(listener))
	    throw TypeError('listener must be a function');

	  if (!this._events || !this._events[type])
	    return this;

	  list = this._events[type];
	  length = list.length;
	  position = -1;

	  if (list === listener ||
	      (isFunction(list.listener) && list.listener === listener)) {
	    delete this._events[type];
	    if (this._events.removeListener)
	      this.emit('removeListener', type, listener);

	  } else if (isObject(list)) {
	    for (i = length; i-- > 0;) {
	      if (list[i] === listener ||
	          (list[i].listener && list[i].listener === listener)) {
	        position = i;
	        break;
	      }
	    }

	    if (position < 0)
	      return this;

	    if (list.length === 1) {
	      list.length = 0;
	      delete this._events[type];
	    } else {
	      list.splice(position, 1);
	    }

	    if (this._events.removeListener)
	      this.emit('removeListener', type, listener);
	  }

	  return this;
	};

	EventEmitter.prototype.removeAllListeners = function(type) {
	  var key, listeners;

	  if (!this._events)
	    return this;

	  // not listening for removeListener, no need to emit
	  if (!this._events.removeListener) {
	    if (arguments.length === 0)
	      this._events = {};
	    else if (this._events[type])
	      delete this._events[type];
	    return this;
	  }

	  // emit removeListener for all listeners on all events
	  if (arguments.length === 0) {
	    for (key in this._events) {
	      if (key === 'removeListener') continue;
	      this.removeAllListeners(key);
	    }
	    this.removeAllListeners('removeListener');
	    this._events = {};
	    return this;
	  }

	  listeners = this._events[type];

	  if (isFunction(listeners)) {
	    this.removeListener(type, listeners);
	  } else {
	    // LIFO order
	    while (listeners.length)
	      this.removeListener(type, listeners[listeners.length - 1]);
	  }
	  delete this._events[type];

	  return this;
	};

	EventEmitter.prototype.listeners = function(type) {
	  var ret;
	  if (!this._events || !this._events[type])
	    ret = [];
	  else if (isFunction(this._events[type]))
	    ret = [this._events[type]];
	  else
	    ret = this._events[type].slice();
	  return ret;
	};

	EventEmitter.listenerCount = function(emitter, type) {
	  var ret;
	  if (!emitter._events || !emitter._events[type])
	    ret = 0;
	  else if (isFunction(emitter._events[type]))
	    ret = 1;
	  else
	    ret = emitter._events[type].length;
	  return ret;
	};

	function isFunction(arg) {
	  return typeof arg === 'function';
	}

	function isNumber(arg) {
	  return typeof arg === 'number';
	}

	function isObject(arg) {
	  return typeof arg === 'object' && arg !== null;
	}

	function isUndefined(arg) {
	  return arg === void 0;
	}


/***/ },
/* 36 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(global, process) {// Copyright Joyent, Inc. and other Node contributors.
	//
	// Permission is hereby granted, free of charge, to any person obtaining a
	// copy of this software and associated documentation files (the
	// "Software"), to deal in the Software without restriction, including
	// without limitation the rights to use, copy, modify, merge, publish,
	// distribute, sublicense, and/or sell copies of the Software, and to permit
	// persons to whom the Software is furnished to do so, subject to the
	// following conditions:
	//
	// The above copyright notice and this permission notice shall be included
	// in all copies or substantial portions of the Software.
	//
	// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
	// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
	// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
	// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
	// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
	// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
	// USE OR OTHER DEALINGS IN THE SOFTWARE.

	var formatRegExp = /%[sdj%]/g;
	exports.format = function(f) {
	  if (!isString(f)) {
	    var objects = [];
	    for (var i = 0; i < arguments.length; i++) {
	      objects.push(inspect(arguments[i]));
	    }
	    return objects.join(' ');
	  }

	  var i = 1;
	  var args = arguments;
	  var len = args.length;
	  var str = String(f).replace(formatRegExp, function(x) {
	    if (x === '%%') return '%';
	    if (i >= len) return x;
	    switch (x) {
	      case '%s': return String(args[i++]);
	      case '%d': return Number(args[i++]);
	      case '%j':
	        try {
	          return JSON.stringify(args[i++]);
	        } catch (_) {
	          return '[Circular]';
	        }
	      default:
	        return x;
	    }
	  });
	  for (var x = args[i]; i < len; x = args[++i]) {
	    if (isNull(x) || !isObject(x)) {
	      str += ' ' + x;
	    } else {
	      str += ' ' + inspect(x);
	    }
	  }
	  return str;
	};


	// Mark that a method should not be used.
	// Returns a modified function which warns once by default.
	// If --no-deprecation is set, then it is a no-op.
	exports.deprecate = function(fn, msg) {
	  // Allow for deprecating things in the process of starting up.
	  if (isUndefined(global.process)) {
	    return function() {
	      return exports.deprecate(fn, msg).apply(this, arguments);
	    };
	  }

	  if (process.noDeprecation === true) {
	    return fn;
	  }

	  var warned = false;
	  function deprecated() {
	    if (!warned) {
	      if (process.throwDeprecation) {
	        throw new Error(msg);
	      } else if (process.traceDeprecation) {
	        console.trace(msg);
	      } else {
	        console.error(msg);
	      }
	      warned = true;
	    }
	    return fn.apply(this, arguments);
	  }

	  return deprecated;
	};


	var debugs = {};
	var debugEnviron;
	exports.debuglog = function(set) {
	  if (isUndefined(debugEnviron))
	    debugEnviron = process.env.NODE_DEBUG || '';
	  set = set.toUpperCase();
	  if (!debugs[set]) {
	    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
	      var pid = process.pid;
	      debugs[set] = function() {
	        var msg = exports.format.apply(exports, arguments);
	        console.error('%s %d: %s', set, pid, msg);
	      };
	    } else {
	      debugs[set] = function() {};
	    }
	  }
	  return debugs[set];
	};


	/**
	 * Echos the value of a value. Trys to print the value out
	 * in the best way possible given the different types.
	 *
	 * @param {Object} obj The object to print out.
	 * @param {Object} opts Optional options object that alters the output.
	 */
	/* legacy: obj, showHidden, depth, colors*/
	function inspect(obj, opts) {
	  // default options
	  var ctx = {
	    seen: [],
	    stylize: stylizeNoColor
	  };
	  // legacy...
	  if (arguments.length >= 3) ctx.depth = arguments[2];
	  if (arguments.length >= 4) ctx.colors = arguments[3];
	  if (isBoolean(opts)) {
	    // legacy...
	    ctx.showHidden = opts;
	  } else if (opts) {
	    // got an "options" object
	    exports._extend(ctx, opts);
	  }
	  // set default options
	  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
	  if (isUndefined(ctx.depth)) ctx.depth = 2;
	  if (isUndefined(ctx.colors)) ctx.colors = false;
	  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
	  if (ctx.colors) ctx.stylize = stylizeWithColor;
	  return formatValue(ctx, obj, ctx.depth);
	}
	exports.inspect = inspect;


	// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
	inspect.colors = {
	  'bold' : [1, 22],
	  'italic' : [3, 23],
	  'underline' : [4, 24],
	  'inverse' : [7, 27],
	  'white' : [37, 39],
	  'grey' : [90, 39],
	  'black' : [30, 39],
	  'blue' : [34, 39],
	  'cyan' : [36, 39],
	  'green' : [32, 39],
	  'magenta' : [35, 39],
	  'red' : [31, 39],
	  'yellow' : [33, 39]
	};

	// Don't use 'blue' not visible on cmd.exe
	inspect.styles = {
	  'special': 'cyan',
	  'number': 'yellow',
	  'boolean': 'yellow',
	  'undefined': 'grey',
	  'null': 'bold',
	  'string': 'green',
	  'date': 'magenta',
	  // "name": intentionally not styling
	  'regexp': 'red'
	};


	function stylizeWithColor(str, styleType) {
	  var style = inspect.styles[styleType];

	  if (style) {
	    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
	           '\u001b[' + inspect.colors[style][1] + 'm';
	  } else {
	    return str;
	  }
	}


	function stylizeNoColor(str, styleType) {
	  return str;
	}


	function arrayToHash(array) {
	  var hash = {};

	  array.forEach(function(val, idx) {
	    hash[val] = true;
	  });

	  return hash;
	}


	function formatValue(ctx, value, recurseTimes) {
	  // Provide a hook for user-specified inspect functions.
	  // Check that value is an object with an inspect function on it
	  if (ctx.customInspect &&
	      value &&
	      isFunction(value.inspect) &&
	      // Filter out the util module, it's inspect function is special
	      value.inspect !== exports.inspect &&
	      // Also filter out any prototype objects using the circular check.
	      !(value.constructor && value.constructor.prototype === value)) {
	    var ret = value.inspect(recurseTimes, ctx);
	    if (!isString(ret)) {
	      ret = formatValue(ctx, ret, recurseTimes);
	    }
	    return ret;
	  }

	  // Primitive types cannot have properties
	  var primitive = formatPrimitive(ctx, value);
	  if (primitive) {
	    return primitive;
	  }

	  // Look up the keys of the object.
	  var keys = Object.keys(value);
	  var visibleKeys = arrayToHash(keys);

	  if (ctx.showHidden) {
	    keys = Object.getOwnPropertyNames(value);
	  }

	  // IE doesn't make error fields non-enumerable
	  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
	  if (isError(value)
	      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
	    return formatError(value);
	  }

	  // Some type of object without properties can be shortcutted.
	  if (keys.length === 0) {
	    if (isFunction(value)) {
	      var name = value.name ? ': ' + value.name : '';
	      return ctx.stylize('[Function' + name + ']', 'special');
	    }
	    if (isRegExp(value)) {
	      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
	    }
	    if (isDate(value)) {
	      return ctx.stylize(Date.prototype.toString.call(value), 'date');
	    }
	    if (isError(value)) {
	      return formatError(value);
	    }
	  }

	  var base = '', array = false, braces = ['{', '}'];

	  // Make Array say that they are Array
	  if (isArray(value)) {
	    array = true;
	    braces = ['[', ']'];
	  }

	  // Make functions say that they are functions
	  if (isFunction(value)) {
	    var n = value.name ? ': ' + value.name : '';
	    base = ' [Function' + n + ']';
	  }

	  // Make RegExps say that they are RegExps
	  if (isRegExp(value)) {
	    base = ' ' + RegExp.prototype.toString.call(value);
	  }

	  // Make dates with properties first say the date
	  if (isDate(value)) {
	    base = ' ' + Date.prototype.toUTCString.call(value);
	  }

	  // Make error with message first say the error
	  if (isError(value)) {
	    base = ' ' + formatError(value);
	  }

	  if (keys.length === 0 && (!array || value.length == 0)) {
	    return braces[0] + base + braces[1];
	  }

	  if (recurseTimes < 0) {
	    if (isRegExp(value)) {
	      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
	    } else {
	      return ctx.stylize('[Object]', 'special');
	    }
	  }

	  ctx.seen.push(value);

	  var output;
	  if (array) {
	    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
	  } else {
	    output = keys.map(function(key) {
	      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
	    });
	  }

	  ctx.seen.pop();

	  return reduceToSingleString(output, base, braces);
	}


	function formatPrimitive(ctx, value) {
	  if (isUndefined(value))
	    return ctx.stylize('undefined', 'undefined');
	  if (isString(value)) {
	    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
	                                             .replace(/'/g, "\\'")
	                                             .replace(/\\"/g, '"') + '\'';
	    return ctx.stylize(simple, 'string');
	  }
	  if (isNumber(value))
	    return ctx.stylize('' + value, 'number');
	  if (isBoolean(value))
	    return ctx.stylize('' + value, 'boolean');
	  // For some reason typeof null is "object", so special case here.
	  if (isNull(value))
	    return ctx.stylize('null', 'null');
	}


	function formatError(value) {
	  return '[' + Error.prototype.toString.call(value) + ']';
	}


	function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
	  var output = [];
	  for (var i = 0, l = value.length; i < l; ++i) {
	    if (hasOwnProperty(value, String(i))) {
	      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
	          String(i), true));
	    } else {
	      output.push('');
	    }
	  }
	  keys.forEach(function(key) {
	    if (!key.match(/^\d+$/)) {
	      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
	          key, true));
	    }
	  });
	  return output;
	}


	function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
	  var name, str, desc;
	  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
	  if (desc.get) {
	    if (desc.set) {
	      str = ctx.stylize('[Getter/Setter]', 'special');
	    } else {
	      str = ctx.stylize('[Getter]', 'special');
	    }
	  } else {
	    if (desc.set) {
	      str = ctx.stylize('[Setter]', 'special');
	    }
	  }
	  if (!hasOwnProperty(visibleKeys, key)) {
	    name = '[' + key + ']';
	  }
	  if (!str) {
	    if (ctx.seen.indexOf(desc.value) < 0) {
	      if (isNull(recurseTimes)) {
	        str = formatValue(ctx, desc.value, null);
	      } else {
	        str = formatValue(ctx, desc.value, recurseTimes - 1);
	      }
	      if (str.indexOf('\n') > -1) {
	        if (array) {
	          str = str.split('\n').map(function(line) {
	            return '  ' + line;
	          }).join('\n').substr(2);
	        } else {
	          str = '\n' + str.split('\n').map(function(line) {
	            return '   ' + line;
	          }).join('\n');
	        }
	      }
	    } else {
	      str = ctx.stylize('[Circular]', 'special');
	    }
	  }
	  if (isUndefined(name)) {
	    if (array && key.match(/^\d+$/)) {
	      return str;
	    }
	    name = JSON.stringify('' + key);
	    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
	      name = name.substr(1, name.length - 2);
	      name = ctx.stylize(name, 'name');
	    } else {
	      name = name.replace(/'/g, "\\'")
	                 .replace(/\\"/g, '"')
	                 .replace(/(^"|"$)/g, "'");
	      name = ctx.stylize(name, 'string');
	    }
	  }

	  return name + ': ' + str;
	}


	function reduceToSingleString(output, base, braces) {
	  var numLinesEst = 0;
	  var length = output.reduce(function(prev, cur) {
	    numLinesEst++;
	    if (cur.indexOf('\n') >= 0) numLinesEst++;
	    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
	  }, 0);

	  if (length > 60) {
	    return braces[0] +
	           (base === '' ? '' : base + '\n ') +
	           ' ' +
	           output.join(',\n  ') +
	           ' ' +
	           braces[1];
	  }

	  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
	}


	// NOTE: These type checking functions intentionally don't use `instanceof`
	// because it is fragile and can be easily faked with `Object.create()`.
	function isArray(ar) {
	  return Array.isArray(ar);
	}
	exports.isArray = isArray;

	function isBoolean(arg) {
	  return typeof arg === 'boolean';
	}
	exports.isBoolean = isBoolean;

	function isNull(arg) {
	  return arg === null;
	}
	exports.isNull = isNull;

	function isNullOrUndefined(arg) {
	  return arg == null;
	}
	exports.isNullOrUndefined = isNullOrUndefined;

	function isNumber(arg) {
	  return typeof arg === 'number';
	}
	exports.isNumber = isNumber;

	function isString(arg) {
	  return typeof arg === 'string';
	}
	exports.isString = isString;

	function isSymbol(arg) {
	  return typeof arg === 'symbol';
	}
	exports.isSymbol = isSymbol;

	function isUndefined(arg) {
	  return arg === void 0;
	}
	exports.isUndefined = isUndefined;

	function isRegExp(re) {
	  return isObject(re) && objectToString(re) === '[object RegExp]';
	}
	exports.isRegExp = isRegExp;

	function isObject(arg) {
	  return typeof arg === 'object' && arg !== null;
	}
	exports.isObject = isObject;

	function isDate(d) {
	  return isObject(d) && objectToString(d) === '[object Date]';
	}
	exports.isDate = isDate;

	function isError(e) {
	  return isObject(e) &&
	      (objectToString(e) === '[object Error]' || e instanceof Error);
	}
	exports.isError = isError;

	function isFunction(arg) {
	  return typeof arg === 'function';
	}
	exports.isFunction = isFunction;

	function isPrimitive(arg) {
	  return arg === null ||
	         typeof arg === 'boolean' ||
	         typeof arg === 'number' ||
	         typeof arg === 'string' ||
	         typeof arg === 'symbol' ||  // ES6 symbol
	         typeof arg === 'undefined';
	}
	exports.isPrimitive = isPrimitive;

	exports.isBuffer = __webpack_require__(56);

	function objectToString(o) {
	  return Object.prototype.toString.call(o);
	}


	function pad(n) {
	  return n < 10 ? '0' + n.toString(10) : n.toString(10);
	}


	var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
	              'Oct', 'Nov', 'Dec'];

	// 26 Feb 16:19:34
	function timestamp() {
	  var d = new Date();
	  var time = [pad(d.getHours()),
	              pad(d.getMinutes()),
	              pad(d.getSeconds())].join(':');
	  return [d.getDate(), months[d.getMonth()], time].join(' ');
	}


	// log is just a thin wrapper to console.log that prepends a timestamp
	exports.log = function() {
	  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
	};


	/**
	 * Inherit the prototype methods from one constructor into another.
	 *
	 * The Function.prototype.inherits from lang.js rewritten as a standalone
	 * function (not on Function.prototype). NOTE: If this file is to be loaded
	 * during bootstrapping this function needs to be rewritten using some native
	 * functions as prototype setup using normal JavaScript does not work as
	 * expected during bootstrapping (see mirror.js in r114903).
	 *
	 * @param {function} ctor Constructor function which needs to inherit the
	 *     prototype.
	 * @param {function} superCtor Constructor function to inherit prototype from.
	 */
	exports.inherits = __webpack_require__(63);

	exports._extend = function(origin, add) {
	  // Don't do anything if add isn't an object
	  if (!add || !isObject(add)) return origin;

	  var keys = Object.keys(add);
	  var i = keys.length;
	  while (i--) {
	    origin[keys[i]] = add[keys[i]];
	  }
	  return origin;
	};

	function hasOwnProperty(obj, prop) {
	  return Object.prototype.hasOwnProperty.call(obj, prop);
	}
	
	/* WEBPACK VAR INJECTION */}.call(exports, (function() { return this; }()), __webpack_require__(58)))

/***/ },
/* 37 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Logging functionality for ripple-lib and any applications built on it.
	 */
	function Log(namespace) {
	  if (!namespace) {
	    this._namespace = [];
	  } else if (Array.isArray(namespace)) {
	    this._namespace = namespace;
	  } else {
	    this._namespace = [''+namespace];
	  }

	  this._prefix = this._namespace.concat(['']).join(': ');
	};

	/**
	 * Create a sub-logger.
	 *
	 * You can have a hierarchy of loggers.
	 *
	 * @example
	 *
	 *   var log = require('ripple').log.sub('server');
	 *
	 *   log.info('connection successful');
	 *   // prints: 'server: connection successful'
	 */
	Log.prototype.sub = function(namespace) {
	  var subNamespace = this._namespace.slice();

	  if (namespace && typeof namespace === 'string') {
	    subNamespace.push(namespace);
	  }

	  var subLogger = new Log(subNamespace);
	  subLogger._setParent(this);
	  return subLogger;
	};

	Log.prototype._setParent = function(parentLogger) {
	  this._parent = parentLogger;
	};

	Log.makeLevel = function(level) {
	  return function() {
	    var args = Array.prototype.slice.call(arguments);
	    args[0] = this._prefix + args[0];
	    Log.engine.logObject.apply(Log, args);
	  };
	};

	Log.prototype.debug = Log.makeLevel(1);
	Log.prototype.info  = Log.makeLevel(2);
	Log.prototype.warn  = Log.makeLevel(3);
	Log.prototype.error = Log.makeLevel(4);

	/**
	 * Basic logging connector.
	 *
	 * This engine has no formatting and works with the most basic of 'console.log'
	 * implementations. This is the logging engine used in Node.js.
	 */
	var BasicLogEngine = {
	  logObject: function logObject(msg) {
	    var args = Array.prototype.slice.call(arguments, 1);

	    args = args.map(function(arg) {
	      return JSON.stringify(arg, null, 2);
	    });

	    args.unshift(msg);

	    console.log.apply(console, args);
	  }
	};

	/**
	 * Null logging connector.
	 *
	 * This engine simply swallows all messages. Used when console.log is not
	 * available.
	 */
	var NullLogEngine = {
	  logObject: function() {}
	};

	Log.engine = NullLogEngine;

	if (console && console.log) {
	  Log.engine = BasicLogEngine;
	}

	/**
	 * Provide a root logger as our main export.
	 *
	 * This means you can use the logger easily on the fly:
	 *     ripple.log.debug('My object is', myObj);
	 */
	module.exports = new Log();

	/**
	 * This is the logger for ripple-lib internally.
	 */
	module.exports.internal = module.exports.sub();

	/**
	 * Expose the class as well.
	 */
	module.exports.Log = Log;


/***/ },
/* 38 */
/***/ function(module, exports, __webpack_require__) {

	// http://wiki.commonjs.org/wiki/Unit_Testing/1.0
	//
	// THIS IS NOT TESTED NOR LIKELY TO WORK OUTSIDE V8!
	//
	// Originally from narwhal.js (http://narwhaljs.org)
	// Copyright (c) 2009 Thomas Robinson <280north.com>
	//
	// Permission is hereby granted, free of charge, to any person obtaining a copy
	// of this software and associated documentation files (the 'Software'), to
	// deal in the Software without restriction, including without limitation the
	// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
	// sell copies of the Software, and to permit persons to whom the Software is
	// furnished to do so, subject to the following conditions:
	//
	// The above copyright notice and this permission notice shall be included in
	// all copies or substantial portions of the Software.
	//
	// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	// AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
	// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
	// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

	// when used in node, this will actually load the util module we depend on
	// versus loading the builtin util module as happens otherwise
	// this is a bug in node module loading as far as I am concerned
	var util = __webpack_require__(36);

	var pSlice = Array.prototype.slice;
	var hasOwn = Object.prototype.hasOwnProperty;

	// 1. The assert module provides functions that throw
	// AssertionError's when particular conditions are not met. The
	// assert module must conform to the following interface.

	var assert = module.exports = ok;

	// 2. The AssertionError is defined in assert.
	// new assert.AssertionError({ message: message,
	//                             actual: actual,
	//                             expected: expected })

	assert.AssertionError = function AssertionError(options) {
	  this.name = 'AssertionError';
	  this.actual = options.actual;
	  this.expected = options.expected;
	  this.operator = options.operator;
	  if (options.message) {
	    this.message = options.message;
	    this.generatedMessage = false;
	  } else {
	    this.message = getMessage(this);
	    this.generatedMessage = true;
	  }
	  var stackStartFunction = options.stackStartFunction || fail;

	  if (Error.captureStackTrace) {
	    Error.captureStackTrace(this, stackStartFunction);
	  }
	  else {
	    // non v8 browsers so we can have a stacktrace
	    var err = new Error();
	    if (err.stack) {
	      var out = err.stack;

	      // try to strip useless frames
	      var fn_name = stackStartFunction.name;
	      var idx = out.indexOf('\n' + fn_name);
	      if (idx >= 0) {
	        // once we have located the function frame
	        // we need to strip out everything before it (and its line)
	        var next_line = out.indexOf('\n', idx + 1);
	        out = out.substring(next_line + 1);
	      }

	      this.stack = out;
	    }
	  }
	};

	// assert.AssertionError instanceof Error
	util.inherits(assert.AssertionError, Error);

	function replacer(key, value) {
	  if (util.isUndefined(value)) {
	    return '' + value;
	  }
	  if (util.isNumber(value) && (isNaN(value) || !isFinite(value))) {
	    return value.toString();
	  }
	  if (util.isFunction(value) || util.isRegExp(value)) {
	    return value.toString();
	  }
	  return value;
	}

	function truncate(s, n) {
	  if (util.isString(s)) {
	    return s.length < n ? s : s.slice(0, n);
	  } else {
	    return s;
	  }
	}

	function getMessage(self) {
	  return truncate(JSON.stringify(self.actual, replacer), 128) + ' ' +
	         self.operator + ' ' +
	         truncate(JSON.stringify(self.expected, replacer), 128);
	}

	// At present only the three keys mentioned above are used and
	// understood by the spec. Implementations or sub modules can pass
	// other keys to the AssertionError's constructor - they will be
	// ignored.

	// 3. All of the following functions must throw an AssertionError
	// when a corresponding condition is not met, with a message that
	// may be undefined if not provided.  All assertion methods provide
	// both the actual and expected values to the assertion error for
	// display purposes.

	function fail(actual, expected, message, operator, stackStartFunction) {
	  throw new assert.AssertionError({
	    message: message,
	    actual: actual,
	    expected: expected,
	    operator: operator,
	    stackStartFunction: stackStartFunction
	  });
	}

	// EXTENSION! allows for well behaved errors defined elsewhere.
	assert.fail = fail;

	// 4. Pure assertion tests whether a value is truthy, as determined
	// by !!guard.
	// assert.ok(guard, message_opt);
	// This statement is equivalent to assert.equal(true, !!guard,
	// message_opt);. To test strictly for the value true, use
	// assert.strictEqual(true, guard, message_opt);.

	function ok(value, message) {
	  if (!value) fail(value, true, message, '==', assert.ok);
	}
	assert.ok = ok;

	// 5. The equality assertion tests shallow, coercive equality with
	// ==.
	// assert.equal(actual, expected, message_opt);

	assert.equal = function equal(actual, expected, message) {
	  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
	};

	// 6. The non-equality assertion tests for whether two objects are not equal
	// with != assert.notEqual(actual, expected, message_opt);

	assert.notEqual = function notEqual(actual, expected, message) {
	  if (actual == expected) {
	    fail(actual, expected, message, '!=', assert.notEqual);
	  }
	};

	// 7. The equivalence assertion tests a deep equality relation.
	// assert.deepEqual(actual, expected, message_opt);

	assert.deepEqual = function deepEqual(actual, expected, message) {
	  if (!_deepEqual(actual, expected)) {
	    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
	  }
	};

	function _deepEqual(actual, expected) {
	  // 7.1. All identical values are equivalent, as determined by ===.
	  if (actual === expected) {
	    return true;

	  } else if (util.isBuffer(actual) && util.isBuffer(expected)) {
	    if (actual.length != expected.length) return false;

	    for (var i = 0; i < actual.length; i++) {
	      if (actual[i] !== expected[i]) return false;
	    }

	    return true;

	  // 7.2. If the expected value is a Date object, the actual value is
	  // equivalent if it is also a Date object that refers to the same time.
	  } else if (util.isDate(actual) && util.isDate(expected)) {
	    return actual.getTime() === expected.getTime();

	  // 7.3 If the expected value is a RegExp object, the actual value is
	  // equivalent if it is also a RegExp object with the same source and
	  // properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
	  } else if (util.isRegExp(actual) && util.isRegExp(expected)) {
	    return actual.source === expected.source &&
	           actual.global === expected.global &&
	           actual.multiline === expected.multiline &&
	           actual.lastIndex === expected.lastIndex &&
	           actual.ignoreCase === expected.ignoreCase;

	  // 7.4. Other pairs that do not both pass typeof value == 'object',
	  // equivalence is determined by ==.
	  } else if (!util.isObject(actual) && !util.isObject(expected)) {
	    return actual == expected;

	  // 7.5 For all other Object pairs, including Array objects, equivalence is
	  // determined by having the same number of owned properties (as verified
	  // with Object.prototype.hasOwnProperty.call), the same set of keys
	  // (although not necessarily the same order), equivalent values for every
	  // corresponding key, and an identical 'prototype' property. Note: this
	  // accounts for both named and indexed properties on Arrays.
	  } else {
	    return objEquiv(actual, expected);
	  }
	}

	function isArguments(object) {
	  return Object.prototype.toString.call(object) == '[object Arguments]';
	}

	function objEquiv(a, b) {
	  if (util.isNullOrUndefined(a) || util.isNullOrUndefined(b))
	    return false;
	  // an identical 'prototype' property.
	  if (a.prototype !== b.prototype) return false;
	  //~~~I've managed to break Object.keys through screwy arguments passing.
	  //   Converting to array solves the problem.
	  if (isArguments(a)) {
	    if (!isArguments(b)) {
	      return false;
	    }
	    a = pSlice.call(a);
	    b = pSlice.call(b);
	    return _deepEqual(a, b);
	  }
	  try {
	    var ka = objectKeys(a),
	        kb = objectKeys(b),
	        key, i;
	  } catch (e) {//happens when one is a string literal and the other isn't
	    return false;
	  }
	  // having the same number of owned properties (keys incorporates
	  // hasOwnProperty)
	  if (ka.length != kb.length)
	    return false;
	  //the same set of keys (although not necessarily the same order),
	  ka.sort();
	  kb.sort();
	  //~~~cheap key test
	  for (i = ka.length - 1; i >= 0; i--) {
	    if (ka[i] != kb[i])
	      return false;
	  }
	  //equivalent values for every corresponding key, and
	  //~~~possibly expensive deep test
	  for (i = ka.length - 1; i >= 0; i--) {
	    key = ka[i];
	    if (!_deepEqual(a[key], b[key])) return false;
	  }
	  return true;
	}

	// 8. The non-equivalence assertion tests for any deep inequality.
	// assert.notDeepEqual(actual, expected, message_opt);

	assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
	  if (_deepEqual(actual, expected)) {
	    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
	  }
	};

	// 9. The strict equality assertion tests strict equality, as determined by ===.
	// assert.strictEqual(actual, expected, message_opt);

	assert.strictEqual = function strictEqual(actual, expected, message) {
	  if (actual !== expected) {
	    fail(actual, expected, message, '===', assert.strictEqual);
	  }
	};

	// 10. The strict non-equality assertion tests for strict inequality, as
	// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

	assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
	  if (actual === expected) {
	    fail(actual, expected, message, '!==', assert.notStrictEqual);
	  }
	};

	function expectedException(actual, expected) {
	  if (!actual || !expected) {
	    return false;
	  }

	  if (Object.prototype.toString.call(expected) == '[object RegExp]') {
	    return expected.test(actual);
	  } else if (actual instanceof expected) {
	    return true;
	  } else if (expected.call({}, actual) === true) {
	    return true;
	  }

	  return false;
	}

	function _throws(shouldThrow, block, expected, message) {
	  var actual;

	  if (util.isString(expected)) {
	    message = expected;
	    expected = null;
	  }

	  try {
	    block();
	  } catch (e) {
	    actual = e;
	  }

	  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
	            (message ? ' ' + message : '.');

	  if (shouldThrow && !actual) {
	    fail(actual, expected, 'Missing expected exception' + message);
	  }

	  if (!shouldThrow && expectedException(actual, expected)) {
	    fail(actual, expected, 'Got unwanted exception' + message);
	  }

	  if ((shouldThrow && actual && expected &&
	      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
	    throw actual;
	  }
	}

	// 11. Expected to throw an error:
	// assert.throws(block, Error_opt, message_opt);

	assert.throws = function(block, /*optional*/error, /*optional*/message) {
	  _throws.apply(this, [true].concat(pSlice.call(arguments)));
	};

	// EXTENSION! This is annoying to write outside this module.
	assert.doesNotThrow = function(block, /*optional*/message) {
	  _throws.apply(this, [false].concat(pSlice.call(arguments)));
	};

	assert.ifError = function(err) { if (err) {throw err;}};

	var objectKeys = Object.keys || function (obj) {
	  var keys = [];
	  for (var key in obj) {
	    if (hasOwn.call(obj, key)) keys.push(key);
	  }
	  return keys;
	};


/***/ },
/* 39 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(Buffer) {/*!
	 * The buffer module from node.js, for the browser.
	 *
	 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
	 * @license  MIT
	 */

	var base64 = __webpack_require__(66)
	var ieee754 = __webpack_require__(61)

	exports.Buffer = Buffer
	exports.SlowBuffer = Buffer
	exports.INSPECT_MAX_BYTES = 50
	Buffer.poolSize = 8192

	/**
	 * If `Buffer._useTypedArrays`:
	 *   === true    Use Uint8Array implementation (fastest)
	 *   === false   Use Object implementation (compatible down to IE6)
	 */
	Buffer._useTypedArrays = (function () {
	  // Detect if browser supports Typed Arrays. Supported browsers are IE 10+, Firefox 4+,
	  // Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+. If the browser does not support adding
	  // properties to `Uint8Array` instances, then that's the same as no `Uint8Array` support
	  // because we need to be able to add all the node Buffer API methods. This is an issue
	  // in Firefox 4-29. Now fixed: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
	  try {
	    var buf = new ArrayBuffer(0)
	    var arr = new Uint8Array(buf)
	    arr.foo = function () { return 42 }
	    return 42 === arr.foo() &&
	        typeof arr.subarray === 'function' // Chrome 9-10 lack `subarray`
	  } catch (e) {
	    return false
	  }
	})()

	/**
	 * Class: Buffer
	 * =============
	 *
	 * The Buffer constructor returns instances of `Uint8Array` that are augmented
	 * with function properties for all the node `Buffer` API functions. We use
	 * `Uint8Array` so that square bracket notation works as expected -- it returns
	 * a single octet.
	 *
	 * By augmenting the instances, we can avoid modifying the `Uint8Array`
	 * prototype.
	 */
	function Buffer (subject, encoding, noZero) {
	  if (!(this instanceof Buffer))
	    return new Buffer(subject, encoding, noZero)

	  var type = typeof subject

	  // Workaround: node's base64 implementation allows for non-padded strings
	  // while base64-js does not.
	  if (encoding === 'base64' && type === 'string') {
	    subject = stringtrim(subject)
	    while (subject.length % 4 !== 0) {
	      subject = subject + '='
	    }
	  }

	  // Find the length
	  var length
	  if (type === 'number')
	    length = coerce(subject)
	  else if (type === 'string')
	    length = Buffer.byteLength(subject, encoding)
	  else if (type === 'object')
	    length = coerce(subject.length) // assume that object is array-like
	  else
	    throw new Error('First argument needs to be a number, array or string.')

	  var buf
	  if (Buffer._useTypedArrays) {
	    // Preferred: Return an augmented `Uint8Array` instance for best performance
	    buf = Buffer._augment(new Uint8Array(length))
	  } else {
	    // Fallback: Return THIS instance of Buffer (created by `new`)
	    buf = this
	    buf.length = length
	    buf._isBuffer = true
	  }

	  var i
	  if (Buffer._useTypedArrays && typeof subject.byteLength === 'number') {
	    // Speed optimization -- use set if we're copying from a typed array
	    buf._set(subject)
	  } else if (isArrayish(subject)) {
	    // Treat array-ish objects as a byte array
	    for (i = 0; i < length; i++) {
	      if (Buffer.isBuffer(subject))
	        buf[i] = subject.readUInt8(i)
	      else
	        buf[i] = subject[i]
	    }
	  } else if (type === 'string') {
	    buf.write(subject, 0, encoding)
	  } else if (type === 'number' && !Buffer._useTypedArrays && !noZero) {
	    for (i = 0; i < length; i++) {
	      buf[i] = 0
	    }
	  }

	  return buf
	}

	// STATIC METHODS
	// ==============

	Buffer.isEncoding = function (encoding) {
	  switch (String(encoding).toLowerCase()) {
	    case 'hex':
	    case 'utf8':
	    case 'utf-8':
	    case 'ascii':
	    case 'binary':
	    case 'base64':
	    case 'raw':
	    case 'ucs2':
	    case 'ucs-2':
	    case 'utf16le':
	    case 'utf-16le':
	      return true
	    default:
	      return false
	  }
	}

	Buffer.isBuffer = function (b) {
	  return !!(b !== null && b !== undefined && b._isBuffer)
	}

	Buffer.byteLength = function (str, encoding) {
	  var ret
	  str = str + ''
	  switch (encoding || 'utf8') {
	    case 'hex':
	      ret = str.length / 2
	      break
	    case 'utf8':
	    case 'utf-8':
	      ret = utf8ToBytes(str).length
	      break
	    case 'ascii':
	    case 'binary':
	    case 'raw':
	      ret = str.length
	      break
	    case 'base64':
	      ret = base64ToBytes(str).length
	      break
	    case 'ucs2':
	    case 'ucs-2':
	    case 'utf16le':
	    case 'utf-16le':
	      ret = str.length * 2
	      break
	    default:
	      throw new Error('Unknown encoding')
	  }
	  return ret
	}

	Buffer.concat = function (list, totalLength) {
	  assert(isArray(list), 'Usage: Buffer.concat(list, [totalLength])\n' +
	      'list should be an Array.')

	  if (list.length === 0) {
	    return new Buffer(0)
	  } else if (list.length === 1) {
	    return list[0]
	  }

	  var i
	  if (typeof totalLength !== 'number') {
	    totalLength = 0
	    for (i = 0; i < list.length; i++) {
	      totalLength += list[i].length
	    }
	  }

	  var buf = new Buffer(totalLength)
	  var pos = 0
	  for (i = 0; i < list.length; i++) {
	    var item = list[i]
	    item.copy(buf, pos)
	    pos += item.length
	  }
	  return buf
	}

	// BUFFER INSTANCE METHODS
	// =======================

	function _hexWrite (buf, string, offset, length) {
	  offset = Number(offset) || 0
	  var remaining = buf.length - offset
	  if (!length) {
	    length = remaining
	  } else {
	    length = Number(length)
	    if (length > remaining) {
	      length = remaining
	    }
	  }

	  // must be an even number of digits
	  var strLen = string.length
	  assert(strLen % 2 === 0, 'Invalid hex string')

	  if (length > strLen / 2) {
	    length = strLen / 2
	  }
	  for (var i = 0; i < length; i++) {
	    var byte = parseInt(string.substr(i * 2, 2), 16)
	    assert(!isNaN(byte), 'Invalid hex string')
	    buf[offset + i] = byte
	  }
	  Buffer._charsWritten = i * 2
	  return i
	}

	function _utf8Write (buf, string, offset, length) {
	  var charsWritten = Buffer._charsWritten =
	    blitBuffer(utf8ToBytes(string), buf, offset, length)
	  return charsWritten
	}

	function _asciiWrite (buf, string, offset, length) {
	  var charsWritten = Buffer._charsWritten =
	    blitBuffer(asciiToBytes(string), buf, offset, length)
	  return charsWritten
	}

	function _binaryWrite (buf, string, offset, length) {
	  return _asciiWrite(buf, string, offset, length)
	}

	function _base64Write (buf, string, offset, length) {
	  var charsWritten = Buffer._charsWritten =
	    blitBuffer(base64ToBytes(string), buf, offset, length)
	  return charsWritten
	}

	function _utf16leWrite (buf, string, offset, length) {
	  var charsWritten = Buffer._charsWritten =
	    blitBuffer(utf16leToBytes(string), buf, offset, length)
	  return charsWritten
	}

	Buffer.prototype.write = function (string, offset, length, encoding) {
	  // Support both (string, offset, length, encoding)
	  // and the legacy (string, encoding, offset, length)
	  if (isFinite(offset)) {
	    if (!isFinite(length)) {
	      encoding = length
	      length = undefined
	    }
	  } else {  // legacy
	    var swap = encoding
	    encoding = offset
	    offset = length
	    length = swap
	  }

	  offset = Number(offset) || 0
	  var remaining = this.length - offset
	  if (!length) {
	    length = remaining
	  } else {
	    length = Number(length)
	    if (length > remaining) {
	      length = remaining
	    }
	  }
	  encoding = String(encoding || 'utf8').toLowerCase()

	  var ret
	  switch (encoding) {
	    case 'hex':
	      ret = _hexWrite(this, string, offset, length)
	      break
	    case 'utf8':
	    case 'utf-8':
	      ret = _utf8Write(this, string, offset, length)
	      break
	    case 'ascii':
	      ret = _asciiWrite(this, string, offset, length)
	      break
	    case 'binary':
	      ret = _binaryWrite(this, string, offset, length)
	      break
	    case 'base64':
	      ret = _base64Write(this, string, offset, length)
	      break
	    case 'ucs2':
	    case 'ucs-2':
	    case 'utf16le':
	    case 'utf-16le':
	      ret = _utf16leWrite(this, string, offset, length)
	      break
	    default:
	      throw new Error('Unknown encoding')
	  }
	  return ret
	}

	Buffer.prototype.toString = function (encoding, start, end) {
	  var self = this

	  encoding = String(encoding || 'utf8').toLowerCase()
	  start = Number(start) || 0
	  end = (end !== undefined)
	    ? Number(end)
	    : end = self.length

	  // Fastpath empty strings
	  if (end === start)
	    return ''

	  var ret
	  switch (encoding) {
	    case 'hex':
	      ret = _hexSlice(self, start, end)
	      break
	    case 'utf8':
	    case 'utf-8':
	      ret = _utf8Slice(self, start, end)
	      break
	    case 'ascii':
	      ret = _asciiSlice(self, start, end)
	      break
	    case 'binary':
	      ret = _binarySlice(self, start, end)
	      break
	    case 'base64':
	      ret = _base64Slice(self, start, end)
	      break
	    case 'ucs2':
	    case 'ucs-2':
	    case 'utf16le':
	    case 'utf-16le':
	      ret = _utf16leSlice(self, start, end)
	      break
	    default:
	      throw new Error('Unknown encoding')
	  }
	  return ret
	}

	Buffer.prototype.toJSON = function () {
	  return {
	    type: 'Buffer',
	    data: Array.prototype.slice.call(this._arr || this, 0)
	  }
	}

	// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
	Buffer.prototype.copy = function (target, target_start, start, end) {
	  var source = this

	  if (!start) start = 0
	  if (!end && end !== 0) end = this.length
	  if (!target_start) target_start = 0

	  // Copy 0 bytes; we're done
	  if (end === start) return
	  if (target.length === 0 || source.length === 0) return

	  // Fatal error conditions
	  assert(end >= start, 'sourceEnd < sourceStart')
	  assert(target_start >= 0 && target_start < target.length,
	      'targetStart out of bounds')
	  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
	  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

	  // Are we oob?
	  if (end > this.length)
	    end = this.length
	  if (target.length - target_start < end - start)
	    end = target.length - target_start + start

	  var len = end - start

	  if (len < 100 || !Buffer._useTypedArrays) {
	    for (var i = 0; i < len; i++)
	      target[i + target_start] = this[i + start]
	  } else {
	    target._set(this.subarray(start, start + len), target_start)
	  }
	}

	function _base64Slice (buf, start, end) {
	  if (start === 0 && end === buf.length) {
	    return base64.fromByteArray(buf)
	  } else {
	    return base64.fromByteArray(buf.slice(start, end))
	  }
	}

	function _utf8Slice (buf, start, end) {
	  var res = ''
	  var tmp = ''
	  end = Math.min(buf.length, end)

	  for (var i = start; i < end; i++) {
	    if (buf[i] <= 0x7F) {
	      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
	      tmp = ''
	    } else {
	      tmp += '%' + buf[i].toString(16)
	    }
	  }

	  return res + decodeUtf8Char(tmp)
	}

	function _asciiSlice (buf, start, end) {
	  var ret = ''
	  end = Math.min(buf.length, end)

	  for (var i = start; i < end; i++)
	    ret += String.fromCharCode(buf[i])
	  return ret
	}

	function _binarySlice (buf, start, end) {
	  return _asciiSlice(buf, start, end)
	}

	function _hexSlice (buf, start, end) {
	  var len = buf.length

	  if (!start || start < 0) start = 0
	  if (!end || end < 0 || end > len) end = len

	  var out = ''
	  for (var i = start; i < end; i++) {
	    out += toHex(buf[i])
	  }
	  return out
	}

	function _utf16leSlice (buf, start, end) {
	  var bytes = buf.slice(start, end)
	  var res = ''
	  for (var i = 0; i < bytes.length; i += 2) {
	    res += String.fromCharCode(bytes[i] + bytes[i+1] * 256)
	  }
	  return res
	}

	Buffer.prototype.slice = function (start, end) {
	  var len = this.length
	  start = clamp(start, len, 0)
	  end = clamp(end, len, len)

	  if (Buffer._useTypedArrays) {
	    return Buffer._augment(this.subarray(start, end))
	  } else {
	    var sliceLen = end - start
	    var newBuf = new Buffer(sliceLen, undefined, true)
	    for (var i = 0; i < sliceLen; i++) {
	      newBuf[i] = this[i + start]
	    }
	    return newBuf
	  }
	}

	// `get` will be removed in Node 0.13+
	Buffer.prototype.get = function (offset) {
	  console.log('.get() is deprecated. Access using array indexes instead.')
	  return this.readUInt8(offset)
	}

	// `set` will be removed in Node 0.13+
	Buffer.prototype.set = function (v, offset) {
	  console.log('.set() is deprecated. Access using array indexes instead.')
	  return this.writeUInt8(v, offset)
	}

	Buffer.prototype.readUInt8 = function (offset, noAssert) {
	  if (!noAssert) {
	    assert(offset !== undefined && offset !== null, 'missing offset')
	    assert(offset < this.length, 'Trying to read beyond buffer length')
	  }

	  if (offset >= this.length)
	    return

	  return this[offset]
	}

	function _readUInt16 (buf, offset, littleEndian, noAssert) {
	  if (!noAssert) {
	    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
	    assert(offset !== undefined && offset !== null, 'missing offset')
	    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
	  }

	  var len = buf.length
	  if (offset >= len)
	    return

	  var val
	  if (littleEndian) {
	    val = buf[offset]
	    if (offset + 1 < len)
	      val |= buf[offset + 1] << 8
	  } else {
	    val = buf[offset] << 8
	    if (offset + 1 < len)
	      val |= buf[offset + 1]
	  }
	  return val
	}

	Buffer.prototype.readUInt16LE = function (offset, noAssert) {
	  return _readUInt16(this, offset, true, noAssert)
	}

	Buffer.prototype.readUInt16BE = function (offset, noAssert) {
	  return _readUInt16(this, offset, false, noAssert)
	}

	function _readUInt32 (buf, offset, littleEndian, noAssert) {
	  if (!noAssert) {
	    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
	    assert(offset !== undefined && offset !== null, 'missing offset')
	    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
	  }

	  var len = buf.length
	  if (offset >= len)
	    return

	  var val
	  if (littleEndian) {
	    if (offset + 2 < len)
	      val = buf[offset + 2] << 16
	    if (offset + 1 < len)
	      val |= buf[offset + 1] << 8
	    val |= buf[offset]
	    if (offset + 3 < len)
	      val = val + (buf[offset + 3] << 24 >>> 0)
	  } else {
	    if (offset + 1 < len)
	      val = buf[offset + 1] << 16
	    if (offset + 2 < len)
	      val |= buf[offset + 2] << 8
	    if (offset + 3 < len)
	      val |= buf[offset + 3]
	    val = val + (buf[offset] << 24 >>> 0)
	  }
	  return val
	}

	Buffer.prototype.readUInt32LE = function (offset, noAssert) {
	  return _readUInt32(this, offset, true, noAssert)
	}

	Buffer.prototype.readUInt32BE = function (offset, noAssert) {
	  return _readUInt32(this, offset, false, noAssert)
	}

	Buffer.prototype.readInt8 = function (offset, noAssert) {
	  if (!noAssert) {
	    assert(offset !== undefined && offset !== null,
	        'missing offset')
	    assert(offset < this.length, 'Trying to read beyond buffer length')
	  }

	  if (offset >= this.length)
	    return

	  var neg = this[offset] & 0x80
	  if (neg)
	    return (0xff - this[offset] + 1) * -1
	  else
	    return this[offset]
	}

	function _readInt16 (buf, offset, littleEndian, noAssert) {
	  if (!noAssert) {
	    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
	    assert(offset !== undefined && offset !== null, 'missing offset')
	    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
	  }

	  var len = buf.length
	  if (offset >= len)
	    return

	  var val = _readUInt16(buf, offset, littleEndian, true)
	  var neg = val & 0x8000
	  if (neg)
	    return (0xffff - val + 1) * -1
	  else
	    return val
	}

	Buffer.prototype.readInt16LE = function (offset, noAssert) {
	  return _readInt16(this, offset, true, noAssert)
	}

	Buffer.prototype.readInt16BE = function (offset, noAssert) {
	  return _readInt16(this, offset, false, noAssert)
	}

	function _readInt32 (buf, offset, littleEndian, noAssert) {
	  if (!noAssert) {
	    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
	    assert(offset !== undefined && offset !== null, 'missing offset')
	    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
	  }

	  var len = buf.length
	  if (offset >= len)
	    return

	  var val = _readUInt32(buf, offset, littleEndian, true)
	  var neg = val & 0x80000000
	  if (neg)
	    return (0xffffffff - val + 1) * -1
	  else
	    return val
	}

	Buffer.prototype.readInt32LE = function (offset, noAssert) {
	  return _readInt32(this, offset, true, noAssert)
	}

	Buffer.prototype.readInt32BE = function (offset, noAssert) {
	  return _readInt32(this, offset, false, noAssert)
	}

	function _readFloat (buf, offset, littleEndian, noAssert) {
	  if (!noAssert) {
	    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
	    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
	  }

	  return ieee754.read(buf, offset, littleEndian, 23, 4)
	}

	Buffer.prototype.readFloatLE = function (offset, noAssert) {
	  return _readFloat(this, offset, true, noAssert)
	}

	Buffer.prototype.readFloatBE = function (offset, noAssert) {
	  return _readFloat(this, offset, false, noAssert)
	}

	function _readDouble (buf, offset, littleEndian, noAssert) {
	  if (!noAssert) {
	    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
	    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
	  }

	  return ieee754.read(buf, offset, littleEndian, 52, 8)
	}

	Buffer.prototype.readDoubleLE = function (offset, noAssert) {
	  return _readDouble(this, offset, true, noAssert)
	}

	Buffer.prototype.readDoubleBE = function (offset, noAssert) {
	  return _readDouble(this, offset, false, noAssert)
	}

	Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
	  if (!noAssert) {
	    assert(value !== undefined && value !== null, 'missing value')
	    assert(offset !== undefined && offset !== null, 'missing offset')
	    assert(offset < this.length, 'trying to write beyond buffer length')
	    verifuint(value, 0xff)
	  }

	  if (offset >= this.length) return

	  this[offset] = value
	}

	function _writeUInt16 (buf, value, offset, littleEndian, noAssert) {
	  if (!noAssert) {
	    assert(value !== undefined && value !== null, 'missing value')
	    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
	    assert(offset !== undefined && offset !== null, 'missing offset')
	    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
	    verifuint(value, 0xffff)
	  }

	  var len = buf.length
	  if (offset >= len)
	    return

	  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
	    buf[offset + i] =
	        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
	            (littleEndian ? i : 1 - i) * 8
	  }
	}

	Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
	  _writeUInt16(this, value, offset, true, noAssert)
	}

	Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
	  _writeUInt16(this, value, offset, false, noAssert)
	}

	function _writeUInt32 (buf, value, offset, littleEndian, noAssert) {
	  if (!noAssert) {
	    assert(value !== undefined && value !== null, 'missing value')
	    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
	    assert(offset !== undefined && offset !== null, 'missing offset')
	    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
	    verifuint(value, 0xffffffff)
	  }

	  var len = buf.length
	  if (offset >= len)
	    return

	  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
	    buf[offset + i] =
	        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
	  }
	}

	Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
	  _writeUInt32(this, value, offset, true, noAssert)
	}

	Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
	  _writeUInt32(this, value, offset, false, noAssert)
	}

	Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
	  if (!noAssert) {
	    assert(value !== undefined && value !== null, 'missing value')
	    assert(offset !== undefined && offset !== null, 'missing offset')
	    assert(offset < this.length, 'Trying to write beyond buffer length')
	    verifsint(value, 0x7f, -0x80)
	  }

	  if (offset >= this.length)
	    return

	  if (value >= 0)
	    this.writeUInt8(value, offset, noAssert)
	  else
	    this.writeUInt8(0xff + value + 1, offset, noAssert)
	}

	function _writeInt16 (buf, value, offset, littleEndian, noAssert) {
	  if (!noAssert) {
	    assert(value !== undefined && value !== null, 'missing value')
	    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
	    assert(offset !== undefined && offset !== null, 'missing offset')
	    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
	    verifsint(value, 0x7fff, -0x8000)
	  }

	  var len = buf.length
	  if (offset >= len)
	    return

	  if (value >= 0)
	    _writeUInt16(buf, value, offset, littleEndian, noAssert)
	  else
	    _writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
	}

	Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
	  _writeInt16(this, value, offset, true, noAssert)
	}

	Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
	  _writeInt16(this, value, offset, false, noAssert)
	}

	function _writeInt32 (buf, value, offset, littleEndian, noAssert) {
	  if (!noAssert) {
	    assert(value !== undefined && value !== null, 'missing value')
	    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
	    assert(offset !== undefined && offset !== null, 'missing offset')
	    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
	    verifsint(value, 0x7fffffff, -0x80000000)
	  }

	  var len = buf.length
	  if (offset >= len)
	    return

	  if (value >= 0)
	    _writeUInt32(buf, value, offset, littleEndian, noAssert)
	  else
	    _writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
	}

	Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
	  _writeInt32(this, value, offset, true, noAssert)
	}

	Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
	  _writeInt32(this, value, offset, false, noAssert)
	}

	function _writeFloat (buf, value, offset, littleEndian, noAssert) {
	  if (!noAssert) {
	    assert(value !== undefined && value !== null, 'missing value')
	    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
	    assert(offset !== undefined && offset !== null, 'missing offset')
	    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
	    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
	  }

	  var len = buf.length
	  if (offset >= len)
	    return

	  ieee754.write(buf, value, offset, littleEndian, 23, 4)
	}

	Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
	  _writeFloat(this, value, offset, true, noAssert)
	}

	Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
	  _writeFloat(this, value, offset, false, noAssert)
	}

	function _writeDouble (buf, value, offset, littleEndian, noAssert) {
	  if (!noAssert) {
	    assert(value !== undefined && value !== null, 'missing value')
	    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
	    assert(offset !== undefined && offset !== null, 'missing offset')
	    assert(offset + 7 < buf.length,
	        'Trying to write beyond buffer length')
	    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
	  }

	  var len = buf.length
	  if (offset >= len)
	    return

	  ieee754.write(buf, value, offset, littleEndian, 52, 8)
	}

	Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
	  _writeDouble(this, value, offset, true, noAssert)
	}

	Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
	  _writeDouble(this, value, offset, false, noAssert)
	}

	// fill(value, start=0, end=buffer.length)
	Buffer.prototype.fill = function (value, start, end) {
	  if (!value) value = 0
	  if (!start) start = 0
	  if (!end) end = this.length

	  if (typeof value === 'string') {
	    value = value.charCodeAt(0)
	  }

	  assert(typeof value === 'number' && !isNaN(value), 'value is not a number')
	  assert(end >= start, 'end < start')

	  // Fill 0 bytes; we're done
	  if (end === start) return
	  if (this.length === 0) return

	  assert(start >= 0 && start < this.length, 'start out of bounds')
	  assert(end >= 0 && end <= this.length, 'end out of bounds')

	  for (var i = start; i < end; i++) {
	    this[i] = value
	  }
	}

	Buffer.prototype.inspect = function () {
	  var out = []
	  var len = this.length
	  for (var i = 0; i < len; i++) {
	    out[i] = toHex(this[i])
	    if (i === exports.INSPECT_MAX_BYTES) {
	      out[i + 1] = '...'
	      break
	    }
	  }
	  return '<Buffer ' + out.join(' ') + '>'
	}

	/**
	 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
	 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
	 */
	Buffer.prototype.toArrayBuffer = function () {
	  if (typeof Uint8Array !== 'undefined') {
	    if (Buffer._useTypedArrays) {
	      return (new Buffer(this)).buffer
	    } else {
	      var buf = new Uint8Array(this.length)
	      for (var i = 0, len = buf.length; i < len; i += 1)
	        buf[i] = this[i]
	      return buf.buffer
	    }
	  } else {
	    throw new Error('Buffer.toArrayBuffer not supported in this browser')
	  }
	}

	// HELPER FUNCTIONS
	// ================

	function stringtrim (str) {
	  if (str.trim) return str.trim()
	  return str.replace(/^\s+|\s+$/g, '')
	}

	var BP = Buffer.prototype

	/**
	 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
	 */
	Buffer._augment = function (arr) {
	  arr._isBuffer = true

	  // save reference to original Uint8Array get/set methods before overwriting
	  arr._get = arr.get
	  arr._set = arr.set

	  // deprecated, will be removed in node 0.13+
	  arr.get = BP.get
	  arr.set = BP.set

	  arr.write = BP.write
	  arr.toString = BP.toString
	  arr.toLocaleString = BP.toString
	  arr.toJSON = BP.toJSON
	  arr.copy = BP.copy
	  arr.slice = BP.slice
	  arr.readUInt8 = BP.readUInt8
	  arr.readUInt16LE = BP.readUInt16LE
	  arr.readUInt16BE = BP.readUInt16BE
	  arr.readUInt32LE = BP.readUInt32LE
	  arr.readUInt32BE = BP.readUInt32BE
	  arr.readInt8 = BP.readInt8
	  arr.readInt16LE = BP.readInt16LE
	  arr.readInt16BE = BP.readInt16BE
	  arr.readInt32LE = BP.readInt32LE
	  arr.readInt32BE = BP.readInt32BE
	  arr.readFloatLE = BP.readFloatLE
	  arr.readFloatBE = BP.readFloatBE
	  arr.readDoubleLE = BP.readDoubleLE
	  arr.readDoubleBE = BP.readDoubleBE
	  arr.writeUInt8 = BP.writeUInt8
	  arr.writeUInt16LE = BP.writeUInt16LE
	  arr.writeUInt16BE = BP.writeUInt16BE
	  arr.writeUInt32LE = BP.writeUInt32LE
	  arr.writeUInt32BE = BP.writeUInt32BE
	  arr.writeInt8 = BP.writeInt8
	  arr.writeInt16LE = BP.writeInt16LE
	  arr.writeInt16BE = BP.writeInt16BE
	  arr.writeInt32LE = BP.writeInt32LE
	  arr.writeInt32BE = BP.writeInt32BE
	  arr.writeFloatLE = BP.writeFloatLE
	  arr.writeFloatBE = BP.writeFloatBE
	  arr.writeDoubleLE = BP.writeDoubleLE
	  arr.writeDoubleBE = BP.writeDoubleBE
	  arr.fill = BP.fill
	  arr.inspect = BP.inspect
	  arr.toArrayBuffer = BP.toArrayBuffer

	  return arr
	}

	// slice(start, end)
	function clamp (index, len, defaultValue) {
	  if (typeof index !== 'number') return defaultValue
	  index = ~~index;  // Coerce to integer.
	  if (index >= len) return len
	  if (index >= 0) return index
	  index += len
	  if (index >= 0) return index
	  return 0
	}

	function coerce (length) {
	  // Coerce length to a number (possibly NaN), round up
	  // in case it's fractional (e.g. 123.456) then do a
	  // double negate to coerce a NaN to 0. Easy, right?
	  length = ~~Math.ceil(+length)
	  return length < 0 ? 0 : length
	}

	function isArray (subject) {
	  return (Array.isArray || function (subject) {
	    return Object.prototype.toString.call(subject) === '[object Array]'
	  })(subject)
	}

	function isArrayish (subject) {
	  return isArray(subject) || Buffer.isBuffer(subject) ||
	      subject && typeof subject === 'object' &&
	      typeof subject.length === 'number'
	}

	function toHex (n) {
	  if (n < 16) return '0' + n.toString(16)
	  return n.toString(16)
	}

	function utf8ToBytes (str) {
	  var byteArray = []
	  for (var i = 0; i < str.length; i++) {
	    var b = str.charCodeAt(i)
	    if (b <= 0x7F)
	      byteArray.push(str.charCodeAt(i))
	    else {
	      var start = i
	      if (b >= 0xD800 && b <= 0xDFFF) i++
	      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
	      for (var j = 0; j < h.length; j++)
	        byteArray.push(parseInt(h[j], 16))
	    }
	  }
	  return byteArray
	}

	function asciiToBytes (str) {
	  var byteArray = []
	  for (var i = 0; i < str.length; i++) {
	    // Node's code seems to be doing this and not & 0x7F..
	    byteArray.push(str.charCodeAt(i) & 0xFF)
	  }
	  return byteArray
	}

	function utf16leToBytes (str) {
	  var c, hi, lo
	  var byteArray = []
	  for (var i = 0; i < str.length; i++) {
	    c = str.charCodeAt(i)
	    hi = c >> 8
	    lo = c % 256
	    byteArray.push(lo)
	    byteArray.push(hi)
	  }

	  return byteArray
	}

	function base64ToBytes (str) {
	  return base64.toByteArray(str)
	}

	function blitBuffer (src, dst, offset, length) {
	  var pos
	  for (var i = 0; i < length; i++) {
	    if ((i + offset >= dst.length) || (i >= src.length))
	      break
	    dst[i + offset] = src[i]
	  }
	  return i
	}

	function decodeUtf8Char (str) {
	  try {
	    return decodeURIComponent(str)
	  } catch (err) {
	    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
	  }
	}

	/*
	 * We have to make sure that the value is a valid integer. This means that it
	 * is non-negative. It has no fractional component and that it does not
	 * exceed the maximum allowed value.
	 */
	function verifuint (value, max) {
	  assert(typeof value === 'number', 'cannot write a non-number as a number')
	  assert(value >= 0, 'specified a negative value for writing an unsigned value')
	  assert(value <= max, 'value is larger than maximum value for type')
	  assert(Math.floor(value) === value, 'value has a fractional component')
	}

	function verifsint (value, max, min) {
	  assert(typeof value === 'number', 'cannot write a non-number as a number')
	  assert(value <= max, 'value larger than maximum allowed value')
	  assert(value >= min, 'value smaller than minimum allowed value')
	  assert(Math.floor(value) === value, 'value has a fractional component')
	}

	function verifIEEE754 (value, max, min) {
	  assert(typeof value === 'number', 'cannot write a non-number as a number')
	  assert(value <= max, 'value larger than maximum allowed value')
	  assert(value >= min, 'value smaller than minimum allowed value')
	}

	function assert (test, message) {
	  if (!test) throw new Error(message || 'Failed assertion')
	}
	
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(39).Buffer))

/***/ },
/* 40 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(Buffer) {var rng = __webpack_require__(51)

	function error () {
	  var m = [].slice.call(arguments).join(' ')
	  throw new Error([
	    m,
	    'we accept pull requests',
	    'http://github.com/dominictarr/crypto-browserify'
	    ].join('\n'))
	}

	exports.createHash = __webpack_require__(52)

	exports.createHmac = __webpack_require__(53)

	exports.randomBytes = function(size, callback) {
	  if (callback && callback.call) {
	    try {
	      callback.call(this, undefined, new Buffer(rng(size)))
	    } catch (err) { callback(err) }
	  } else {
	    return new Buffer(rng(size))
	  }
	}

	function each(a, f) {
	  for(var i in a)
	    f(a[i], i)
	}

	exports.getHashes = function () {
	  return ['sha1', 'sha256', 'md5', 'rmd160']

	}

	var p = __webpack_require__(54)(exports.createHmac)
	exports.pbkdf2 = p.pbkdf2
	exports.pbkdf2Sync = p.pbkdf2Sync


	// the least I can do is make error messages for the rest of the node.js/crypto api.
	each(['createCredentials'
	, 'createCipher'
	, 'createCipheriv'
	, 'createDecipher'
	, 'createDecipheriv'
	, 'createSign'
	, 'createVerify'
	, 'createDiffieHellman'
	], function (name) {
	  exports[name] = function () {
	    error('sorry,', name, 'is not implemented yet')
	  }
	})
	
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(39).Buffer))

/***/ },
/* 41 */
/***/ function(module, exports, __webpack_require__) {

	/*jshint strict:true node:true es5:true onevar:true laxcomma:true laxbreak:true eqeqeq:true immed:true latedef:true*/
	(function () {
	  "use strict";

	// Copyright Joyent, Inc. and other Node contributors.
	//
	// Permission is hereby granted, free of charge, to any person obtaining a
	// copy of this software and associated documentation files (the
	// "Software"), to deal in the Software without restriction, including
	// without limitation the rights to use, copy, modify, merge, publish,
	// distribute, sublicense, and/or sell copies of the Software, and to permit
	// persons to whom the Software is furnished to do so, subject to the
	// following conditions:
	//
	// The above copyright notice and this permission notice shall be included
	// in all copies or substantial portions of the Software.
	//
	// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
	// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
	// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
	// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
	// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
	// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
	// USE OR OTHER DEALINGS IN THE SOFTWARE.

	var punycode = __webpack_require__(64);

	exports.parse = urlParse;
	exports.resolve = urlResolve;
	exports.resolveObject = urlResolveObject;
	exports.format = urlFormat;

	// Reference: RFC 3986, RFC 1808, RFC 2396

	// define these here so at least they only have to be
	// compiled once on the first module load.
	var protocolPattern = /^([a-z0-9.+-]+:)/i,
	    portPattern = /:[0-9]*$/,

	    // RFC 2396: characters reserved for delimiting URLs.
	    // We actually just auto-escape these.
	    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

	    // RFC 2396: characters not allowed for various reasons.
	    unwise = ['{', '}', '|', '\\', '^', '~', '`'].concat(delims),

	    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
	    autoEscape = ['\''].concat(delims),
	    // Characters that are never ever allowed in a hostname.
	    // Note that any invalid chars are also handled, but these
	    // are the ones that are *expected* to be seen, so we fast-path
	    // them.
	    nonHostChars = ['%', '/', '?', ';', '#']
	      .concat(unwise).concat(autoEscape),
	    nonAuthChars = ['/', '@', '?', '#'].concat(delims),
	    hostnameMaxLen = 255,
	    hostnamePartPattern = /^[a-zA-Z0-9][a-z0-9A-Z_-]{0,62}$/,
	    hostnamePartStart = /^([a-zA-Z0-9][a-z0-9A-Z_-]{0,62})(.*)$/,
	    // protocols that can allow "unsafe" and "unwise" chars.
	    unsafeProtocol = {
	      'javascript': true,
	      'javascript:': true
	    },
	    // protocols that never have a hostname.
	    hostlessProtocol = {
	      'javascript': true,
	      'javascript:': true
	    },
	    // protocols that always have a path component.
	    pathedProtocol = {
	      'http': true,
	      'https': true,
	      'ftp': true,
	      'gopher': true,
	      'file': true,
	      'http:': true,
	      'ftp:': true,
	      'gopher:': true,
	      'file:': true
	    },
	    // protocols that always contain a // bit.
	    slashedProtocol = {
	      'http': true,
	      'https': true,
	      'ftp': true,
	      'gopher': true,
	      'file': true,
	      'http:': true,
	      'https:': true,
	      'ftp:': true,
	      'gopher:': true,
	      'file:': true
	    },
	    querystring = __webpack_require__(65);

	function urlParse(url, parseQueryString, slashesDenoteHost) {
	  if (url && typeof(url) === 'object' && url.href) return url;

	  if (typeof url !== 'string') {
	    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
	  }

	  var out = {},
	      rest = url;

	  // trim before proceeding.
	  // This is to support parse stuff like "  http://foo.com  \n"
	  rest = rest.trim();

	  var proto = protocolPattern.exec(rest);
	  if (proto) {
	    proto = proto[0];
	    var lowerProto = proto.toLowerCase();
	    out.protocol = lowerProto;
	    rest = rest.substr(proto.length);
	  }

	  // figure out if it's got a host
	  // user@server is *always* interpreted as a hostname, and url
	  // resolution will treat //foo/bar as host=foo,path=bar because that's
	  // how the browser resolves relative URLs.
	  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
	    var slashes = rest.substr(0, 2) === '//';
	    if (slashes && !(proto && hostlessProtocol[proto])) {
	      rest = rest.substr(2);
	      out.slashes = true;
	    }
	  }

	  if (!hostlessProtocol[proto] &&
	      (slashes || (proto && !slashedProtocol[proto]))) {
	    // there's a hostname.
	    // the first instance of /, ?, ;, or # ends the host.
	    // don't enforce full RFC correctness, just be unstupid about it.

	    // If there is an @ in the hostname, then non-host chars *are* allowed
	    // to the left of the first @ sign, unless some non-auth character
	    // comes *before* the @-sign.
	    // URLs are obnoxious.
	    var atSign = rest.indexOf('@');
	    if (atSign !== -1) {
	      var auth = rest.slice(0, atSign);

	      // there *may be* an auth
	      var hasAuth = true;
	      for (var i = 0, l = nonAuthChars.length; i < l; i++) {
	        if (auth.indexOf(nonAuthChars[i]) !== -1) {
	          // not a valid auth.  Something like http://foo.com/bar@baz/
	          hasAuth = false;
	          break;
	        }
	      }

	      if (hasAuth) {
	        // pluck off the auth portion.
	        out.auth = decodeURIComponent(auth);
	        rest = rest.substr(atSign + 1);
	      }
	    }

	    var firstNonHost = -1;
	    for (var i = 0, l = nonHostChars.length; i < l; i++) {
	      var index = rest.indexOf(nonHostChars[i]);
	      if (index !== -1 &&
	          (firstNonHost < 0 || index < firstNonHost)) firstNonHost = index;
	    }

	    if (firstNonHost !== -1) {
	      out.host = rest.substr(0, firstNonHost);
	      rest = rest.substr(firstNonHost);
	    } else {
	      out.host = rest;
	      rest = '';
	    }

	    // pull out port.
	    var p = parseHost(out.host);
	    var keys = Object.keys(p);
	    for (var i = 0, l = keys.length; i < l; i++) {
	      var key = keys[i];
	      out[key] = p[key];
	    }

	    // we've indicated that there is a hostname,
	    // so even if it's empty, it has to be present.
	    out.hostname = out.hostname || '';

	    // if hostname begins with [ and ends with ]
	    // assume that it's an IPv6 address.
	    var ipv6Hostname = out.hostname[0] === '[' &&
	        out.hostname[out.hostname.length - 1] === ']';

	    // validate a little.
	    if (out.hostname.length > hostnameMaxLen) {
	      out.hostname = '';
	    } else if (!ipv6Hostname) {
	      var hostparts = out.hostname.split(/\./);
	      for (var i = 0, l = hostparts.length; i < l; i++) {
	        var part = hostparts[i];
	        if (!part) continue;
	        if (!part.match(hostnamePartPattern)) {
	          var newpart = '';
	          for (var j = 0, k = part.length; j < k; j++) {
	            if (part.charCodeAt(j) > 127) {
	              // we replace non-ASCII char with a temporary placeholder
	              // we need this to make sure size of hostname is not
	              // broken by replacing non-ASCII by nothing
	              newpart += 'x';
	            } else {
	              newpart += part[j];
	            }
	          }
	          // we test again with ASCII char only
	          if (!newpart.match(hostnamePartPattern)) {
	            var validParts = hostparts.slice(0, i);
	            var notHost = hostparts.slice(i + 1);
	            var bit = part.match(hostnamePartStart);
	            if (bit) {
	              validParts.push(bit[1]);
	              notHost.unshift(bit[2]);
	            }
	            if (notHost.length) {
	              rest = '/' + notHost.join('.') + rest;
	            }
	            out.hostname = validParts.join('.');
	            break;
	          }
	        }
	      }
	    }

	    // hostnames are always lower case.
	    out.hostname = out.hostname.toLowerCase();

	    if (!ipv6Hostname) {
	      // IDNA Support: Returns a puny coded representation of "domain".
	      // It only converts the part of the domain name that
	      // has non ASCII characters. I.e. it dosent matter if
	      // you call it with a domain that already is in ASCII.
	      var domainArray = out.hostname.split('.');
	      var newOut = [];
	      for (var i = 0; i < domainArray.length; ++i) {
	        var s = domainArray[i];
	        newOut.push(s.match(/[^A-Za-z0-9_-]/) ?
	            'xn--' + punycode.encode(s) : s);
	      }
	      out.hostname = newOut.join('.');
	    }

	    out.host = (out.hostname || '') +
	        ((out.port) ? ':' + out.port : '');
	    out.href += out.host;

	    // strip [ and ] from the hostname
	    if (ipv6Hostname) {
	      out.hostname = out.hostname.substr(1, out.hostname.length - 2);
	      if (rest[0] !== '/') {
	        rest = '/' + rest;
	      }
	    }
	  }

	  // now rest is set to the post-host stuff.
	  // chop off any delim chars.
	  if (!unsafeProtocol[lowerProto]) {

	    // First, make 100% sure that any "autoEscape" chars get
	    // escaped, even if encodeURIComponent doesn't think they
	    // need to be.
	    for (var i = 0, l = autoEscape.length; i < l; i++) {
	      var ae = autoEscape[i];
	      var esc = encodeURIComponent(ae);
	      if (esc === ae) {
	        esc = escape(ae);
	      }
	      rest = rest.split(ae).join(esc);
	    }
	  }


	  // chop off from the tail first.
	  var hash = rest.indexOf('#');
	  if (hash !== -1) {
	    // got a fragment string.
	    out.hash = rest.substr(hash);
	    rest = rest.slice(0, hash);
	  }
	  var qm = rest.indexOf('?');
	  if (qm !== -1) {
	    out.search = rest.substr(qm);
	    out.query = rest.substr(qm + 1);
	    if (parseQueryString) {
	      out.query = querystring.parse(out.query);
	    }
	    rest = rest.slice(0, qm);
	  } else if (parseQueryString) {
	    // no query string, but parseQueryString still requested
	    out.search = '';
	    out.query = {};
	  }
	  if (rest) out.pathname = rest;
	  if (slashedProtocol[proto] &&
	      out.hostname && !out.pathname) {
	    out.pathname = '/';
	  }

	  //to support http.request
	  if (out.pathname || out.search) {
	    out.path = (out.pathname ? out.pathname : '') +
	               (out.search ? out.search : '');
	  }

	  // finally, reconstruct the href based on what has been validated.
	  out.href = urlFormat(out);
	  return out;
	}

	// format a parsed object into a url string
	function urlFormat(obj) {
	  // ensure it's an object, and not a string url.
	  // If it's an obj, this is a no-op.
	  // this way, you can call url_format() on strings
	  // to clean up potentially wonky urls.
	  if (typeof(obj) === 'string') obj = urlParse(obj);

	  var auth = obj.auth || '';
	  if (auth) {
	    auth = encodeURIComponent(auth);
	    auth = auth.replace(/%3A/i, ':');
	    auth += '@';
	  }

	  var protocol = obj.protocol || '',
	      pathname = obj.pathname || '',
	      hash = obj.hash || '',
	      host = false,
	      query = '';

	  if (obj.host !== undefined) {
	    host = auth + obj.host;
	  } else if (obj.hostname !== undefined) {
	    host = auth + (obj.hostname.indexOf(':') === -1 ?
	        obj.hostname :
	        '[' + obj.hostname + ']');
	    if (obj.port) {
	      host += ':' + obj.port;
	    }
	  }

	  if (obj.query && typeof obj.query === 'object' &&
	      Object.keys(obj.query).length) {
	    query = querystring.stringify(obj.query);
	  }

	  var search = obj.search || (query && ('?' + query)) || '';

	  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

	  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
	  // unless they had them to begin with.
	  if (obj.slashes ||
	      (!protocol || slashedProtocol[protocol]) && host !== false) {
	    host = '//' + (host || '');
	    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
	  } else if (!host) {
	    host = '';
	  }

	  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
	  if (search && search.charAt(0) !== '?') search = '?' + search;

	  return protocol + host + pathname + search + hash;
	}

	function urlResolve(source, relative) {
	  return urlFormat(urlResolveObject(source, relative));
	}

	function urlResolveObject(source, relative) {
	  if (!source) return relative;

	  source = urlParse(urlFormat(source), false, true);
	  relative = urlParse(urlFormat(relative), false, true);

	  // hash is always overridden, no matter what.
	  source.hash = relative.hash;

	  if (relative.href === '') {
	    source.href = urlFormat(source);
	    return source;
	  }

	  // hrefs like //foo/bar always cut to the protocol.
	  if (relative.slashes && !relative.protocol) {
	    relative.protocol = source.protocol;
	    //urlParse appends trailing / to urls like http://www.example.com
	    if (slashedProtocol[relative.protocol] &&
	        relative.hostname && !relative.pathname) {
	      relative.path = relative.pathname = '/';
	    }
	    relative.href = urlFormat(relative);
	    return relative;
	  }

	  if (relative.protocol && relative.protocol !== source.protocol) {
	    // if it's a known url protocol, then changing
	    // the protocol does weird things
	    // first, if it's not file:, then we MUST have a host,
	    // and if there was a path
	    // to begin with, then we MUST have a path.
	    // if it is file:, then the host is dropped,
	    // because that's known to be hostless.
	    // anything else is assumed to be absolute.
	    if (!slashedProtocol[relative.protocol]) {
	      relative.href = urlFormat(relative);
	      return relative;
	    }
	    source.protocol = relative.protocol;
	    if (!relative.host && !hostlessProtocol[relative.protocol]) {
	      var relPath = (relative.pathname || '').split('/');
	      while (relPath.length && !(relative.host = relPath.shift()));
	      if (!relative.host) relative.host = '';
	      if (!relative.hostname) relative.hostname = '';
	      if (relPath[0] !== '') relPath.unshift('');
	      if (relPath.length < 2) relPath.unshift('');
	      relative.pathname = relPath.join('/');
	    }
	    source.pathname = relative.pathname;
	    source.search = relative.search;
	    source.query = relative.query;
	    source.host = relative.host || '';
	    source.auth = relative.auth;
	    source.hostname = relative.hostname || relative.host;
	    source.port = relative.port;
	    //to support http.request
	    if (source.pathname !== undefined || source.search !== undefined) {
	      source.path = (source.pathname ? source.pathname : '') +
	                    (source.search ? source.search : '');
	    }
	    source.slashes = source.slashes || relative.slashes;
	    source.href = urlFormat(source);
	    return source;
	  }

	  var isSourceAbs = (source.pathname && source.pathname.charAt(0) === '/'),
	      isRelAbs = (
	          relative.host !== undefined ||
	          relative.pathname && relative.pathname.charAt(0) === '/'
	      ),
	      mustEndAbs = (isRelAbs || isSourceAbs ||
	                    (source.host && relative.pathname)),
	      removeAllDots = mustEndAbs,
	      srcPath = source.pathname && source.pathname.split('/') || [],
	      relPath = relative.pathname && relative.pathname.split('/') || [],
	      psychotic = source.protocol &&
	          !slashedProtocol[source.protocol];

	  // if the url is a non-slashed url, then relative
	  // links like ../.. should be able
	  // to crawl up to the hostname, as well.  This is strange.
	  // source.protocol has already been set by now.
	  // Later on, put the first path part into the host field.
	  if (psychotic) {

	    delete source.hostname;
	    delete source.port;
	    if (source.host) {
	      if (srcPath[0] === '') srcPath[0] = source.host;
	      else srcPath.unshift(source.host);
	    }
	    delete source.host;
	    if (relative.protocol) {
	      delete relative.hostname;
	      delete relative.port;
	      if (relative.host) {
	        if (relPath[0] === '') relPath[0] = relative.host;
	        else relPath.unshift(relative.host);
	      }
	      delete relative.host;
	    }
	    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
	  }

	  if (isRelAbs) {
	    // it's absolute.
	    source.host = (relative.host || relative.host === '') ?
	                      relative.host : source.host;
	    source.hostname = (relative.hostname || relative.hostname === '') ?
	                      relative.hostname : source.hostname;
	    source.search = relative.search;
	    source.query = relative.query;
	    srcPath = relPath;
	    // fall through to the dot-handling below.
	  } else if (relPath.length) {
	    // it's relative
	    // throw away the existing file, and take the new path instead.
	    if (!srcPath) srcPath = [];
	    srcPath.pop();
	    srcPath = srcPath.concat(relPath);
	    source.search = relative.search;
	    source.query = relative.query;
	  } else if ('search' in relative) {
	    // just pull out the search.
	    // like href='?foo'.
	    // Put this after the other two cases because it simplifies the booleans
	    if (psychotic) {
	      source.hostname = source.host = srcPath.shift();
	      //occationaly the auth can get stuck only in host
	      //this especialy happens in cases like
	      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
	      var authInHost = source.host && source.host.indexOf('@') > 0 ?
	                       source.host.split('@') : false;
	      if (authInHost) {
	        source.auth = authInHost.shift();
	        source.host = source.hostname = authInHost.shift();
	      }
	    }
	    source.search = relative.search;
	    source.query = relative.query;
	    //to support http.request
	    if (source.pathname !== undefined || source.search !== undefined) {
	      source.path = (source.pathname ? source.pathname : '') +
	                    (source.search ? source.search : '');
	    }
	    source.href = urlFormat(source);
	    return source;
	  }
	  if (!srcPath.length) {
	    // no path at all.  easy.
	    // we've already handled the other stuff above.
	    delete source.pathname;
	    //to support http.request
	    if (!source.search) {
	      source.path = '/' + source.search;
	    } else {
	      delete source.path;
	    }
	    source.href = urlFormat(source);
	    return source;
	  }
	  // if a url ENDs in . or .., then it must get a trailing slash.
	  // however, if it ends in anything else non-slashy,
	  // then it must NOT get a trailing slash.
	  var last = srcPath.slice(-1)[0];
	  var hasTrailingSlash = (
	      (source.host || relative.host) && (last === '.' || last === '..') ||
	      last === '');

	  // strip single dots, resolve double dots to parent dir
	  // if the path tries to go above the root, `up` ends up > 0
	  var up = 0;
	  for (var i = srcPath.length; i >= 0; i--) {
	    last = srcPath[i];
	    if (last == '.') {
	      srcPath.splice(i, 1);
	    } else if (last === '..') {
	      srcPath.splice(i, 1);
	      up++;
	    } else if (up) {
	      srcPath.splice(i, 1);
	      up--;
	    }
	  }

	  // if the path is allowed to go above the root, restore leading ..s
	  if (!mustEndAbs && !removeAllDots) {
	    for (; up--; up) {
	      srcPath.unshift('..');
	    }
	  }

	  if (mustEndAbs && srcPath[0] !== '' &&
	      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
	    srcPath.unshift('');
	  }

	  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
	    srcPath.push('');
	  }

	  var isAbsolute = srcPath[0] === '' ||
	      (srcPath[0] && srcPath[0].charAt(0) === '/');

	  // put the host back
	  if (psychotic) {
	    source.hostname = source.host = isAbsolute ? '' :
	                                    srcPath.length ? srcPath.shift() : '';
	    //occationaly the auth can get stuck only in host
	    //this especialy happens in cases like
	    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
	    var authInHost = source.host && source.host.indexOf('@') > 0 ?
	                     source.host.split('@') : false;
	    if (authInHost) {
	      source.auth = authInHost.shift();
	      source.host = source.hostname = authInHost.shift();
	    }
	  }

	  mustEndAbs = mustEndAbs || (source.host && srcPath.length);

	  if (mustEndAbs && !isAbsolute) {
	    srcPath.unshift('');
	  }

	  source.pathname = srcPath.join('/');
	  //to support request.http
	  if (source.pathname !== undefined || source.search !== undefined) {
	    source.path = (source.pathname ? source.pathname : '') +
	                  (source.search ? source.search : '');
	  }
	  source.auth = relative.auth || source.auth;
	  source.slashes = source.slashes || relative.slashes;
	  source.href = urlFormat(source);
	  return source;
	}

	function parseHost(host) {
	  var out = {};
	  var port = portPattern.exec(host);
	  if (port) {
	    port = port[0];
	    if (port !== ':') {
	      out.port = port.substr(1);
	    }
	    host = host.substr(0, host.length - port.length);
	  }
	  if (host) out.hostname = host;
	  return out;
	}

	}());


/***/ },
/* 42 */
/***/ function(module, exports, __webpack_require__) {

	var hasOwn = Object.prototype.hasOwnProperty;
	var toString = Object.prototype.toString;

	function isPlainObject(obj) {
		if (!obj || toString.call(obj) !== '[object Object]' || obj.nodeType || obj.setInterval)
			return false;

		var has_own_constructor = hasOwn.call(obj, 'constructor');
		var has_is_property_of_method = hasOwn.call(obj.constructor.prototype, 'isPrototypeOf');
		// Not own constructor property must be Object
		if (obj.constructor && !has_own_constructor && !has_is_property_of_method)
			return false;

		// Own properties are enumerated firstly, so to speed up,
		// if last one is own, then all properties are own.
		var key;
		for ( key in obj ) {}

		return key === undefined || hasOwn.call( obj, key );
	};

	module.exports = function extend() {
		var options, name, src, copy, copyIsArray, clone,
		    target = arguments[0] || {},
		    i = 1,
		    length = arguments.length,
		    deep = false;

		// Handle a deep copy situation
		if ( typeof target === "boolean" ) {
			deep = target;
			target = arguments[1] || {};
			// skip the boolean and the target
			i = 2;
		}

		// Handle case when target is a string or something (possible in deep copy)
		if ( typeof target !== "object" && typeof target !== "function") {
			target = {};
		}

		for ( ; i < length; i++ ) {
			// Only deal with non-null/undefined values
			if ( (options = arguments[ i ]) != null ) {
				// Extend the base object
				for ( name in options ) {
					src = target[ name ];
					copy = options[ name ];

					// Prevent never-ending loop
					if ( target === copy ) {
						continue;
					}

					// Recurse if we're merging plain objects or arrays
					if ( deep && copy && ( isPlainObject(copy) || (copyIsArray = Array.isArray(copy)) ) ) {
						if ( copyIsArray ) {
							copyIsArray = false;
							clone = src && Array.isArray(src) ? src : [];

						} else {
							clone = src && isPlainObject(src) ? src : {};
						}

						// Never move original objects, clone them
						target[ name ] = extend( deep, clone, copy );

					// Don't bring in undefined values
					} else if ( copy !== undefined ) {
						target[ name ] = copy;
					}
				}
			}
		}

		// Return the modified object
		return target;
	};


/***/ },
/* 43 */
/***/ function(module, exports, __webpack_require__) {

	
	/**
	 * Manager for pending transactions
	 */

	var LRU = __webpack_require__(47);
	var Transaction = __webpack_require__(5).Transaction;

	function TransactionQueue() {
	  this._queue = [ ];
	  this._idCache = LRU();
	  this._sequenceCache = LRU();
	};

	/**
	 * Store received (validated) sequence
	 */

	TransactionQueue.prototype.addReceivedSequence = function(sequence) {
	  this._sequenceCache.set(String(sequence), true);
	};

	/**
	 * Check that sequence number has been consumed by a validated
	 * transaction
	 */

	TransactionQueue.prototype.hasSequence = function(sequence) {
	  return this._sequenceCache.has(String(sequence));
	};

	/**
	 * Store received (validated) ID transaction
	 */

	TransactionQueue.prototype.addReceivedId = function(id, transaction) {
	  this._idCache.set(id, transaction);
	};

	/**
	 * Get received (validated) transaction by ID
	 */

	TransactionQueue.prototype.getReceived = function(id) {
	  return this._idCache.get(id);
	};

	/**
	 * Get a submitted transaction by ID. Transactions
	 * may have multiple associated IDs.
	 */

	TransactionQueue.prototype.getSubmission = function(id) {
	  var result = void(0);

	  for (var i=0, tx; (tx=this._queue[i]); i++) {
	    if (~tx.submittedIDs.indexOf(id)) {
	      result = tx;
	      break;
	    }
	  }

	  return result;
	};

	/**
	 * Remove a transaction from the queue
	 */

	TransactionQueue.prototype.remove = function(tx) {
	  // ND: We are just removing the Transaction by identity
	  var i = this._queue.length;

	  if (typeof tx === 'string') {
	    tx = this.getSubmission(tx);
	  }

	  if (!(tx instanceof Transaction)) {
	    return;
	  }

	  while (i--) {
	    if (this._queue[i] === tx) {
	      this._queue.splice(i, 1);
	      break;
	    }
	  }
	};

	TransactionQueue.prototype.push = function(tx) {
	  this._queue.push(tx);
	};

	TransactionQueue.prototype.forEach = function(fn) {
	  this._queue.forEach(fn);
	};

	TransactionQueue.prototype.length =
	TransactionQueue.prototype.getLength = function() {
	  return this._queue.length;
	};

	exports.TransactionQueue = TransactionQueue;


/***/ },
/* 44 */
/***/ function(module, exports, __webpack_require__) {

	var utils  = __webpack_require__(19);
	var extend = __webpack_require__(42);
	var UInt   = __webpack_require__(29).UInt;

	//
	// UInt128 support
	//

	var UInt128 = extend(function () {
	  // Internal form: NaN or BigInteger
	  this._value  = NaN;
	}, UInt);

	UInt128.width = 16;
	UInt128.prototype = extend({}, UInt.prototype);
	UInt128.prototype.constructor = UInt128;

	var HEX_ZERO = UInt128.HEX_ZERO = '00000000000000000000000000000000';
	var HEX_ONE  = UInt128.HEX_ONE  = '00000000000000000000000000000000';
	var XPS_ZERO = UInt128.XPS_ZERO = utils.hexToString(HEX_ZERO);
	var XPS_ONE  = UInt128.XPS_ONE  = utils.hexToString(HEX_ONE);

	exports.UInt128 = UInt128;


/***/ },
/* 45 */
/***/ function(module, exports, __webpack_require__) {

	var Crypt = __webpack_require__(26).Crypt;
	var Message = __webpack_require__(14).Message;
	var parser  = __webpack_require__(41);
	var querystring = __webpack_require__(50);
	var extend = __webpack_require__(42);

	var SignedRequest = function (config) {
	  // XXX Constructor should be generalized and constructing from an Angular.js
	  //     $http config should be a SignedRequest.from... utility method.
	  this.config = extend(true, {}, config);
	  if (!this.config.data) this.config.data = {};
	};



	/**
	 * Create a string from request parameters that
	 * will be used to sign a request
	 * @param {Object} parsed - parsed url
	 * @param {Object} date 
	 * @param {Object} mechanism - type of signing
	 */
	SignedRequest.prototype.getStringToSign = function (parsed, date, mechanism) {
	  // XXX This method doesn't handle signing GET requests correctly. The data
	  //     field will be merged into the search string, not the request body.

	  // Sort the properties of the JSON object into canonical form
	  var canonicalData = JSON.stringify(copyObjectWithSortedKeys(this.config.data));

	  // Canonical request using Amazon's v4 signature format
	  // See: http://docs.aws.amazon.com/general/latest/gr/sigv4-create-canonical-request.html
	  var canonicalRequest = [
	    this.config.method || 'GET',
	    parsed.pathname || '',
	    parsed.search || '',
	    // XXX Headers signing not supported
	    '',
	    '',
	    Crypt.hashSha512(canonicalData).toLowerCase()
	  ].join('\n');

	  // String to sign inspired by Amazon's v4 signature format
	  // See: http://docs.aws.amazon.com/general/latest/gr/sigv4-create-string-to-sign.html
	  //
	  // We don't have a credential scope, so we skip it.
	  //
	  // But that modifies the format, so the format ID is RIPPLE1, instead of AWS4.
	  return [
	    mechanism,
	    date,
	    Crypt.hashSha512(canonicalRequest).toLowerCase()
	  ].join('\n');
	};

	//prepare for signing
	function copyObjectWithSortedKeys(object) {
	  if (isPlainObject(object)) {
	    var newObj = {};
	    var keysSorted = Object.keys(object).sort();
	    var key;
	    for (var i in keysSorted) {
	      key = keysSorted[i];
	      if (Object.prototype.hasOwnProperty.call(object, key)) {
	        newObj[key] = copyObjectWithSortedKeys(object[key]);
	      }
	    }
	    return newObj;
	  } else if (Array.isArray(object)) {
	    return object.map(copyObjectWithSortedKeys);
	  } else {
	    return object;
	  }
	}

	//from npm extend
	function isPlainObject(obj) {
	  var hasOwn = Object.prototype.hasOwnProperty;
	  var toString = Object.prototype.toString;

	  if (!obj || toString.call(obj) !== '[object Object]' || obj.nodeType || obj.setInterval)
	    return false;

	  var has_own_constructor = hasOwn.call(obj, 'constructor');
	  var has_is_property_of_method = hasOwn.call(obj.constructor.prototype, 'isPrototypeOf');
	  // Not own constructor property must be Object
	  if (obj.constructor && !has_own_constructor && !has_is_property_of_method)
	    return false;

	  // Own properties are enumerated firstly, so to speed up,
	  // if last one is own, then all properties are own.
	  var key;
	  for ( key in obj ) {}

	  return key === undefined || hasOwn.call( obj, key );
	};

	/**
	 * HMAC signed request
	 * @param {Object} config
	 * @param {Object} auth_secret
	 * @param {Object} blob_id
	 */
	SignedRequest.prototype.signHmac = function (auth_secret, blob_id) {
	  var config = extend(true, {}, this.config);

	  // Parse URL
	  var parsed        = parser.parse(config.url);
	  var date          = dateAsIso8601();
	  var signatureType = 'RIPPLE1-HMAC-SHA512';
	  var stringToSign  = this.getStringToSign(parsed, date, signatureType);
	  var signature     = Crypt.signString(auth_secret, stringToSign);

	  var query = querystring.stringify({
	    signature: Crypt.base64ToBase64Url(signature),
	    signature_date: date,
	    signature_blob_id: blob_id,
	    signature_type: signatureType
	  });

	  config.url += (parsed.search ? '&' : '?') + query;
	  return config;
	};

	/**
	 * Asymmetric signed request
	 * @param {Object} config
	 * @param {Object} secretKey
	 * @param {Object} account
	 * @param {Object} blob_id
	 */
	SignedRequest.prototype.signAsymmetric = function (secretKey, account, blob_id) {
	  var config = extend(true, {}, this.config);

	  // Parse URL
	  var parsed        = parser.parse(config.url);
	  var date          = dateAsIso8601();
	  var signatureType = 'RIPPLE1-ECDSA-SHA512';
	  var stringToSign  = this.getStringToSign(parsed, date, signatureType);
	  var signature     = Message.signMessage(stringToSign, secretKey);
	 
	  var query = querystring.stringify({
	    signature: Crypt.base64ToBase64Url(signature),
	    signature_date: date,
	    signature_blob_id: blob_id,
	    signature_account: account,
	    signature_type: signatureType
	  });

	  config.url += (parsed.search ? '&' : '?') + query;

	  return config;
	};

	/**
	 * Asymmetric signed request for vault recovery
	 * @param {Object} config
	 * @param {Object} secretKey
	 * @param {Object} username
	 */
	SignedRequest.prototype.signAsymmetricRecovery = function (secretKey, username) {
	  var config = extend(true, {}, this.config);

	  // Parse URL
	  var parsed        = parser.parse(config.url);
	  var date          = dateAsIso8601();
	  var signatureType = 'RIPPLE1-ECDSA-SHA512';
	  var stringToSign  = this.getStringToSign(parsed, date, signatureType);
	  var signature     = Message.signMessage(stringToSign, secretKey);
	 
	  var query = querystring.stringify({
	    signature: Crypt.base64ToBase64Url(signature),
	    signature_date: date,
	    signature_username: username,
	    signature_type: signatureType
	  });

	  config.url += (parsed.search ? '&' : '?') + query;

	  return config;
	};

	var dateAsIso8601 = (function () {
	  function pad(n) {
	    return (n < 0 || n > 9 ? "" : "0") + n;
	  }

	  return function dateAsIso8601() {
	    var date = new Date();
	    return date.getUTCFullYear() + "-" +
	      pad(date.getUTCMonth()     + 1)  + "-" +
	      pad(date.getUTCDate())     + "T" +
	      pad(date.getUTCHours())    + ":" +
	      pad(date.getUTCMinutes())  + ":" +
	      pad(date.getUTCSeconds())  + ".000Z";
	  };
	})();

	// XXX Add methods for verifying requests
	// SignedRequest.prototype.verifySignatureHmac
	// SignedRequest.prototype.verifySignatureAsymetric

	exports.SignedRequest = SignedRequest;



/***/ },
/* 46 */
/***/ function(module, exports, __webpack_require__) {

	var __WEBPACK_AMD_DEFINE_ARRAY__, __WEBPACK_AMD_DEFINE_RESULT__;"use strict";function q(a){throw a;}var u=void 0,v=!1;var sjcl={cipher:{},hash:{},keyexchange:{},mode:{},misc:{},codec:{},exception:{corrupt:function(a){this.toString=function(){return"CORRUPT: "+this.message};this.message=a},invalid:function(a){this.toString=function(){return"INVALID: "+this.message};this.message=a},bug:function(a){this.toString=function(){return"BUG: "+this.message};this.message=a},notReady:function(a){this.toString=function(){return"NOT READY: "+this.message};this.message=a}}};
	"undefined"!==typeof module&&module.exports&&(module.exports=sjcl);"function"==='function'&&!(__WEBPACK_AMD_DEFINE_ARRAY__ = [], __WEBPACK_AMD_DEFINE_RESULT__ = (function(){return sjcl}.apply(null, __WEBPACK_AMD_DEFINE_ARRAY__)), __WEBPACK_AMD_DEFINE_RESULT__ !== undefined && (module.exports = __WEBPACK_AMD_DEFINE_RESULT__));
	sjcl.cipher.aes=function(a){this.p[0][0][0]||this.u();var b,c,d,e,f=this.p[0][4],g=this.p[1];b=a.length;var h=1;4!==b&&(6!==b&&8!==b)&&q(new sjcl.exception.invalid("invalid aes key size"));this.b=[d=a.slice(0),e=[]];for(a=b;a<4*b+28;a++){c=d[a-1];if(0===a%b||8===b&&4===a%b)c=f[c>>>24]<<24^f[c>>16&255]<<16^f[c>>8&255]<<8^f[c&255],0===a%b&&(c=c<<8^c>>>24^h<<24,h=h<<1^283*(h>>7));d[a]=d[a-b]^c}for(b=0;a;b++,a--)c=d[b&3?a:a-4],e[b]=4>=a||4>b?c:g[0][f[c>>>24]]^g[1][f[c>>16&255]]^g[2][f[c>>8&255]]^g[3][f[c&
	255]]};
	sjcl.cipher.aes.prototype={encrypt:function(a){return aa(this,a,0)},decrypt:function(a){return aa(this,a,1)},p:[[[],[],[],[],[]],[[],[],[],[],[]]],u:function(){var a=this.p[0],b=this.p[1],c=a[4],d=b[4],e,f,g,h=[],k=[],l,n,m,p;for(e=0;0x100>e;e++)k[(h[e]=e<<1^283*(e>>7))^e]=e;for(f=g=0;!c[f];f^=l||1,g=k[g]||1){m=g^g<<1^g<<2^g<<3^g<<4;m=m>>8^m&255^99;c[f]=m;d[m]=f;n=h[e=h[l=h[f]]];p=0x1010101*n^0x10001*e^0x101*l^0x1010100*f;n=0x101*h[m]^0x1010100*m;for(e=0;4>e;e++)a[e][f]=n=n<<24^n>>>8,b[e][m]=p=p<<24^p>>>8}for(e=
	0;5>e;e++)a[e]=a[e].slice(0),b[e]=b[e].slice(0)}};
	function aa(a,b,c){4!==b.length&&q(new sjcl.exception.invalid("invalid aes block size"));var d=a.b[c],e=b[0]^d[0],f=b[c?3:1]^d[1],g=b[2]^d[2];b=b[c?1:3]^d[3];var h,k,l,n=d.length/4-2,m,p=4,s=[0,0,0,0];h=a.p[c];a=h[0];var r=h[1],D=h[2],F=h[3],E=h[4];for(m=0;m<n;m++)h=a[e>>>24]^r[f>>16&255]^D[g>>8&255]^F[b&255]^d[p],k=a[f>>>24]^r[g>>16&255]^D[b>>8&255]^F[e&255]^d[p+1],l=a[g>>>24]^r[b>>16&255]^D[e>>8&255]^F[f&255]^d[p+2],b=a[b>>>24]^r[e>>16&255]^D[f>>8&255]^F[g&255]^d[p+3],p+=4,e=h,f=k,g=l;for(m=0;4>
	m;m++)s[c?3&-m:m]=E[e>>>24]<<24^E[f>>16&255]<<16^E[g>>8&255]<<8^E[b&255]^d[p++],h=e,e=f,f=g,g=b,b=h;return s}
	sjcl.bitArray={bitSlice:function(a,b,c){a=sjcl.bitArray.R(a.slice(b/32),32-(b&31)).slice(1);return c===u?a:sjcl.bitArray.clamp(a,c-b)},extract:function(a,b,c){var d=Math.floor(-b-c&31);return((b+c-1^b)&-32?a[b/32|0]<<32-d^a[b/32+1|0]>>>d:a[b/32|0]>>>d)&(1<<c)-1},concat:function(a,b){if(0===a.length||0===b.length)return a.concat(b);var c=a[a.length-1],d=sjcl.bitArray.getPartial(c);return 32===d?a.concat(b):sjcl.bitArray.R(b,d,c|0,a.slice(0,a.length-1))},bitLength:function(a){var b=a.length;return 0===
	b?0:32*(b-1)+sjcl.bitArray.getPartial(a[b-1])},clamp:function(a,b){if(32*a.length<b)return a;a=a.slice(0,Math.ceil(b/32));var c=a.length;b&=31;0<c&&b&&(a[c-1]=sjcl.bitArray.partial(b,a[c-1]&2147483648>>b-1,1));return a},partial:function(a,b,c){return 32===a?b:(c?b|0:b<<32-a)+0x10000000000*a},getPartial:function(a){return Math.round(a/0x10000000000)||32},equal:function(a,b){if(sjcl.bitArray.bitLength(a)!==sjcl.bitArray.bitLength(b))return v;var c=0,d;for(d=0;d<a.length;d++)c|=a[d]^b[d];return 0===
	c},R:function(a,b,c,d){var e;e=0;for(d===u&&(d=[]);32<=b;b-=32)d.push(c),c=0;if(0===b)return d.concat(a);for(e=0;e<a.length;e++)d.push(c|a[e]>>>b),c=a[e]<<32-b;e=a.length?a[a.length-1]:0;a=sjcl.bitArray.getPartial(e);d.push(sjcl.bitArray.partial(b+a&31,32<b+a?c:d.pop(),1));return d},q:function(a,b){return[a[0]^b[0],a[1]^b[1],a[2]^b[2],a[3]^b[3]]},byteswapM:function(a){var b,c;for(b=0;b<a.length;++b)c=a[b],a[b]=c>>>24|c>>>8&0xff00|(c&0xff00)<<8|c<<24;return a}};
	sjcl.codec.utf8String={fromBits:function(a){var b="",c=sjcl.bitArray.bitLength(a),d,e;for(d=0;d<c/8;d++)0===(d&3)&&(e=a[d/4]),b+=String.fromCharCode(e>>>24),e<<=8;return decodeURIComponent(escape(b))},toBits:function(a){a=unescape(encodeURIComponent(a));var b=[],c,d=0;for(c=0;c<a.length;c++)d=d<<8|a.charCodeAt(c),3===(c&3)&&(b.push(d),d=0);c&3&&b.push(sjcl.bitArray.partial(8*(c&3),d));return b}};
	sjcl.codec.hex={fromBits:function(a){var b="",c;for(c=0;c<a.length;c++)b+=((a[c]|0)+0xf00000000000).toString(16).substr(4);return b.substr(0,sjcl.bitArray.bitLength(a)/4)},toBits:function(a){var b,c=[],d;a=a.replace(/\s|0x/g,"");d=a.length;a+="00000000";for(b=0;b<a.length;b+=8)c.push(parseInt(a.substr(b,8),16)^0);return sjcl.bitArray.clamp(c,4*d)}};
	sjcl.codec.base64={M:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",fromBits:function(a,b,c){var d="",e=0,f=sjcl.codec.base64.M,g=0,h=sjcl.bitArray.bitLength(a);c&&(f=f.substr(0,62)+"-_");for(c=0;6*d.length<h;)d+=f.charAt((g^a[c]>>>e)>>>26),6>e?(g=a[c]<<6-e,e+=26,c++):(g<<=6,e-=6);for(;d.length&3&&!b;)d+="=";return d},toBits:function(a,b){a=a.replace(/\s|=/g,"");var c=[],d,e=0,f=sjcl.codec.base64.M,g=0,h;b&&(f=f.substr(0,62)+"-_");for(d=0;d<a.length;d++)h=f.indexOf(a.charAt(d)),
	0>h&&q(new sjcl.exception.invalid("this isn't base64!")),26<e?(e-=26,c.push(g^h>>>e),g=h<<32-e):(e+=6,g^=h<<32-e);e&56&&c.push(sjcl.bitArray.partial(e&56,g,1));return c}};sjcl.codec.base64url={fromBits:function(a){return sjcl.codec.base64.fromBits(a,1,1)},toBits:function(a){return sjcl.codec.base64.toBits(a,1)}};sjcl.hash.sha256=function(a){this.b[0]||this.u();a?(this.e=a.e.slice(0),this.c=a.c.slice(0),this.a=a.a):this.reset()};sjcl.hash.sha256.hash=function(a){return(new sjcl.hash.sha256).update(a).finalize()};
	sjcl.hash.sha256.prototype={blockSize:512,reset:function(){this.e=this.i.slice(0);this.c=[];this.a=0;return this},update:function(a){"string"===typeof a&&(a=sjcl.codec.utf8String.toBits(a));var b,c=this.c=sjcl.bitArray.concat(this.c,a);b=this.a;a=this.a=b+sjcl.bitArray.bitLength(a);for(b=512+b&-512;b<=a;b+=512)this.h(c.splice(0,16));return this},finalize:function(){var a,b=this.c,c=this.e,b=sjcl.bitArray.concat(b,[sjcl.bitArray.partial(1,1)]);for(a=b.length+2;a&15;a++)b.push(0);b.push(Math.floor(this.a/
	4294967296));for(b.push(this.a|0);b.length;)this.h(b.splice(0,16));this.reset();return c},i:[],b:[],u:function(){function a(a){return 0x100000000*(a-Math.floor(a))|0}var b=0,c=2,d;a:for(;64>b;c++){for(d=2;d*d<=c;d++)if(0===c%d)continue a;8>b&&(this.i[b]=a(Math.pow(c,0.5)));this.b[b]=a(Math.pow(c,1/3));b++}},h:function(a){var b,c,d=a.slice(0),e=this.e,f=this.b,g=e[0],h=e[1],k=e[2],l=e[3],n=e[4],m=e[5],p=e[6],s=e[7];for(a=0;64>a;a++)16>a?b=d[a]:(b=d[a+1&15],c=d[a+14&15],b=d[a&15]=(b>>>7^b>>>18^b>>>3^
	b<<25^b<<14)+(c>>>17^c>>>19^c>>>10^c<<15^c<<13)+d[a&15]+d[a+9&15]|0),b=b+s+(n>>>6^n>>>11^n>>>25^n<<26^n<<21^n<<7)+(p^n&(m^p))+f[a],s=p,p=m,m=n,n=l+b|0,l=k,k=h,h=g,g=b+(h&k^l&(h^k))+(h>>>2^h>>>13^h>>>22^h<<30^h<<19^h<<10)|0;e[0]=e[0]+g|0;e[1]=e[1]+h|0;e[2]=e[2]+k|0;e[3]=e[3]+l|0;e[4]=e[4]+n|0;e[5]=e[5]+m|0;e[6]=e[6]+p|0;e[7]=e[7]+s|0}};
	sjcl.mode.ccm={name:"ccm",encrypt:function(a,b,c,d,e){var f,g=b.slice(0),h=sjcl.bitArray,k=h.bitLength(c)/8,l=h.bitLength(g)/8;e=e||64;d=d||[];7>k&&q(new sjcl.exception.invalid("ccm: iv must be at least 7 bytes"));for(f=2;4>f&&l>>>8*f;f++);f<15-k&&(f=15-k);c=h.clamp(c,8*(15-f));b=sjcl.mode.ccm.O(a,b,c,d,e,f);g=sjcl.mode.ccm.t(a,g,c,b,e,f);return h.concat(g.data,g.tag)},decrypt:function(a,b,c,d,e){e=e||64;d=d||[];var f=sjcl.bitArray,g=f.bitLength(c)/8,h=f.bitLength(b),k=f.clamp(b,h-e),l=f.bitSlice(b,
	h-e),h=(h-e)/8;7>g&&q(new sjcl.exception.invalid("ccm: iv must be at least 7 bytes"));for(b=2;4>b&&h>>>8*b;b++);b<15-g&&(b=15-g);c=f.clamp(c,8*(15-b));k=sjcl.mode.ccm.t(a,k,c,l,e,b);a=sjcl.mode.ccm.O(a,k.data,c,d,e,b);f.equal(k.tag,a)||q(new sjcl.exception.corrupt("ccm: tag doesn't match"));return k.data},O:function(a,b,c,d,e,f){var g=[],h=sjcl.bitArray,k=h.q;e/=8;(e%2||4>e||16<e)&&q(new sjcl.exception.invalid("ccm: invalid tag length"));(0xffffffff<d.length||0xffffffff<b.length)&&q(new sjcl.exception.bug("ccm: can't deal with 4GiB or more data"));
	f=[h.partial(8,(d.length?64:0)|e-2<<2|f-1)];f=h.concat(f,c);f[3]|=h.bitLength(b)/8;f=a.encrypt(f);if(d.length){c=h.bitLength(d)/8;65279>=c?g=[h.partial(16,c)]:0xffffffff>=c&&(g=h.concat([h.partial(16,65534)],[c]));g=h.concat(g,d);for(d=0;d<g.length;d+=4)f=a.encrypt(k(f,g.slice(d,d+4).concat([0,0,0])))}for(d=0;d<b.length;d+=4)f=a.encrypt(k(f,b.slice(d,d+4).concat([0,0,0])));return h.clamp(f,8*e)},t:function(a,b,c,d,e,f){var g,h=sjcl.bitArray;g=h.q;var k=b.length,l=h.bitLength(b);c=h.concat([h.partial(8,
	f-1)],c).concat([0,0,0]).slice(0,4);d=h.bitSlice(g(d,a.encrypt(c)),0,e);if(!k)return{tag:d,data:[]};for(g=0;g<k;g+=4)c[3]++,e=a.encrypt(c),b[g]^=e[0],b[g+1]^=e[1],b[g+2]^=e[2],b[g+3]^=e[3];return{tag:d,data:h.clamp(b,l)}}};
	sjcl.mode.ocb2={name:"ocb2",encrypt:function(a,b,c,d,e,f){128!==sjcl.bitArray.bitLength(c)&&q(new sjcl.exception.invalid("ocb iv must be 128 bits"));var g,h=sjcl.mode.ocb2.K,k=sjcl.bitArray,l=k.q,n=[0,0,0,0];c=h(a.encrypt(c));var m,p=[];d=d||[];e=e||64;for(g=0;g+4<b.length;g+=4)m=b.slice(g,g+4),n=l(n,m),p=p.concat(l(c,a.encrypt(l(c,m)))),c=h(c);m=b.slice(g);b=k.bitLength(m);g=a.encrypt(l(c,[0,0,0,b]));m=k.clamp(l(m.concat([0,0,0]),g),b);n=l(n,l(m.concat([0,0,0]),g));n=a.encrypt(l(n,l(c,h(c))));d.length&&
	(n=l(n,f?d:sjcl.mode.ocb2.pmac(a,d)));return p.concat(k.concat(m,k.clamp(n,e)))},decrypt:function(a,b,c,d,e,f){128!==sjcl.bitArray.bitLength(c)&&q(new sjcl.exception.invalid("ocb iv must be 128 bits"));e=e||64;var g=sjcl.mode.ocb2.K,h=sjcl.bitArray,k=h.q,l=[0,0,0,0],n=g(a.encrypt(c)),m,p,s=sjcl.bitArray.bitLength(b)-e,r=[];d=d||[];for(c=0;c+4<s/32;c+=4)m=k(n,a.decrypt(k(n,b.slice(c,c+4)))),l=k(l,m),r=r.concat(m),n=g(n);p=s-32*c;m=a.encrypt(k(n,[0,0,0,p]));m=k(m,h.clamp(b.slice(c),p).concat([0,0,0]));
	l=k(l,m);l=a.encrypt(k(l,k(n,g(n))));d.length&&(l=k(l,f?d:sjcl.mode.ocb2.pmac(a,d)));h.equal(h.clamp(l,e),h.bitSlice(b,s))||q(new sjcl.exception.corrupt("ocb: tag doesn't match"));return r.concat(h.clamp(m,p))},pmac:function(a,b){var c,d=sjcl.mode.ocb2.K,e=sjcl.bitArray,f=e.q,g=[0,0,0,0],h=a.encrypt([0,0,0,0]),h=f(h,d(d(h)));for(c=0;c+4<b.length;c+=4)h=d(h),g=f(g,a.encrypt(f(h,b.slice(c,c+4))));c=b.slice(c);128>e.bitLength(c)&&(h=f(h,d(h)),c=e.concat(c,[-2147483648,0,0,0]));g=f(g,c);return a.encrypt(f(d(f(h,
	d(h))),g))},K:function(a){return[a[0]<<1^a[1]>>>31,a[1]<<1^a[2]>>>31,a[2]<<1^a[3]>>>31,a[3]<<1^135*(a[0]>>>31)]}};
	sjcl.mode.gcm={name:"gcm",encrypt:function(a,b,c,d,e){var f=b.slice(0);b=sjcl.bitArray;d=d||[];a=sjcl.mode.gcm.t(!0,a,f,d,c,e||128);return b.concat(a.data,a.tag)},decrypt:function(a,b,c,d,e){var f=b.slice(0),g=sjcl.bitArray,h=g.bitLength(f);e=e||128;d=d||[];e<=h?(b=g.bitSlice(f,h-e),f=g.bitSlice(f,0,h-e)):(b=f,f=[]);a=sjcl.mode.gcm.t(v,a,f,d,c,e);g.equal(a.tag,b)||q(new sjcl.exception.corrupt("gcm: tag doesn't match"));return a.data},ba:function(a,b){var c,d,e,f,g,h=sjcl.bitArray.q;e=[0,0,0,0];f=
	b.slice(0);for(c=0;128>c;c++){(d=0!==(a[Math.floor(c/32)]&1<<31-c%32))&&(e=h(e,f));g=0!==(f[3]&1);for(d=3;0<d;d--)f[d]=f[d]>>>1|(f[d-1]&1)<<31;f[0]>>>=1;g&&(f[0]^=-0x1f000000)}return e},m:function(a,b,c){var d,e=c.length;b=b.slice(0);for(d=0;d<e;d+=4)b[0]^=0xffffffff&c[d],b[1]^=0xffffffff&c[d+1],b[2]^=0xffffffff&c[d+2],b[3]^=0xffffffff&c[d+3],b=sjcl.mode.gcm.ba(b,a);return b},t:function(a,b,c,d,e,f){var g,h,k,l,n,m,p,s,r=sjcl.bitArray;m=c.length;p=r.bitLength(c);s=r.bitLength(d);h=r.bitLength(e);g=
	b.encrypt([0,0,0,0]);96===h?(e=e.slice(0),e=r.concat(e,[1])):(e=sjcl.mode.gcm.m(g,[0,0,0,0],e),e=sjcl.mode.gcm.m(g,e,[0,0,Math.floor(h/0x100000000),h&0xffffffff]));h=sjcl.mode.gcm.m(g,[0,0,0,0],d);n=e.slice(0);d=h.slice(0);a||(d=sjcl.mode.gcm.m(g,h,c));for(l=0;l<m;l+=4)n[3]++,k=b.encrypt(n),c[l]^=k[0],c[l+1]^=k[1],c[l+2]^=k[2],c[l+3]^=k[3];c=r.clamp(c,p);a&&(d=sjcl.mode.gcm.m(g,h,c));a=[Math.floor(s/0x100000000),s&0xffffffff,Math.floor(p/0x100000000),p&0xffffffff];d=sjcl.mode.gcm.m(g,d,a);k=b.encrypt(e);
	d[0]^=k[0];d[1]^=k[1];d[2]^=k[2];d[3]^=k[3];return{tag:r.bitSlice(d,0,f),data:c}}};sjcl.misc.hmac=function(a,b){this.P=b=b||sjcl.hash.sha256;var c=[[],[]],d,e=b.prototype.blockSize/32;this.s=[new b,new b];a.length>e&&(a=b.hash(a));for(d=0;d<e;d++)c[0][d]=a[d]^909522486,c[1][d]=a[d]^1549556828;this.s[0].update(c[0]);this.s[1].update(c[1]);this.J=new b(this.s[0])};
	sjcl.misc.hmac.prototype.encrypt=sjcl.misc.hmac.prototype.mac=function(a){this.T&&q(new sjcl.exception.invalid("encrypt on already updated hmac called!"));this.update(a);return this.digest(a)};sjcl.misc.hmac.prototype.reset=function(){this.J=new this.P(this.s[0]);this.T=v};sjcl.misc.hmac.prototype.update=function(a){this.T=!0;this.J.update(a)};sjcl.misc.hmac.prototype.digest=function(){var a=this.J.finalize(),a=(new this.P(this.s[1])).update(a).finalize();this.reset();return a};
	sjcl.misc.pbkdf2=function(a,b,c,d,e){c=c||1E3;(0>d||0>c)&&q(sjcl.exception.invalid("invalid params to pbkdf2"));"string"===typeof a&&(a=sjcl.codec.utf8String.toBits(a));"string"===typeof b&&(b=sjcl.codec.utf8String.toBits(b));e=e||sjcl.misc.hmac;a=new e(a);var f,g,h,k,l=[],n=sjcl.bitArray;for(k=1;32*l.length<(d||1);k++){e=f=a.encrypt(n.concat(b,[k]));for(g=1;g<c;g++){f=a.encrypt(f);for(h=0;h<f.length;h++)e[h]^=f[h]}l=l.concat(e)}d&&(l=n.clamp(l,d));return l};
	sjcl.prng=function(a){this.g=[new sjcl.hash.sha256];this.n=[0];this.I=0;this.A={};this.H=0;this.N={};this.Q=this.j=this.o=this.Z=0;this.b=[0,0,0,0,0,0,0,0];this.l=[0,0,0,0];this.F=u;this.G=a;this.w=v;this.D={progress:{},seeded:{}};this.r=this.Y=0;this.B=1;this.C=2;this.V=0x10000;this.L=[0,48,64,96,128,192,0x100,384,512,768,1024];this.W=3E4;this.U=80};
	sjcl.prng.prototype={randomWords:function(a,b){var c=[],d;d=this.isReady(b);var e;d===this.r&&q(new sjcl.exception.notReady("generator isn't seeded"));if(d&this.C){d=!(d&this.B);e=[];var f=0,g;this.Q=e[0]=(new Date).valueOf()+this.W;for(g=0;16>g;g++)e.push(0x100000000*Math.random()|0);for(g=0;g<this.g.length&&!(e=e.concat(this.g[g].finalize()),f+=this.n[g],this.n[g]=0,!d&&this.I&1<<g);g++);this.I>=1<<this.g.length&&(this.g.push(new sjcl.hash.sha256),this.n.push(0));this.j-=f;f>this.o&&(this.o=f);this.I++;
	this.b=sjcl.hash.sha256.hash(this.b.concat(e));this.F=new sjcl.cipher.aes(this.b);for(d=0;4>d&&!(this.l[d]=this.l[d]+1|0,this.l[d]);d++);}for(d=0;d<a;d+=4)0===(d+1)%this.V&&fa(this),e=B(this),c.push(e[0],e[1],e[2],e[3]);fa(this);return c.slice(0,a)},setDefaultParanoia:function(a,b){0===a&&"Setting paranoia=0 will ruin your security; use it only for testing"!==b&&q("Setting paranoia=0 will ruin your security; use it only for testing");this.G=a},addEntropy:function(a,b,c){c=c||"user";var d,e,f=(new Date).valueOf(),
	g=this.A[c],h=this.isReady(),k=0;d=this.N[c];d===u&&(d=this.N[c]=this.Z++);g===u&&(g=this.A[c]=0);this.A[c]=(this.A[c]+1)%this.g.length;switch(typeof a){case "number":b===u&&(b=1);this.g[g].update([d,this.H++,1,b,f,1,a|0]);break;case "object":c=Object.prototype.toString.call(a);if("[object Uint32Array]"===c){e=[];for(c=0;c<a.length;c++)e.push(a[c]);a=e}else{"[object Array]"!==c&&(k=1);for(c=0;c<a.length&&!k;c++)"number"!==typeof a[c]&&(k=1)}if(!k){if(b===u)for(c=b=0;c<a.length;c++)for(e=a[c];0<e;)b++,
	e>>>=1;this.g[g].update([d,this.H++,2,b,f,a.length].concat(a))}break;case "string":b===u&&(b=a.length);this.g[g].update([d,this.H++,3,b,f,a.length]);this.g[g].update(a);break;default:k=1}k&&q(new sjcl.exception.bug("random: addEntropy only supports number, array of numbers or string"));this.n[g]+=b;this.j+=b;h===this.r&&(this.isReady()!==this.r&&ga("seeded",Math.max(this.o,this.j)),ga("progress",this.getProgress()))},isReady:function(a){a=this.L[a!==u?a:this.G];return this.o&&this.o>=a?this.n[0]>
	this.U&&(new Date).valueOf()>this.Q?this.C|this.B:this.B:this.j>=a?this.C|this.r:this.r},getProgress:function(a){a=this.L[a?a:this.G];return this.o>=a?1:this.j>a?1:this.j/a},startCollectors:function(){this.w||(this.d={loadTimeCollector:P(this,this.fa),mouseCollector:P(this,this.ga),keyboardCollector:P(this,this.da),accelerometerCollector:P(this,this.X)},window.addEventListener?(window.addEventListener("load",this.d.loadTimeCollector,v),window.addEventListener("mousemove",this.d.mouseCollector,v),
	window.addEventListener("keypress",this.d.keyboardCollector,v),window.addEventListener("devicemotion",this.d.accelerometerCollector,v)):document.attachEvent?(document.attachEvent("onload",this.d.loadTimeCollector),document.attachEvent("onmousemove",this.d.mouseCollector),document.attachEvent("keypress",this.d.keyboardCollector)):q(new sjcl.exception.bug("can't attach event")),this.w=!0)},stopCollectors:function(){this.w&&(window.removeEventListener?(window.removeEventListener("load",this.d.loadTimeCollector,
	v),window.removeEventListener("mousemove",this.d.mouseCollector,v),window.removeEventListener("keypress",this.d.keyboardCollector,v),window.removeEventListener("devicemotion",this.d.accelerometerCollector,v)):document.detachEvent&&(document.detachEvent("onload",this.d.loadTimeCollector),document.detachEvent("onmousemove",this.d.mouseCollector),document.detachEvent("keypress",this.d.keyboardCollector)),this.w=v)},addEventListener:function(a,b){this.D[a][this.Y++]=b},removeEventListener:function(a,
	b){var c,d,e=this.D[a],f=[];for(d in e)e.hasOwnProperty(d)&&e[d]===b&&f.push(d);for(c=0;c<f.length;c++)d=f[c],delete e[d]},da:function(){Q(1)},ga:function(a){var b,c;try{b=a.x||a.clientX||a.offsetX||0,c=a.y||a.clientY||a.offsetY||0}catch(d){c=b=0}0!=b&&0!=c&&sjcl.random.addEntropy([b,c],2,"mouse");Q(0)},fa:function(){Q(2)},X:function(a){a=a.accelerationIncludingGravity.x||a.accelerationIncludingGravity.y||a.accelerationIncludingGravity.z;if(window.orientation){var b=window.orientation;"number"===
	typeof b&&sjcl.random.addEntropy(b,1,"accelerometer")}a&&sjcl.random.addEntropy(a,2,"accelerometer");Q(0)}};function ga(a,b){var c,d=sjcl.random.D[a],e=[];for(c in d)d.hasOwnProperty(c)&&e.push(d[c]);for(c=0;c<e.length;c++)e[c](b)}function Q(a){"undefined"!==typeof window&&window.performance&&"function"===typeof window.performance.now?sjcl.random.addEntropy(window.performance.now(),a,"loadtime"):sjcl.random.addEntropy((new Date).valueOf(),a,"loadtime")}
	function fa(a){a.b=B(a).concat(B(a));a.F=new sjcl.cipher.aes(a.b)}function B(a){for(var b=0;4>b&&!(a.l[b]=a.l[b]+1|0,a.l[b]);b++);return a.F.encrypt(a.l)}function P(a,b){return function(){b.apply(a,arguments)}}sjcl.random=new sjcl.prng(6);
	a:try{var R,S,X,Y;if(Y="undefined"!==typeof module){var Z;if(Z=module.exports){var ha;try{ha=__webpack_require__(40)}catch(ma){ha=null}Z=(S=ha)&&S.randomBytes}Y=Z}if(Y)R=S.randomBytes(128),R=new Uint32Array((new Uint8Array(R)).buffer),sjcl.random.addEntropy(R,1024,"crypto['randomBytes']");else if("undefined"!==typeof window&&"undefined"!==typeof Uint32Array){X=new Uint32Array(32);if(window.crypto&&window.crypto.getRandomValues)window.crypto.getRandomValues(X);else if(window.msCrypto&&window.msCrypto.getRandomValues)window.msCrypto.getRandomValues(X);
	else break a;sjcl.random.addEntropy(X,1024,"crypto['getRandomValues']")}}catch(pa){"undefined"!==typeof window&&window.console&&(console.log("There was an error collecting entropy from the browser:"),console.log(pa))}
	sjcl.json={defaults:{v:1,iter:1E3,ks:128,ts:64,mode:"ccm",adata:"",cipher:"aes"},aa:function(a,b,c,d){c=c||{};d=d||{};var e=sjcl.json,f=e.k({iv:sjcl.random.randomWords(4,0)},e.defaults),g;e.k(f,c);c=f.adata;"string"===typeof f.salt&&(f.salt=sjcl.codec.base64.toBits(f.salt));"string"===typeof f.iv&&(f.iv=sjcl.codec.base64.toBits(f.iv));(!sjcl.mode[f.mode]||!sjcl.cipher[f.cipher]||"string"===typeof a&&100>=f.iter||64!==f.ts&&96!==f.ts&&128!==f.ts||128!==f.ks&&192!==f.ks&&0x100!==f.ks||2>f.iv.length||
	4<f.iv.length)&&q(new sjcl.exception.invalid("json encrypt: invalid parameters"));"string"===typeof a?(g=sjcl.misc.cachedPbkdf2(a,f),a=g.key.slice(0,f.ks/32),f.salt=g.salt):sjcl.ecc&&a instanceof sjcl.ecc.elGamal.publicKey&&(g=a.kem(),f.kemtag=g.tag,a=g.key.slice(0,f.ks/32));"string"===typeof b&&(b=sjcl.codec.utf8String.toBits(b));"string"===typeof c&&(c=sjcl.codec.utf8String.toBits(c));g=new sjcl.cipher[f.cipher](a);e.k(d,f);d.key=a;f.ct=sjcl.mode[f.mode].encrypt(g,b,f.iv,c,f.ts);return f},encrypt:function(a,
	b,c,d){var e=sjcl.json,f=e.aa.apply(e,arguments);return e.encode(f)},$:function(a,b,c,d){c=c||{};d=d||{};var e=sjcl.json;b=e.k(e.k(e.k({},e.defaults),b),c,!0);var f,g;f=b.adata;"string"===typeof b.salt&&(b.salt=sjcl.codec.base64.toBits(b.salt));"string"===typeof b.iv&&(b.iv=sjcl.codec.base64.toBits(b.iv));(!sjcl.mode[b.mode]||!sjcl.cipher[b.cipher]||"string"===typeof a&&100>=b.iter||64!==b.ts&&96!==b.ts&&128!==b.ts||128!==b.ks&&192!==b.ks&&0x100!==b.ks||!b.iv||2>b.iv.length||4<b.iv.length)&&q(new sjcl.exception.invalid("json decrypt: invalid parameters"));
	"string"===typeof a?(g=sjcl.misc.cachedPbkdf2(a,b),a=g.key.slice(0,b.ks/32),b.salt=g.salt):sjcl.ecc&&a instanceof sjcl.ecc.elGamal.secretKey&&(a=a.unkem(sjcl.codec.base64.toBits(b.kemtag)).slice(0,b.ks/32));"string"===typeof f&&(f=sjcl.codec.utf8String.toBits(f));g=new sjcl.cipher[b.cipher](a);f=sjcl.mode[b.mode].decrypt(g,b.ct,b.iv,f,b.ts);e.k(d,b);d.key=a;return 1===c.raw?f:sjcl.codec.utf8String.fromBits(f)},decrypt:function(a,b,c,d){var e=sjcl.json;return e.$(a,e.decode(b),c,d)},encode:function(a){var b,
	c="{",d="";for(b in a)if(a.hasOwnProperty(b))switch(b.match(/^[a-z0-9]+$/i)||q(new sjcl.exception.invalid("json encode: invalid property name")),c+=d+'"'+b+'":',d=",",typeof a[b]){case "number":case "boolean":c+=a[b];break;case "string":c+='"'+escape(a[b])+'"';break;case "object":c+='"'+sjcl.codec.base64.fromBits(a[b],0)+'"';break;default:q(new sjcl.exception.bug("json encode: unsupported type"))}return c+"}"},decode:function(a){a=a.replace(/\s/g,"");a.match(/^\{.*\}$/)||q(new sjcl.exception.invalid("json decode: this isn't json!"));
	a=a.replace(/^\{|\}$/g,"").split(/,/);var b={},c,d;for(c=0;c<a.length;c++)(d=a[c].match(/^\s*(?:(["']?)([a-z][a-z0-9]*)\1)\s*:\s*(?:(-?\d+)|"([a-z0-9+\/%*_.@=\-]*)"|(true|false))$/i))||q(new sjcl.exception.invalid("json decode: this isn't json!")),d[3]?b[d[2]]=parseInt(d[3],10):d[4]?b[d[2]]=d[2].match(/^(ct|salt|iv)$/)?sjcl.codec.base64.toBits(d[4]):unescape(d[4]):d[5]&&(b[d[2]]="true"===d[5]);return b},k:function(a,b,c){a===u&&(a={});if(b===u)return a;for(var d in b)b.hasOwnProperty(d)&&(c&&(a[d]!==
	u&&a[d]!==b[d])&&q(new sjcl.exception.invalid("required parameter overridden")),a[d]=b[d]);return a},ja:function(a,b){var c={},d;for(d in a)a.hasOwnProperty(d)&&a[d]!==b[d]&&(c[d]=a[d]);return c},ia:function(a,b){var c={},d;for(d=0;d<b.length;d++)a[b[d]]!==u&&(c[b[d]]=a[b[d]]);return c}};sjcl.encrypt=sjcl.json.encrypt;sjcl.decrypt=sjcl.json.decrypt;sjcl.misc.ha={};
	sjcl.misc.cachedPbkdf2=function(a,b){var c=sjcl.misc.ha,d;b=b||{};d=b.iter||1E3;c=c[a]=c[a]||{};d=c[d]=c[d]||{firstSalt:b.salt&&b.salt.length?b.salt.slice(0):sjcl.random.randomWords(2,0)};c=b.salt===u?d.firstSalt:b.salt;d[c]=d[c]||sjcl.misc.pbkdf2(a,c,b.iter);return{key:d[c].slice(0),salt:c.slice(0)}};sjcl.bn=function(a){this.initWith(a)};
	sjcl.bn.prototype={radix:24,maxMul:8,f:sjcl.bn,copy:function(){return new this.f(this)},initWith:function(a){var b=0,c;switch(typeof a){case "object":this.limbs=a.limbs.slice(0);break;case "number":this.limbs=[a];this.normalize();break;case "string":a=a.replace(/^0x/,"");this.limbs=[];c=this.radix/4;for(b=0;b<a.length;b+=c)this.limbs.push(parseInt(a.substring(Math.max(a.length-b-c,0),a.length-b),16));break;default:this.limbs=[0]}return this},equals:function(a){"number"===typeof a&&(a=new this.f(a));
	var b=0,c;this.fullReduce();a.fullReduce();for(c=0;c<this.limbs.length||c<a.limbs.length;c++)b|=this.getLimb(c)^a.getLimb(c);return 0===b},getLimb:function(a){return a>=this.limbs.length?0:this.limbs[a]},greaterEquals:function(a){"number"===typeof a&&(a=new this.f(a));var b=0,c=0,d,e,f;for(d=Math.max(this.limbs.length,a.limbs.length)-1;0<=d;d--)e=this.getLimb(d),f=a.getLimb(d),c|=f-e&~b,b|=e-f&~c;return(c|~b)>>>31},toString:function(){this.fullReduce();var a="",b,c,d=this.limbs;for(b=0;b<this.limbs.length;b++){for(c=
	d[b].toString(16);b<this.limbs.length-1&&6>c.length;)c="0"+c;a=c+a}return"0x"+a},addM:function(a){"object"!==typeof a&&(a=new this.f(a));var b=this.limbs,c=a.limbs;for(a=b.length;a<c.length;a++)b[a]=0;for(a=0;a<c.length;a++)b[a]+=c[a];return this},doubleM:function(){var a,b=0,c,d=this.radix,e=this.radixMask,f=this.limbs;for(a=0;a<f.length;a++)c=f[a],c=c+c+b,f[a]=c&e,b=c>>d;b&&f.push(b);return this},halveM:function(){var a,b=0,c,d=this.radix,e=this.limbs;for(a=e.length-1;0<=a;a--)c=e[a],e[a]=c+b>>
	1,b=(c&1)<<d;e[e.length-1]||e.pop();return this},subM:function(a){"object"!==typeof a&&(a=new this.f(a));var b=this.limbs,c=a.limbs;for(a=b.length;a<c.length;a++)b[a]=0;for(a=0;a<c.length;a++)b[a]-=c[a];return this},mod:function(a){var b=!this.greaterEquals(new sjcl.bn(0));a=(new sjcl.bn(a)).normalize();var c=(new sjcl.bn(this)).normalize(),d=0;for(b&&(c=(new sjcl.bn(0)).subM(c).normalize());c.greaterEquals(a);d++)a.doubleM();for(b&&(c=a.sub(c).normalize());0<d;d--)a.halveM(),c.greaterEquals(a)&&
	c.subM(a).normalize();return c.trim()},inverseMod:function(a){var b=new sjcl.bn(1),c=new sjcl.bn(0),d=new sjcl.bn(this),e=new sjcl.bn(a),f,g=1;a.limbs[0]&1||q(new sjcl.exception.invalid("inverseMod: p must be odd"));do{d.limbs[0]&1&&(d.greaterEquals(e)||(f=d,d=e,e=f,f=b,b=c,c=f),d.subM(e),d.normalize(),b.greaterEquals(c)||b.addM(a),b.subM(c));d.halveM();b.limbs[0]&1&&b.addM(a);b.normalize();b.halveM();for(f=g=0;f<d.limbs.length;f++)g|=d.limbs[f]}while(g);e.equals(1)||q(new sjcl.exception.invalid("inverseMod: p and x must be relatively prime"));
	return c},add:function(a){return this.copy().addM(a)},sub:function(a){return this.copy().subM(a)},mul:function(a){"number"===typeof a&&(a=new this.f(a));var b,c=this.limbs,d=a.limbs,e=c.length,f=d.length,g=new this.f,h=g.limbs,k,l=this.maxMul;for(b=0;b<this.limbs.length+a.limbs.length+1;b++)h[b]=0;for(b=0;b<e;b++){k=c[b];for(a=0;a<f;a++)h[b+a]+=k*d[a];--l||(l=this.maxMul,g.cnormalize())}return g.cnormalize().reduce()},square:function(){return this.mul(this)},power:function(a){"number"===typeof a?
	a=[a]:a.limbs!==u&&(a=a.normalize().limbs);var b,c,d=new this.f(1),e=this;for(b=0;b<a.length;b++)for(c=0;c<this.radix;c++)a[b]&1<<c&&(d=d.mul(e)),e=e.square();return d},mulmod:function(a,b){return this.mod(b).mul(a.mod(b)).mod(b)},powermod:function(a,b){for(var c=new sjcl.bn(1),d=new sjcl.bn(this),e=new sjcl.bn(a);;){e.limbs[0]&1&&(c=c.mulmod(d,b));e.halveM();if(e.equals(0))break;d=d.mulmod(d,b)}return c.normalize().reduce()},trim:function(){var a=this.limbs,b;do b=a.pop();while(a.length&&0===b);
	a.push(b);return this},reduce:function(){return this},fullReduce:function(){return this.normalize()},normalize:function(){var a=0,b,c=this.placeVal,d=this.ipv,e,f=this.limbs,g=f.length,h=this.radixMask;for(b=0;b<g||0!==a&&-1!==a;b++)a=(f[b]||0)+a,e=f[b]=a&h,a=(a-e)*d;-1===a&&(f[b-1]-=c);return this},cnormalize:function(){var a=0,b,c=this.ipv,d,e=this.limbs,f=e.length,g=this.radixMask;for(b=0;b<f-1;b++)a=e[b]+a,d=e[b]=a&g,a=(a-d)*c;e[b]+=a;return this},toBits:function(a){this.fullReduce();a=a||this.exponent||
	this.bitLength();var b=Math.floor((a-1)/24),c=sjcl.bitArray,d=[c.partial((a+7&-8)%this.radix||this.radix,this.getLimb(b))];for(b--;0<=b;b--)d=c.concat(d,[c.partial(Math.min(this.radix,a),this.getLimb(b))]),a-=this.radix;return d},bitLength:function(){this.fullReduce();for(var a=this.radix*(this.limbs.length-1),b=this.limbs[this.limbs.length-1];b;b>>>=1)a++;return a+7&-8}};
	sjcl.bn.fromBits=function(a){var b=new this,c=[],d=sjcl.bitArray,e=this.prototype,f=Math.min(this.bitLength||0x100000000,d.bitLength(a)),g=f%e.radix||e.radix;for(c[0]=d.extract(a,0,g);g<f;g+=e.radix)c.unshift(d.extract(a,g,e.radix));b.limbs=c;return b};sjcl.bn.prototype.ipv=1/(sjcl.bn.prototype.placeVal=Math.pow(2,sjcl.bn.prototype.radix));sjcl.bn.prototype.radixMask=(1<<sjcl.bn.prototype.radix)-1;
	sjcl.bn.pseudoMersennePrime=function(a,b){function c(a){this.initWith(a)}var d=c.prototype=new sjcl.bn,e,f;e=d.modOffset=Math.ceil(f=a/d.radix);d.exponent=a;d.offset=[];d.factor=[];d.minOffset=e;d.fullMask=0;d.fullOffset=[];d.fullFactor=[];d.modulus=c.modulus=new sjcl.bn(Math.pow(2,a));d.fullMask=0|-Math.pow(2,a%d.radix);for(e=0;e<b.length;e++)d.offset[e]=Math.floor(b[e][0]/d.radix-f),d.fullOffset[e]=Math.ceil(b[e][0]/d.radix-f),d.factor[e]=b[e][1]*Math.pow(0.5,a-b[e][0]+d.offset[e]*d.radix),d.fullFactor[e]=
	b[e][1]*Math.pow(0.5,a-b[e][0]+d.fullOffset[e]*d.radix),d.modulus.addM(new sjcl.bn(Math.pow(2,b[e][0])*b[e][1])),d.minOffset=Math.min(d.minOffset,-d.offset[e]);d.f=c;d.modulus.cnormalize();d.reduce=function(){var a,b,c,d=this.modOffset,e=this.limbs,f=this.offset,p=this.offset.length,s=this.factor,r;for(a=this.minOffset;e.length>d;){c=e.pop();r=e.length;for(b=0;b<p;b++)e[r+f[b]]-=s[b]*c;a--;a||(e.push(0),this.cnormalize(),a=this.minOffset)}this.cnormalize();return this};d.S=-1===d.fullMask?d.reduce:
	function(){var a=this.limbs,b=a.length-1,c,d;this.reduce();if(b===this.modOffset-1){d=a[b]&this.fullMask;a[b]-=d;for(c=0;c<this.fullOffset.length;c++)a[b+this.fullOffset[c]]-=this.fullFactor[c]*d;this.normalize()}};d.fullReduce=function(){var a,b;this.S();this.addM(this.modulus);this.addM(this.modulus);this.normalize();this.S();for(b=this.limbs.length;b<this.modOffset;b++)this.limbs[b]=0;a=this.greaterEquals(this.modulus);for(b=0;b<this.limbs.length;b++)this.limbs[b]-=this.modulus.limbs[b]*a;this.cnormalize();
	return this};d.inverse=function(){return this.power(this.modulus.sub(2))};c.fromBits=sjcl.bn.fromBits;return c};var $=sjcl.bn.pseudoMersennePrime;
	sjcl.bn.prime={p127:$(127,[[0,-1]]),p25519:$(255,[[0,-19]]),p192k:$(192,[[32,-1],[12,-1],[8,-1],[7,-1],[6,-1],[3,-1],[0,-1]]),p224k:$(224,[[32,-1],[12,-1],[11,-1],[9,-1],[7,-1],[4,-1],[1,-1],[0,-1]]),p256k:$(0x100,[[32,-1],[9,-1],[8,-1],[7,-1],[6,-1],[4,-1],[0,-1]]),p192:$(192,[[0,-1],[64,-1]]),p224:$(224,[[0,1],[96,-1]]),p256:$(0x100,[[0,-1],[96,1],[192,1],[224,-1]]),p384:$(384,[[0,-1],[32,1],[96,-1],[128,-1]]),p521:$(521,[[0,-1]])};
	sjcl.bn.random=function(a,b){"object"!==typeof a&&(a=new sjcl.bn(a));for(var c,d,e=a.limbs.length,f=a.limbs[e-1]+1,g=new sjcl.bn;;){do c=sjcl.random.randomWords(e,b),0>c[e-1]&&(c[e-1]+=0x100000000);while(Math.floor(c[e-1]/f)===Math.floor(0x100000000/f));c[e-1]%=f;for(d=0;d<e-1;d++)c[d]&=a.radixMask;g.limbs=c;if(!g.greaterEquals(a))return g}};
	sjcl.codec.bytes={fromBits:function(a){var b=[],c=sjcl.bitArray.bitLength(a),d,e;for(d=0;d<c/8;d++)0===(d&3)&&(e=a[d/4]),b.push(e>>>24),e<<=8;return b},toBits:function(a){var b=[],c,d=0;for(c=0;c<a.length;c++)d=d<<8|a[c],3===(c&3)&&(b.push(d),d=0);c&3&&b.push(sjcl.bitArray.partial(8*(c&3),d));return b}};sjcl.hash.sha512=function(a){this.b[0]||this.u();a?(this.e=a.e.slice(0),this.c=a.c.slice(0),this.a=a.a):this.reset()};sjcl.hash.sha512.hash=function(a){return(new sjcl.hash.sha512).update(a).finalize()};
	sjcl.hash.sha512.prototype={blockSize:1024,reset:function(){this.e=this.i.slice(0);this.c=[];this.a=0;return this},update:function(a){"string"===typeof a&&(a=sjcl.codec.utf8String.toBits(a));var b,c=this.c=sjcl.bitArray.concat(this.c,a);b=this.a;a=this.a=b+sjcl.bitArray.bitLength(a);for(b=1024+b&-1024;b<=a;b+=1024)this.h(c.splice(0,32));return this},finalize:function(){var a,b=this.c,c=this.e,b=sjcl.bitArray.concat(b,[sjcl.bitArray.partial(1,1)]);for(a=b.length+4;a&31;a++)b.push(0);b.push(0);b.push(0);
	b.push(Math.floor(this.a/0x100000000));for(b.push(this.a|0);b.length;)this.h(b.splice(0,32));this.reset();return c},i:[],ca:[12372232,13281083,9762859,1914609,15106769,4090911,4308331,8266105],b:[],ea:[2666018,15689165,5061423,9034684,4764984,380953,1658779,7176472,197186,7368638,14987916,16757986,8096111,1480369,13046325,6891156,15813330,5187043,9229749,11312229,2818677,10937475,4324308,1135541,6741931,11809296,16458047,15666916,11046850,698149,229999,945776,13774844,2541862,12856045,9810911,11494366,
	7844520,15576806,8533307,15795044,4337665,16291729,5553712,15684120,6662416,7413802,12308920,13816008,4303699,9366425,10176680,13195875,4295371,6546291,11712675,15708924,1519456,15772530,6568428,6495784,8568297,13007125,7492395,2515356,12632583,14740254,7262584,1535930,13146278,16321966,1853211,294276,13051027,13221564,1051980,4080310,6651434,14088940,4675607],u:function(){function a(a){return 0x100000000*(a-Math.floor(a))|0}function b(a){return 0x10000000000*(a-Math.floor(a))&255}var c=0,d=2,e;a:for(;80>
	c;d++){for(e=2;e*e<=d;e++)if(0===d%e)continue a;8>c&&(this.i[2*c]=a(Math.pow(d,0.5)),this.i[2*c+1]=b(Math.pow(d,0.5))<<24|this.ca[c]);this.b[2*c]=a(Math.pow(d,1/3));this.b[2*c+1]=b(Math.pow(d,1/3))<<24|this.ea[c];c++}},h:function(a){var b,c,d=a.slice(0),e=this.e,f=this.b,g=e[0],h=e[1],k=e[2],l=e[3],n=e[4],m=e[5],p=e[6],s=e[7],r=e[8],D=e[9],F=e[10],E=e[11],ia=e[12],T=e[13],ja=e[14],U=e[15],y=g,w=h,I=k,G=l,J=n,H=m,ba=p,K=s,z=r,x=D,V=F,L=E,W=ia,M=T,ca=ja,N=U;for(a=0;80>a;a++){if(16>a)b=d[2*a],c=d[2*
	a+1];else{c=d[2*(a-15)];var t=d[2*(a-15)+1];b=(t<<31|c>>>1)^(t<<24|c>>>8)^c>>>7;var A=(c<<31|t>>>1)^(c<<24|t>>>8)^(c<<25|t>>>7);c=d[2*(a-2)];var C=d[2*(a-2)+1],t=(C<<13|c>>>19)^(c<<3|C>>>29)^c>>>6,C=(c<<13|C>>>19)^(C<<3|c>>>29)^(c<<26|C>>>6),da=d[2*(a-7)],ea=d[2*(a-16)],O=d[2*(a-16)+1];c=A+d[2*(a-7)+1];b=b+da+(c>>>0<A>>>0?1:0);c+=C;b+=t+(c>>>0<C>>>0?1:0);c+=O;b+=ea+(c>>>0<O>>>0?1:0)}d[2*a]=b|=0;d[2*a+1]=c|=0;var da=z&V^~z&W,ka=x&L^~x&M,C=y&I^y&J^I&J,na=w&G^w&H^G&H,ea=(w<<4|y>>>28)^(y<<30|w>>>2)^(y<<
	25|w>>>7),O=(y<<4|w>>>28)^(w<<30|y>>>2)^(w<<25|y>>>7),oa=f[2*a],la=f[2*a+1],t=N+((z<<18|x>>>14)^(z<<14|x>>>18)^(x<<23|z>>>9)),A=ca+((x<<18|z>>>14)^(x<<14|z>>>18)^(z<<23|x>>>9))+(t>>>0<N>>>0?1:0),t=t+ka,A=A+(da+(t>>>0<ka>>>0?1:0)),t=t+la,A=A+(oa+(t>>>0<la>>>0?1:0)),t=t+c|0,A=A+(b+(t>>>0<c>>>0?1:0));c=O+na;b=ea+C+(c>>>0<O>>>0?1:0);ca=W;N=M;W=V;M=L;V=z;L=x;x=K+t|0;z=ba+A+(x>>>0<K>>>0?1:0)|0;ba=J;K=H;J=I;H=G;I=y;G=w;w=t+c|0;y=A+b+(w>>>0<t>>>0?1:0)|0}h=e[1]=h+w|0;e[0]=g+y+(h>>>0<w>>>0?1:0)|0;l=e[3]=l+
	G|0;e[2]=k+I+(l>>>0<G>>>0?1:0)|0;m=e[5]=m+H|0;e[4]=n+J+(m>>>0<H>>>0?1:0)|0;s=e[7]=s+K|0;e[6]=p+ba+(s>>>0<K>>>0?1:0)|0;D=e[9]=D+x|0;e[8]=r+z+(D>>>0<x>>>0?1:0)|0;E=e[11]=E+L|0;e[10]=F+V+(E>>>0<L>>>0?1:0)|0;T=e[13]=T+M|0;e[12]=ia+W+(T>>>0<M>>>0?1:0)|0;U=e[15]=U+N|0;e[14]=ja+ca+(U>>>0<N>>>0?1:0)|0}};sjcl.hash.sha1=function(a){a?(this.e=a.e.slice(0),this.c=a.c.slice(0),this.a=a.a):this.reset()};sjcl.hash.sha1.hash=function(a){return(new sjcl.hash.sha1).update(a).finalize()};
	sjcl.hash.sha1.prototype={blockSize:512,reset:function(){this.e=this.i.slice(0);this.c=[];this.a=0;return this},update:function(a){"string"===typeof a&&(a=sjcl.codec.utf8String.toBits(a));var b,c=this.c=sjcl.bitArray.concat(this.c,a);b=this.a;a=this.a=b+sjcl.bitArray.bitLength(a);for(b=this.blockSize+b&-this.blockSize;b<=a;b+=this.blockSize)this.h(c.splice(0,16));return this},finalize:function(){var a,b=this.c,c=this.e,b=sjcl.bitArray.concat(b,[sjcl.bitArray.partial(1,1)]);for(a=b.length+2;a&15;a++)b.push(0);
	b.push(Math.floor(this.a/0x100000000));for(b.push(this.a|0);b.length;)this.h(b.splice(0,16));this.reset();return c},i:[1732584193,4023233417,2562383102,271733878,3285377520],b:[1518500249,1859775393,2400959708,3395469782],h:function(a){var b,c,d,e,f,g,h=a.slice(0),k=this.e;c=k[0];d=k[1];e=k[2];f=k[3];g=k[4];for(a=0;79>=a;a++)16<=a&&(h[a]=(h[a-3]^h[a-8]^h[a-14]^h[a-16])<<1|(h[a-3]^h[a-8]^h[a-14]^h[a-16])>>>31),b=19>=a?d&e|~d&f:39>=a?d^e^f:59>=a?d&e|d&f|e&f:79>=a?d^e^f:u,b=(c<<5|c>>>27)+b+g+h[a]+this.b[Math.floor(a/
	20)]|0,g=f,f=e,e=d<<30|d>>>2,d=c,c=b;k[0]=k[0]+c|0;k[1]=k[1]+d|0;k[2]=k[2]+e|0;k[3]=k[3]+f|0;k[4]=k[4]+g|0}};


/***/ },
/* 47 */
/***/ function(module, exports, __webpack_require__) {

	;(function () { // closure for web browsers

	if (typeof module === 'object' && module.exports) {
	  module.exports = LRUCache
	} else {
	  // just set the global for non-node platforms.
	  this.LRUCache = LRUCache
	}

	function hOP (obj, key) {
	  return Object.prototype.hasOwnProperty.call(obj, key)
	}

	function naiveLength () { return 1 }

	function LRUCache (options) {
	  if (!(this instanceof LRUCache))
	    return new LRUCache(options)

	  if (typeof options === 'number')
	    options = { max: options }

	  if (!options)
	    options = {}

	  this._max = options.max
	  // Kind of weird to have a default max of Infinity, but oh well.
	  if (!this._max || !(typeof this._max === "number") || this._max <= 0 )
	    this._max = Infinity

	  this._lengthCalculator = options.length || naiveLength
	  if (typeof this._lengthCalculator !== "function")
	    this._lengthCalculator = naiveLength

	  this._allowStale = options.stale || false
	  this._maxAge = options.maxAge || null
	  this._dispose = options.dispose
	  this.reset()
	}

	// resize the cache when the max changes.
	Object.defineProperty(LRUCache.prototype, "max",
	  { set : function (mL) {
	      if (!mL || !(typeof mL === "number") || mL <= 0 ) mL = Infinity
	      this._max = mL
	      if (this._length > this._max) trim(this)
	    }
	  , get : function () { return this._max }
	  , enumerable : true
	  })

	// resize the cache when the lengthCalculator changes.
	Object.defineProperty(LRUCache.prototype, "lengthCalculator",
	  { set : function (lC) {
	      if (typeof lC !== "function") {
	        this._lengthCalculator = naiveLength
	        this._length = this._itemCount
	        for (var key in this._cache) {
	          this._cache[key].length = 1
	        }
	      } else {
	        this._lengthCalculator = lC
	        this._length = 0
	        for (var key in this._cache) {
	          this._cache[key].length = this._lengthCalculator(this._cache[key].value)
	          this._length += this._cache[key].length
	        }
	      }

	      if (this._length > this._max) trim(this)
	    }
	  , get : function () { return this._lengthCalculator }
	  , enumerable : true
	  })

	Object.defineProperty(LRUCache.prototype, "length",
	  { get : function () { return this._length }
	  , enumerable : true
	  })


	Object.defineProperty(LRUCache.prototype, "itemCount",
	  { get : function () { return this._itemCount }
	  , enumerable : true
	  })

	LRUCache.prototype.forEach = function (fn, thisp) {
	  thisp = thisp || this
	  var i = 0;
	  for (var k = this._mru - 1; k >= 0 && i < this._itemCount; k--) if (this._lruList[k]) {
	    i++
	    var hit = this._lruList[k]
	    if (this._maxAge && (Date.now() - hit.now > this._maxAge)) {
	      del(this, hit)
	      if (!this._allowStale) hit = undefined
	    }
	    if (hit) {
	      fn.call(thisp, hit.value, hit.key, this)
	    }
	  }
	}

	LRUCache.prototype.keys = function () {
	  var keys = new Array(this._itemCount)
	  var i = 0
	  for (var k = this._mru - 1; k >= 0 && i < this._itemCount; k--) if (this._lruList[k]) {
	    var hit = this._lruList[k]
	    keys[i++] = hit.key
	  }
	  return keys
	}

	LRUCache.prototype.values = function () {
	  var values = new Array(this._itemCount)
	  var i = 0
	  for (var k = this._mru - 1; k >= 0 && i < this._itemCount; k--) if (this._lruList[k]) {
	    var hit = this._lruList[k]
	    values[i++] = hit.value
	  }
	  return values
	}

	LRUCache.prototype.reset = function () {
	  if (this._dispose && this._cache) {
	    for (var k in this._cache) {
	      this._dispose(k, this._cache[k].value)
	    }
	  }

	  this._cache = Object.create(null) // hash of items by key
	  this._lruList = Object.create(null) // list of items in order of use recency
	  this._mru = 0 // most recently used
	  this._lru = 0 // least recently used
	  this._length = 0 // number of items in the list
	  this._itemCount = 0
	}

	// Provided for debugging/dev purposes only. No promises whatsoever that
	// this API stays stable.
	LRUCache.prototype.dump = function () {
	  return this._cache
	}

	LRUCache.prototype.dumpLru = function () {
	  return this._lruList
	}

	LRUCache.prototype.set = function (key, value) {
	  if (hOP(this._cache, key)) {
	    // dispose of the old one before overwriting
	    if (this._dispose) this._dispose(key, this._cache[key].value)
	    if (this._maxAge) this._cache[key].now = Date.now()
	    this._cache[key].value = value
	    this.get(key)
	    return true
	  }

	  var len = this._lengthCalculator(value)
	  var age = this._maxAge ? Date.now() : 0
	  var hit = new Entry(key, value, this._mru++, len, age)

	  // oversized objects fall out of cache automatically.
	  if (hit.length > this._max) {
	    if (this._dispose) this._dispose(key, value)
	    return false
	  }

	  this._length += hit.length
	  this._lruList[hit.lu] = this._cache[key] = hit
	  this._itemCount ++

	  if (this._length > this._max) trim(this)
	  return true
	}

	LRUCache.prototype.has = function (key) {
	  if (!hOP(this._cache, key)) return false
	  var hit = this._cache[key]
	  if (this._maxAge && (Date.now() - hit.now > this._maxAge)) {
	    return false
	  }
	  return true
	}

	LRUCache.prototype.get = function (key) {
	  return get(this, key, true)
	}

	LRUCache.prototype.peek = function (key) {
	  return get(this, key, false)
	}

	LRUCache.prototype.pop = function () {
	  var hit = this._lruList[this._lru]
	  del(this, hit)
	  return hit || null
	}

	LRUCache.prototype.del = function (key) {
	  del(this, this._cache[key])
	}

	function get (self, key, doUse) {
	  var hit = self._cache[key]
	  if (hit) {
	    if (self._maxAge && (Date.now() - hit.now > self._maxAge)) {
	      del(self, hit)
	      if (!self._allowStale) hit = undefined
	    } else {
	      if (doUse) use(self, hit)
	    }
	    if (hit) hit = hit.value
	  }
	  return hit
	}

	function use (self, hit) {
	  shiftLU(self, hit)
	  hit.lu = self._mru ++
	  if (self._maxAge) hit.now = Date.now()
	  self._lruList[hit.lu] = hit
	}

	function trim (self) {
	  while (self._lru < self._mru && self._length > self._max)
	    del(self, self._lruList[self._lru])
	}

	function shiftLU (self, hit) {
	  delete self._lruList[ hit.lu ]
	  while (self._lru < self._mru && !self._lruList[self._lru]) self._lru ++
	}

	function del (self, hit) {
	  if (hit) {
	    if (self._dispose) self._dispose(hit.key, hit.value)
	    self._length -= hit.length
	    self._itemCount --
	    delete self._cache[ hit.key ]
	    shiftLU(self, hit)
	  }
	}

	// classy, since V8 prefers predictable objects.
	function Entry (key, value, lu, length, now) {
	  this.key = key
	  this.value = value
	  this.lu = lu
	  this.length = length
	  this.now = now
	}

	})()


/***/ },
/* 48 */
/***/ function(module, exports, __webpack_require__) {

	var __WEBPACK_AMD_DEFINE_ARRAY__, __WEBPACK_AMD_DEFINE_RESULT__;/* WEBPACK VAR INJECTION */(function(process) {/*!
	 * async
	 * https://github.com/caolan/async
	 *
	 * Copyright 2010-2014 Caolan McMahon
	 * Released under the MIT license
	 */
	/*jshint onevar: false, indent:4 */
	/*global setImmediate: false, setTimeout: false, console: false */
	(function () {

	    var async = {};

	    // global on the server, window in the browser
	    var root, previous_async;

	    root = this;
	    if (root != null) {
	      previous_async = root.async;
	    }

	    async.noConflict = function () {
	        root.async = previous_async;
	        return async;
	    };

	    function only_once(fn) {
	        var called = false;
	        return function() {
	            if (called) throw new Error("Callback was already called.");
	            called = true;
	            fn.apply(root, arguments);
	        }
	    }

	    //// cross-browser compatiblity functions ////

	    var _toString = Object.prototype.toString;

	    var _isArray = Array.isArray || function (obj) {
	        return _toString.call(obj) === '[object Array]';
	    };

	    var _each = function (arr, iterator) {
	        for (var i = 0; i < arr.length; i += 1) {
	            iterator(arr[i], i, arr);
	        }
	    };

	    var _map = function (arr, iterator) {
	        if (arr.map) {
	            return arr.map(iterator);
	        }
	        var results = [];
	        _each(arr, function (x, i, a) {
	            results.push(iterator(x, i, a));
	        });
	        return results;
	    };

	    var _reduce = function (arr, iterator, memo) {
	        if (arr.reduce) {
	            return arr.reduce(iterator, memo);
	        }
	        _each(arr, function (x, i, a) {
	            memo = iterator(memo, x, i, a);
	        });
	        return memo;
	    };

	    var _keys = function (obj) {
	        if (Object.keys) {
	            return Object.keys(obj);
	        }
	        var keys = [];
	        for (var k in obj) {
	            if (obj.hasOwnProperty(k)) {
	                keys.push(k);
	            }
	        }
	        return keys;
	    };

	    //// exported async module functions ////

	    //// nextTick implementation with browser-compatible fallback ////
	    if (typeof process === 'undefined' || !(process.nextTick)) {
	        if (typeof setImmediate === 'function') {
	            async.nextTick = function (fn) {
	                // not a direct alias for IE10 compatibility
	                setImmediate(fn);
	            };
	            async.setImmediate = async.nextTick;
	        }
	        else {
	            async.nextTick = function (fn) {
	                setTimeout(fn, 0);
	            };
	            async.setImmediate = async.nextTick;
	        }
	    }
	    else {
	        async.nextTick = process.nextTick;
	        if (typeof setImmediate !== 'undefined') {
	            async.setImmediate = function (fn) {
	              // not a direct alias for IE10 compatibility
	              setImmediate(fn);
	            };
	        }
	        else {
	            async.setImmediate = async.nextTick;
	        }
	    }

	    async.each = function (arr, iterator, callback) {
	        callback = callback || function () {};
	        if (!arr.length) {
	            return callback();
	        }
	        var completed = 0;
	        _each(arr, function (x) {
	            iterator(x, only_once(done) );
	        });
	        function done(err) {
	          if (err) {
	              callback(err);
	              callback = function () {};
	          }
	          else {
	              completed += 1;
	              if (completed >= arr.length) {
	                  callback();
	              }
	          }
	        }
	    };
	    async.forEach = async.each;

	    async.eachSeries = function (arr, iterator, callback) {
	        callback = callback || function () {};
	        if (!arr.length) {
	            return callback();
	        }
	        var completed = 0;
	        var iterate = function () {
	            iterator(arr[completed], function (err) {
	                if (err) {
	                    callback(err);
	                    callback = function () {};
	                }
	                else {
	                    completed += 1;
	                    if (completed >= arr.length) {
	                        callback();
	                    }
	                    else {
	                        iterate();
	                    }
	                }
	            });
	        };
	        iterate();
	    };
	    async.forEachSeries = async.eachSeries;

	    async.eachLimit = function (arr, limit, iterator, callback) {
	        var fn = _eachLimit(limit);
	        fn.apply(null, [arr, iterator, callback]);
	    };
	    async.forEachLimit = async.eachLimit;

	    var _eachLimit = function (limit) {

	        return function (arr, iterator, callback) {
	            callback = callback || function () {};
	            if (!arr.length || limit <= 0) {
	                return callback();
	            }
	            var completed = 0;
	            var started = 0;
	            var running = 0;

	            (function replenish () {
	                if (completed >= arr.length) {
	                    return callback();
	                }

	                while (running < limit && started < arr.length) {
	                    started += 1;
	                    running += 1;
	                    iterator(arr[started - 1], function (err) {
	                        if (err) {
	                            callback(err);
	                            callback = function () {};
	                        }
	                        else {
	                            completed += 1;
	                            running -= 1;
	                            if (completed >= arr.length) {
	                                callback();
	                            }
	                            else {
	                                replenish();
	                            }
	                        }
	                    });
	                }
	            })();
	        };
	    };


	    var doParallel = function (fn) {
	        return function () {
	            var args = Array.prototype.slice.call(arguments);
	            return fn.apply(null, [async.each].concat(args));
	        };
	    };
	    var doParallelLimit = function(limit, fn) {
	        return function () {
	            var args = Array.prototype.slice.call(arguments);
	            return fn.apply(null, [_eachLimit(limit)].concat(args));
	        };
	    };
	    var doSeries = function (fn) {
	        return function () {
	            var args = Array.prototype.slice.call(arguments);
	            return fn.apply(null, [async.eachSeries].concat(args));
	        };
	    };


	    var _asyncMap = function (eachfn, arr, iterator, callback) {
	        arr = _map(arr, function (x, i) {
	            return {index: i, value: x};
	        });
	        if (!callback) {
	            eachfn(arr, function (x, callback) {
	                iterator(x.value, function (err) {
	                    callback(err);
	                });
	            });
	        } else {
	            var results = [];
	            eachfn(arr, function (x, callback) {
	                iterator(x.value, function (err, v) {
	                    results[x.index] = v;
	                    callback(err);
	                });
	            }, function (err) {
	                callback(err, results);
	            });
	        }
	    };
	    async.map = doParallel(_asyncMap);
	    async.mapSeries = doSeries(_asyncMap);
	    async.mapLimit = function (arr, limit, iterator, callback) {
	        return _mapLimit(limit)(arr, iterator, callback);
	    };

	    var _mapLimit = function(limit) {
	        return doParallelLimit(limit, _asyncMap);
	    };

	    // reduce only has a series version, as doing reduce in parallel won't
	    // work in many situations.
	    async.reduce = function (arr, memo, iterator, callback) {
	        async.eachSeries(arr, function (x, callback) {
	            iterator(memo, x, function (err, v) {
	                memo = v;
	                callback(err);
	            });
	        }, function (err) {
	            callback(err, memo);
	        });
	    };
	    // inject alias
	    async.inject = async.reduce;
	    // foldl alias
	    async.foldl = async.reduce;

	    async.reduceRight = function (arr, memo, iterator, callback) {
	        var reversed = _map(arr, function (x) {
	            return x;
	        }).reverse();
	        async.reduce(reversed, memo, iterator, callback);
	    };
	    // foldr alias
	    async.foldr = async.reduceRight;

	    var _filter = function (eachfn, arr, iterator, callback) {
	        var results = [];
	        arr = _map(arr, function (x, i) {
	            return {index: i, value: x};
	        });
	        eachfn(arr, function (x, callback) {
	            iterator(x.value, function (v) {
	                if (v) {
	                    results.push(x);
	                }
	                callback();
	            });
	        }, function (err) {
	            callback(_map(results.sort(function (a, b) {
	                return a.index - b.index;
	            }), function (x) {
	                return x.value;
	            }));
	        });
	    };
	    async.filter = doParallel(_filter);
	    async.filterSeries = doSeries(_filter);
	    // select alias
	    async.select = async.filter;
	    async.selectSeries = async.filterSeries;

	    var _reject = function (eachfn, arr, iterator, callback) {
	        var results = [];
	        arr = _map(arr, function (x, i) {
	            return {index: i, value: x};
	        });
	        eachfn(arr, function (x, callback) {
	            iterator(x.value, function (v) {
	                if (!v) {
	                    results.push(x);
	                }
	                callback();
	            });
	        }, function (err) {
	            callback(_map(results.sort(function (a, b) {
	                return a.index - b.index;
	            }), function (x) {
	                return x.value;
	            }));
	        });
	    };
	    async.reject = doParallel(_reject);
	    async.rejectSeries = doSeries(_reject);

	    var _detect = function (eachfn, arr, iterator, main_callback) {
	        eachfn(arr, function (x, callback) {
	            iterator(x, function (result) {
	                if (result) {
	                    main_callback(x);
	                    main_callback = function () {};
	                }
	                else {
	                    callback();
	                }
	            });
	        }, function (err) {
	            main_callback();
	        });
	    };
	    async.detect = doParallel(_detect);
	    async.detectSeries = doSeries(_detect);

	    async.some = function (arr, iterator, main_callback) {
	        async.each(arr, function (x, callback) {
	            iterator(x, function (v) {
	                if (v) {
	                    main_callback(true);
	                    main_callback = function () {};
	                }
	                callback();
	            });
	        }, function (err) {
	            main_callback(false);
	        });
	    };
	    // any alias
	    async.any = async.some;

	    async.every = function (arr, iterator, main_callback) {
	        async.each(arr, function (x, callback) {
	            iterator(x, function (v) {
	                if (!v) {
	                    main_callback(false);
	                    main_callback = function () {};
	                }
	                callback();
	            });
	        }, function (err) {
	            main_callback(true);
	        });
	    };
	    // all alias
	    async.all = async.every;

	    async.sortBy = function (arr, iterator, callback) {
	        async.map(arr, function (x, callback) {
	            iterator(x, function (err, criteria) {
	                if (err) {
	                    callback(err);
	                }
	                else {
	                    callback(null, {value: x, criteria: criteria});
	                }
	            });
	        }, function (err, results) {
	            if (err) {
	                return callback(err);
	            }
	            else {
	                var fn = function (left, right) {
	                    var a = left.criteria, b = right.criteria;
	                    return a < b ? -1 : a > b ? 1 : 0;
	                };
	                callback(null, _map(results.sort(fn), function (x) {
	                    return x.value;
	                }));
	            }
	        });
	    };

	    async.auto = function (tasks, callback) {
	        callback = callback || function () {};
	        var keys = _keys(tasks);
	        var remainingTasks = keys.length
	        if (!remainingTasks) {
	            return callback();
	        }

	        var results = {};

	        var listeners = [];
	        var addListener = function (fn) {
	            listeners.unshift(fn);
	        };
	        var removeListener = function (fn) {
	            for (var i = 0; i < listeners.length; i += 1) {
	                if (listeners[i] === fn) {
	                    listeners.splice(i, 1);
	                    return;
	                }
	            }
	        };
	        var taskComplete = function () {
	            remainingTasks--
	            _each(listeners.slice(0), function (fn) {
	                fn();
	            });
	        };

	        addListener(function () {
	            if (!remainingTasks) {
	                var theCallback = callback;
	                // prevent final callback from calling itself if it errors
	                callback = function () {};

	                theCallback(null, results);
	            }
	        });

	        _each(keys, function (k) {
	            var task = _isArray(tasks[k]) ? tasks[k]: [tasks[k]];
	            var taskCallback = function (err) {
	                var args = Array.prototype.slice.call(arguments, 1);
	                if (args.length <= 1) {
	                    args = args[0];
	                }
	                if (err) {
	                    var safeResults = {};
	                    _each(_keys(results), function(rkey) {
	                        safeResults[rkey] = results[rkey];
	                    });
	                    safeResults[k] = args;
	                    callback(err, safeResults);
	                    // stop subsequent errors hitting callback multiple times
	                    callback = function () {};
	                }
	                else {
	                    results[k] = args;
	                    async.setImmediate(taskComplete);
	                }
	            };
	            var requires = task.slice(0, Math.abs(task.length - 1)) || [];
	            var ready = function () {
	                return _reduce(requires, function (a, x) {
	                    return (a && results.hasOwnProperty(x));
	                }, true) && !results.hasOwnProperty(k);
	            };
	            if (ready()) {
	                task[task.length - 1](taskCallback, results);
	            }
	            else {
	                var listener = function () {
	                    if (ready()) {
	                        removeListener(listener);
	                        task[task.length - 1](taskCallback, results);
	                    }
	                };
	                addListener(listener);
	            }
	        });
	    };

	    async.retry = function(times, task, callback) {
	        var DEFAULT_TIMES = 5;
	        var attempts = [];
	        // Use defaults if times not passed
	        if (typeof times === 'function') {
	            callback = task;
	            task = times;
	            times = DEFAULT_TIMES;
	        }
	        // Make sure times is a number
	        times = parseInt(times, 10) || DEFAULT_TIMES;
	        var wrappedTask = function(wrappedCallback, wrappedResults) {
	            var retryAttempt = function(task, finalAttempt) {
	                return function(seriesCallback) {
	                    task(function(err, result){
	                        seriesCallback(!err || finalAttempt, {err: err, result: result});
	                    }, wrappedResults);
	                };
	            };
	            while (times) {
	                attempts.push(retryAttempt(task, !(times-=1)));
	            }
	            async.series(attempts, function(done, data){
	                data = data[data.length - 1];
	                (wrappedCallback || callback)(data.err, data.result);
	            });
	        }
	        // If a callback is passed, run this as a controll flow
	        return callback ? wrappedTask() : wrappedTask
	    };

	    async.waterfall = function (tasks, callback) {
	        callback = callback || function () {};
	        if (!_isArray(tasks)) {
	          var err = new Error('First argument to waterfall must be an array of functions');
	          return callback(err);
	        }
	        if (!tasks.length) {
	            return callback();
	        }
	        var wrapIterator = function (iterator) {
	            return function (err) {
	                if (err) {
	                    callback.apply(null, arguments);
	                    callback = function () {};
	                }
	                else {
	                    var args = Array.prototype.slice.call(arguments, 1);
	                    var next = iterator.next();
	                    if (next) {
	                        args.push(wrapIterator(next));
	                    }
	                    else {
	                        args.push(callback);
	                    }
	                    async.setImmediate(function () {
	                        iterator.apply(null, args);
	                    });
	                }
	            };
	        };
	        wrapIterator(async.iterator(tasks))();
	    };

	    var _parallel = function(eachfn, tasks, callback) {
	        callback = callback || function () {};
	        if (_isArray(tasks)) {
	            eachfn.map(tasks, function (fn, callback) {
	                if (fn) {
	                    fn(function (err) {
	                        var args = Array.prototype.slice.call(arguments, 1);
	                        if (args.length <= 1) {
	                            args = args[0];
	                        }
	                        callback.call(null, err, args);
	                    });
	                }
	            }, callback);
	        }
	        else {
	            var results = {};
	            eachfn.each(_keys(tasks), function (k, callback) {
	                tasks[k](function (err) {
	                    var args = Array.prototype.slice.call(arguments, 1);
	                    if (args.length <= 1) {
	                        args = args[0];
	                    }
	                    results[k] = args;
	                    callback(err);
	                });
	            }, function (err) {
	                callback(err, results);
	            });
	        }
	    };

	    async.parallel = function (tasks, callback) {
	        _parallel({ map: async.map, each: async.each }, tasks, callback);
	    };

	    async.parallelLimit = function(tasks, limit, callback) {
	        _parallel({ map: _mapLimit(limit), each: _eachLimit(limit) }, tasks, callback);
	    };

	    async.series = function (tasks, callback) {
	        callback = callback || function () {};
	        if (_isArray(tasks)) {
	            async.mapSeries(tasks, function (fn, callback) {
	                if (fn) {
	                    fn(function (err) {
	                        var args = Array.prototype.slice.call(arguments, 1);
	                        if (args.length <= 1) {
	                            args = args[0];
	                        }
	                        callback.call(null, err, args);
	                    });
	                }
	            }, callback);
	        }
	        else {
	            var results = {};
	            async.eachSeries(_keys(tasks), function (k, callback) {
	                tasks[k](function (err) {
	                    var args = Array.prototype.slice.call(arguments, 1);
	                    if (args.length <= 1) {
	                        args = args[0];
	                    }
	                    results[k] = args;
	                    callback(err);
	                });
	            }, function (err) {
	                callback(err, results);
	            });
	        }
	    };

	    async.iterator = function (tasks) {
	        var makeCallback = function (index) {
	            var fn = function () {
	                if (tasks.length) {
	                    tasks[index].apply(null, arguments);
	                }
	                return fn.next();
	            };
	            fn.next = function () {
	                return (index < tasks.length - 1) ? makeCallback(index + 1): null;
	            };
	            return fn;
	        };
	        return makeCallback(0);
	    };

	    async.apply = function (fn) {
	        var args = Array.prototype.slice.call(arguments, 1);
	        return function () {
	            return fn.apply(
	                null, args.concat(Array.prototype.slice.call(arguments))
	            );
	        };
	    };

	    var _concat = function (eachfn, arr, fn, callback) {
	        var r = [];
	        eachfn(arr, function (x, cb) {
	            fn(x, function (err, y) {
	                r = r.concat(y || []);
	                cb(err);
	            });
	        }, function (err) {
	            callback(err, r);
	        });
	    };
	    async.concat = doParallel(_concat);
	    async.concatSeries = doSeries(_concat);

	    async.whilst = function (test, iterator, callback) {
	        if (test()) {
	            iterator(function (err) {
	                if (err) {
	                    return callback(err);
	                }
	                async.whilst(test, iterator, callback);
	            });
	        }
	        else {
	            callback();
	        }
	    };

	    async.doWhilst = function (iterator, test, callback) {
	        iterator(function (err) {
	            if (err) {
	                return callback(err);
	            }
	            var args = Array.prototype.slice.call(arguments, 1);
	            if (test.apply(null, args)) {
	                async.doWhilst(iterator, test, callback);
	            }
	            else {
	                callback();
	            }
	        });
	    };

	    async.until = function (test, iterator, callback) {
	        if (!test()) {
	            iterator(function (err) {
	                if (err) {
	                    return callback(err);
	                }
	                async.until(test, iterator, callback);
	            });
	        }
	        else {
	            callback();
	        }
	    };

	    async.doUntil = function (iterator, test, callback) {
	        iterator(function (err) {
	            if (err) {
	                return callback(err);
	            }
	            var args = Array.prototype.slice.call(arguments, 1);
	            if (!test.apply(null, args)) {
	                async.doUntil(iterator, test, callback);
	            }
	            else {
	                callback();
	            }
	        });
	    };

	    async.queue = function (worker, concurrency) {
	        if (concurrency === undefined) {
	            concurrency = 1;
	        }
	        function _insert(q, data, pos, callback) {
	          if (!q.started){
	            q.started = true;
	          }
	          if (!_isArray(data)) {
	              data = [data];
	          }
	          if(data.length == 0) {
	             // call drain immediately if there are no tasks
	             return async.setImmediate(function() {
	                 if (q.drain) {
	                     q.drain();
	                 }
	             });
	          }
	          _each(data, function(task) {
	              var item = {
	                  data: task,
	                  callback: typeof callback === 'function' ? callback : null
	              };

	              if (pos) {
	                q.tasks.unshift(item);
	              } else {
	                q.tasks.push(item);
	              }

	              if (q.saturated && q.tasks.length === q.concurrency) {
	                  q.saturated();
	              }
	              async.setImmediate(q.process);
	          });
	        }

	        var workers = 0;
	        var q = {
	            tasks: [],
	            concurrency: concurrency,
	            saturated: null,
	            empty: null,
	            drain: null,
	            started: false,
	            paused: false,
	            push: function (data, callback) {
	              _insert(q, data, false, callback);
	            },
	            kill: function () {
	              q.drain = null;
	              q.tasks = [];
	            },
	            unshift: function (data, callback) {
	              _insert(q, data, true, callback);
	            },
	            process: function () {
	                if (!q.paused && workers < q.concurrency && q.tasks.length) {
	                    var task = q.tasks.shift();
	                    if (q.empty && q.tasks.length === 0) {
	                        q.empty();
	                    }
	                    workers += 1;
	                    var next = function () {
	                        workers -= 1;
	                        if (task.callback) {
	                            task.callback.apply(task, arguments);
	                        }
	                        if (q.drain && q.tasks.length + workers === 0) {
	                            q.drain();
	                        }
	                        q.process();
	                    };
	                    var cb = only_once(next);
	                    worker(task.data, cb);
	                }
	            },
	            length: function () {
	                return q.tasks.length;
	            },
	            running: function () {
	                return workers;
	            },
	            idle: function() {
	                return q.tasks.length + workers === 0;
	            },
	            pause: function () {
	                if (q.paused === true) { return; }
	                q.paused = true;
	            },
	            resume: function () {
	                if (q.paused === false) { return; }
	                q.paused = false;
	                // Need to call q.process once per concurrent
	                // worker to preserve full concurrency after pause
	                for (var w = 1; w <= q.concurrency; w++) {
	                    async.setImmediate(q.process);
	                }
	            }
	        };
	        return q;
	    };

	    async.priorityQueue = function (worker, concurrency) {

	        function _compareTasks(a, b){
	          return a.priority - b.priority;
	        };

	        function _binarySearch(sequence, item, compare) {
	          var beg = -1,
	              end = sequence.length - 1;
	          while (beg < end) {
	            var mid = beg + ((end - beg + 1) >>> 1);
	            if (compare(item, sequence[mid]) >= 0) {
	              beg = mid;
	            } else {
	              end = mid - 1;
	            }
	          }
	          return beg;
	        }

	        function _insert(q, data, priority, callback) {
	          if (!q.started){
	            q.started = true;
	          }
	          if (!_isArray(data)) {
	              data = [data];
	          }
	          if(data.length == 0) {
	             // call drain immediately if there are no tasks
	             return async.setImmediate(function() {
	                 if (q.drain) {
	                     q.drain();
	                 }
	             });
	          }
	          _each(data, function(task) {
	              var item = {
	                  data: task,
	                  priority: priority,
	                  callback: typeof callback === 'function' ? callback : null
	              };

	              q.tasks.splice(_binarySearch(q.tasks, item, _compareTasks) + 1, 0, item);

	              if (q.saturated && q.tasks.length === q.concurrency) {
	                  q.saturated();
	              }
	              async.setImmediate(q.process);
	          });
	        }

	        // Start with a normal queue
	        var q = async.queue(worker, concurrency);

	        // Override push to accept second parameter representing priority
	        q.push = function (data, priority, callback) {
	          _insert(q, data, priority, callback);
	        };

	        // Remove unshift function
	        delete q.unshift;

	        return q;
	    };

	    async.cargo = function (worker, payload) {
	        var working     = false,
	            tasks       = [];

	        var cargo = {
	            tasks: tasks,
	            payload: payload,
	            saturated: null,
	            empty: null,
	            drain: null,
	            drained: true,
	            push: function (data, callback) {
	                if (!_isArray(data)) {
	                    data = [data];
	                }
	                _each(data, function(task) {
	                    tasks.push({
	                        data: task,
	                        callback: typeof callback === 'function' ? callback : null
	                    });
	                    cargo.drained = false;
	                    if (cargo.saturated && tasks.length === payload) {
	                        cargo.saturated();
	                    }
	                });
	                async.setImmediate(cargo.process);
	            },
	            process: function process() {
	                if (working) return;
	                if (tasks.length === 0) {
	                    if(cargo.drain && !cargo.drained) cargo.drain();
	                    cargo.drained = true;
	                    return;
	                }

	                var ts = typeof payload === 'number'
	                            ? tasks.splice(0, payload)
	                            : tasks.splice(0, tasks.length);

	                var ds = _map(ts, function (task) {
	                    return task.data;
	                });

	                if(cargo.empty) cargo.empty();
	                working = true;
	                worker(ds, function () {
	                    working = false;

	                    var args = arguments;
	                    _each(ts, function (data) {
	                        if (data.callback) {
	                            data.callback.apply(null, args);
	                        }
	                    });

	                    process();
	                });
	            },
	            length: function () {
	                return tasks.length;
	            },
	            running: function () {
	                return working;
	            }
	        };
	        return cargo;
	    };

	    var _console_fn = function (name) {
	        return function (fn) {
	            var args = Array.prototype.slice.call(arguments, 1);
	            fn.apply(null, args.concat([function (err) {
	                var args = Array.prototype.slice.call(arguments, 1);
	                if (typeof console !== 'undefined') {
	                    if (err) {
	                        if (console.error) {
	                            console.error(err);
	                        }
	                    }
	                    else if (console[name]) {
	                        _each(args, function (x) {
	                            console[name](x);
	                        });
	                    }
	                }
	            }]));
	        };
	    };
	    async.log = _console_fn('log');
	    async.dir = _console_fn('dir');
	    /*async.info = _console_fn('info');
	    async.warn = _console_fn('warn');
	    async.error = _console_fn('error');*/

	    async.memoize = function (fn, hasher) {
	        var memo = {};
	        var queues = {};
	        hasher = hasher || function (x) {
	            return x;
	        };
	        var memoized = function () {
	            var args = Array.prototype.slice.call(arguments);
	            var callback = args.pop();
	            var key = hasher.apply(null, args);
	            if (key in memo) {
	                async.nextTick(function () {
	                    callback.apply(null, memo[key]);
	                });
	            }
	            else if (key in queues) {
	                queues[key].push(callback);
	            }
	            else {
	                queues[key] = [callback];
	                fn.apply(null, args.concat([function () {
	                    memo[key] = arguments;
	                    var q = queues[key];
	                    delete queues[key];
	                    for (var i = 0, l = q.length; i < l; i++) {
	                      q[i].apply(null, arguments);
	                    }
	                }]));
	            }
	        };
	        memoized.memo = memo;
	        memoized.unmemoized = fn;
	        return memoized;
	    };

	    async.unmemoize = function (fn) {
	      return function () {
	        return (fn.unmemoized || fn).apply(null, arguments);
	      };
	    };

	    async.times = function (count, iterator, callback) {
	        var counter = [];
	        for (var i = 0; i < count; i++) {
	            counter.push(i);
	        }
	        return async.map(counter, iterator, callback);
	    };

	    async.timesSeries = function (count, iterator, callback) {
	        var counter = [];
	        for (var i = 0; i < count; i++) {
	            counter.push(i);
	        }
	        return async.mapSeries(counter, iterator, callback);
	    };

	    async.seq = function (/* functions... */) {
	        var fns = arguments;
	        return function () {
	            var that = this;
	            var args = Array.prototype.slice.call(arguments);
	            var callback = args.pop();
	            async.reduce(fns, args, function (newargs, fn, cb) {
	                fn.apply(that, newargs.concat([function () {
	                    var err = arguments[0];
	                    var nextargs = Array.prototype.slice.call(arguments, 1);
	                    cb(err, nextargs);
	                }]))
	            },
	            function (err, results) {
	                callback.apply(that, [err].concat(results));
	            });
	        };
	    };

	    async.compose = function (/* functions... */) {
	      return async.seq.apply(null, Array.prototype.reverse.call(arguments));
	    };

	    var _applyEach = function (eachfn, fns /*args...*/) {
	        var go = function () {
	            var that = this;
	            var args = Array.prototype.slice.call(arguments);
	            var callback = args.pop();
	            return eachfn(fns, function (fn, cb) {
	                fn.apply(that, args.concat([cb]));
	            },
	            callback);
	        };
	        if (arguments.length > 2) {
	            var args = Array.prototype.slice.call(arguments, 2);
	            return go.apply(this, args);
	        }
	        else {
	            return go;
	        }
	    };
	    async.applyEach = doParallel(_applyEach);
	    async.applyEachSeries = doSeries(_applyEach);

	    async.forever = function (fn, callback) {
	        function next(err) {
	            if (err) {
	                if (callback) {
	                    return callback(err);
	                }
	                throw err;
	            }
	            fn(next);
	        }
	        next();
	    };

	    // Node.js
	    if (typeof module !== 'undefined' && module.exports) {
	        module.exports = async;
	    }
	    // AMD / RequireJS
	    else if (true) {
	        !(__WEBPACK_AMD_DEFINE_ARRAY__ = [], __WEBPACK_AMD_DEFINE_RESULT__ = (function () {
	            return async;
	        }.apply(null, __WEBPACK_AMD_DEFINE_ARRAY__)), __WEBPACK_AMD_DEFINE_RESULT__ !== undefined && (module.exports = __WEBPACK_AMD_DEFINE_RESULT__));
	    }
	    // included directly via <script> tag
	    else {
	        root.async = async;
	    }

	}());
	
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(58)))

/***/ },
/* 49 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Module dependencies.
	 */

	var Emitter = __webpack_require__(67);
	var reduce = __webpack_require__(68);

	/**
	 * Root reference for iframes.
	 */

	var root = 'undefined' == typeof window
	  ? this
	  : window;

	/**
	 * Noop.
	 */

	function noop(){};

	/**
	 * Check if `obj` is a host object,
	 * we don't want to serialize these :)
	 *
	 * TODO: future proof, move to compoent land
	 *
	 * @param {Object} obj
	 * @return {Boolean}
	 * @api private
	 */

	function isHost(obj) {
	  var str = {}.toString.call(obj);

	  switch (str) {
	    case '[object File]':
	    case '[object Blob]':
	    case '[object FormData]':
	      return true;
	    default:
	      return false;
	  }
	}

	/**
	 * Determine XHR.
	 */

	function getXHR() {
	  if (root.XMLHttpRequest
	    && ('file:' != root.location.protocol || !root.ActiveXObject)) {
	    return new XMLHttpRequest;
	  } else {
	    try { return new ActiveXObject('Microsoft.XMLHTTP'); } catch(e) {}
	    try { return new ActiveXObject('Msxml2.XMLHTTP.6.0'); } catch(e) {}
	    try { return new ActiveXObject('Msxml2.XMLHTTP.3.0'); } catch(e) {}
	    try { return new ActiveXObject('Msxml2.XMLHTTP'); } catch(e) {}
	  }
	  return false;
	}

	/**
	 * Removes leading and trailing whitespace, added to support IE.
	 *
	 * @param {String} s
	 * @return {String}
	 * @api private
	 */

	var trim = ''.trim
	  ? function(s) { return s.trim(); }
	  : function(s) { return s.replace(/(^\s*|\s*$)/g, ''); };

	/**
	 * Check if `obj` is an object.
	 *
	 * @param {Object} obj
	 * @return {Boolean}
	 * @api private
	 */

	function isObject(obj) {
	  return obj === Object(obj);
	}

	/**
	 * Serialize the given `obj`.
	 *
	 * @param {Object} obj
	 * @return {String}
	 * @api private
	 */

	function serialize(obj) {
	  if (!isObject(obj)) return obj;
	  var pairs = [];
	  for (var key in obj) {
	    if (null != obj[key]) {
	      pairs.push(encodeURIComponent(key)
	        + '=' + encodeURIComponent(obj[key]));
	    }
	  }
	  return pairs.join('&');
	}

	/**
	 * Expose serialization method.
	 */

	 request.serializeObject = serialize;

	 /**
	  * Parse the given x-www-form-urlencoded `str`.
	  *
	  * @param {String} str
	  * @return {Object}
	  * @api private
	  */

	function parseString(str) {
	  var obj = {};
	  var pairs = str.split('&');
	  var parts;
	  var pair;

	  for (var i = 0, len = pairs.length; i < len; ++i) {
	    pair = pairs[i];
	    parts = pair.split('=');
	    obj[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
	  }

	  return obj;
	}

	/**
	 * Expose parser.
	 */

	request.parseString = parseString;

	/**
	 * Default MIME type map.
	 *
	 *     superagent.types.xml = 'application/xml';
	 *
	 */

	request.types = {
	  html: 'text/html',
	  json: 'application/json',
	  xml: 'application/xml',
	  urlencoded: 'application/x-www-form-urlencoded',
	  'form': 'application/x-www-form-urlencoded',
	  'form-data': 'application/x-www-form-urlencoded'
	};

	/**
	 * Default serialization map.
	 *
	 *     superagent.serialize['application/xml'] = function(obj){
	 *       return 'generated xml here';
	 *     };
	 *
	 */

	 request.serialize = {
	   'application/x-www-form-urlencoded': serialize,
	   'application/json': JSON.stringify
	 };

	 /**
	  * Default parsers.
	  *
	  *     superagent.parse['application/xml'] = function(str){
	  *       return { object parsed from str };
	  *     };
	  *
	  */

	request.parse = {
	  'application/x-www-form-urlencoded': parseString,
	  'application/json': JSON.parse
	};

	/**
	 * Parse the given header `str` into
	 * an object containing the mapped fields.
	 *
	 * @param {String} str
	 * @return {Object}
	 * @api private
	 */

	function parseHeader(str) {
	  var lines = str.split(/\r?\n/);
	  var fields = {};
	  var index;
	  var line;
	  var field;
	  var val;

	  lines.pop(); // trailing CRLF

	  for (var i = 0, len = lines.length; i < len; ++i) {
	    line = lines[i];
	    index = line.indexOf(':');
	    field = line.slice(0, index).toLowerCase();
	    val = trim(line.slice(index + 1));
	    fields[field] = val;
	  }

	  return fields;
	}

	/**
	 * Return the mime type for the given `str`.
	 *
	 * @param {String} str
	 * @return {String}
	 * @api private
	 */

	function type(str){
	  return str.split(/ *; */).shift();
	};

	/**
	 * Return header field parameters.
	 *
	 * @param {String} str
	 * @return {Object}
	 * @api private
	 */

	function params(str){
	  return reduce(str.split(/ *; */), function(obj, str){
	    var parts = str.split(/ *= */)
	      , key = parts.shift()
	      , val = parts.shift();

	    if (key && val) obj[key] = val;
	    return obj;
	  }, {});
	};

	/**
	 * Initialize a new `Response` with the given `xhr`.
	 *
	 *  - set flags (.ok, .error, etc)
	 *  - parse header
	 *
	 * Examples:
	 *
	 *  Aliasing `superagent` as `request` is nice:
	 *
	 *      request = superagent;
	 *
	 *  We can use the promise-like API, or pass callbacks:
	 *
	 *      request.get('/').end(function(res){});
	 *      request.get('/', function(res){});
	 *
	 *  Sending data can be chained:
	 *
	 *      request
	 *        .post('/user')
	 *        .send({ name: 'tj' })
	 *        .end(function(res){});
	 *
	 *  Or passed to `.send()`:
	 *
	 *      request
	 *        .post('/user')
	 *        .send({ name: 'tj' }, function(res){});
	 *
	 *  Or passed to `.post()`:
	 *
	 *      request
	 *        .post('/user', { name: 'tj' })
	 *        .end(function(res){});
	 *
	 * Or further reduced to a single call for simple cases:
	 *
	 *      request
	 *        .post('/user', { name: 'tj' }, function(res){});
	 *
	 * @param {XMLHTTPRequest} xhr
	 * @param {Object} options
	 * @api private
	 */

	function Response(req, options) {
	  options = options || {};
	  this.req = req;
	  this.xhr = this.req.xhr;
	  this.text = this.xhr.responseText;
	  this.setStatusProperties(this.xhr.status);
	  this.header = this.headers = parseHeader(this.xhr.getAllResponseHeaders());
	  // getAllResponseHeaders sometimes falsely returns "" for CORS requests, but
	  // getResponseHeader still works. so we get content-type even if getting
	  // other headers fails.
	  this.header['content-type'] = this.xhr.getResponseHeader('content-type');
	  this.setHeaderProperties(this.header);
	  this.body = this.req.method != 'HEAD'
	    ? this.parseBody(this.text)
	    : null;
	}

	/**
	 * Get case-insensitive `field` value.
	 *
	 * @param {String} field
	 * @return {String}
	 * @api public
	 */

	Response.prototype.get = function(field){
	  return this.header[field.toLowerCase()];
	};

	/**
	 * Set header related properties:
	 *
	 *   - `.type` the content type without params
	 *
	 * A response of "Content-Type: text/plain; charset=utf-8"
	 * will provide you with a `.type` of "text/plain".
	 *
	 * @param {Object} header
	 * @api private
	 */

	Response.prototype.setHeaderProperties = function(header){
	  // content-type
	  var ct = this.header['content-type'] || '';
	  this.type = type(ct);

	  // params
	  var obj = params(ct);
	  for (var key in obj) this[key] = obj[key];
	};

	/**
	 * Parse the given body `str`.
	 *
	 * Used for auto-parsing of bodies. Parsers
	 * are defined on the `superagent.parse` object.
	 *
	 * @param {String} str
	 * @return {Mixed}
	 * @api private
	 */

	Response.prototype.parseBody = function(str){
	  var parse = request.parse[this.type];
	  return parse
	    ? parse(str)
	    : null;
	};

	/**
	 * Set flags such as `.ok` based on `status`.
	 *
	 * For example a 2xx response will give you a `.ok` of __true__
	 * whereas 5xx will be __false__ and `.error` will be __true__. The
	 * `.clientError` and `.serverError` are also available to be more
	 * specific, and `.statusType` is the class of error ranging from 1..5
	 * sometimes useful for mapping respond colors etc.
	 *
	 * "sugar" properties are also defined for common cases. Currently providing:
	 *
	 *   - .noContent
	 *   - .badRequest
	 *   - .unauthorized
	 *   - .notAcceptable
	 *   - .notFound
	 *
	 * @param {Number} status
	 * @api private
	 */

	Response.prototype.setStatusProperties = function(status){
	  var type = status / 100 | 0;

	  // status / class
	  this.status = status;
	  this.statusType = type;

	  // basics
	  this.info = 1 == type;
	  this.ok = 2 == type;
	  this.clientError = 4 == type;
	  this.serverError = 5 == type;
	  this.error = (4 == type || 5 == type)
	    ? this.toError()
	    : false;

	  // sugar
	  this.accepted = 202 == status;
	  this.noContent = 204 == status || 1223 == status;
	  this.badRequest = 400 == status;
	  this.unauthorized = 401 == status;
	  this.notAcceptable = 406 == status;
	  this.notFound = 404 == status;
	  this.forbidden = 403 == status;
	};

	/**
	 * Return an `Error` representative of this response.
	 *
	 * @return {Error}
	 * @api public
	 */

	Response.prototype.toError = function(){
	  var req = this.req;
	  var method = req.method;
	  var url = req.url;

	  var msg = 'cannot ' + method + ' ' + url + ' (' + this.status + ')';
	  var err = new Error(msg);
	  err.status = this.status;
	  err.method = method;
	  err.url = url;

	  return err;
	};

	/**
	 * Expose `Response`.
	 */

	request.Response = Response;

	/**
	 * Initialize a new `Request` with the given `method` and `url`.
	 *
	 * @param {String} method
	 * @param {String} url
	 * @api public
	 */

	function Request(method, url) {
	  var self = this;
	  Emitter.call(this);
	  this._query = this._query || [];
	  this.method = method;
	  this.url = url;
	  this.header = {};
	  this._header = {};
	  this.on('end', function(){
	    var res = new Response(self);
	    if ('HEAD' == method) res.text = null;
	    self.callback(null, res);
	  });
	}

	/**
	 * Mixin `Emitter`.
	 */

	Emitter(Request.prototype);

	/**
	 * Allow for extension
	 */

	Request.prototype.use = function(fn) {
	  fn(this);
	  return this;
	}

	/**
	 * Set timeout to `ms`.
	 *
	 * @param {Number} ms
	 * @return {Request} for chaining
	 * @api public
	 */

	Request.prototype.timeout = function(ms){
	  this._timeout = ms;
	  return this;
	};

	/**
	 * Clear previous timeout.
	 *
	 * @return {Request} for chaining
	 * @api public
	 */

	Request.prototype.clearTimeout = function(){
	  this._timeout = 0;
	  clearTimeout(this._timer);
	  return this;
	};

	/**
	 * Abort the request, and clear potential timeout.
	 *
	 * @return {Request}
	 * @api public
	 */

	Request.prototype.abort = function(){
	  if (this.aborted) return;
	  this.aborted = true;
	  this.xhr.abort();
	  this.clearTimeout();
	  this.emit('abort');
	  return this;
	};

	/**
	 * Set header `field` to `val`, or multiple fields with one object.
	 *
	 * Examples:
	 *
	 *      req.get('/')
	 *        .set('Accept', 'application/json')
	 *        .set('X-API-Key', 'foobar')
	 *        .end(callback);
	 *
	 *      req.get('/')
	 *        .set({ Accept: 'application/json', 'X-API-Key': 'foobar' })
	 *        .end(callback);
	 *
	 * @param {String|Object} field
	 * @param {String} val
	 * @return {Request} for chaining
	 * @api public
	 */

	Request.prototype.set = function(field, val){
	  if (isObject(field)) {
	    for (var key in field) {
	      this.set(key, field[key]);
	    }
	    return this;
	  }
	  this._header[field.toLowerCase()] = val;
	  this.header[field] = val;
	  return this;
	};

	/**
	 * Get case-insensitive header `field` value.
	 *
	 * @param {String} field
	 * @return {String}
	 * @api private
	 */

	Request.prototype.getHeader = function(field){
	  return this._header[field.toLowerCase()];
	};

	/**
	 * Set Content-Type to `type`, mapping values from `request.types`.
	 *
	 * Examples:
	 *
	 *      superagent.types.xml = 'application/xml';
	 *
	 *      request.post('/')
	 *        .type('xml')
	 *        .send(xmlstring)
	 *        .end(callback);
	 *
	 *      request.post('/')
	 *        .type('application/xml')
	 *        .send(xmlstring)
	 *        .end(callback);
	 *
	 * @param {String} type
	 * @return {Request} for chaining
	 * @api public
	 */

	Request.prototype.type = function(type){
	  this.set('Content-Type', request.types[type] || type);
	  return this;
	};

	/**
	 * Set Accept to `type`, mapping values from `request.types`.
	 *
	 * Examples:
	 *
	 *      superagent.types.json = 'application/json';
	 *
	 *      request.get('/agent')
	 *        .accept('json')
	 *        .end(callback);
	 *
	 *      request.get('/agent')
	 *        .accept('application/json')
	 *        .end(callback);
	 *
	 * @param {String} accept
	 * @return {Request} for chaining
	 * @api public
	 */

	Request.prototype.accept = function(type){
	  this.set('Accept', request.types[type] || type);
	  return this;
	};

	/**
	 * Set Authorization field value with `user` and `pass`.
	 *
	 * @param {String} user
	 * @param {String} pass
	 * @return {Request} for chaining
	 * @api public
	 */

	Request.prototype.auth = function(user, pass){
	  var str = btoa(user + ':' + pass);
	  this.set('Authorization', 'Basic ' + str);
	  return this;
	};

	/**
	* Add query-string `val`.
	*
	* Examples:
	*
	*   request.get('/shoes')
	*     .query('size=10')
	*     .query({ color: 'blue' })
	*
	* @param {Object|String} val
	* @return {Request} for chaining
	* @api public
	*/

	Request.prototype.query = function(val){
	  if ('string' != typeof val) val = serialize(val);
	  if (val) this._query.push(val);
	  return this;
	};

	/**
	 * Write the field `name` and `val` for "multipart/form-data"
	 * request bodies.
	 *
	 * ``` js
	 * request.post('/upload')
	 *   .field('foo', 'bar')
	 *   .end(callback);
	 * ```
	 *
	 * @param {String} name
	 * @param {String|Blob|File} val
	 * @return {Request} for chaining
	 * @api public
	 */

	Request.prototype.field = function(name, val){
	  if (!this._formData) this._formData = new FormData();
	  this._formData.append(name, val);
	  return this;
	};

	/**
	 * Queue the given `file` as an attachment to the specified `field`,
	 * with optional `filename`.
	 *
	 * ``` js
	 * request.post('/upload')
	 *   .attach(new Blob(['<a id="a"><b id="b">hey!</b></a>'], { type: "text/html"}))
	 *   .end(callback);
	 * ```
	 *
	 * @param {String} field
	 * @param {Blob|File} file
	 * @param {String} filename
	 * @return {Request} for chaining
	 * @api public
	 */

	Request.prototype.attach = function(field, file, filename){
	  if (!this._formData) this._formData = new FormData();
	  this._formData.append(field, file, filename);
	  return this;
	};

	/**
	 * Send `data`, defaulting the `.type()` to "json" when
	 * an object is given.
	 *
	 * Examples:
	 *
	 *       // querystring
	 *       request.get('/search')
	 *         .end(callback)
	 *
	 *       // multiple data "writes"
	 *       request.get('/search')
	 *         .send({ search: 'query' })
	 *         .send({ range: '1..5' })
	 *         .send({ order: 'desc' })
	 *         .end(callback)
	 *
	 *       // manual json
	 *       request.post('/user')
	 *         .type('json')
	 *         .send('{"name":"tj"})
	 *         .end(callback)
	 *
	 *       // auto json
	 *       request.post('/user')
	 *         .send({ name: 'tj' })
	 *         .end(callback)
	 *
	 *       // manual x-www-form-urlencoded
	 *       request.post('/user')
	 *         .type('form')
	 *         .send('name=tj')
	 *         .end(callback)
	 *
	 *       // auto x-www-form-urlencoded
	 *       request.post('/user')
	 *         .type('form')
	 *         .send({ name: 'tj' })
	 *         .end(callback)
	 *
	 *       // defaults to x-www-form-urlencoded
	  *      request.post('/user')
	  *        .send('name=tobi')
	  *        .send('species=ferret')
	  *        .end(callback)
	 *
	 * @param {String|Object} data
	 * @return {Request} for chaining
	 * @api public
	 */

	Request.prototype.send = function(data){
	  var obj = isObject(data);
	  var type = this.getHeader('Content-Type');

	  // merge
	  if (obj && isObject(this._data)) {
	    for (var key in data) {
	      this._data[key] = data[key];
	    }
	  } else if ('string' == typeof data) {
	    if (!type) this.type('form');
	    type = this.getHeader('Content-Type');
	    if ('application/x-www-form-urlencoded' == type) {
	      this._data = this._data
	        ? this._data + '&' + data
	        : data;
	    } else {
	      this._data = (this._data || '') + data;
	    }
	  } else {
	    this._data = data;
	  }

	  if (!obj) return this;
	  if (!type) this.type('json');
	  return this;
	};

	/**
	 * Invoke the callback with `err` and `res`
	 * and handle arity check.
	 *
	 * @param {Error} err
	 * @param {Response} res
	 * @api private
	 */

	Request.prototype.callback = function(err, res){
	  var fn = this._callback;
	  if (2 == fn.length) return fn(err, res);
	  if (err) return this.emit('error', err);
	  fn(res);
	};

	/**
	 * Invoke callback with x-domain error.
	 *
	 * @api private
	 */

	Request.prototype.crossDomainError = function(){
	  var err = new Error('Origin is not allowed by Access-Control-Allow-Origin');
	  err.crossDomain = true;
	  this.callback(err);
	};

	/**
	 * Invoke callback with timeout error.
	 *
	 * @api private
	 */

	Request.prototype.timeoutError = function(){
	  var timeout = this._timeout;
	  var err = new Error('timeout of ' + timeout + 'ms exceeded');
	  err.timeout = timeout;
	  this.callback(err);
	};

	/**
	 * Enable transmission of cookies with x-domain requests.
	 *
	 * Note that for this to work the origin must not be
	 * using "Access-Control-Allow-Origin" with a wildcard,
	 * and also must set "Access-Control-Allow-Credentials"
	 * to "true".
	 *
	 * @api public
	 */

	Request.prototype.withCredentials = function(){
	  this._withCredentials = true;
	  return this;
	};

	/**
	 * Initiate request, invoking callback `fn(res)`
	 * with an instanceof `Response`.
	 *
	 * @param {Function} fn
	 * @return {Request} for chaining
	 * @api public
	 */

	Request.prototype.end = function(fn){
	  var self = this;
	  var xhr = this.xhr = getXHR();
	  var query = this._query.join('&');
	  var timeout = this._timeout;
	  var data = this._formData || this._data;

	  // store callback
	  this._callback = fn || noop;

	  // state change
	  xhr.onreadystatechange = function(){
	    if (4 != xhr.readyState) return;
	    if (0 == xhr.status) {
	      if (self.aborted) return self.timeoutError();
	      return self.crossDomainError();
	    }
	    self.emit('end');
	  };

	  // progress
	  if (xhr.upload) {
	    xhr.upload.onprogress = function(e){
	      e.percent = e.loaded / e.total * 100;
	      self.emit('progress', e);
	    };
	  }

	  // timeout
	  if (timeout && !this._timer) {
	    this._timer = setTimeout(function(){
	      self.abort();
	    }, timeout);
	  }

	  // querystring
	  if (query) {
	    query = request.serializeObject(query);
	    this.url += ~this.url.indexOf('?')
	      ? '&' + query
	      : '?' + query;
	  }

	  // initiate request
	  xhr.open(this.method, this.url, true);

	  // CORS
	  if (this._withCredentials) xhr.withCredentials = true;

	  // body
	  if ('GET' != this.method && 'HEAD' != this.method && 'string' != typeof data && !isHost(data)) {
	    // serialize stuff
	    var serialize = request.serialize[this.getHeader('Content-Type')];
	    if (serialize) data = serialize(data);
	  }

	  // set header fields
	  for (var field in this.header) {
	    if (null == this.header[field]) continue;
	    xhr.setRequestHeader(field, this.header[field]);
	  }

	  // send stuff
	  this.emit('request', this);
	  xhr.send(data);
	  return this;
	};

	/**
	 * Expose `Request`.
	 */

	request.Request = Request;

	/**
	 * Issue a request:
	 *
	 * Examples:
	 *
	 *    request('GET', '/users').end(callback)
	 *    request('/users').end(callback)
	 *    request('/users', callback)
	 *
	 * @param {String} method
	 * @param {String|Function} url or callback
	 * @return {Request}
	 * @api public
	 */

	function request(method, url) {
	  // callback
	  if ('function' == typeof url) {
	    return new Request('GET', method).end(url);
	  }

	  // url first
	  if (1 == arguments.length) {
	    return new Request('GET', method);
	  }

	  return new Request(method, url);
	}

	/**
	 * GET `url` with optional callback `fn(res)`.
	 *
	 * @param {String} url
	 * @param {Mixed|Function} data or fn
	 * @param {Function} fn
	 * @return {Request}
	 * @api public
	 */

	request.get = function(url, data, fn){
	  var req = request('GET', url);
	  if ('function' == typeof data) fn = data, data = null;
	  if (data) req.query(data);
	  if (fn) req.end(fn);
	  return req;
	};

	/**
	 * HEAD `url` with optional callback `fn(res)`.
	 *
	 * @param {String} url
	 * @param {Mixed|Function} data or fn
	 * @param {Function} fn
	 * @return {Request}
	 * @api public
	 */

	request.head = function(url, data, fn){
	  var req = request('HEAD', url);
	  if ('function' == typeof data) fn = data, data = null;
	  if (data) req.send(data);
	  if (fn) req.end(fn);
	  return req;
	};

	/**
	 * DELETE `url` with optional callback `fn(res)`.
	 *
	 * @param {String} url
	 * @param {Function} fn
	 * @return {Request}
	 * @api public
	 */

	request.del = function(url, fn){
	  var req = request('DELETE', url);
	  if (fn) req.end(fn);
	  return req;
	};

	/**
	 * PATCH `url` with optional `data` and callback `fn(res)`.
	 *
	 * @param {String} url
	 * @param {Mixed} data
	 * @param {Function} fn
	 * @return {Request}
	 * @api public
	 */

	request.patch = function(url, data, fn){
	  var req = request('PATCH', url);
	  if ('function' == typeof data) fn = data, data = null;
	  if (data) req.send(data);
	  if (fn) req.end(fn);
	  return req;
	};

	/**
	 * POST `url` with optional `data` and callback `fn(res)`.
	 *
	 * @param {String} url
	 * @param {Mixed} data
	 * @param {Function} fn
	 * @return {Request}
	 * @api public
	 */

	request.post = function(url, data, fn){
	  var req = request('POST', url);
	  if ('function' == typeof data) fn = data, data = null;
	  if (data) req.send(data);
	  if (fn) req.end(fn);
	  return req;
	};

	/**
	 * PUT `url` with optional `data` and callback `fn(res)`.
	 *
	 * @param {String} url
	 * @param {Mixed|Function} data or fn
	 * @param {Function} fn
	 * @return {Request}
	 * @api public
	 */

	request.put = function(url, data, fn){
	  var req = request('PUT', url);
	  if ('function' == typeof data) fn = data, data = null;
	  if (data) req.send(data);
	  if (fn) req.end(fn);
	  return req;
	};

	/**
	 * Expose `request`.
	 */

	module.exports = request;


/***/ },
/* 50 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';

	exports.decode = exports.parse = __webpack_require__(59);
	exports.encode = exports.stringify = __webpack_require__(60);


/***/ },
/* 51 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(Buffer) {// Original code adapted from Robert Kieffer.
	// details at https://github.com/broofa/node-uuid


	(function() {
	  var _global = this;

	  var mathRNG, whatwgRNG;

	  // NOTE: Math.random() does not guarantee "cryptographic quality"
	  mathRNG = function(size) {
	    var bytes = new Buffer(size);
	    var r;

	    for (var i = 0, r; i < size; i++) {
	      if ((i & 0x03) == 0) r = Math.random() * 0x100000000;
	      bytes[i] = r >>> ((i & 0x03) << 3) & 0xff;
	    }

	    return bytes;
	  }

	  if (_global.crypto && crypto.getRandomValues) {
	    whatwgRNG = function(size) {
	      var bytes = new Buffer(size); //in browserify, this is an extended Uint8Array
	      crypto.getRandomValues(bytes);
	      return bytes;
	    }
	  }

	  module.exports = whatwgRNG || mathRNG;

	}())
	
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(39).Buffer))

/***/ },
/* 52 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(Buffer) {var createHash = __webpack_require__(69)

	var md5 = toConstructor(__webpack_require__(62))
	var rmd160 = toConstructor(__webpack_require__(57))

	function toConstructor (fn) {
	  return function () {
	    var buffers = []
	    var m= {
	      update: function (data, enc) {
	        if(!Buffer.isBuffer(data)) data = new Buffer(data, enc)
	        buffers.push(data)
	        return this
	      },
	      digest: function (enc) {
	        var buf = Buffer.concat(buffers)
	        var r = fn(buf)
	        buffers = null
	        return enc ? r.toString(enc) : r
	      }
	    }
	    return m
	  }
	}

	module.exports = function (alg) {
	  if('md5' === alg) return new md5()
	  if('rmd160' === alg) return new rmd160()
	  return createHash(alg)
	}
	
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(39).Buffer))

/***/ },
/* 53 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(Buffer) {var createHash = __webpack_require__(52)

	var blocksize = 64
	var zeroBuffer = new Buffer(blocksize); zeroBuffer.fill(0)

	module.exports = Hmac

	function Hmac (alg, key) {
	  if(!(this instanceof Hmac)) return new Hmac(alg, key)
	  this._opad = opad
	  this._alg = alg

	  key = this._key = !Buffer.isBuffer(key) ? new Buffer(key) : key

	  if(key.length > blocksize) {
	    key = createHash(alg).update(key).digest()
	  } else if(key.length < blocksize) {
	    key = Buffer.concat([key, zeroBuffer], blocksize)
	  }

	  var ipad = this._ipad = new Buffer(blocksize)
	  var opad = this._opad = new Buffer(blocksize)

	  for(var i = 0; i < blocksize; i++) {
	    ipad[i] = key[i] ^ 0x36
	    opad[i] = key[i] ^ 0x5C
	  }

	  this._hash = createHash(alg).update(ipad)
	}

	Hmac.prototype.update = function (data, enc) {
	  this._hash.update(data, enc)
	  return this
	}

	Hmac.prototype.digest = function (enc) {
	  var h = this._hash.digest()
	  return createHash(this._alg).update(this._opad).update(h).digest(enc)
	}

	
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(39).Buffer))

/***/ },
/* 54 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(Buffer) {// JavaScript PBKDF2 Implementation
	// Based on http://git.io/qsv2zw
	// Licensed under LGPL v3
	// Copyright (c) 2013 jduncanator

	var blocksize = 64
	var zeroBuffer = new Buffer(blocksize); zeroBuffer.fill(0)

	module.exports = function (createHmac, exports) {
	  exports = exports || {}

	  exports.pbkdf2 = function(password, salt, iterations, keylen, cb) {
	    if('function' !== typeof cb)
	      throw new Error('No callback provided to pbkdf2');
	    setTimeout(function () {
	      cb(null, exports.pbkdf2Sync(password, salt, iterations, keylen))
	    })
	  }

	  exports.pbkdf2Sync = function(key, salt, iterations, keylen) {
	    if('number' !== typeof iterations)
	      throw new TypeError('Iterations not a number')
	    if(iterations < 0)
	      throw new TypeError('Bad iterations')
	    if('number' !== typeof keylen)
	      throw new TypeError('Key length not a number')
	    if(keylen < 0)
	      throw new TypeError('Bad key length')

	    //stretch key to the correct length that hmac wants it,
	    //otherwise this will happen every time hmac is called
	    //twice per iteration.
	    var key = !Buffer.isBuffer(key) ? new Buffer(key) : key

	    if(key.length > blocksize) {
	      key = createHash(alg).update(key).digest()
	    } else if(key.length < blocksize) {
	      key = Buffer.concat([key, zeroBuffer], blocksize)
	    }

	    var HMAC;
	    var cplen, p = 0, i = 1, itmp = new Buffer(4), digtmp;
	    var out = new Buffer(keylen);
	    out.fill(0);
	    while(keylen) {
	      if(keylen > 20)
	        cplen = 20;
	      else
	        cplen = keylen;

	      /* We are unlikely to ever use more than 256 blocks (5120 bits!)
	         * but just in case...
	         */
	        itmp[0] = (i >> 24) & 0xff;
	        itmp[1] = (i >> 16) & 0xff;
	          itmp[2] = (i >> 8) & 0xff;
	          itmp[3] = i & 0xff;

	          HMAC = createHmac('sha1', key);
	          HMAC.update(salt)
	          HMAC.update(itmp);
	        digtmp = HMAC.digest();
	        digtmp.copy(out, p, 0, cplen);

	        for(var j = 1; j < iterations; j++) {
	          HMAC = createHmac('sha1', key);
	          HMAC.update(digtmp);
	          digtmp = HMAC.digest();
	          for(var k = 0; k < cplen; k++) {
	            out[k] ^= digtmp[k];
	          }
	        }
	      keylen -= cplen;
	      i++;
	      p += cplen;
	    }

	    return out;
	  }

	  return exports
	}
	
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(39).Buffer))

/***/ },
/* 55 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(Buffer) {(function(nacl) {
	'use strict';

	// Ported in 2014 by Dmitry Chestnykh and Devi Mandiri.
	// Public domain.
	//
	// Implementation derived from TweetNaCl version 20140427.
	// See for details: http://tweetnacl.cr.yp.to/

	/* jshint newcap: false */

	var u64 = function (h, l) { this.hi = h|0 >>> 0; this.lo = l|0 >>> 0; };
	var gf = function(init) {
	  var i, r = new Float64Array(16);
	  if (init) for (i = 0; i < init.length; i++) r[i] = init[i];
	  return r;
	};

	//  Pluggable, initialized in high-level API below.
	var randombytes = function(/* x, n */) { throw new Error('no PRNG'); };

	var _0 = new Uint8Array(16);
	var _9 = new Uint8Array(32); _9[0] = 9;

	var gf0 = gf(),
	    gf1 = gf([1]),
	    _121665 = gf([0xdb41, 1]),
	    D = gf([0x78a3, 0x1359, 0x4dca, 0x75eb, 0xd8ab, 0x4141, 0x0a4d, 0x0070, 0xe898, 0x7779, 0x4079, 0x8cc7, 0xfe73, 0x2b6f, 0x6cee, 0x5203]),
	    D2 = gf([0xf159, 0x26b2, 0x9b94, 0xebd6, 0xb156, 0x8283, 0x149a, 0x00e0, 0xd130, 0xeef3, 0x80f2, 0x198e, 0xfce7, 0x56df, 0xd9dc, 0x2406]),
	    X = gf([0xd51a, 0x8f25, 0x2d60, 0xc956, 0xa7b2, 0x9525, 0xc760, 0x692c, 0xdc5c, 0xfdd6, 0xe231, 0xc0a4, 0x53fe, 0xcd6e, 0x36d3, 0x2169]),
	    Y = gf([0x6658, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666]),
	    I = gf([0xa0b0, 0x4a0e, 0x1b27, 0xc4ee, 0xe478, 0xad2f, 0x1806, 0x2f43, 0xd7a7, 0x3dfb, 0x0099, 0x2b4d, 0xdf0b, 0x4fc1, 0x2480, 0x2b83]);

	function L32(x, c) { return (x << c) | (x >>> (32 - c)); }

	function ld32(x, i) {
	  var u = x[i+3] & 0xff;
	  u = (u<<8)|(x[i+2] & 0xff);
	  u = (u<<8)|(x[i+1] & 0xff);
	  return (u<<8)|(x[i+0] & 0xff);
	}

	function dl64(x, i) {
	  var h = (x[i] << 24) | (x[i+1] << 16) | (x[i+2] << 8) | x[i+3];
	  var l = (x[i+4] << 24) | (x[i+5] << 16) | (x[i+6] << 8) | x[i+7];
	  return new u64(h, l);
	}

	function st32(x, j, u) {
	  var i;
	  for (i = 0; i < 4; i++) { x[j+i] = u & 255; u >>>= 8; }
	}

	function ts64(x, i, u) {
	  x[i]   = (u.hi >> 24) & 0xff;
	  x[i+1] = (u.hi >> 16) & 0xff;
	  x[i+2] = (u.hi >>  8) & 0xff;
	  x[i+3] = u.hi & 0xff;
	  x[i+4] = (u.lo >> 24)  & 0xff;
	  x[i+5] = (u.lo >> 16)  & 0xff;
	  x[i+6] = (u.lo >>  8)  & 0xff;
	  x[i+7] = u.lo & 0xff;
	}

	function vn(x, xi, y, yi, n) {
	  var i,d = 0;
	  for (i = 0; i < n; i++) d |= x[xi+i]^y[yi+i];
	  return (1 & ((d - 1) >>> 8)) - 1;
	}

	function crypto_verify_16(x, xi, y, yi) {
	  return vn(x,xi,y,yi,16);
	}

	function crypto_verify_32(x, xi, y, yi) {
	  return vn(x,xi,y,yi,32);
	}

	function core(out,inp,k,c,h) {
	  var w = new Uint32Array(16), x = new Uint32Array(16),
	      y = new Uint32Array(16), t = new Uint32Array(4);
	  var i, j, m;

	  for (i = 0; i < 4; i++) {
	    x[5*i] = ld32(c, 4*i);
	    x[1+i] = ld32(k, 4*i);
	    x[6+i] = ld32(inp, 4*i);
	    x[11+i] = ld32(k, 16+4*i);
	  }

	  for (i = 0; i < 16; i++) y[i] = x[i];

	  for (i = 0; i < 20; i++) {
	    for (j = 0; j < 4; j++) {
	      for (m = 0; m < 4; m++) t[m] = x[(5*j+4*m)%16];
	      t[1] ^= L32((t[0]+t[3])|0, 7);
	      t[2] ^= L32((t[1]+t[0])|0, 9);
	      t[3] ^= L32((t[2]+t[1])|0,13);
	      t[0] ^= L32((t[3]+t[2])|0,18);
	      for (m = 0; m < 4; m++) w[4*j+(j+m)%4] = t[m];
	    }
	    for (m = 0; m < 16; m++) x[m] = w[m];
	  }

	  if (h) {
	    for (i = 0; i < 16; i++) x[i] = (x[i] + y[i]) | 0;
	    for (i = 0; i < 4; i++) {
	      x[5*i] = (x[5*i] - ld32(c, 4*i)) | 0;
	      x[6+i] = (x[6+i] - ld32(inp, 4*i)) | 0;
	    }
	    for (i = 0; i < 4; i++) {
	      st32(out,4*i,x[5*i]);
	      st32(out,16+4*i,x[6+i]);
	    }
	  } else {
	    for (i = 0; i < 16; i++) st32(out, 4 * i, (x[i] + y[i]) | 0);
	  }
	}

	function crypto_core_salsa20(out,inp,k,c) {
	  core(out,inp,k,c,false);
	  return 0;
	}

	function crypto_core_hsalsa20(out,inp,k,c) {
	  core(out,inp,k,c,true);
	  return 0;
	}

	var sigma = new Uint8Array([101, 120, 112, 97, 110, 100, 32, 51, 50, 45, 98, 121, 116, 101, 32, 107]);
	            // "expand 32-byte k"

	function crypto_stream_salsa20_xor(c,cpos,m,mpos,b,n,k) {
	  var z = new Uint8Array(16), x = new Uint8Array(64);
	  var u, i;
	  if (!b) return 0;
	  for (i = 0; i < 16; i++) z[i] = 0;
	  for (i = 0; i < 8; i++) z[i] = n[i];
	  while (b >= 64) {
	    crypto_core_salsa20(x,z,k,sigma);
	    for (i = 0; i < 64; i++) c[cpos+i] = (m?m[mpos+i]:0) ^ x[i];
	    u = 1;
	    for (i = 8; i < 16; i++) {
	      u = u + (z[i] & 0xff) | 0;
	      z[i] = u & 0xff;
	      u >>>= 8;
	    }
	    b -= 64;
	    cpos += 64;
	    if (m) mpos += 64;
	  }
	  if (b > 0) {
	    crypto_core_salsa20(x,z,k,sigma);
	    for (i = 0; i < b; i++) c[cpos+i] = (m?m[mpos+i]:0) ^ x[i];
	  }
	  return 0;
	}

	function crypto_stream_salsa20(c,cpos,d,n,k) {
	  return crypto_stream_salsa20_xor(c,cpos,null,0,d,n,k);
	}

	function crypto_stream(c,cpos,d,n,k) {
	  var s = new Uint8Array(32);
	  crypto_core_hsalsa20(s,n,k,sigma);
	  return crypto_stream_salsa20(c,cpos,d,n.subarray(16),s);
	}

	function crypto_stream_xor(c,cpos,m,mpos,d,n,k) {
	  var s = new Uint8Array(32);
	  crypto_core_hsalsa20(s,n,k,sigma);
	  return crypto_stream_salsa20_xor(c,cpos,m,mpos,d,n.subarray(16),s);
	}

	function add1305(h, c) {
	  var j, u = 0;
	  for (j = 0; j < 17; j++) {
	    u = (u + ((h[j] + c[j]) | 0)) | 0;
	    h[j] = u & 255;
	    u >>>= 8;
	  }
	}

	var minusp = new Uint32Array([
	  5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 252
	]);

	function crypto_onetimeauth(out, outpos, m, mpos, n, k) {
	  var s, i, j, u;
	  var x = new Uint32Array(17), r = new Uint32Array(17),
	      h = new Uint32Array(17), c = new Uint32Array(17),
	      g = new Uint32Array(17);
	  for (j = 0; j < 17; j++) r[j]=h[j]=0;
	  for (j = 0; j < 16; j++) r[j]=k[j];
	  r[3]&=15;
	  r[4]&=252;
	  r[7]&=15;
	  r[8]&=252;
	  r[11]&=15;
	  r[12]&=252;
	  r[15]&=15;

	  while (n > 0) {
	    for (j = 0; j < 17; j++) c[j] = 0;
	    for (j = 0;(j < 16) && (j < n);++j) c[j] = m[mpos+j];
	    c[j] = 1;
	    mpos += j; n -= j;
	    add1305(h,c);
	    for (i = 0; i < 17; i++) {
	      x[i] = 0;
	      for (j = 0; j < 17; j++) x[i] = (x[i] + (h[j] * ((j <= i) ? r[i - j] : ((320 * r[i + 17 - j])|0))) | 0) | 0;
	    }
	    for (i = 0; i < 17; i++) h[i] = x[i];
	    u = 0;
	    for (j = 0; j < 16; j++) {
	      u = (u + h[j]) | 0;
	      h[j] = u & 255;
	      u >>>= 8;
	    }
	    u = (u + h[16]) | 0; h[16] = u & 3;
	    u = (5 * (u >>> 2)) | 0;
	    for (j = 0; j < 16; j++) {
	      u = (u + h[j]) | 0;
	      h[j] = u & 255;
	      u >>>= 8;
	    }
	    u = (u + h[16]) | 0; h[16] = u;
	  }

	  for (j = 0; j < 17; j++) g[j] = h[j];
	  add1305(h,minusp);
	  s = (-(h[16] >>> 7) | 0);
	  for (j = 0; j < 17; j++) h[j] ^= s & (g[j] ^ h[j]);

	  for (j = 0; j < 16; j++) c[j] = k[j + 16];
	  c[16] = 0;
	  add1305(h,c);
	  for (j = 0; j < 16; j++) out[outpos+j] = h[j];
	  return 0;
	}

	function crypto_onetimeauth_verify(h, hpos, m, mpos, n, k) {
	  var x = new Uint8Array(16);
	  crypto_onetimeauth(x,0,m,mpos,n,k);
	  return crypto_verify_16(h,hpos,x,0);
	}

	function crypto_secretbox(c,m,d,n,k) {
	  var i;
	  if (d < 32) return -1;
	  crypto_stream_xor(c,0,m,0,d,n,k);
	  crypto_onetimeauth(c, 16, c, 32, d - 32, c);
	  for (i = 0; i < 16; i++) c[i] = 0;
	  return 0;
	}

	function crypto_secretbox_open(m,c,d,n,k) {
	  var i;
	  var x = new Uint8Array(32);
	  if (d < 32) return -1;
	  crypto_stream(x,0,32,n,k);
	  if (crypto_onetimeauth_verify(c, 16,c, 32,d - 32,x) !== 0) return -1;
	  crypto_stream_xor(m,0,c,0,d,n,k);
	  for (i = 0; i < 32; i++) m[i] = 0;
	  return 0;
	}

	function set25519(r, a) {
	  var i;
	  for (i = 0; i < 16; i++) r[i] = a[i]|0;
	}

	function car25519(o) {
	  var c;
	  var i;
	  for (i = 0; i < 16; i++) {
	      o[i] += 65536;
	      c = Math.floor(o[i] / 65536);
	      o[(i+1)*(i<15?1:0)] += c - 1 + 37 * (c-1) * (i===15?1:0);
	      o[i] -= (c * 65536);
	  }
	}

	function sel25519(p, q, b) {
	  var t, c = ~(b-1);
	  for (var i = 0; i < 16; i++) {
	    t = c & (p[i] ^ q[i]);
	    p[i] ^= t;
	    q[i] ^= t;
	  }
	}

	function pack25519(o, n) {
	  var i, j, b;
	  var m = gf(), t = gf();
	  for (i = 0; i < 16; i++) t[i] = n[i];
	  car25519(t);
	  car25519(t);
	  car25519(t);
	  for (j = 0; j < 2; j++) {
	    m[0] = t[0] - 0xffed;
	    for (i = 1; i < 15; i++) {
	      m[i] = t[i] - 0xffff - ((m[i-1]>>16) & 1);
	      m[i-1] &= 0xffff;
	    }
	    m[15] = t[15] - 0x7fff - ((m[14]>>16) & 1);
	    b = (m[15]>>16) & 1;
	    m[14] &= 0xffff;
	    sel25519(t, m, 1-b);
	  }
	  for (i = 0; i < 16; i++) {
	    o[2*i] = t[i] & 0xff;
	    o[2*i+1] = t[i]>>8;
	  }
	}

	function neq25519(a, b) {
	  var c = new Uint8Array(32), d = new Uint8Array(32);
	  pack25519(c, a);
	  pack25519(d, b);
	  return crypto_verify_32(c, 0, d, 0);
	}

	function par25519(a) {
	  var d = new Uint8Array(32);
	  pack25519(d, a);
	  return d[0] & 1;
	}

	function unpack25519(o, n) {
	  var i;
	  for (i = 0; i < 16; i++) o[i] = n[2*i] + (n[2*i+1] << 8);
	  o[15] &= 0x7fff;
	}

	function A(o, a, b) {
	  var i;
	  for (i = 0; i < 16; i++) o[i] = (a[i] + b[i])|0;
	}

	function Z(o, a, b) {
	  var i;
	  for (i = 0; i < 16; i++) o[i] = (a[i] - b[i])|0;
	}

	function M(o, a, b) {
	  var i, j, t = new Float64Array(31);
	  for (i = 0; i < 31; i++) t[i] = 0;
	  for (i = 0; i < 16; i++) {
	    for (j = 0; j < 16; j++) {
	      t[i+j] += a[i] * b[j];
	    }
	  }
	  for (i = 0; i < 15; i++) {
	    t[i] += 38 * t[i+16];
	  }
	  for (i = 0; i < 16; i++) o[i] = t[i];
	  car25519(o);
	  car25519(o);
	}

	function S(o, a) {
	  M(o, a, a);
	}

	function inv25519(o, i) {
	  var c = gf();
	  var a;
	  for (a = 0; a < 16; a++) c[a] = i[a];
	  for (a = 253; a >= 0; a--) {
	    S(c, c);
	    if(a !== 2 && a !== 4) M(c, c, i);
	  }
	  for (a = 0; a < 16; a++) o[a] = c[a];
	}

	function pow2523(o, i) {
	  var c = gf();
	  var a;
	  for (a = 0; a < 16; a++) c[a] = i[a];
	  for (a = 250; a >= 0; a--) {
	      S(c, c);
	      if(a !== 1) M(c, c, i);
	  }
	  for (a = 0; a < 16; a++) o[a] = c[a];
	}

	function crypto_scalarmult(q, n, p) {
	  var z = new Uint8Array(32);
	  var x = new Float64Array(80), r, i;
	  var a = gf(), b = gf(), c = gf(),
	      d = gf(), e = gf(), f = gf();
	  for (i = 0; i < 31; i++) z[i] = n[i];
	  z[31]=(n[31]&127)|64;
	  z[0]&=248;
	  unpack25519(x,p);
	  for (i = 0; i < 16; i++) {
	    b[i]=x[i];
	    d[i]=a[i]=c[i]=0;
	  }
	  a[0]=d[0]=1;
	  for (i=254;i>=0;--i) {
	    r=(z[i>>>3]>>>(i&7))&1;
	    sel25519(a,b,r);
	    sel25519(c,d,r);
	    A(e,a,c);
	    Z(a,a,c);
	    A(c,b,d);
	    Z(b,b,d);
	    S(d,e);
	    S(f,a);
	    M(a,c,a);
	    M(c,b,e);
	    A(e,a,c);
	    Z(a,a,c);
	    S(b,a);
	    Z(c,d,f);
	    M(a,c,_121665);
	    A(a,a,d);
	    M(c,c,a);
	    M(a,d,f);
	    M(d,b,x);
	    S(b,e);
	    sel25519(a,b,r);
	    sel25519(c,d,r);
	  }
	  for (i = 0; i < 16; i++) {
	    x[i+16]=a[i];
	    x[i+32]=c[i];
	    x[i+48]=b[i];
	    x[i+64]=d[i];
	  }
	  var x32 = x.subarray(32);
	  var x16 = x.subarray(16);
	  inv25519(x32,x32);
	  M(x16,x16,x32);
	  pack25519(q,x16);
	  return 0;
	}

	function crypto_scalarmult_base(q, n) {
	  return crypto_scalarmult(q, n, _9);
	}

	function crypto_box_keypair(y, x) {
	  randombytes(x, 32);
	  return crypto_scalarmult_base(y, x);
	}

	function crypto_box_beforenm(k, y, x) {
	  var s = new Uint8Array(32);
	  crypto_scalarmult(s, x, y);
	  return crypto_core_hsalsa20(k, _0, s, sigma);
	}

	var crypto_box_afternm = crypto_secretbox;
	var crypto_box_open_afternm = crypto_secretbox_open;

	function crypto_box(c, m, d, n, y, x) {
	  var k = new Uint8Array(32);
	  crypto_box_beforenm(k, y, x);
	  return crypto_box_afternm(c, m, d, n, k);
	}

	function crypto_box_open(m, c, d, n, y, x) {
	  var k = new Uint8Array(32);
	  crypto_box_beforenm(k, y, x);
	  return crypto_box_open_afternm(m, c, d, n, k);
	}

	function add64() {
	  var a = 0, b = 0, c = 0, d = 0, m16 = 65535, l, h, i;
	  for (i = 0; i < arguments.length; i++) {
	    l = arguments[i].lo;
	    h = arguments[i].hi;
	    a += (l & m16); b += (l >>> 16);
	    c += (h & m16); d += (h >>> 16);
	  }

	  b += (a >>> 16);
	  c += (b >>> 16);
	  d += (c >>> 16);

	  return new u64((c & m16) | (d << 16), (a & m16) | (b << 16));
	}

	function shr64(x, c) {
	  return new u64((x.hi >>> c), (x.lo >>> c) | (x.hi << (32 - c)));
	}

	function xor64() {
	  var l = 0, h = 0, i;
	  for (i = 0; i < arguments.length; i++) {
	    l ^= arguments[i].lo;
	    h ^= arguments[i].hi;
	  }
	  return new u64(h, l);
	}

	function R(x, c) {
	  var h, l, c1 = 32 - c;
	  if (c < 32) {
	    h = (x.hi >>> c) | (x.lo << c1);
	    l = (x.lo >>> c) | (x.hi << c1);
	  } else if (c < 64) {
	    h = (x.lo >>> c) | (x.hi << c1);
	    l = (x.hi >>> c) | (x.lo << c1);
	  }
	  return new u64(h, l);
	}

	function Ch(x, y, z) {
	  var h = (x.hi & y.hi) ^ (~x.hi & z.hi),
	      l = (x.lo & y.lo) ^ (~x.lo & z.lo);
	  return new u64(h, l);
	}

	function Maj(x, y, z) {
	  var h = (x.hi & y.hi) ^ (x.hi & z.hi) ^ (y.hi & z.hi),
	      l = (x.lo & y.lo) ^ (x.lo & z.lo) ^ (y.lo & z.lo);
	  return new u64(h, l);
	}

	function Sigma0(x) { return xor64(R(x,28), R(x,34), R(x,39)); }
	function Sigma1(x) { return xor64(R(x,14), R(x,18), R(x,41)); }
	function sigma0(x) { return xor64(R(x, 1), R(x, 8), shr64(x,7)); }
	function sigma1(x) { return xor64(R(x,19), R(x,61), shr64(x,6)); }

	var K = [
	  new u64(0x428a2f98, 0xd728ae22), new u64(0x71374491, 0x23ef65cd),
	  new u64(0xb5c0fbcf, 0xec4d3b2f), new u64(0xe9b5dba5, 0x8189dbbc),
	  new u64(0x3956c25b, 0xf348b538), new u64(0x59f111f1, 0xb605d019),
	  new u64(0x923f82a4, 0xaf194f9b), new u64(0xab1c5ed5, 0xda6d8118),
	  new u64(0xd807aa98, 0xa3030242), new u64(0x12835b01, 0x45706fbe),
	  new u64(0x243185be, 0x4ee4b28c), new u64(0x550c7dc3, 0xd5ffb4e2),
	  new u64(0x72be5d74, 0xf27b896f), new u64(0x80deb1fe, 0x3b1696b1),
	  new u64(0x9bdc06a7, 0x25c71235), new u64(0xc19bf174, 0xcf692694),
	  new u64(0xe49b69c1, 0x9ef14ad2), new u64(0xefbe4786, 0x384f25e3),
	  new u64(0x0fc19dc6, 0x8b8cd5b5), new u64(0x240ca1cc, 0x77ac9c65),
	  new u64(0x2de92c6f, 0x592b0275), new u64(0x4a7484aa, 0x6ea6e483),
	  new u64(0x5cb0a9dc, 0xbd41fbd4), new u64(0x76f988da, 0x831153b5),
	  new u64(0x983e5152, 0xee66dfab), new u64(0xa831c66d, 0x2db43210),
	  new u64(0xb00327c8, 0x98fb213f), new u64(0xbf597fc7, 0xbeef0ee4),
	  new u64(0xc6e00bf3, 0x3da88fc2), new u64(0xd5a79147, 0x930aa725),
	  new u64(0x06ca6351, 0xe003826f), new u64(0x14292967, 0x0a0e6e70),
	  new u64(0x27b70a85, 0x46d22ffc), new u64(0x2e1b2138, 0x5c26c926),
	  new u64(0x4d2c6dfc, 0x5ac42aed), new u64(0x53380d13, 0x9d95b3df),
	  new u64(0x650a7354, 0x8baf63de), new u64(0x766a0abb, 0x3c77b2a8),
	  new u64(0x81c2c92e, 0x47edaee6), new u64(0x92722c85, 0x1482353b),
	  new u64(0xa2bfe8a1, 0x4cf10364), new u64(0xa81a664b, 0xbc423001),
	  new u64(0xc24b8b70, 0xd0f89791), new u64(0xc76c51a3, 0x0654be30),
	  new u64(0xd192e819, 0xd6ef5218), new u64(0xd6990624, 0x5565a910),
	  new u64(0xf40e3585, 0x5771202a), new u64(0x106aa070, 0x32bbd1b8),
	  new u64(0x19a4c116, 0xb8d2d0c8), new u64(0x1e376c08, 0x5141ab53),
	  new u64(0x2748774c, 0xdf8eeb99), new u64(0x34b0bcb5, 0xe19b48a8),
	  new u64(0x391c0cb3, 0xc5c95a63), new u64(0x4ed8aa4a, 0xe3418acb),
	  new u64(0x5b9cca4f, 0x7763e373), new u64(0x682e6ff3, 0xd6b2b8a3),
	  new u64(0x748f82ee, 0x5defb2fc), new u64(0x78a5636f, 0x43172f60),
	  new u64(0x84c87814, 0xa1f0ab72), new u64(0x8cc70208, 0x1a6439ec),
	  new u64(0x90befffa, 0x23631e28), new u64(0xa4506ceb, 0xde82bde9),
	  new u64(0xbef9a3f7, 0xb2c67915), new u64(0xc67178f2, 0xe372532b),
	  new u64(0xca273ece, 0xea26619c), new u64(0xd186b8c7, 0x21c0c207),
	  new u64(0xeada7dd6, 0xcde0eb1e), new u64(0xf57d4f7f, 0xee6ed178),
	  new u64(0x06f067aa, 0x72176fba), new u64(0x0a637dc5, 0xa2c898a6),
	  new u64(0x113f9804, 0xbef90dae), new u64(0x1b710b35, 0x131c471b),
	  new u64(0x28db77f5, 0x23047d84), new u64(0x32caab7b, 0x40c72493),
	  new u64(0x3c9ebe0a, 0x15c9bebc), new u64(0x431d67c4, 0x9c100d4c),
	  new u64(0x4cc5d4be, 0xcb3e42b6), new u64(0x597f299c, 0xfc657e2a),
	  new u64(0x5fcb6fab, 0x3ad6faec), new u64(0x6c44198c, 0x4a475817)
	];

	function crypto_hashblocks(x, m, n) {
	  var z = [], b = [], a = [], w = [], t, i, j;

	  for (i = 0; i < 8; i++) z[i] = a[i] = dl64(x, 8*i);

	  var pos = 0;
	  while (n >= 128) {
	    for (i = 0; i < 16; i++) w[i] = dl64(m, 8*i+pos);
	    for (i = 0; i < 80; i++) {
	      for (j = 0; j < 8; j++) b[j] = a[j];
	      t = add64(a[7], Sigma1(a[4]), Ch(a[4], a[5], a[6]), K[i], w[i%16]);
	      b[7] = add64(t, Sigma0(a[0]), Maj(a[0], a[1], a[2]));
	      b[3] = add64(b[3], t);
	      for (j = 0; j < 8; j++) a[(j+1)%8] = b[j];
	      if (i%16 === 15) {
	        for (j = 0; j < 16; j++) {
	          w[j] = add64(w[j], w[(j+9)%16], sigma0(w[(j+1)%16]), sigma1(w[(j+14)%16]));
	        }
	      }
	    }

	    for (i = 0; i < 8; i++) {
	      a[i] = add64(a[i], z[i]);
	      z[i] = a[i];
	    }

	    pos += 128;
	    n -= 128;
	  }

	  for (i = 0; i < 8; i++) ts64(x, 8*i, z[i]);
	  return n;
	}

	var iv = new Uint8Array([
	  0x6a,0x09,0xe6,0x67,0xf3,0xbc,0xc9,0x08,
	  0xbb,0x67,0xae,0x85,0x84,0xca,0xa7,0x3b,
	  0x3c,0x6e,0xf3,0x72,0xfe,0x94,0xf8,0x2b,
	  0xa5,0x4f,0xf5,0x3a,0x5f,0x1d,0x36,0xf1,
	  0x51,0x0e,0x52,0x7f,0xad,0xe6,0x82,0xd1,
	  0x9b,0x05,0x68,0x8c,0x2b,0x3e,0x6c,0x1f,
	  0x1f,0x83,0xd9,0xab,0xfb,0x41,0xbd,0x6b,
	  0x5b,0xe0,0xcd,0x19,0x13,0x7e,0x21,0x79
	]);

	function crypto_hash(out, m, n) {
	  var h = new Uint8Array(64), x = new Uint8Array(256);
	  var i, b = n;

	  for (i = 0; i < 64; i++) h[i] = iv[i];

	  crypto_hashblocks(h, m, n);
	  n %= 128;

	  for (i = 0; i < 256; i++) x[i] = 0;
	  for (i = 0; i < n; i++) x[i] = m[b-n+i];
	  x[n] = 128;

	  n = 256-128*(n<112?1:0);
	  x[n-9] = 0;
	  ts64(x, n-8, new u64((b / 0x20000000) | 0, b << 3));
	  crypto_hashblocks(h, x, n);

	  for (i = 0; i < 64; i++) out[i] = h[i];

	  return 0;
	}

	function add(p, q) {
	  var a = gf(), b = gf(), c = gf(),
	      d = gf(), e = gf(), f = gf(),
	      g = gf(), h = gf(), t = gf();

	  Z(a, p[1], p[0]);
	  Z(t, q[1], q[0]);
	  M(a, a, t);
	  A(b, p[0], p[1]);
	  A(t, q[0], q[1]);
	  M(b, b, t);
	  M(c, p[3], q[3]);
	  M(c, c, D2);
	  M(d, p[2], q[2]);
	  A(d, d, d);
	  Z(e, b, a);
	  Z(f, d, c);
	  A(g, d, c);
	  A(h, b, a);

	  M(p[0], e, f);
	  M(p[1], h, g);
	  M(p[2], g, f);
	  M(p[3], e, h);
	}

	function cswap(p, q, b) {
	  var i;
	  for (i = 0; i < 4; i++) {
	    sel25519(p[i], q[i], b);
	  }
	}

	function pack(r, p) {
	  var tx = gf(), ty = gf(), zi = gf();
	  inv25519(zi, p[2]);
	  M(tx, p[0], zi);
	  M(ty, p[1], zi);
	  pack25519(r, ty);
	  r[31] ^= par25519(tx) << 7;
	}

	function scalarmult(p, q, s) {
	  var b, i;
	  set25519(p[0], gf0);
	  set25519(p[1], gf1);
	  set25519(p[2], gf1);
	  set25519(p[3], gf0);
	  for (i = 255; i >= 0; --i) {
	    b = (s[(i/8)|0] >> (i&7)) & 1;
	    cswap(p, q, b);
	    add(q, p);
	    add(p, p);
	    cswap(p, q, b);
	  }
	}

	function scalarbase(p, s) {
	  var q = [gf(), gf(), gf(), gf()];
	  set25519(q[0], X);
	  set25519(q[1], Y);
	  set25519(q[2], gf1);
	  M(q[3], X, Y);
	  scalarmult(p, q, s);
	}

	function crypto_sign_keypair_from_seed(seed, pk, sk) {
	  var d = new Uint8Array(64);
	  var p = [gf(), gf(), gf(), gf()];
	  var i;

	  crypto_hash(d, seed, 32);
	  d[0] &= 248;
	  d[31] &= 127;
	  d[31] |= 64;

	  scalarbase(p, d);
	  pack(pk, p);

	  for (i = 0; i < 32; i++) sk[i] = seed[i];
	  for (i = 0; i < 32; i++) sk[i+32] = pk[i];
	  return 0;
	}

	function crypto_sign_keypair(pk, sk) {
	  var seed = new Uint8Array(crypto_sign_SEEDBYTES)
	  randombytes(seed, crypto_sign_SEEDBYTES)
	  
	  return crypto_sign_keypair_from_seed(seed, pk, sk);
	}

	var L = new Float64Array([0xed, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58, 0xd6, 0x9c, 0xf7, 0xa2, 0xde, 0xf9, 0xde, 0x14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x10]);

	function modL(r, x) {
	  var carry, i, j, k;
	  for (i = 63; i >= 32; --i) {
	    carry = 0;
	    for (j = i - 32, k = i - 12; j < k; ++j) {
	      x[j] += carry - 16 * x[i] * L[j - (i - 32)];
	      carry = (x[j] + 128) >> 8;
	      x[j] -= carry * 256;
	    }
	    x[j] += carry;
	    x[i] = 0;
	  }
	  carry = 0;
	  for (j = 0; j < 32; j++) {
	    x[j] += carry - (x[31] >> 4) * L[j];
	    carry = x[j] >> 8;
	    x[j] &= 255;
	  }
	  for (j = 0; j < 32; j++) x[j] -= carry * L[j];
	  for (i = 0; i < 32; i++) {
	    x[i+1] += x[i] >> 8;
	    r[i] = x[i] & 255;
	  }
	}

	function reduce(r) {
	  var x = new Float64Array(64), i;
	  for (i = 0; i < 64; i++) x[i] = r[i];
	  for (i = 0; i < 64; i++) r[i] = 0;
	  modL(r, x);
	}

	// Note: difference from C - smlen returned, not passed as argument.
	function crypto_sign(sm, m, n, sk) {
	  var d = new Uint8Array(64), h = new Uint8Array(64), r = new Uint8Array(64);
	  var i, j, x = new Float64Array(64);
	  var p = [gf(), gf(), gf(), gf()];

	  crypto_hash(d, sk, 32);
	  d[0] &= 248;
	  d[31] &= 127;
	  d[31] |= 64;

	  var smlen = n + 64;
	  for (i = 0; i < n; i++) sm[64 + i] = m[i];
	  for (i = 0; i < 32; i++) sm[32 + i] = d[32 + i];

	  crypto_hash(r, sm.subarray(32), n+32);
	  reduce(r);
	  scalarbase(p, r);
	  pack(sm, p);

	  for (i = 32; i < 64; i++) sm[i] = sk[i];
	  crypto_hash(h, sm, n + 64);
	  reduce(h);

	  for (i = 0; i < 64; i++) x[i] = 0;
	  for (i = 0; i < 32; i++) x[i] = r[i];
	  for (i = 0; i < 32; i++) {
	    for (j = 0; j < 32; j++) {
	      x[i+j] += h[i] * d[j];
	    }
	  }

	  modL(sm.subarray(32), x);
	  return smlen;
	}

	function unpackneg(r, p) {
	  var t = gf(), chk = gf(), num = gf(),
	      den = gf(), den2 = gf(), den4 = gf(),
	      den6 = gf();

	  set25519(r[2], gf1);
	  unpack25519(r[1], p);
	  S(num, r[1]);
	  M(den, num, D);
	  Z(num, num, r[2]);
	  A(den, r[2], den);

	  S(den2, den);
	  S(den4, den2);
	  M(den6, den4, den2);
	  M(t, den6, num);
	  M(t, t, den);

	  pow2523(t, t);
	  M(t, t, num);
	  M(t, t, den);
	  M(t, t, den);
	  M(r[0], t, den);

	  S(chk, r[0]);
	  M(chk, chk, den);
	  if (neq25519(chk, num)) M(r[0], r[0], I);

	  S(chk, r[0]);
	  M(chk, chk, den);
	  if (neq25519(chk, num)) return -1;

	  if (par25519(r[0]) === (p[31]>>7)) Z(r[0], gf0, r[0]);

	  M(r[3], r[0], r[1]);
	  return 0;
	}

	function crypto_sign_open(m, sm, n, pk) {
	  var i, mlen;
	  var t = new Uint8Array(32), h = new Uint8Array(64);
	  var p = [gf(), gf(), gf(), gf()],
	      q = [gf(), gf(), gf(), gf()];

	  mlen = -1;
	  if (n < 64) return -1;

	  if (unpackneg(q, pk)) return -1;

	  for (i = 0; i < n; i++) m[i] = sm[i];
	  for (i = 0; i < 32; i++) m[i+32] = pk[i];
	  crypto_hash(h, m, n);
	  reduce(h);
	  scalarmult(p, q, h);

	  scalarbase(q, sm.subarray(32));
	  add(p, q);
	  pack(t, p);

	  n -= 64;
	  if (crypto_verify_32(sm, 0, t, 0)) {
	    for (i = 0; i < n; i++) m[i] = 0;
	    return -1;
	  }

	  for (i = 0; i < n; i++) m[i] = sm[i + 64];
	  mlen = n;
	  return mlen;
	}

	var crypto_secretbox_KEYBYTES = 32,
	    crypto_secretbox_NONCEBYTES = 24,
	    crypto_secretbox_ZEROBYTES = 32,
	    crypto_secretbox_BOXZEROBYTES = 16,
	    crypto_scalarmult_BYTES = 32,
	    crypto_scalarmult_SCALARBYTES = 32,
	    crypto_box_PUBLICKEYBYTES = 32,
	    crypto_box_SECRETKEYBYTES = 32,
	    crypto_box_BEFORENMBYTES = 32,
	    crypto_box_NONCEBYTES = crypto_secretbox_NONCEBYTES,
	    crypto_box_ZEROBYTES = crypto_secretbox_ZEROBYTES,
	    crypto_box_BOXZEROBYTES = crypto_secretbox_BOXZEROBYTES,
	    crypto_sign_BYTES = 64,
	    crypto_sign_SEEDBYTES = 32,
	    crypto_sign_PUBLICKEYBYTES = 32,
	    crypto_sign_SECRETKEYBYTES = 64,
	    crypto_hash_BYTES = 64;

	nacl.lowlevel = {
	  crypto_stream_xor : crypto_stream_xor,
	  crypto_stream : crypto_stream,
	  crypto_stream_salsa20_xor : crypto_stream_salsa20_xor,
	  crypto_stream_salsa20 : crypto_stream_salsa20,
	  crypto_onetimeauth : crypto_onetimeauth,
	  crypto_onetimeauth_verify : crypto_onetimeauth_verify,
	  crypto_verify_16 : crypto_verify_16,
	  crypto_verify_32 : crypto_verify_32,
	  crypto_secretbox : crypto_secretbox,
	  crypto_secretbox_open : crypto_secretbox_open,
	  crypto_scalarmult : crypto_scalarmult,
	  crypto_scalarmult_base : crypto_scalarmult_base,
	  crypto_box_beforenm : crypto_box_beforenm,
	  crypto_box_afternm : crypto_box_afternm,
	  crypto_box : crypto_box,
	  crypto_box_open : crypto_box_open,
	  crypto_box_keypair : crypto_box_keypair,
	  crypto_hash : crypto_hash,
	  crypto_hashblocks : crypto_hashblocks, // for testing
	  crypto_sign : crypto_sign,
	  crypto_sign_keypair : crypto_sign_keypair,
	  crypto_sign_open : crypto_sign_open,

	  crypto_secretbox_KEYBYTES : crypto_secretbox_KEYBYTES,
	  crypto_secretbox_NONCEBYTES : crypto_secretbox_NONCEBYTES,
	  crypto_secretbox_ZEROBYTES : crypto_secretbox_ZEROBYTES,
	  crypto_secretbox_BOXZEROBYTES : crypto_secretbox_BOXZEROBYTES,
	  crypto_scalarmult_BYTES : crypto_scalarmult_BYTES,
	  crypto_scalarmult_SCALARBYTES : crypto_scalarmult_SCALARBYTES,
	  crypto_box_PUBLICKEYBYTES : crypto_box_PUBLICKEYBYTES,
	  crypto_box_SECRETKEYBYTES : crypto_box_SECRETKEYBYTES,
	  crypto_box_BEFORENMBYTES : crypto_box_BEFORENMBYTES,
	  crypto_box_NONCEBYTES : crypto_box_NONCEBYTES,
	  crypto_box_ZEROBYTES : crypto_box_ZEROBYTES,
	  crypto_box_BOXZEROBYTES : crypto_box_BOXZEROBYTES,
	  crypto_sign_BYTES : crypto_sign_BYTES,
	  crypto_sign_SEEDBYTES : crypto_sign_SEEDBYTES,
	  crypto_sign_PUBLICKEYBYTES : crypto_sign_PUBLICKEYBYTES,
	  crypto_sign_SECRETKEYBYTES : crypto_sign_SECRETKEYBYTES,
	  crypto_hash_BYTES : crypto_hash_BYTES
	};

	/* High-level API */

	function checkLengths(k, n) {
	  if (k.length !== crypto_secretbox_KEYBYTES) throw new Error('bad key size');
	  if (n.length !== crypto_secretbox_NONCEBYTES) throw new Error('bad nonce size');
	}

	function checkBoxLengths(pk, sk) {
	  if (pk.length !== crypto_box_PUBLICKEYBYTES) throw new Error('bad public key size');
	  if (sk.length !== crypto_box_SECRETKEYBYTES) throw new Error('bad secret key size');
	}

	function checkArrayTypes() {
	  var type = {}.toString, t;
	  for (var i = 0; i < arguments.length; i++) {
	     if ((t = type.call(arguments[i])) !== '[object Uint8Array]')
	       throw new TypeError('unexpected type ' + t + ', use Uint8Array');
	  }
	}

	nacl.util = {};

	nacl.util.decodeUTF8 = function(s) {
	  var i, d = unescape(encodeURIComponent(s)), b = new Uint8Array(d.length);
	  for (i = 0; i < d.length; i++) b[i] = d.charCodeAt(i);
	  return b;
	};

	nacl.util.encodeUTF8 = function(arr) {
	  var i, s = [];
	  for (i = 0; i < arr.length; i++) s.push(String.fromCharCode(arr[i]));
	  return decodeURIComponent(escape(s.join('')));
	};

	nacl.util.encodeBase64 = function(arr) {
	  if (typeof btoa === 'undefined') {
	    return (new Buffer(arr)).toString('base64');
	  } else {
	    var i, s = [], len = arr.length;
	    for (i = 0; i < len; i++) s.push(String.fromCharCode(arr[i]));
	    return btoa(s.join(''));
	  }
	};

	nacl.util.decodeBase64 = function(s) {
	  if (typeof atob === 'undefined') {
	    return new Uint8Array(Array.prototype.slice.call(new Buffer(s, 'base64'), 0));
	  } else {
	    var i, d = atob(s), b = new Uint8Array(d.length);
	    for (i = 0; i < d.length; i++) b[i] = d.charCodeAt(i);
	    return b;
	  }
	};

	nacl.randomBytes = function(n) {
	  var b = new Uint8Array(n);
	  randombytes(b, n);
	  return b;
	};

	nacl.secretbox = function(msg, nonce, key) {
	  checkArrayTypes(msg, nonce, key);
	  checkLengths(key, nonce);
	  var m = new Uint8Array(crypto_secretbox_ZEROBYTES + msg.length);
	  var c = new Uint8Array(m.length);
	  for (var i = 0; i < msg.length; i++) m[i+crypto_secretbox_ZEROBYTES] = msg[i];
	  crypto_secretbox(c, m, m.length, nonce, key);
	  return c.subarray(crypto_secretbox_BOXZEROBYTES);
	};

	nacl.secretbox.open = function(box, nonce, key) {
	  checkArrayTypes(box, nonce, key);
	  checkLengths(key, nonce);
	  var c = new Uint8Array(crypto_secretbox_BOXZEROBYTES + box.length);
	  var m = new Uint8Array(c.length);
	  for (var i = 0; i < box.length; i++) c[i+crypto_secretbox_BOXZEROBYTES] = box[i];
	  if (c.length < 32) return false;
	  if (crypto_secretbox_open(m, c, c.length, nonce, key) !== 0) return false;
	  return m.subarray(crypto_secretbox_ZEROBYTES);
	};

	nacl.secretbox.keyLength = crypto_secretbox_KEYBYTES;
	nacl.secretbox.nonceLength = crypto_secretbox_NONCEBYTES;
	nacl.secretbox.overheadLength = crypto_secretbox_BOXZEROBYTES;

	nacl.scalarMult = function(n, p) {
	  checkArrayTypes(n, p);
	  if (n.length !== crypto_scalarmult_SCALARBYTES) throw new Error('bad n size');
	  if (p.length !== crypto_scalarmult_BYTES) throw new Error('bad p size');
	  var q = new Uint8Array(crypto_scalarmult_BYTES);
	  crypto_scalarmult(q, n, p);
	  return q;
	};

	nacl.scalarMult.base = function(n) {
	  checkArrayTypes(n);
	  if (n.length !== crypto_scalarmult_SCALARBYTES) throw new Error('bad n size');
	  var q = new Uint8Array(crypto_scalarmult_BYTES);
	  crypto_scalarmult_base(q, n);
	  return q;
	};

	nacl.scalarMult.scalarLength = crypto_scalarmult_SCALARBYTES;
	nacl.scalarMult.groupElementLength = crypto_scalarmult_BYTES;

	nacl.box = function(msg, nonce, publicKey, secretKey) {
	  var k = nacl.box.before(publicKey, secretKey);
	  return nacl.secretbox(msg, nonce, k);
	};

	nacl.box.before = function(publicKey, secretKey) {
	  checkArrayTypes(publicKey, secretKey);
	  checkBoxLengths(publicKey, secretKey);
	  var k = new Uint8Array(crypto_box_BEFORENMBYTES);
	  crypto_box_beforenm(k, publicKey, secretKey);
	  return k;
	};

	nacl.box.after = nacl.secretbox;

	nacl.box.open = function(msg, nonce, publicKey, secretKey) {
	  var k = nacl.box.before(publicKey, secretKey);
	  return nacl.secretbox.open(msg, nonce, k);
	};

	nacl.box.open.after = nacl.secretbox.open;

	nacl.box.keyPair = function() {
	  var pk = new Uint8Array(crypto_box_PUBLICKEYBYTES);
	  var sk = new Uint8Array(crypto_box_SECRETKEYBYTES);
	  crypto_box_keypair(pk, sk);
	  return {publicKey: pk, secretKey: sk};
	};

	nacl.box.keyPair.fromSecretKey = function(secretKey) {
	  checkArrayTypes(secretKey);
	  if (secretKey.length !== crypto_box_SECRETKEYBYTES)
	    throw new Error('bad secret key size');
	  var pk = new Uint8Array(crypto_box_PUBLICKEYBYTES);
	  crypto_scalarmult_base(pk, secretKey);
	  return {publicKey: pk, secretKey: secretKey};
	};

	nacl.box.publicKeyLength = crypto_box_PUBLICKEYBYTES;
	nacl.box.secretKeyLength = crypto_box_SECRETKEYBYTES;
	nacl.box.sharedKeyLength = crypto_box_BEFORENMBYTES;
	nacl.box.nonceLength = crypto_box_NONCEBYTES;
	nacl.box.overheadLength = nacl.secretbox.overheadLength;

	nacl.sign = function(msg, secretKey) {
	  checkArrayTypes(msg, secretKey);
	  if (secretKey.length !== crypto_sign_SECRETKEYBYTES)
	    throw new Error('bad secret key size');
	  var sm = new Uint8Array(crypto_sign_BYTES+msg.length);
	  crypto_sign(sm, msg, msg.length, secretKey);
	  var sig = new Uint8Array(crypto_sign_BYTES);
	  for (var i = 0; i < sig.length; i++) sig[i] = sm[i];
	  return sig;
	};

	nacl.sign.open = function(msg, sig, publicKey) {
	  checkArrayTypes(msg, sig, publicKey);
	  if (sig.length !== crypto_sign_BYTES)
	    throw new Error('bad signature size');
	  if (publicKey.length !== crypto_sign_PUBLICKEYBYTES)
	    throw new Error('bad public key size');
	  var sm = new Uint8Array(crypto_sign_BYTES + msg.length);
	  var m = new Uint8Array(crypto_sign_BYTES + msg.length);
	  var i;
	  for (i = 0; i < crypto_sign_BYTES; i++) sm[i] = sig[i];
	  for (i = 0; i < msg.length; i++) sm[i+crypto_sign_BYTES] = msg[i];
	  var mlen = crypto_sign_open(m, sm, sm.length, publicKey);
	  if (mlen < 0) return false;
	  return m.subarray(0, mlen);
	};

	nacl.sign.keyPair = function() {
	  var pk = new Uint8Array(crypto_sign_PUBLICKEYBYTES);
	  var sk = new Uint8Array(crypto_sign_SECRETKEYBYTES);
	  crypto_sign_keypair(pk, sk);
	  return {publicKey: pk, secretKey: sk};
	};

	nacl.sign.keyPair.fromSecretKey = function(secretKey) {
	  checkArrayTypes(secretKey);
	  if (secretKey.length !== crypto_sign_SECRETKEYBYTES)
	    throw new Error('bad secret key size');
	  var pk = new Uint8Array(crypto_sign_PUBLICKEYBYTES);
	  var i;
	  for (i = 0; i < 32; i++) pk[i] = secretKey[32+i];
	  return {publicKey: pk, secretKey: secretKey};
	};

	nacl.sign.keyPair.fromSeed = function(seed) {
	  checkArrayTypes(seed);
	  if (seed.length !== crypto_sign_SEEDBYTES)
	    throw new Error('bad seed size');
	  var pk = new Uint8Array(crypto_sign_PUBLICKEYBYTES);
	  var sk = new Uint8Array(crypto_sign_SECRETKEYBYTES);
	  crypto_sign_keypair_from_seed(seed, pk, sk);
	  return {publicKey: pk, secretKey: sk};
	};

	nacl.sign.publicKeyLength = crypto_sign_PUBLICKEYBYTES;
	nacl.sign.secretKeyLength = crypto_sign_SECRETKEYBYTES;
	nacl.sign.signatureLength = crypto_sign_BYTES;

	nacl.hash = function(msg) {
	  checkArrayTypes(msg);
	  var h = new Uint8Array(crypto_hash_BYTES);
	  crypto_hash(h, msg, msg.length);
	  return h;
	};

	nacl.hash.hashLength = crypto_hash_BYTES;

	nacl.verify = function(x, y) {
	  checkArrayTypes(x, y);
	  // Zero length arguments are considered not equal.
	  if (x.length === 0 || y.length === 0) return false;
	  if (x.length !== y.length) return false;
	  return (vn(x, 0, y, 0, x.length) === 0) ? true : false;
	};

	nacl.setPRNG = function(fn) {
	  randombytes = fn;
	};

	(function() {
	  // Initialize PRNG if environment provides CSPRNG.
	  // If not, methods calling randombytes will throw.
	  var crypto;
	  if (typeof window !== 'undefined') {
	    // Browser.
	    if (window.crypto && window.crypto.getRandomValues) {
	      crypto = window.crypto; // Standard
	    } else if (window.msCrypto && window.msCrypto.getRandomValues) {
	      crypto = window.msCrypto; // Internet Explorer 11+
	    }
	    if (crypto) {
	      nacl.setPRNG(function(x, n) {
	        var i, v = new Uint8Array(n);
	        crypto.getRandomValues(v);
	        for (i = 0; i < n; i++) x[i] = v[i];
	      });
	    }
	  } else if (true) {
	    // Node.js.
	    crypto = __webpack_require__(40);
	    if (crypto) {
	      nacl.setPRNG(function(x, n) {
	        var i, v = crypto.randomBytes(n);
	        for (i = 0; i < n; i++) x[i] = v[i];
	      });
	    }
	  }
	})();

	})(typeof module !== 'undefined' && module.exports ? module.exports : (window.nacl = window.nacl || {}));
	
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(39).Buffer))

/***/ },
/* 56 */
/***/ function(module, exports, __webpack_require__) {

	module.exports = function isBuffer(arg) {
	  return arg && typeof arg === 'object'
	    && typeof arg.copy === 'function'
	    && typeof arg.fill === 'function'
	    && typeof arg.readUInt8 === 'function';
	}

/***/ },
/* 57 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(Buffer) {
	module.exports = ripemd160



	/*
	CryptoJS v3.1.2
	code.google.com/p/crypto-js
	(c) 2009-2013 by Jeff Mott. All rights reserved.
	code.google.com/p/crypto-js/wiki/License
	*/
	/** @preserve
	(c) 2012 by Cédric Mesnil. All rights reserved.

	Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

	    - Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
	    - Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

	THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
	*/

	// Constants table
	var zl = [
	    0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15,
	    7,  4, 13,  1, 10,  6, 15,  3, 12,  0,  9,  5,  2, 14, 11,  8,
	    3, 10, 14,  4,  9, 15,  8,  1,  2,  7,  0,  6, 13, 11,  5, 12,
	    1,  9, 11, 10,  0,  8, 12,  4, 13,  3,  7, 15, 14,  5,  6,  2,
	    4,  0,  5,  9,  7, 12,  2, 10, 14,  1,  3,  8, 11,  6, 15, 13];
	var zr = [
	    5, 14,  7,  0,  9,  2, 11,  4, 13,  6, 15,  8,  1, 10,  3, 12,
	    6, 11,  3,  7,  0, 13,  5, 10, 14, 15,  8, 12,  4,  9,  1,  2,
	    15,  5,  1,  3,  7, 14,  6,  9, 11,  8, 12,  2, 10,  0,  4, 13,
	    8,  6,  4,  1,  3, 11, 15,  0,  5, 12,  2, 13,  9,  7, 10, 14,
	    12, 15, 10,  4,  1,  5,  8,  7,  6,  2, 13, 14,  0,  3,  9, 11];
	var sl = [
	     11, 14, 15, 12,  5,  8,  7,  9, 11, 13, 14, 15,  6,  7,  9,  8,
	    7, 6,   8, 13, 11,  9,  7, 15,  7, 12, 15,  9, 11,  7, 13, 12,
	    11, 13,  6,  7, 14,  9, 13, 15, 14,  8, 13,  6,  5, 12,  7,  5,
	      11, 12, 14, 15, 14, 15,  9,  8,  9, 14,  5,  6,  8,  6,  5, 12,
	    9, 15,  5, 11,  6,  8, 13, 12,  5, 12, 13, 14, 11,  8,  5,  6 ];
	var sr = [
	    8,  9,  9, 11, 13, 15, 15,  5,  7,  7,  8, 11, 14, 14, 12,  6,
	    9, 13, 15,  7, 12,  8,  9, 11,  7,  7, 12,  7,  6, 15, 13, 11,
	    9,  7, 15, 11,  8,  6,  6, 14, 12, 13,  5, 14, 13, 13,  7,  5,
	    15,  5,  8, 11, 14, 14,  6, 14,  6,  9, 12,  9, 12,  5, 15,  8,
	    8,  5, 12,  9, 12,  5, 14,  6,  8, 13,  6,  5, 15, 13, 11, 11 ];

	var hl =  [ 0x00000000, 0x5A827999, 0x6ED9EBA1, 0x8F1BBCDC, 0xA953FD4E];
	var hr =  [ 0x50A28BE6, 0x5C4DD124, 0x6D703EF3, 0x7A6D76E9, 0x00000000];

	var bytesToWords = function (bytes) {
	  var words = [];
	  for (var i = 0, b = 0; i < bytes.length; i++, b += 8) {
	    words[b >>> 5] |= bytes[i] << (24 - b % 32);
	  }
	  return words;
	};

	var wordsToBytes = function (words) {
	  var bytes = [];
	  for (var b = 0; b < words.length * 32; b += 8) {
	    bytes.push((words[b >>> 5] >>> (24 - b % 32)) & 0xFF);
	  }
	  return bytes;
	};

	var processBlock = function (H, M, offset) {

	  // Swap endian
	  for (var i = 0; i < 16; i++) {
	    var offset_i = offset + i;
	    var M_offset_i = M[offset_i];

	    // Swap
	    M[offset_i] = (
	        (((M_offset_i << 8)  | (M_offset_i >>> 24)) & 0x00ff00ff) |
	        (((M_offset_i << 24) | (M_offset_i >>> 8))  & 0xff00ff00)
	    );
	  }

	  // Working variables
	  var al, bl, cl, dl, el;
	  var ar, br, cr, dr, er;

	  ar = al = H[0];
	  br = bl = H[1];
	  cr = cl = H[2];
	  dr = dl = H[3];
	  er = el = H[4];
	  // Computation
	  var t;
	  for (var i = 0; i < 80; i += 1) {
	    t = (al +  M[offset+zl[i]])|0;
	    if (i<16){
	        t +=  f1(bl,cl,dl) + hl[0];
	    } else if (i<32) {
	        t +=  f2(bl,cl,dl) + hl[1];
	    } else if (i<48) {
	        t +=  f3(bl,cl,dl) + hl[2];
	    } else if (i<64) {
	        t +=  f4(bl,cl,dl) + hl[3];
	    } else {// if (i<80) {
	        t +=  f5(bl,cl,dl) + hl[4];
	    }
	    t = t|0;
	    t =  rotl(t,sl[i]);
	    t = (t+el)|0;
	    al = el;
	    el = dl;
	    dl = rotl(cl, 10);
	    cl = bl;
	    bl = t;

	    t = (ar + M[offset+zr[i]])|0;
	    if (i<16){
	        t +=  f5(br,cr,dr) + hr[0];
	    } else if (i<32) {
	        t +=  f4(br,cr,dr) + hr[1];
	    } else if (i<48) {
	        t +=  f3(br,cr,dr) + hr[2];
	    } else if (i<64) {
	        t +=  f2(br,cr,dr) + hr[3];
	    } else {// if (i<80) {
	        t +=  f1(br,cr,dr) + hr[4];
	    }
	    t = t|0;
	    t =  rotl(t,sr[i]) ;
	    t = (t+er)|0;
	    ar = er;
	    er = dr;
	    dr = rotl(cr, 10);
	    cr = br;
	    br = t;
	  }
	  // Intermediate hash value
	  t    = (H[1] + cl + dr)|0;
	  H[1] = (H[2] + dl + er)|0;
	  H[2] = (H[3] + el + ar)|0;
	  H[3] = (H[4] + al + br)|0;
	  H[4] = (H[0] + bl + cr)|0;
	  H[0] =  t;
	};

	function f1(x, y, z) {
	  return ((x) ^ (y) ^ (z));
	}

	function f2(x, y, z) {
	  return (((x)&(y)) | ((~x)&(z)));
	}

	function f3(x, y, z) {
	  return (((x) | (~(y))) ^ (z));
	}

	function f4(x, y, z) {
	  return (((x) & (z)) | ((y)&(~(z))));
	}

	function f5(x, y, z) {
	  return ((x) ^ ((y) |(~(z))));
	}

	function rotl(x,n) {
	  return (x<<n) | (x>>>(32-n));
	}

	function ripemd160(message) {
	  var H = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];

	  if (typeof message == 'string')
	    message = new Buffer(message, 'utf8');

	  var m = bytesToWords(message);

	  var nBitsLeft = message.length * 8;
	  var nBitsTotal = message.length * 8;

	  // Add padding
	  m[nBitsLeft >>> 5] |= 0x80 << (24 - nBitsLeft % 32);
	  m[(((nBitsLeft + 64) >>> 9) << 4) + 14] = (
	      (((nBitsTotal << 8)  | (nBitsTotal >>> 24)) & 0x00ff00ff) |
	      (((nBitsTotal << 24) | (nBitsTotal >>> 8))  & 0xff00ff00)
	  );

	  for (var i=0 ; i<m.length; i += 16) {
	    processBlock(H, m, i);
	  }

	  // Swap endian
	  for (var i = 0; i < 5; i++) {
	      // Shortcut
	    var H_i = H[i];

	    // Swap
	    H[i] = (((H_i << 8)  | (H_i >>> 24)) & 0x00ff00ff) |
	          (((H_i << 24) | (H_i >>> 8))  & 0xff00ff00);
	  }

	  var digestbytes = wordsToBytes(H);
	  return new Buffer(digestbytes);
	}


	
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(39).Buffer))

/***/ },
/* 58 */
/***/ function(module, exports, __webpack_require__) {

	// shim for using process in browser

	var process = module.exports = {};

	process.nextTick = (function () {
	    var canSetImmediate = typeof window !== 'undefined'
	    && window.setImmediate;
	    var canPost = typeof window !== 'undefined'
	    && window.postMessage && window.addEventListener
	    ;

	    if (canSetImmediate) {
	        return function (f) { return window.setImmediate(f) };
	    }

	    if (canPost) {
	        var queue = [];
	        window.addEventListener('message', function (ev) {
	            var source = ev.source;
	            if ((source === window || source === null) && ev.data === 'process-tick') {
	                ev.stopPropagation();
	                if (queue.length > 0) {
	                    var fn = queue.shift();
	                    fn();
	                }
	            }
	        }, true);

	        return function nextTick(fn) {
	            queue.push(fn);
	            window.postMessage('process-tick', '*');
	        };
	    }

	    return function nextTick(fn) {
	        setTimeout(fn, 0);
	    };
	})();

	process.title = 'browser';
	process.browser = true;
	process.env = {};
	process.argv = [];

	function noop() {}

	process.on = noop;
	process.once = noop;
	process.off = noop;
	process.emit = noop;

	process.binding = function (name) {
	    throw new Error('process.binding is not supported');
	}

	// TODO(shtylman)
	process.cwd = function () { return '/' };
	process.chdir = function (dir) {
	    throw new Error('process.chdir is not supported');
	};


/***/ },
/* 59 */
/***/ function(module, exports, __webpack_require__) {

	// Copyright Joyent, Inc. and other Node contributors.
	//
	// Permission is hereby granted, free of charge, to any person obtaining a
	// copy of this software and associated documentation files (the
	// "Software"), to deal in the Software without restriction, including
	// without limitation the rights to use, copy, modify, merge, publish,
	// distribute, sublicense, and/or sell copies of the Software, and to permit
	// persons to whom the Software is furnished to do so, subject to the
	// following conditions:
	//
	// The above copyright notice and this permission notice shall be included
	// in all copies or substantial portions of the Software.
	//
	// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
	// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
	// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
	// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
	// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
	// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
	// USE OR OTHER DEALINGS IN THE SOFTWARE.

	'use strict';

	// If obj.hasOwnProperty has been overridden, then calling
	// obj.hasOwnProperty(prop) will break.
	// See: https://github.com/joyent/node/issues/1707
	function hasOwnProperty(obj, prop) {
	  return Object.prototype.hasOwnProperty.call(obj, prop);
	}

	module.exports = function(qs, sep, eq, options) {
	  sep = sep || '&';
	  eq = eq || '=';
	  var obj = {};

	  if (typeof qs !== 'string' || qs.length === 0) {
	    return obj;
	  }

	  var regexp = /\+/g;
	  qs = qs.split(sep);

	  var maxKeys = 1000;
	  if (options && typeof options.maxKeys === 'number') {
	    maxKeys = options.maxKeys;
	  }

	  var len = qs.length;
	  // maxKeys <= 0 means that we should not limit keys count
	  if (maxKeys > 0 && len > maxKeys) {
	    len = maxKeys;
	  }

	  for (var i = 0; i < len; ++i) {
	    var x = qs[i].replace(regexp, '%20'),
	        idx = x.indexOf(eq),
	        kstr, vstr, k, v;

	    if (idx >= 0) {
	      kstr = x.substr(0, idx);
	      vstr = x.substr(idx + 1);
	    } else {
	      kstr = x;
	      vstr = '';
	    }

	    k = decodeURIComponent(kstr);
	    v = decodeURIComponent(vstr);

	    if (!hasOwnProperty(obj, k)) {
	      obj[k] = v;
	    } else if (isArray(obj[k])) {
	      obj[k].push(v);
	    } else {
	      obj[k] = [obj[k], v];
	    }
	  }

	  return obj;
	};

	var isArray = Array.isArray || function (xs) {
	  return Object.prototype.toString.call(xs) === '[object Array]';
	};


/***/ },
/* 60 */
/***/ function(module, exports, __webpack_require__) {

	// Copyright Joyent, Inc. and other Node contributors.
	//
	// Permission is hereby granted, free of charge, to any person obtaining a
	// copy of this software and associated documentation files (the
	// "Software"), to deal in the Software without restriction, including
	// without limitation the rights to use, copy, modify, merge, publish,
	// distribute, sublicense, and/or sell copies of the Software, and to permit
	// persons to whom the Software is furnished to do so, subject to the
	// following conditions:
	//
	// The above copyright notice and this permission notice shall be included
	// in all copies or substantial portions of the Software.
	//
	// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
	// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
	// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
	// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
	// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
	// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
	// USE OR OTHER DEALINGS IN THE SOFTWARE.

	'use strict';

	var stringifyPrimitive = function(v) {
	  switch (typeof v) {
	    case 'string':
	      return v;

	    case 'boolean':
	      return v ? 'true' : 'false';

	    case 'number':
	      return isFinite(v) ? v : '';

	    default:
	      return '';
	  }
	};

	module.exports = function(obj, sep, eq, name) {
	  sep = sep || '&';
	  eq = eq || '=';
	  if (obj === null) {
	    obj = undefined;
	  }

	  if (typeof obj === 'object') {
	    return map(objectKeys(obj), function(k) {
	      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
	      if (isArray(obj[k])) {
	        return map(obj[k], function(v) {
	          return ks + encodeURIComponent(stringifyPrimitive(v));
	        }).join(sep);
	      } else {
	        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
	      }
	    }).join(sep);

	  }

	  if (!name) return '';
	  return encodeURIComponent(stringifyPrimitive(name)) + eq +
	         encodeURIComponent(stringifyPrimitive(obj));
	};

	var isArray = Array.isArray || function (xs) {
	  return Object.prototype.toString.call(xs) === '[object Array]';
	};

	function map (xs, f) {
	  if (xs.map) return xs.map(f);
	  var res = [];
	  for (var i = 0; i < xs.length; i++) {
	    res.push(f(xs[i], i));
	  }
	  return res;
	}

	var objectKeys = Object.keys || function (obj) {
	  var res = [];
	  for (var key in obj) {
	    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
	  }
	  return res;
	};


/***/ },
/* 61 */
/***/ function(module, exports, __webpack_require__) {

	exports.read = function (buffer, offset, isLE, mLen, nBytes) {
	  var e, m
	  var eLen = nBytes * 8 - mLen - 1
	  var eMax = (1 << eLen) - 1
	  var eBias = eMax >> 1
	  var nBits = -7
	  var i = isLE ? (nBytes - 1) : 0
	  var d = isLE ? -1 : 1
	  var s = buffer[offset + i]

	  i += d

	  e = s & ((1 << (-nBits)) - 1)
	  s >>= (-nBits)
	  nBits += eLen
	  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

	  m = e & ((1 << (-nBits)) - 1)
	  e >>= (-nBits)
	  nBits += mLen
	  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

	  if (e === 0) {
	    e = 1 - eBias
	  } else if (e === eMax) {
	    return m ? NaN : ((s ? -1 : 1) * Infinity)
	  } else {
	    m = m + Math.pow(2, mLen)
	    e = e - eBias
	  }
	  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
	}

	exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
	  var e, m, c
	  var eLen = nBytes * 8 - mLen - 1
	  var eMax = (1 << eLen) - 1
	  var eBias = eMax >> 1
	  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
	  var i = isLE ? 0 : (nBytes - 1)
	  var d = isLE ? 1 : -1
	  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

	  value = Math.abs(value)

	  if (isNaN(value) || value === Infinity) {
	    m = isNaN(value) ? 1 : 0
	    e = eMax
	  } else {
	    e = Math.floor(Math.log(value) / Math.LN2)
	    if (value * (c = Math.pow(2, -e)) < 1) {
	      e--
	      c *= 2
	    }
	    if (e + eBias >= 1) {
	      value += rt / c
	    } else {
	      value += rt * Math.pow(2, 1 - eBias)
	    }
	    if (value * c >= 2) {
	      e++
	      c /= 2
	    }

	    if (e + eBias >= eMax) {
	      m = 0
	      e = eMax
	    } else if (e + eBias >= 1) {
	      m = (value * c - 1) * Math.pow(2, mLen)
	      e = e + eBias
	    } else {
	      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
	      e = 0
	    }
	  }

	  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

	  e = (e << mLen) | m
	  eLen += mLen
	  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

	  buffer[offset + i - d] |= s * 128
	}


/***/ },
/* 62 */
/***/ function(module, exports, __webpack_require__) {

	/*
	 * A JavaScript implementation of the RSA Data Security, Inc. MD5 Message
	 * Digest Algorithm, as defined in RFC 1321.
	 * Version 2.1 Copyright (C) Paul Johnston 1999 - 2002.
	 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
	 * Distributed under the BSD License
	 * See http://pajhome.org.uk/crypt/md5 for more info.
	 */

	var helpers = __webpack_require__(70);

	/*
	 * Calculate the MD5 of an array of little-endian words, and a bit length
	 */
	function core_md5(x, len)
	{
	  /* append padding */
	  x[len >> 5] |= 0x80 << ((len) % 32);
	  x[(((len + 64) >>> 9) << 4) + 14] = len;

	  var a =  1732584193;
	  var b = -271733879;
	  var c = -1732584194;
	  var d =  271733878;

	  for(var i = 0; i < x.length; i += 16)
	  {
	    var olda = a;
	    var oldb = b;
	    var oldc = c;
	    var oldd = d;

	    a = md5_ff(a, b, c, d, x[i+ 0], 7 , -680876936);
	    d = md5_ff(d, a, b, c, x[i+ 1], 12, -389564586);
	    c = md5_ff(c, d, a, b, x[i+ 2], 17,  606105819);
	    b = md5_ff(b, c, d, a, x[i+ 3], 22, -1044525330);
	    a = md5_ff(a, b, c, d, x[i+ 4], 7 , -176418897);
	    d = md5_ff(d, a, b, c, x[i+ 5], 12,  1200080426);
	    c = md5_ff(c, d, a, b, x[i+ 6], 17, -1473231341);
	    b = md5_ff(b, c, d, a, x[i+ 7], 22, -45705983);
	    a = md5_ff(a, b, c, d, x[i+ 8], 7 ,  1770035416);
	    d = md5_ff(d, a, b, c, x[i+ 9], 12, -1958414417);
	    c = md5_ff(c, d, a, b, x[i+10], 17, -42063);
	    b = md5_ff(b, c, d, a, x[i+11], 22, -1990404162);
	    a = md5_ff(a, b, c, d, x[i+12], 7 ,  1804603682);
	    d = md5_ff(d, a, b, c, x[i+13], 12, -40341101);
	    c = md5_ff(c, d, a, b, x[i+14], 17, -1502002290);
	    b = md5_ff(b, c, d, a, x[i+15], 22,  1236535329);

	    a = md5_gg(a, b, c, d, x[i+ 1], 5 , -165796510);
	    d = md5_gg(d, a, b, c, x[i+ 6], 9 , -1069501632);
	    c = md5_gg(c, d, a, b, x[i+11], 14,  643717713);
	    b = md5_gg(b, c, d, a, x[i+ 0], 20, -373897302);
	    a = md5_gg(a, b, c, d, x[i+ 5], 5 , -701558691);
	    d = md5_gg(d, a, b, c, x[i+10], 9 ,  38016083);
	    c = md5_gg(c, d, a, b, x[i+15], 14, -660478335);
	    b = md5_gg(b, c, d, a, x[i+ 4], 20, -405537848);
	    a = md5_gg(a, b, c, d, x[i+ 9], 5 ,  568446438);
	    d = md5_gg(d, a, b, c, x[i+14], 9 , -1019803690);
	    c = md5_gg(c, d, a, b, x[i+ 3], 14, -187363961);
	    b = md5_gg(b, c, d, a, x[i+ 8], 20,  1163531501);
	    a = md5_gg(a, b, c, d, x[i+13], 5 , -1444681467);
	    d = md5_gg(d, a, b, c, x[i+ 2], 9 , -51403784);
	    c = md5_gg(c, d, a, b, x[i+ 7], 14,  1735328473);
	    b = md5_gg(b, c, d, a, x[i+12], 20, -1926607734);

	    a = md5_hh(a, b, c, d, x[i+ 5], 4 , -378558);
	    d = md5_hh(d, a, b, c, x[i+ 8], 11, -2022574463);
	    c = md5_hh(c, d, a, b, x[i+11], 16,  1839030562);
	    b = md5_hh(b, c, d, a, x[i+14], 23, -35309556);
	    a = md5_hh(a, b, c, d, x[i+ 1], 4 , -1530992060);
	    d = md5_hh(d, a, b, c, x[i+ 4], 11,  1272893353);
	    c = md5_hh(c, d, a, b, x[i+ 7], 16, -155497632);
	    b = md5_hh(b, c, d, a, x[i+10], 23, -1094730640);
	    a = md5_hh(a, b, c, d, x[i+13], 4 ,  681279174);
	    d = md5_hh(d, a, b, c, x[i+ 0], 11, -358537222);
	    c = md5_hh(c, d, a, b, x[i+ 3], 16, -722521979);
	    b = md5_hh(b, c, d, a, x[i+ 6], 23,  76029189);
	    a = md5_hh(a, b, c, d, x[i+ 9], 4 , -640364487);
	    d = md5_hh(d, a, b, c, x[i+12], 11, -421815835);
	    c = md5_hh(c, d, a, b, x[i+15], 16,  530742520);
	    b = md5_hh(b, c, d, a, x[i+ 2], 23, -995338651);

	    a = md5_ii(a, b, c, d, x[i+ 0], 6 , -198630844);
	    d = md5_ii(d, a, b, c, x[i+ 7], 10,  1126891415);
	    c = md5_ii(c, d, a, b, x[i+14], 15, -1416354905);
	    b = md5_ii(b, c, d, a, x[i+ 5], 21, -57434055);
	    a = md5_ii(a, b, c, d, x[i+12], 6 ,  1700485571);
	    d = md5_ii(d, a, b, c, x[i+ 3], 10, -1894986606);
	    c = md5_ii(c, d, a, b, x[i+10], 15, -1051523);
	    b = md5_ii(b, c, d, a, x[i+ 1], 21, -2054922799);
	    a = md5_ii(a, b, c, d, x[i+ 8], 6 ,  1873313359);
	    d = md5_ii(d, a, b, c, x[i+15], 10, -30611744);
	    c = md5_ii(c, d, a, b, x[i+ 6], 15, -1560198380);
	    b = md5_ii(b, c, d, a, x[i+13], 21,  1309151649);
	    a = md5_ii(a, b, c, d, x[i+ 4], 6 , -145523070);
	    d = md5_ii(d, a, b, c, x[i+11], 10, -1120210379);
	    c = md5_ii(c, d, a, b, x[i+ 2], 15,  718787259);
	    b = md5_ii(b, c, d, a, x[i+ 9], 21, -343485551);

	    a = safe_add(a, olda);
	    b = safe_add(b, oldb);
	    c = safe_add(c, oldc);
	    d = safe_add(d, oldd);
	  }
	  return Array(a, b, c, d);

	}

	/*
	 * These functions implement the four basic operations the algorithm uses.
	 */
	function md5_cmn(q, a, b, x, s, t)
	{
	  return safe_add(bit_rol(safe_add(safe_add(a, q), safe_add(x, t)), s),b);
	}
	function md5_ff(a, b, c, d, x, s, t)
	{
	  return md5_cmn((b & c) | ((~b) & d), a, b, x, s, t);
	}
	function md5_gg(a, b, c, d, x, s, t)
	{
	  return md5_cmn((b & d) | (c & (~d)), a, b, x, s, t);
	}
	function md5_hh(a, b, c, d, x, s, t)
	{
	  return md5_cmn(b ^ c ^ d, a, b, x, s, t);
	}
	function md5_ii(a, b, c, d, x, s, t)
	{
	  return md5_cmn(c ^ (b | (~d)), a, b, x, s, t);
	}

	/*
	 * Add integers, wrapping at 2^32. This uses 16-bit operations internally
	 * to work around bugs in some JS interpreters.
	 */
	function safe_add(x, y)
	{
	  var lsw = (x & 0xFFFF) + (y & 0xFFFF);
	  var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
	  return (msw << 16) | (lsw & 0xFFFF);
	}

	/*
	 * Bitwise rotate a 32-bit number to the left.
	 */
	function bit_rol(num, cnt)
	{
	  return (num << cnt) | (num >>> (32 - cnt));
	}

	module.exports = function md5(buf) {
	  return helpers.hash(buf, core_md5, 16);
	};


/***/ },
/* 63 */
/***/ function(module, exports, __webpack_require__) {

	if (typeof Object.create === 'function') {
	  // implementation from standard node.js 'util' module
	  module.exports = function inherits(ctor, superCtor) {
	    ctor.super_ = superCtor
	    ctor.prototype = Object.create(superCtor.prototype, {
	      constructor: {
	        value: ctor,
	        enumerable: false,
	        writable: true,
	        configurable: true
	      }
	    });
	  };
	} else {
	  // old school shim for old browsers
	  module.exports = function inherits(ctor, superCtor) {
	    ctor.super_ = superCtor
	    var TempCtor = function () {}
	    TempCtor.prototype = superCtor.prototype
	    ctor.prototype = new TempCtor()
	    ctor.prototype.constructor = ctor
	  }
	}


/***/ },
/* 64 */
/***/ function(module, exports, __webpack_require__) {

	var __WEBPACK_AMD_DEFINE_FACTORY__, __WEBPACK_AMD_DEFINE_RESULT__;var require;/* WEBPACK VAR INJECTION */(function(module) {/*! http://mths.be/punycode by @mathias */
	;(function(root) {

		/**
		 * The `punycode` object.
		 * @name punycode
		 * @type Object
		 */
		var punycode,

		/** Detect free variables `define`, `exports`, `module` and `require` */
		freeDefine = __webpack_require__(74),
		freeExports = typeof exports == 'object' && exports,
		freeModule = typeof module == 'object' && module,
		freeRequire = typeof require == 'function' && require,

		/** Highest positive signed 32-bit float value */
		maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

		/** Bootstring parameters */
		base = 36,
		tMin = 1,
		tMax = 26,
		skew = 38,
		damp = 700,
		initialBias = 72,
		initialN = 128, // 0x80
		delimiter = '-', // '\x2D'

		/** Regular expressions */
		regexNonASCII = /[^ -~]/, // unprintable ASCII chars + non-ASCII chars
		regexPunycode = /^xn--/,

		/** Error messages */
		errors = {
			'overflow': 'Overflow: input needs wider integers to process.',
			'ucs2decode': 'UCS-2(decode): illegal sequence',
			'ucs2encode': 'UCS-2(encode): illegal value',
			'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
			'invalid-input': 'Invalid input'
		},

		/** Convenience shortcuts */
		baseMinusTMin = base - tMin,
		floor = Math.floor,
		stringFromCharCode = String.fromCharCode,

		/** Temporary variable */
		key;

		/*--------------------------------------------------------------------------*/

		/**
		 * A generic error utility function.
		 * @private
		 * @param {String} type The error type.
		 * @returns {Error} Throws a `RangeError` with the applicable error message.
		 */
		function error(type) {
			throw RangeError(errors[type]);
		}

		/**
		 * A generic `Array#map` utility function.
		 * @private
		 * @param {Array} array The array to iterate over.
		 * @param {Function} callback The function that gets called for every array
		 * item.
		 * @returns {Array} A new array of values returned by the callback function.
		 */
		function map(array, fn) {
			var length = array.length;
			while (length--) {
				array[length] = fn(array[length]);
			}
			return array;
		}

		/**
		 * A simple `Array#map`-like wrapper to work with domain name strings.
		 * @private
		 * @param {String} domain The domain name.
		 * @param {Function} callback The function that gets called for every
		 * character.
		 * @returns {Array} A new string of characters returned by the callback
		 * function.
		 */
		function mapDomain(string, fn) {
			var glue = '.';
			return map(string.split(glue), fn).join(glue);
		}

		/**
		 * Creates an array containing the decimal code points of each Unicode
		 * character in the string. While JavaScript uses UCS-2 internally,
		 * this function will convert a pair of surrogate halves (each of which
		 * UCS-2 exposes as separate characters) into a single code point,
		 * matching UTF-16.
		 * @see `punycode.ucs2.encode`
		 * @see <http://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode.ucs2
		 * @name decode
		 * @param {String} string The Unicode input string (UCS-2).
		 * @returns {Array} The new array of code points.
		 */
		function ucs2decode(string) {
			var output = [],
			    counter = 0,
			    length = string.length,
			    value,
			    extra;
			while (counter < length) {
				value = string.charCodeAt(counter++);
				if ((value & 0xF800) == 0xD800) {
					extra = string.charCodeAt(counter++);
					if ((value & 0xFC00) != 0xD800 || (extra & 0xFC00) != 0xDC00) {
						error('ucs2decode');
					}
					value = ((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000;
				}
				output.push(value);
			}
			return output;
		}

		/**
		 * Creates a string based on an array of decimal code points.
		 * @see `punycode.ucs2.decode`
		 * @memberOf punycode.ucs2
		 * @name encode
		 * @param {Array} codePoints The array of decimal code points.
		 * @returns {String} The new Unicode string (UCS-2).
		 */
		function ucs2encode(array) {
			return map(array, function(value) {
				var output = '';
				if ((value & 0xF800) == 0xD800) {
					error('ucs2encode');
				}
				if (value > 0xFFFF) {
					value -= 0x10000;
					output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
					value = 0xDC00 | value & 0x3FF;
				}
				output += stringFromCharCode(value);
				return output;
			}).join('');
		}

		/**
		 * Converts a basic code point into a digit/integer.
		 * @see `digitToBasic()`
		 * @private
		 * @param {Number} codePoint The basic (decimal) code point.
		 * @returns {Number} The numeric value of a basic code point (for use in
		 * representing integers) in the range `0` to `base - 1`, or `base` if
		 * the code point does not represent a value.
		 */
		function basicToDigit(codePoint) {
			return codePoint - 48 < 10
				? codePoint - 22
				: codePoint - 65 < 26
					? codePoint - 65
					: codePoint - 97 < 26
						? codePoint - 97
						: base;
		}

		/**
		 * Converts a digit/integer into a basic code point.
		 * @see `basicToDigit()`
		 * @private
		 * @param {Number} digit The numeric value of a basic code point.
		 * @returns {Number} The basic code point whose value (when used for
		 * representing integers) is `digit`, which needs to be in the range
		 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
		 * used; else, the lowercase form is used. The behavior is undefined
		 * if flag is non-zero and `digit` has no uppercase form.
		 */
		function digitToBasic(digit, flag) {
			//  0..25 map to ASCII a..z or A..Z
			// 26..35 map to ASCII 0..9
			return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
		}

		/**
		 * Bias adaptation function as per section 3.4 of RFC 3492.
		 * http://tools.ietf.org/html/rfc3492#section-3.4
		 * @private
		 */
		function adapt(delta, numPoints, firstTime) {
			var k = 0;
			delta = firstTime ? floor(delta / damp) : delta >> 1;
			delta += floor(delta / numPoints);
			for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
				delta = floor(delta / baseMinusTMin);
			}
			return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
		}

		/**
		 * Converts a basic code point to lowercase is `flag` is falsy, or to
		 * uppercase if `flag` is truthy. The code point is unchanged if it's
		 * caseless. The behavior is undefined if `codePoint` is not a basic code
		 * point.
		 * @private
		 * @param {Number} codePoint The numeric value of a basic code point.
		 * @returns {Number} The resulting basic code point.
		 */
		function encodeBasic(codePoint, flag) {
			codePoint -= (codePoint - 97 < 26) << 5;
			return codePoint + (!flag && codePoint - 65 < 26) << 5;
		}

		/**
		 * Converts a Punycode string of ASCII code points to a string of Unicode
		 * code points.
		 * @memberOf punycode
		 * @param {String} input The Punycode string of ASCII code points.
		 * @returns {String} The resulting string of Unicode code points.
		 */
		function decode(input) {
			// Don't use UCS-2
			var output = [],
			    inputLength = input.length,
			    out,
			    i = 0,
			    n = initialN,
			    bias = initialBias,
			    basic,
			    j,
			    index,
			    oldi,
			    w,
			    k,
			    digit,
			    t,
			    length,
			    /** Cached calculation results */
			    baseMinusT;

			// Handle the basic code points: let `basic` be the number of input code
			// points before the last delimiter, or `0` if there is none, then copy
			// the first basic code points to the output.

			basic = input.lastIndexOf(delimiter);
			if (basic < 0) {
				basic = 0;
			}

			for (j = 0; j < basic; ++j) {
				// if it's not a basic code point
				if (input.charCodeAt(j) >= 0x80) {
					error('not-basic');
				}
				output.push(input.charCodeAt(j));
			}

			// Main decoding loop: start just after the last delimiter if any basic code
			// points were copied; start at the beginning otherwise.

			for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

				// `index` is the index of the next character to be consumed.
				// Decode a generalized variable-length integer into `delta`,
				// which gets added to `i`. The overflow checking is easier
				// if we increase `i` as we go, then subtract off its starting
				// value at the end to obtain `delta`.
				for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

					if (index >= inputLength) {
						error('invalid-input');
					}

					digit = basicToDigit(input.charCodeAt(index++));

					if (digit >= base || digit > floor((maxInt - i) / w)) {
						error('overflow');
					}

					i += digit * w;
					t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

					if (digit < t) {
						break;
					}

					baseMinusT = base - t;
					if (w > floor(maxInt / baseMinusT)) {
						error('overflow');
					}

					w *= baseMinusT;

				}

				out = output.length + 1;
				bias = adapt(i - oldi, out, oldi == 0);

				// `i` was supposed to wrap around from `out` to `0`,
				// incrementing `n` each time, so we'll fix that now:
				if (floor(i / out) > maxInt - n) {
					error('overflow');
				}

				n += floor(i / out);
				i %= out;

				// Insert `n` at position `i` of the output
				output.splice(i++, 0, n);

			}

			return ucs2encode(output);
		}

		/**
		 * Converts a string of Unicode code points to a Punycode string of ASCII
		 * code points.
		 * @memberOf punycode
		 * @param {String} input The string of Unicode code points.
		 * @returns {String} The resulting Punycode string of ASCII code points.
		 */
		function encode(input) {
			var n,
			    delta,
			    handledCPCount,
			    basicLength,
			    bias,
			    j,
			    m,
			    q,
			    k,
			    t,
			    currentValue,
			    output = [],
			    /** `inputLength` will hold the number of code points in `input`. */
			    inputLength,
			    /** Cached calculation results */
			    handledCPCountPlusOne,
			    baseMinusT,
			    qMinusT;

			// Convert the input in UCS-2 to Unicode
			input = ucs2decode(input);

			// Cache the length
			inputLength = input.length;

			// Initialize the state
			n = initialN;
			delta = 0;
			bias = initialBias;

			// Handle the basic code points
			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue < 0x80) {
					output.push(stringFromCharCode(currentValue));
				}
			}

			handledCPCount = basicLength = output.length;

			// `handledCPCount` is the number of code points that have been handled;
			// `basicLength` is the number of basic code points.

			// Finish the basic string - if it is not empty - with a delimiter
			if (basicLength) {
				output.push(delimiter);
			}

			// Main encoding loop:
			while (handledCPCount < inputLength) {

				// All non-basic code points < n have been handled already. Find the next
				// larger one:
				for (m = maxInt, j = 0; j < inputLength; ++j) {
					currentValue = input[j];
					if (currentValue >= n && currentValue < m) {
						m = currentValue;
					}
				}

				// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
				// but guard against overflow
				handledCPCountPlusOne = handledCPCount + 1;
				if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
					error('overflow');
				}

				delta += (m - n) * handledCPCountPlusOne;
				n = m;

				for (j = 0; j < inputLength; ++j) {
					currentValue = input[j];

					if (currentValue < n && ++delta > maxInt) {
						error('overflow');
					}

					if (currentValue == n) {
						// Represent delta as a generalized variable-length integer
						for (q = delta, k = base; /* no condition */; k += base) {
							t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
							if (q < t) {
								break;
							}
							qMinusT = q - t;
							baseMinusT = base - t;
							output.push(
								stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
							);
							q = floor(qMinusT / baseMinusT);
						}

						output.push(stringFromCharCode(digitToBasic(q, 0)));
						bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
						delta = 0;
						++handledCPCount;
					}
				}

				++delta;
				++n;

			}
			return output.join('');
		}

		/**
		 * Converts a Punycode string representing a domain name to Unicode. Only the
		 * Punycoded parts of the domain name will be converted, i.e. it doesn't
		 * matter if you call it on a string that has already been converted to
		 * Unicode.
		 * @memberOf punycode
		 * @param {String} domain The Punycode domain name to convert to Unicode.
		 * @returns {String} The Unicode representation of the given Punycode
		 * string.
		 */
		function toUnicode(domain) {
			return mapDomain(domain, function(string) {
				return regexPunycode.test(string)
					? decode(string.slice(4).toLowerCase())
					: string;
			});
		}

		/**
		 * Converts a Unicode string representing a domain name to Punycode. Only the
		 * non-ASCII parts of the domain name will be converted, i.e. it doesn't
		 * matter if you call it with a domain that's already in ASCII.
		 * @memberOf punycode
		 * @param {String} domain The domain name to convert, as a Unicode string.
		 * @returns {String} The Punycode representation of the given domain name.
		 */
		function toASCII(domain) {
			return mapDomain(domain, function(string) {
				return regexNonASCII.test(string)
					? 'xn--' + encode(string)
					: string;
			});
		}

		/*--------------------------------------------------------------------------*/

		/** Define the public API */
		punycode = {
			/**
			 * A string representing the current Punycode.js version number.
			 * @memberOf punycode
			 * @type String
			 */
			'version': '1.0.0',
			/**
			 * An object of methods to convert from JavaScript's internal character
			 * representation (UCS-2) to decimal Unicode code points, and back.
			 * @see <http://mathiasbynens.be/notes/javascript-encoding>
			 * @memberOf punycode
			 * @type Object
			 */
			'ucs2': {
				'decode': ucs2decode,
				'encode': ucs2encode
			},
			'decode': decode,
			'encode': encode,
			'toASCII': toASCII,
			'toUnicode': toUnicode
		};

		/** Expose `punycode` */
		if (freeExports) {
			if (freeModule && freeModule.exports == freeExports) {
				// in Node.js or Ringo 0.8+
				freeModule.exports = punycode;
			} else {
				// in Narwhal or Ringo 0.7-
				for (key in punycode) {
					punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
				}
			}
		} else if (__webpack_require__(74)) {
			// via curl.js or RequireJS
			!(__WEBPACK_AMD_DEFINE_FACTORY__ = (punycode), (typeof __WEBPACK_AMD_DEFINE_FACTORY__ === 'function' ? (__WEBPACK_AMD_DEFINE_RESULT__ = __WEBPACK_AMD_DEFINE_FACTORY__.call(exports, __webpack_require__, exports, module), __WEBPACK_AMD_DEFINE_RESULT__ !== undefined && (module.exports = __WEBPACK_AMD_DEFINE_RESULT__)) : module.exports = __WEBPACK_AMD_DEFINE_FACTORY__));
		} else {
			// in a browser or Rhino
			root.punycode = punycode;
		}

	}(this));
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(75)(module)))

/***/ },
/* 65 */
/***/ function(module, exports, __webpack_require__) {

	var __WEBPACK_AMD_DEFINE_RESULT__;// Copyright Joyent, Inc. and other Node contributors.
	//
	// Permission is hereby granted, free of charge, to any person obtaining a
	// copy of this software and associated documentation files (the
	// "Software"), to deal in the Software without restriction, including
	// without limitation the rights to use, copy, modify, merge, publish,
	// distribute, sublicense, and/or sell copies of the Software, and to permit
	// persons to whom the Software is furnished to do so, subject to the
	// following conditions:
	//
	// The above copyright notice and this permission notice shall be included
	// in all copies or substantial portions of the Software.
	//
	// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
	// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
	// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
	// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
	// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
	// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
	// USE OR OTHER DEALINGS IN THE SOFTWARE.

	// Query String Utilities

	!(__WEBPACK_AMD_DEFINE_RESULT__ = (function(require, exports, module, undefined) {
	"use strict";

	var QueryString = exports;

	function charCode(c) {
	  return c.charCodeAt(0);
	}

	QueryString.unescape = decodeURIComponent;
	QueryString.escape = encodeURIComponent;

	var stringifyPrimitive = function(v) {
	  switch (typeof v) {
	    case 'string':
	      return v;

	    case 'boolean':
	      return v ? 'true' : 'false';

	    case 'number':
	      return isFinite(v) ? v : '';

	    default:
	      return '';
	  }
	};


	QueryString.stringify = QueryString.encode = function(obj, sep, eq, name) {
	  sep = sep || '&';
	  eq = eq || '=';
	  obj = (obj === null) ? undefined : obj;

	  switch (typeof obj) {
	    case 'object':
	      return Object.keys(obj).map(function(k) {
	        if (Array.isArray(obj[k])) {
	          return obj[k].map(function(v) {
	            return QueryString.escape(stringifyPrimitive(k)) +
	                   eq +
	                   QueryString.escape(stringifyPrimitive(v));
	          }).join(sep);
	        } else {
	          return QueryString.escape(stringifyPrimitive(k)) +
	                 eq +
	                 QueryString.escape(stringifyPrimitive(obj[k]));
	        }
	      }).join(sep);

	    default:
	      if (!name) return '';
	      return QueryString.escape(stringifyPrimitive(name)) + eq +
	             QueryString.escape(stringifyPrimitive(obj));
	  }
	};

	// Parse a key=val string.
	QueryString.parse = QueryString.decode = function(qs, sep, eq) {
	  sep = sep || '&';
	  eq = eq || '=';
	  var obj = {};

	  if (typeof qs !== 'string' || qs.length === 0) {
	    return obj;
	  }

	  qs.split(sep).forEach(function(kvp) {
	    var x = kvp.split(eq);
	    var k = QueryString.unescape(x[0], true);
	    var v = QueryString.unescape(x.slice(1).join(eq), true);

	    if (!(k in obj)) {
	      obj[k] = v;
	    } else if (!Array.isArray(obj[k])) {
	      obj[k] = [obj[k], v];
	    } else {
	      obj[k].push(v);
	    }
	  });

	  return obj;
	};

	}.call(exports, __webpack_require__, exports, module)), __WEBPACK_AMD_DEFINE_RESULT__ !== undefined && (module.exports = __WEBPACK_AMD_DEFINE_RESULT__));


/***/ },
/* 66 */
/***/ function(module, exports, __webpack_require__) {

	var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

	;(function (exports) {
		'use strict';

	  var Arr = (typeof Uint8Array !== 'undefined')
	    ? Uint8Array
	    : Array

		var PLUS   = '+'.charCodeAt(0)
		var SLASH  = '/'.charCodeAt(0)
		var NUMBER = '0'.charCodeAt(0)
		var LOWER  = 'a'.charCodeAt(0)
		var UPPER  = 'A'.charCodeAt(0)
		var PLUS_URL_SAFE = '-'.charCodeAt(0)
		var SLASH_URL_SAFE = '_'.charCodeAt(0)

		function decode (elt) {
			var code = elt.charCodeAt(0)
			if (code === PLUS ||
			    code === PLUS_URL_SAFE)
				return 62 // '+'
			if (code === SLASH ||
			    code === SLASH_URL_SAFE)
				return 63 // '/'
			if (code < NUMBER)
				return -1 //no match
			if (code < NUMBER + 10)
				return code - NUMBER + 26 + 26
			if (code < UPPER + 26)
				return code - UPPER
			if (code < LOWER + 26)
				return code - LOWER + 26
		}

		function b64ToByteArray (b64) {
			var i, j, l, tmp, placeHolders, arr

			if (b64.length % 4 > 0) {
				throw new Error('Invalid string. Length must be a multiple of 4')
			}

			// the number of equal signs (place holders)
			// if there are two placeholders, than the two characters before it
			// represent one byte
			// if there is only one, then the three characters before it represent 2 bytes
			// this is just a cheap hack to not do indexOf twice
			var len = b64.length
			placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

			// base64 is 4/3 + up to two characters of the original data
			arr = new Arr(b64.length * 3 / 4 - placeHolders)

			// if there are placeholders, only get up to the last complete 4 chars
			l = placeHolders > 0 ? b64.length - 4 : b64.length

			var L = 0

			function push (v) {
				arr[L++] = v
			}

			for (i = 0, j = 0; i < l; i += 4, j += 3) {
				tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
				push((tmp & 0xFF0000) >> 16)
				push((tmp & 0xFF00) >> 8)
				push(tmp & 0xFF)
			}

			if (placeHolders === 2) {
				tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
				push(tmp & 0xFF)
			} else if (placeHolders === 1) {
				tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
				push((tmp >> 8) & 0xFF)
				push(tmp & 0xFF)
			}

			return arr
		}

		function uint8ToBase64 (uint8) {
			var i,
				extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
				output = "",
				temp, length

			function encode (num) {
				return lookup.charAt(num)
			}

			function tripletToBase64 (num) {
				return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
			}

			// go through the array every three bytes, we'll deal with trailing stuff later
			for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
				temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
				output += tripletToBase64(temp)
			}

			// pad the end with zeros, but make sure to not forget the extra bytes
			switch (extraBytes) {
				case 1:
					temp = uint8[uint8.length - 1]
					output += encode(temp >> 2)
					output += encode((temp << 4) & 0x3F)
					output += '=='
					break
				case 2:
					temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
					output += encode(temp >> 10)
					output += encode((temp >> 4) & 0x3F)
					output += encode((temp << 2) & 0x3F)
					output += '='
					break
			}

			return output
		}

		exports.toByteArray = b64ToByteArray
		exports.fromByteArray = uint8ToBase64
	}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))


/***/ },
/* 67 */
/***/ function(module, exports, __webpack_require__) {

	
	/**
	 * Expose `Emitter`.
	 */

	module.exports = Emitter;

	/**
	 * Initialize a new `Emitter`.
	 *
	 * @api public
	 */

	function Emitter(obj) {
	  if (obj) return mixin(obj);
	};

	/**
	 * Mixin the emitter properties.
	 *
	 * @param {Object} obj
	 * @return {Object}
	 * @api private
	 */

	function mixin(obj) {
	  for (var key in Emitter.prototype) {
	    obj[key] = Emitter.prototype[key];
	  }
	  return obj;
	}

	/**
	 * Listen on the given `event` with `fn`.
	 *
	 * @param {String} event
	 * @param {Function} fn
	 * @return {Emitter}
	 * @api public
	 */

	Emitter.prototype.on =
	Emitter.prototype.addEventListener = function(event, fn){
	  this._callbacks = this._callbacks || {};
	  (this._callbacks[event] = this._callbacks[event] || [])
	    .push(fn);
	  return this;
	};

	/**
	 * Adds an `event` listener that will be invoked a single
	 * time then automatically removed.
	 *
	 * @param {String} event
	 * @param {Function} fn
	 * @return {Emitter}
	 * @api public
	 */

	Emitter.prototype.once = function(event, fn){
	  var self = this;
	  this._callbacks = this._callbacks || {};

	  function on() {
	    self.off(event, on);
	    fn.apply(this, arguments);
	  }

	  on.fn = fn;
	  this.on(event, on);
	  return this;
	};

	/**
	 * Remove the given callback for `event` or all
	 * registered callbacks.
	 *
	 * @param {String} event
	 * @param {Function} fn
	 * @return {Emitter}
	 * @api public
	 */

	Emitter.prototype.off =
	Emitter.prototype.removeListener =
	Emitter.prototype.removeAllListeners =
	Emitter.prototype.removeEventListener = function(event, fn){
	  this._callbacks = this._callbacks || {};

	  // all
	  if (0 == arguments.length) {
	    this._callbacks = {};
	    return this;
	  }

	  // specific event
	  var callbacks = this._callbacks[event];
	  if (!callbacks) return this;

	  // remove all handlers
	  if (1 == arguments.length) {
	    delete this._callbacks[event];
	    return this;
	  }

	  // remove specific handler
	  var cb;
	  for (var i = 0; i < callbacks.length; i++) {
	    cb = callbacks[i];
	    if (cb === fn || cb.fn === fn) {
	      callbacks.splice(i, 1);
	      break;
	    }
	  }
	  return this;
	};

	/**
	 * Emit `event` with the given args.
	 *
	 * @param {String} event
	 * @param {Mixed} ...
	 * @return {Emitter}
	 */

	Emitter.prototype.emit = function(event){
	  this._callbacks = this._callbacks || {};
	  var args = [].slice.call(arguments, 1)
	    , callbacks = this._callbacks[event];

	  if (callbacks) {
	    callbacks = callbacks.slice(0);
	    for (var i = 0, len = callbacks.length; i < len; ++i) {
	      callbacks[i].apply(this, args);
	    }
	  }

	  return this;
	};

	/**
	 * Return array of callbacks for `event`.
	 *
	 * @param {String} event
	 * @return {Array}
	 * @api public
	 */

	Emitter.prototype.listeners = function(event){
	  this._callbacks = this._callbacks || {};
	  return this._callbacks[event] || [];
	};

	/**
	 * Check if this emitter has `event` handlers.
	 *
	 * @param {String} event
	 * @return {Boolean}
	 * @api public
	 */

	Emitter.prototype.hasListeners = function(event){
	  return !! this.listeners(event).length;
	};


/***/ },
/* 68 */
/***/ function(module, exports, __webpack_require__) {

	
	/**
	 * Reduce `arr` with `fn`.
	 *
	 * @param {Array} arr
	 * @param {Function} fn
	 * @param {Mixed} initial
	 *
	 * TODO: combatible error handling?
	 */

	module.exports = function(arr, fn, initial){  
	  var idx = 0;
	  var len = arr.length;
	  var curr = arguments.length == 3
	    ? initial
	    : arr[idx++];

	  while (idx < len) {
	    curr = fn.call(null, curr, arr[idx], ++idx, arr);
	  }
	  
	  return curr;
	};

/***/ },
/* 69 */
/***/ function(module, exports, __webpack_require__) {

	var exports = module.exports = function (alg) {
	  var Alg = exports[alg]
	  if(!Alg) throw new Error(alg + ' is not supported (we accept pull requests)')
	  return new Alg()
	}

	var Buffer = __webpack_require__(76).Buffer
	var Hash   = __webpack_require__(71)(Buffer)

	exports.sha =
	exports.sha1 = __webpack_require__(72)(Buffer, Hash)
	exports.sha256 = __webpack_require__(73)(Buffer, Hash)


/***/ },
/* 70 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(Buffer) {var intSize = 4;
	var zeroBuffer = new Buffer(intSize); zeroBuffer.fill(0);
	var chrsz = 8;

	function toArray(buf, bigEndian) {
	  if ((buf.length % intSize) !== 0) {
	    var len = buf.length + (intSize - (buf.length % intSize));
	    buf = Buffer.concat([buf, zeroBuffer], len);
	  }

	  var arr = [];
	  var fn = bigEndian ? buf.readInt32BE : buf.readInt32LE;
	  for (var i = 0; i < buf.length; i += intSize) {
	    arr.push(fn.call(buf, i));
	  }
	  return arr;
	}

	function toBuffer(arr, size, bigEndian) {
	  var buf = new Buffer(size);
	  var fn = bigEndian ? buf.writeInt32BE : buf.writeInt32LE;
	  for (var i = 0; i < arr.length; i++) {
	    fn.call(buf, arr[i], i * 4, true);
	  }
	  return buf;
	}

	function hash(buf, fn, hashSize, bigEndian) {
	  if (!Buffer.isBuffer(buf)) buf = new Buffer(buf);
	  var arr = fn(toArray(buf, bigEndian), buf.length * chrsz);
	  return toBuffer(arr, hashSize, bigEndian);
	}

	module.exports = { hash: hash };
	
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(39).Buffer))

/***/ },
/* 71 */
/***/ function(module, exports, __webpack_require__) {

	var u = __webpack_require__(77)
	var write = u.write
	var fill = u.zeroFill

	module.exports = function (Buffer) {

	  //prototype class for hash functions
	  function Hash (blockSize, finalSize) {
	    this._block = new Buffer(blockSize) //new Uint32Array(blockSize/4)
	    this._finalSize = finalSize
	    this._blockSize = blockSize
	    this._len = 0
	    this._s = 0
	  }

	  Hash.prototype.init = function () {
	    this._s = 0
	    this._len = 0
	  }

	  function lengthOf(data, enc) {
	    if(enc == null)     return data.byteLength || data.length
	    if(enc == 'ascii' || enc == 'binary')  return data.length
	    if(enc == 'hex')    return data.length/2
	    if(enc == 'base64') return data.length/3
	  }

	  Hash.prototype.update = function (data, enc) {
	    var bl = this._blockSize

	    //I'd rather do this with a streaming encoder, like the opposite of
	    //http://nodejs.org/api/string_decoder.html
	    var length
	      if(!enc && 'string' === typeof data)
	        enc = 'utf8'

	    if(enc) {
	      if(enc === 'utf-8')
	        enc = 'utf8'

	      if(enc === 'base64' || enc === 'utf8')
	        data = new Buffer(data, enc), enc = null

	      length = lengthOf(data, enc)
	    } else
	      length = data.byteLength || data.length

	    var l = this._len += length
	    var s = this._s = (this._s || 0)
	    var f = 0
	    var buffer = this._block
	    while(s < l) {
	      var t = Math.min(length, f + bl)
	      write(buffer, data, enc, s%bl, f, t)
	      var ch = (t - f);
	      s += ch; f += ch

	      if(!(s%bl))
	        this._update(buffer)
	    }
	    this._s = s

	    return this

	  }

	  Hash.prototype.digest = function (enc) {
	    var bl = this._blockSize
	    var fl = this._finalSize
	    var len = this._len*8

	    var x = this._block

	    var bits = len % (bl*8)

	    //add end marker, so that appending 0's creats a different hash.
	    x[this._len % bl] = 0x80
	    fill(this._block, this._len % bl + 1)

	    if(bits >= fl*8) {
	      this._update(this._block)
	      u.zeroFill(this._block, 0)
	    }

	    //TODO: handle case where the bit length is > Math.pow(2, 29)
	    x.writeInt32BE(len, fl + 4) //big endian

	    var hash = this._update(this._block) || this._hash()
	    if(enc == null) return hash
	    return hash.toString(enc)
	  }

	  Hash.prototype._update = function () {
	    throw new Error('_update must be implemented by subclass')
	  }

	  return Hash
	}


/***/ },
/* 72 */
/***/ function(module, exports, __webpack_require__) {

	/*
	 * A JavaScript implementation of the Secure Hash Algorithm, SHA-1, as defined
	 * in FIPS PUB 180-1
	 * Version 2.1a Copyright Paul Johnston 2000 - 2002.
	 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
	 * Distributed under the BSD License
	 * See http://pajhome.org.uk/crypt/md5 for details.
	 */
	module.exports = function (Buffer, Hash) {

	  var inherits = __webpack_require__(36).inherits

	  inherits(Sha1, Hash)

	  var A = 0|0
	  var B = 4|0
	  var C = 8|0
	  var D = 12|0
	  var E = 16|0

	  var BE = false
	  var LE = true

	  var W = new Int32Array(80)

	  var POOL = []

	  function Sha1 () {
	    if(POOL.length)
	      return POOL.pop().init()

	    if(!(this instanceof Sha1)) return new Sha1()
	    this._w = W
	    Hash.call(this, 16*4, 14*4)
	  
	    this._h = null
	    this.init()
	  }

	  Sha1.prototype.init = function () {
	    this._a = 0x67452301
	    this._b = 0xefcdab89
	    this._c = 0x98badcfe
	    this._d = 0x10325476
	    this._e = 0xc3d2e1f0

	    Hash.prototype.init.call(this)
	    return this
	  }

	  Sha1.prototype._POOL = POOL

	  // assume that array is a Uint32Array with length=16,
	  // and that if it is the last block, it already has the length and the 1 bit appended.


	  var isDV = new Buffer(1) instanceof DataView
	  function readInt32BE (X, i) {
	    return isDV
	      ? X.getInt32(i, false)
	      : X.readInt32BE(i)
	  }

	  Sha1.prototype._update = function (array) {

	    var X = this._block
	    var h = this._h
	    var a, b, c, d, e, _a, _b, _c, _d, _e

	    a = _a = this._a
	    b = _b = this._b
	    c = _c = this._c
	    d = _d = this._d
	    e = _e = this._e

	    var w = this._w

	    for(var j = 0; j < 80; j++) {
	      var W = w[j]
	        = j < 16
	        //? X.getInt32(j*4, false)
	        //? readInt32BE(X, j*4) //*/ X.readInt32BE(j*4) //*/
	        ? X.readInt32BE(j*4)
	        : rol(w[j - 3] ^ w[j -  8] ^ w[j - 14] ^ w[j - 16], 1)

	      var t =
	        add(
	          add(rol(a, 5), sha1_ft(j, b, c, d)),
	          add(add(e, W), sha1_kt(j))
	        );

	      e = d
	      d = c
	      c = rol(b, 30)
	      b = a
	      a = t
	    }

	    this._a = add(a, _a)
	    this._b = add(b, _b)
	    this._c = add(c, _c)
	    this._d = add(d, _d)
	    this._e = add(e, _e)
	  }

	  Sha1.prototype._hash = function () {
	    if(POOL.length < 100) POOL.push(this)
	    var H = new Buffer(20)
	    //console.log(this._a|0, this._b|0, this._c|0, this._d|0, this._e|0)
	    H.writeInt32BE(this._a|0, A)
	    H.writeInt32BE(this._b|0, B)
	    H.writeInt32BE(this._c|0, C)
	    H.writeInt32BE(this._d|0, D)
	    H.writeInt32BE(this._e|0, E)
	    return H
	  }

	  /*
	   * Perform the appropriate triplet combination function for the current
	   * iteration
	   */
	  function sha1_ft(t, b, c, d) {
	    if(t < 20) return (b & c) | ((~b) & d);
	    if(t < 40) return b ^ c ^ d;
	    if(t < 60) return (b & c) | (b & d) | (c & d);
	    return b ^ c ^ d;
	  }

	  /*
	   * Determine the appropriate additive constant for the current iteration
	   */
	  function sha1_kt(t) {
	    return (t < 20) ?  1518500249 : (t < 40) ?  1859775393 :
	           (t < 60) ? -1894007588 : -899497514;
	  }

	  /*
	   * Add integers, wrapping at 2^32. This uses 16-bit operations internally
	   * to work around bugs in some JS interpreters.
	   * //dominictarr: this is 10 years old, so maybe this can be dropped?)
	   *
	   */
	  function add(x, y) {
	    return (x + y ) | 0
	  //lets see how this goes on testling.
	  //  var lsw = (x & 0xFFFF) + (y & 0xFFFF);
	  //  var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
	  //  return (msw << 16) | (lsw & 0xFFFF);
	  }

	  /*
	   * Bitwise rotate a 32-bit number to the left.
	   */
	  function rol(num, cnt) {
	    return (num << cnt) | (num >>> (32 - cnt));
	  }

	  return Sha1
	}


/***/ },
/* 73 */
/***/ function(module, exports, __webpack_require__) {

	
	/**
	 * A JavaScript implementation of the Secure Hash Algorithm, SHA-256, as defined
	 * in FIPS 180-2
	 * Version 2.2-beta Copyright Angel Marin, Paul Johnston 2000 - 2009.
	 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
	 *
	 */

	var inherits = __webpack_require__(36).inherits
	var BE       = false
	var LE       = true
	var u        = __webpack_require__(77)

	module.exports = function (Buffer, Hash) {

	  var K = [
	      0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5,
	      0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
	      0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3,
	      0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
	      0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC,
	      0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
	      0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7,
	      0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
	      0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13,
	      0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
	      0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3,
	      0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
	      0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5,
	      0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
	      0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208,
	      0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2
	    ]

	  inherits(Sha256, Hash)
	  var W = new Array(64)
	  var POOL = []
	  function Sha256() {
	    if(POOL.length) {
	      //return POOL.shift().init()
	    }
	    //this._data = new Buffer(32)

	    this.init()

	    this._w = W //new Array(64)

	    Hash.call(this, 16*4, 14*4)
	  };

	  Sha256.prototype.init = function () {

	    this._a = 0x6a09e667|0
	    this._b = 0xbb67ae85|0
	    this._c = 0x3c6ef372|0
	    this._d = 0xa54ff53a|0
	    this._e = 0x510e527f|0
	    this._f = 0x9b05688c|0
	    this._g = 0x1f83d9ab|0
	    this._h = 0x5be0cd19|0

	    this._len = this._s = 0

	    return this
	  }

	  var safe_add = function(x, y) {
	    var lsw = (x & 0xFFFF) + (y & 0xFFFF);
	    var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
	    return (msw << 16) | (lsw & 0xFFFF);
	  }

	  function S (X, n) {
	    return (X >>> n) | (X << (32 - n));
	  }

	  function R (X, n) {
	    return (X >>> n);
	  }

	  function Ch (x, y, z) {
	    return ((x & y) ^ ((~x) & z));
	  }

	  function Maj (x, y, z) {
	    return ((x & y) ^ (x & z) ^ (y & z));
	  }

	  function Sigma0256 (x) {
	    return (S(x, 2) ^ S(x, 13) ^ S(x, 22));
	  }

	  function Sigma1256 (x) {
	    return (S(x, 6) ^ S(x, 11) ^ S(x, 25));
	  }

	  function Gamma0256 (x) {
	    return (S(x, 7) ^ S(x, 18) ^ R(x, 3));
	  }

	  function Gamma1256 (x) {
	    return (S(x, 17) ^ S(x, 19) ^ R(x, 10));
	  }

	  Sha256.prototype._update = function(m) {
	    var M = this._block
	    var W = this._w
	    var a, b, c, d, e, f, g, h
	    var T1, T2

	    a = this._a | 0
	    b = this._b | 0
	    c = this._c | 0
	    d = this._d | 0
	    e = this._e | 0
	    f = this._f | 0
	    g = this._g | 0
	    h = this._h | 0

	    for (var j = 0; j < 64; j++) {
	      var w = W[j] = j < 16
	        ? M.readInt32BE(j * 4)
	        : Gamma1256(W[j - 2]) + W[j - 7] + Gamma0256(W[j - 15]) + W[j - 16]

	      T1 = h + Sigma1256(e) + Ch(e, f, g) + K[j] + w

	      T2 = Sigma0256(a) + Maj(a, b, c);
	      h = g; g = f; f = e; e = d + T1; d = c; c = b; b = a; a = T1 + T2;
	    }

	    this._a = (a + this._a) | 0
	    this._b = (b + this._b) | 0
	    this._c = (c + this._c) | 0
	    this._d = (d + this._d) | 0
	    this._e = (e + this._e) | 0
	    this._f = (f + this._f) | 0
	    this._g = (g + this._g) | 0
	    this._h = (h + this._h) | 0

	  };

	  Sha256.prototype._hash = function () {
	    if(POOL.length < 10)
	      POOL.push(this)

	    var H = new Buffer(32)

	    H.writeInt32BE(this._a,  0)
	    H.writeInt32BE(this._b,  4)
	    H.writeInt32BE(this._c,  8)
	    H.writeInt32BE(this._d, 12)
	    H.writeInt32BE(this._e, 16)
	    H.writeInt32BE(this._f, 20)
	    H.writeInt32BE(this._g, 24)
	    H.writeInt32BE(this._h, 28)

	    return H
	  }

	  return Sha256

	}


/***/ },
/* 74 */
/***/ function(module, exports, __webpack_require__) {

	module.exports = function() { throw new Error("define cannot be used indirect"); };


/***/ },
/* 75 */
/***/ function(module, exports, __webpack_require__) {

	module.exports = function(module) {
		if(!module.webpackPolyfill) {
			module.deprecate = function() {};
			module.paths = [];
			// module.parent = undefined by default
			module.children = [];
			module.webpackPolyfill = 1;
		}
		return module;
	}


/***/ },
/* 76 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(Buffer) {/*!
	 * The buffer module from node.js, for the browser.
	 *
	 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
	 * @license  MIT
	 */

	var base64 = __webpack_require__(79)
	var ieee754 = __webpack_require__(78)

	exports.Buffer = Buffer
	exports.SlowBuffer = Buffer
	exports.INSPECT_MAX_BYTES = 50
	Buffer.poolSize = 8192

	/**
	 * If `Buffer._useTypedArrays`:
	 *   === true    Use Uint8Array implementation (fastest)
	 *   === false   Use Object implementation (compatible down to IE6)
	 */
	Buffer._useTypedArrays = (function () {
	  // Detect if browser supports Typed Arrays. Supported browsers are IE 10+, Firefox 4+,
	  // Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+. If the browser does not support adding
	  // properties to `Uint8Array` instances, then that's the same as no `Uint8Array` support
	  // because we need to be able to add all the node Buffer API methods. This is an issue
	  // in Firefox 4-29. Now fixed: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
	  try {
	    var buf = new ArrayBuffer(0)
	    var arr = new Uint8Array(buf)
	    arr.foo = function () { return 42 }
	    return 42 === arr.foo() &&
	        typeof arr.subarray === 'function' // Chrome 9-10 lack `subarray`
	  } catch (e) {
	    return false
	  }
	})()

	/**
	 * Class: Buffer
	 * =============
	 *
	 * The Buffer constructor returns instances of `Uint8Array` that are augmented
	 * with function properties for all the node `Buffer` API functions. We use
	 * `Uint8Array` so that square bracket notation works as expected -- it returns
	 * a single octet.
	 *
	 * By augmenting the instances, we can avoid modifying the `Uint8Array`
	 * prototype.
	 */
	function Buffer (subject, encoding, noZero) {
	  if (!(this instanceof Buffer))
	    return new Buffer(subject, encoding, noZero)

	  var type = typeof subject

	  if (encoding === 'base64' && type === 'string') {
	    subject = base64clean(subject)
	  }

	  // Find the length
	  var length
	  if (type === 'number')
	    length = coerce(subject)
	  else if (type === 'string')
	    length = Buffer.byteLength(subject, encoding)
	  else if (type === 'object')
	    length = coerce(subject.length) // assume that object is array-like
	  else
	    throw new Error('First argument needs to be a number, array or string.')

	  var buf
	  if (Buffer._useTypedArrays) {
	    // Preferred: Return an augmented `Uint8Array` instance for best performance
	    buf = Buffer._augment(new Uint8Array(length))
	  } else {
	    // Fallback: Return THIS instance of Buffer (created by `new`)
	    buf = this
	    buf.length = length
	    buf._isBuffer = true
	  }

	  var i
	  if (Buffer._useTypedArrays && typeof subject.byteLength === 'number') {
	    // Speed optimization -- use set if we're copying from a typed array
	    buf._set(subject)
	  } else if (isArrayish(subject)) {
	    // Treat array-ish objects as a byte array
	    if (Buffer.isBuffer(subject)) {
	      for (i = 0; i < length; i++)
	        buf[i] = subject.readUInt8(i)
	    } else {
	      for (i = 0; i < length; i++)
	        buf[i] = ((subject[i] % 256) + 256) % 256
	    }
	  } else if (type === 'string') {
	    buf.write(subject, 0, encoding)
	  } else if (type === 'number' && !Buffer._useTypedArrays && !noZero) {
	    for (i = 0; i < length; i++) {
	      buf[i] = 0
	    }
	  }

	  return buf
	}

	// STATIC METHODS
	// ==============

	Buffer.isEncoding = function (encoding) {
	  switch (String(encoding).toLowerCase()) {
	    case 'hex':
	    case 'utf8':
	    case 'utf-8':
	    case 'ascii':
	    case 'binary':
	    case 'base64':
	    case 'raw':
	    case 'ucs2':
	    case 'ucs-2':
	    case 'utf16le':
	    case 'utf-16le':
	      return true
	    default:
	      return false
	  }
	}

	Buffer.isBuffer = function (b) {
	  return !!(b != null && b._isBuffer)
	}

	Buffer.byteLength = function (str, encoding) {
	  var ret
	  str = str.toString()
	  switch (encoding || 'utf8') {
	    case 'hex':
	      ret = str.length / 2
	      break
	    case 'utf8':
	    case 'utf-8':
	      ret = utf8ToBytes(str).length
	      break
	    case 'ascii':
	    case 'binary':
	    case 'raw':
	      ret = str.length
	      break
	    case 'base64':
	      ret = base64ToBytes(str).length
	      break
	    case 'ucs2':
	    case 'ucs-2':
	    case 'utf16le':
	    case 'utf-16le':
	      ret = str.length * 2
	      break
	    default:
	      throw new Error('Unknown encoding')
	  }
	  return ret
	}

	Buffer.concat = function (list, totalLength) {
	  assert(isArray(list), 'Usage: Buffer.concat(list[, length])')

	  if (list.length === 0) {
	    return new Buffer(0)
	  } else if (list.length === 1) {
	    return list[0]
	  }

	  var i
	  if (totalLength === undefined) {
	    totalLength = 0
	    for (i = 0; i < list.length; i++) {
	      totalLength += list[i].length
	    }
	  }

	  var buf = new Buffer(totalLength)
	  var pos = 0
	  for (i = 0; i < list.length; i++) {
	    var item = list[i]
	    item.copy(buf, pos)
	    pos += item.length
	  }
	  return buf
	}

	Buffer.compare = function (a, b) {
	  assert(Buffer.isBuffer(a) && Buffer.isBuffer(b), 'Arguments must be Buffers')
	  var x = a.length
	  var y = b.length
	  for (var i = 0, len = Math.min(x, y); i < len && a[i] === b[i]; i++) {}
	  if (i !== len) {
	    x = a[i]
	    y = b[i]
	  }
	  if (x < y) {
	    return -1
	  }
	  if (y < x) {
	    return 1
	  }
	  return 0
	}

	// BUFFER INSTANCE METHODS
	// =======================

	function hexWrite (buf, string, offset, length) {
	  offset = Number(offset) || 0
	  var remaining = buf.length - offset
	  if (!length) {
	    length = remaining
	  } else {
	    length = Number(length)
	    if (length > remaining) {
	      length = remaining
	    }
	  }

	  // must be an even number of digits
	  var strLen = string.length
	  assert(strLen % 2 === 0, 'Invalid hex string')

	  if (length > strLen / 2) {
	    length = strLen / 2
	  }
	  for (var i = 0; i < length; i++) {
	    var byte = parseInt(string.substr(i * 2, 2), 16)
	    assert(!isNaN(byte), 'Invalid hex string')
	    buf[offset + i] = byte
	  }
	  return i
	}

	function utf8Write (buf, string, offset, length) {
	  var charsWritten = blitBuffer(utf8ToBytes(string), buf, offset, length)
	  return charsWritten
	}

	function asciiWrite (buf, string, offset, length) {
	  var charsWritten = blitBuffer(asciiToBytes(string), buf, offset, length)
	  return charsWritten
	}

	function binaryWrite (buf, string, offset, length) {
	  return asciiWrite(buf, string, offset, length)
	}

	function base64Write (buf, string, offset, length) {
	  var charsWritten = blitBuffer(base64ToBytes(string), buf, offset, length)
	  return charsWritten
	}

	function utf16leWrite (buf, string, offset, length) {
	  var charsWritten = blitBuffer(utf16leToBytes(string), buf, offset, length)
	  return charsWritten
	}

	Buffer.prototype.write = function (string, offset, length, encoding) {
	  // Support both (string, offset, length, encoding)
	  // and the legacy (string, encoding, offset, length)
	  if (isFinite(offset)) {
	    if (!isFinite(length)) {
	      encoding = length
	      length = undefined
	    }
	  } else {  // legacy
	    var swap = encoding
	    encoding = offset
	    offset = length
	    length = swap
	  }

	  offset = Number(offset) || 0
	  var remaining = this.length - offset
	  if (!length) {
	    length = remaining
	  } else {
	    length = Number(length)
	    if (length > remaining) {
	      length = remaining
	    }
	  }
	  encoding = String(encoding || 'utf8').toLowerCase()

	  var ret
	  switch (encoding) {
	    case 'hex':
	      ret = hexWrite(this, string, offset, length)
	      break
	    case 'utf8':
	    case 'utf-8':
	      ret = utf8Write(this, string, offset, length)
	      break
	    case 'ascii':
	      ret = asciiWrite(this, string, offset, length)
	      break
	    case 'binary':
	      ret = binaryWrite(this, string, offset, length)
	      break
	    case 'base64':
	      ret = base64Write(this, string, offset, length)
	      break
	    case 'ucs2':
	    case 'ucs-2':
	    case 'utf16le':
	    case 'utf-16le':
	      ret = utf16leWrite(this, string, offset, length)
	      break
	    default:
	      throw new Error('Unknown encoding')
	  }
	  return ret
	}

	Buffer.prototype.toString = function (encoding, start, end) {
	  var self = this

	  encoding = String(encoding || 'utf8').toLowerCase()
	  start = Number(start) || 0
	  end = (end === undefined) ? self.length : Number(end)

	  // Fastpath empty strings
	  if (end === start)
	    return ''

	  var ret
	  switch (encoding) {
	    case 'hex':
	      ret = hexSlice(self, start, end)
	      break
	    case 'utf8':
	    case 'utf-8':
	      ret = utf8Slice(self, start, end)
	      break
	    case 'ascii':
	      ret = asciiSlice(self, start, end)
	      break
	    case 'binary':
	      ret = binarySlice(self, start, end)
	      break
	    case 'base64':
	      ret = base64Slice(self, start, end)
	      break
	    case 'ucs2':
	    case 'ucs-2':
	    case 'utf16le':
	    case 'utf-16le':
	      ret = utf16leSlice(self, start, end)
	      break
	    default:
	      throw new Error('Unknown encoding')
	  }
	  return ret
	}

	Buffer.prototype.toJSON = function () {
	  return {
	    type: 'Buffer',
	    data: Array.prototype.slice.call(this._arr || this, 0)
	  }
	}

	Buffer.prototype.equals = function (b) {
	  assert(Buffer.isBuffer(b), 'Argument must be a Buffer')
	  return Buffer.compare(this, b) === 0
	}

	Buffer.prototype.compare = function (b) {
	  assert(Buffer.isBuffer(b), 'Argument must be a Buffer')
	  return Buffer.compare(this, b)
	}

	// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
	Buffer.prototype.copy = function (target, target_start, start, end) {
	  var source = this

	  if (!start) start = 0
	  if (!end && end !== 0) end = this.length
	  if (!target_start) target_start = 0

	  // Copy 0 bytes; we're done
	  if (end === start) return
	  if (target.length === 0 || source.length === 0) return

	  // Fatal error conditions
	  assert(end >= start, 'sourceEnd < sourceStart')
	  assert(target_start >= 0 && target_start < target.length,
	      'targetStart out of bounds')
	  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
	  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

	  // Are we oob?
	  if (end > this.length)
	    end = this.length
	  if (target.length - target_start < end - start)
	    end = target.length - target_start + start

	  var len = end - start

	  if (len < 100 || !Buffer._useTypedArrays) {
	    for (var i = 0; i < len; i++) {
	      target[i + target_start] = this[i + start]
	    }
	  } else {
	    target._set(this.subarray(start, start + len), target_start)
	  }
	}

	function base64Slice (buf, start, end) {
	  if (start === 0 && end === buf.length) {
	    return base64.fromByteArray(buf)
	  } else {
	    return base64.fromByteArray(buf.slice(start, end))
	  }
	}

	function utf8Slice (buf, start, end) {
	  var res = ''
	  var tmp = ''
	  end = Math.min(buf.length, end)

	  for (var i = start; i < end; i++) {
	    if (buf[i] <= 0x7F) {
	      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
	      tmp = ''
	    } else {
	      tmp += '%' + buf[i].toString(16)
	    }
	  }

	  return res + decodeUtf8Char(tmp)
	}

	function asciiSlice (buf, start, end) {
	  var ret = ''
	  end = Math.min(buf.length, end)

	  for (var i = start; i < end; i++) {
	    ret += String.fromCharCode(buf[i])
	  }
	  return ret
	}

	function binarySlice (buf, start, end) {
	  return asciiSlice(buf, start, end)
	}

	function hexSlice (buf, start, end) {
	  var len = buf.length

	  if (!start || start < 0) start = 0
	  if (!end || end < 0 || end > len) end = len

	  var out = ''
	  for (var i = start; i < end; i++) {
	    out += toHex(buf[i])
	  }
	  return out
	}

	function utf16leSlice (buf, start, end) {
	  var bytes = buf.slice(start, end)
	  var res = ''
	  for (var i = 0; i < bytes.length; i += 2) {
	    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
	  }
	  return res
	}

	Buffer.prototype.slice = function (start, end) {
	  var len = this.length
	  start = clamp(start, len, 0)
	  end = clamp(end, len, len)

	  if (Buffer._useTypedArrays) {
	    return Buffer._augment(this.subarray(start, end))
	  } else {
	    var sliceLen = end - start
	    var newBuf = new Buffer(sliceLen, undefined, true)
	    for (var i = 0; i < sliceLen; i++) {
	      newBuf[i] = this[i + start]
	    }
	    return newBuf
	  }
	}

	// `get` will be removed in Node 0.13+
	Buffer.prototype.get = function (offset) {
	  console.log('.get() is deprecated. Access using array indexes instead.')
	  return this.readUInt8(offset)
	}

	// `set` will be removed in Node 0.13+
	Buffer.prototype.set = function (v, offset) {
	  console.log('.set() is deprecated. Access using array indexes instead.')
	  return this.writeUInt8(v, offset)
	}

	Buffer.prototype.readUInt8 = function (offset, noAssert) {
	  if (!noAssert) {
	    assert(offset !== undefined && offset !== null, 'missing offset')
	    assert(offset < this.length, 'Trying to read beyond buffer length')
	  }

	  if (offset >= this.length)
	    return

	  return this[offset]
	}

	function readUInt16 (buf, offset, littleEndian, noAssert) {
	  if (!noAssert) {
	    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
	    assert(offset !== undefined && offset !== null, 'missing offset')
	    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
	  }

	  var len = buf.length
	  if (offset >= len)
	    return

	  var val
	  if (littleEndian) {
	    val = buf[offset]
	    if (offset + 1 < len)
	      val |= buf[offset + 1] << 8
	  } else {
	    val = buf[offset] << 8
	    if (offset + 1 < len)
	      val |= buf[offset + 1]
	  }
	  return val
	}

	Buffer.prototype.readUInt16LE = function (offset, noAssert) {
	  return readUInt16(this, offset, true, noAssert)
	}

	Buffer.prototype.readUInt16BE = function (offset, noAssert) {
	  return readUInt16(this, offset, false, noAssert)
	}

	function readUInt32 (buf, offset, littleEndian, noAssert) {
	  if (!noAssert) {
	    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
	    assert(offset !== undefined && offset !== null, 'missing offset')
	    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
	  }

	  var len = buf.length
	  if (offset >= len)
	    return

	  var val
	  if (littleEndian) {
	    if (offset + 2 < len)
	      val = buf[offset + 2] << 16
	    if (offset + 1 < len)
	      val |= buf[offset + 1] << 8
	    val |= buf[offset]
	    if (offset + 3 < len)
	      val = val + (buf[offset + 3] << 24 >>> 0)
	  } else {
	    if (offset + 1 < len)
	      val = buf[offset + 1] << 16
	    if (offset + 2 < len)
	      val |= buf[offset + 2] << 8
	    if (offset + 3 < len)
	      val |= buf[offset + 3]
	    val = val + (buf[offset] << 24 >>> 0)
	  }
	  return val
	}

	Buffer.prototype.readUInt32LE = function (offset, noAssert) {
	  return readUInt32(this, offset, true, noAssert)
	}

	Buffer.prototype.readUInt32BE = function (offset, noAssert) {
	  return readUInt32(this, offset, false, noAssert)
	}

	Buffer.prototype.readInt8 = function (offset, noAssert) {
	  if (!noAssert) {
	    assert(offset !== undefined && offset !== null,
	        'missing offset')
	    assert(offset < this.length, 'Trying to read beyond buffer length')
	  }

	  if (offset >= this.length)
	    return

	  var neg = this[offset] & 0x80
	  if (neg)
	    return (0xff - this[offset] + 1) * -1
	  else
	    return this[offset]
	}

	function readInt16 (buf, offset, littleEndian, noAssert) {
	  if (!noAssert) {
	    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
	    assert(offset !== undefined && offset !== null, 'missing offset')
	    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
	  }

	  var len = buf.length
	  if (offset >= len)
	    return

	  var val = readUInt16(buf, offset, littleEndian, true)
	  var neg = val & 0x8000
	  if (neg)
	    return (0xffff - val + 1) * -1
	  else
	    return val
	}

	Buffer.prototype.readInt16LE = function (offset, noAssert) {
	  return readInt16(this, offset, true, noAssert)
	}

	Buffer.prototype.readInt16BE = function (offset, noAssert) {
	  return readInt16(this, offset, false, noAssert)
	}

	function readInt32 (buf, offset, littleEndian, noAssert) {
	  if (!noAssert) {
	    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
	    assert(offset !== undefined && offset !== null, 'missing offset')
	    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
	  }

	  var len = buf.length
	  if (offset >= len)
	    return

	  var val = readUInt32(buf, offset, littleEndian, true)
	  var neg = val & 0x80000000
	  if (neg)
	    return (0xffffffff - val + 1) * -1
	  else
	    return val
	}

	Buffer.prototype.readInt32LE = function (offset, noAssert) {
	  return readInt32(this, offset, true, noAssert)
	}

	Buffer.prototype.readInt32BE = function (offset, noAssert) {
	  return readInt32(this, offset, false, noAssert)
	}

	function readFloat (buf, offset, littleEndian, noAssert) {
	  if (!noAssert) {
	    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
	    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
	  }

	  return ieee754.read(buf, offset, littleEndian, 23, 4)
	}

	Buffer.prototype.readFloatLE = function (offset, noAssert) {
	  return readFloat(this, offset, true, noAssert)
	}

	Buffer.prototype.readFloatBE = function (offset, noAssert) {
	  return readFloat(this, offset, false, noAssert)
	}

	function readDouble (buf, offset, littleEndian, noAssert) {
	  if (!noAssert) {
	    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
	    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
	  }

	  return ieee754.read(buf, offset, littleEndian, 52, 8)
	}

	Buffer.prototype.readDoubleLE = function (offset, noAssert) {
	  return readDouble(this, offset, true, noAssert)
	}

	Buffer.prototype.readDoubleBE = function (offset, noAssert) {
	  return readDouble(this, offset, false, noAssert)
	}

	Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
	  if (!noAssert) {
	    assert(value !== undefined && value !== null, 'missing value')
	    assert(offset !== undefined && offset !== null, 'missing offset')
	    assert(offset < this.length, 'trying to write beyond buffer length')
	    verifuint(value, 0xff)
	  }

	  if (offset >= this.length) return

	  this[offset] = value
	  return offset + 1
	}

	function writeUInt16 (buf, value, offset, littleEndian, noAssert) {
	  if (!noAssert) {
	    assert(value !== undefined && value !== null, 'missing value')
	    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
	    assert(offset !== undefined && offset !== null, 'missing offset')
	    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
	    verifuint(value, 0xffff)
	  }

	  var len = buf.length
	  if (offset >= len)
	    return

	  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
	    buf[offset + i] =
	        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
	            (littleEndian ? i : 1 - i) * 8
	  }
	  return offset + 2
	}

	Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
	  return writeUInt16(this, value, offset, true, noAssert)
	}

	Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
	  return writeUInt16(this, value, offset, false, noAssert)
	}

	function writeUInt32 (buf, value, offset, littleEndian, noAssert) {
	  if (!noAssert) {
	    assert(value !== undefined && value !== null, 'missing value')
	    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
	    assert(offset !== undefined && offset !== null, 'missing offset')
	    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
	    verifuint(value, 0xffffffff)
	  }

	  var len = buf.length
	  if (offset >= len)
	    return

	  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
	    buf[offset + i] =
	        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
	  }
	  return offset + 4
	}

	Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
	  return writeUInt32(this, value, offset, true, noAssert)
	}

	Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
	  return writeUInt32(this, value, offset, false, noAssert)
	}

	Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
	  if (!noAssert) {
	    assert(value !== undefined && value !== null, 'missing value')
	    assert(offset !== undefined && offset !== null, 'missing offset')
	    assert(offset < this.length, 'Trying to write beyond buffer length')
	    verifsint(value, 0x7f, -0x80)
	  }

	  if (offset >= this.length)
	    return

	  if (value >= 0)
	    this.writeUInt8(value, offset, noAssert)
	  else
	    this.writeUInt8(0xff + value + 1, offset, noAssert)
	  return offset + 1
	}

	function writeInt16 (buf, value, offset, littleEndian, noAssert) {
	  if (!noAssert) {
	    assert(value !== undefined && value !== null, 'missing value')
	    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
	    assert(offset !== undefined && offset !== null, 'missing offset')
	    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
	    verifsint(value, 0x7fff, -0x8000)
	  }

	  var len = buf.length
	  if (offset >= len)
	    return

	  if (value >= 0)
	    writeUInt16(buf, value, offset, littleEndian, noAssert)
	  else
	    writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
	  return offset + 2
	}

	Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
	  return writeInt16(this, value, offset, true, noAssert)
	}

	Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
	  return writeInt16(this, value, offset, false, noAssert)
	}

	function writeInt32 (buf, value, offset, littleEndian, noAssert) {
	  if (!noAssert) {
	    assert(value !== undefined && value !== null, 'missing value')
	    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
	    assert(offset !== undefined && offset !== null, 'missing offset')
	    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
	    verifsint(value, 0x7fffffff, -0x80000000)
	  }

	  var len = buf.length
	  if (offset >= len)
	    return

	  if (value >= 0)
	    writeUInt32(buf, value, offset, littleEndian, noAssert)
	  else
	    writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
	  return offset + 4
	}

	Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
	  return writeInt32(this, value, offset, true, noAssert)
	}

	Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
	  return writeInt32(this, value, offset, false, noAssert)
	}

	function writeFloat (buf, value, offset, littleEndian, noAssert) {
	  if (!noAssert) {
	    assert(value !== undefined && value !== null, 'missing value')
	    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
	    assert(offset !== undefined && offset !== null, 'missing offset')
	    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
	    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
	  }

	  var len = buf.length
	  if (offset >= len)
	    return

	  ieee754.write(buf, value, offset, littleEndian, 23, 4)
	  return offset + 4
	}

	Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
	  return writeFloat(this, value, offset, true, noAssert)
	}

	Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
	  return writeFloat(this, value, offset, false, noAssert)
	}

	function writeDouble (buf, value, offset, littleEndian, noAssert) {
	  if (!noAssert) {
	    assert(value !== undefined && value !== null, 'missing value')
	    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
	    assert(offset !== undefined && offset !== null, 'missing offset')
	    assert(offset + 7 < buf.length,
	        'Trying to write beyond buffer length')
	    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
	  }

	  var len = buf.length
	  if (offset >= len)
	    return

	  ieee754.write(buf, value, offset, littleEndian, 52, 8)
	  return offset + 8
	}

	Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
	  return writeDouble(this, value, offset, true, noAssert)
	}

	Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
	  return writeDouble(this, value, offset, false, noAssert)
	}

	// fill(value, start=0, end=buffer.length)
	Buffer.prototype.fill = function (value, start, end) {
	  if (!value) value = 0
	  if (!start) start = 0
	  if (!end) end = this.length

	  assert(end >= start, 'end < start')

	  // Fill 0 bytes; we're done
	  if (end === start) return
	  if (this.length === 0) return

	  assert(start >= 0 && start < this.length, 'start out of bounds')
	  assert(end >= 0 && end <= this.length, 'end out of bounds')

	  var i
	  if (typeof value === 'number') {
	    for (i = start; i < end; i++) {
	      this[i] = value
	    }
	  } else {
	    var bytes = utf8ToBytes(value.toString())
	    var len = bytes.length
	    for (i = start; i < end; i++) {
	      this[i] = bytes[i % len]
	    }
	  }

	  return this
	}

	Buffer.prototype.inspect = function () {
	  var out = []
	  var len = this.length
	  for (var i = 0; i < len; i++) {
	    out[i] = toHex(this[i])
	    if (i === exports.INSPECT_MAX_BYTES) {
	      out[i + 1] = '...'
	      break
	    }
	  }
	  return '<Buffer ' + out.join(' ') + '>'
	}

	/**
	 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
	 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
	 */
	Buffer.prototype.toArrayBuffer = function () {
	  if (typeof Uint8Array !== 'undefined') {
	    if (Buffer._useTypedArrays) {
	      return (new Buffer(this)).buffer
	    } else {
	      var buf = new Uint8Array(this.length)
	      for (var i = 0, len = buf.length; i < len; i += 1) {
	        buf[i] = this[i]
	      }
	      return buf.buffer
	    }
	  } else {
	    throw new Error('Buffer.toArrayBuffer not supported in this browser')
	  }
	}

	// HELPER FUNCTIONS
	// ================

	var BP = Buffer.prototype

	/**
	 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
	 */
	Buffer._augment = function (arr) {
	  arr._isBuffer = true

	  // save reference to original Uint8Array get/set methods before overwriting
	  arr._get = arr.get
	  arr._set = arr.set

	  // deprecated, will be removed in node 0.13+
	  arr.get = BP.get
	  arr.set = BP.set

	  arr.write = BP.write
	  arr.toString = BP.toString
	  arr.toLocaleString = BP.toString
	  arr.toJSON = BP.toJSON
	  arr.equals = BP.equals
	  arr.compare = BP.compare
	  arr.copy = BP.copy
	  arr.slice = BP.slice
	  arr.readUInt8 = BP.readUInt8
	  arr.readUInt16LE = BP.readUInt16LE
	  arr.readUInt16BE = BP.readUInt16BE
	  arr.readUInt32LE = BP.readUInt32LE
	  arr.readUInt32BE = BP.readUInt32BE
	  arr.readInt8 = BP.readInt8
	  arr.readInt16LE = BP.readInt16LE
	  arr.readInt16BE = BP.readInt16BE
	  arr.readInt32LE = BP.readInt32LE
	  arr.readInt32BE = BP.readInt32BE
	  arr.readFloatLE = BP.readFloatLE
	  arr.readFloatBE = BP.readFloatBE
	  arr.readDoubleLE = BP.readDoubleLE
	  arr.readDoubleBE = BP.readDoubleBE
	  arr.writeUInt8 = BP.writeUInt8
	  arr.writeUInt16LE = BP.writeUInt16LE
	  arr.writeUInt16BE = BP.writeUInt16BE
	  arr.writeUInt32LE = BP.writeUInt32LE
	  arr.writeUInt32BE = BP.writeUInt32BE
	  arr.writeInt8 = BP.writeInt8
	  arr.writeInt16LE = BP.writeInt16LE
	  arr.writeInt16BE = BP.writeInt16BE
	  arr.writeInt32LE = BP.writeInt32LE
	  arr.writeInt32BE = BP.writeInt32BE
	  arr.writeFloatLE = BP.writeFloatLE
	  arr.writeFloatBE = BP.writeFloatBE
	  arr.writeDoubleLE = BP.writeDoubleLE
	  arr.writeDoubleBE = BP.writeDoubleBE
	  arr.fill = BP.fill
	  arr.inspect = BP.inspect
	  arr.toArrayBuffer = BP.toArrayBuffer

	  return arr
	}

	var INVALID_BASE64_RE = /[^+\/0-9A-z]/g

	function base64clean (str) {
	  // Node strips out invalid characters like \n and \t from the string, base64-js does not
	  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
	  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
	  while (str.length % 4 !== 0) {
	    str = str + '='
	  }
	  return str
	}

	function stringtrim (str) {
	  if (str.trim) return str.trim()
	  return str.replace(/^\s+|\s+$/g, '')
	}

	// slice(start, end)
	function clamp (index, len, defaultValue) {
	  if (typeof index !== 'number') return defaultValue
	  index = ~~index;  // Coerce to integer.
	  if (index >= len) return len
	  if (index >= 0) return index
	  index += len
	  if (index >= 0) return index
	  return 0
	}

	function coerce (length) {
	  // Coerce length to a number (possibly NaN), round up
	  // in case it's fractional (e.g. 123.456) then do a
	  // double negate to coerce a NaN to 0. Easy, right?
	  length = ~~Math.ceil(+length)
	  return length < 0 ? 0 : length
	}

	function isArray (subject) {
	  return (Array.isArray || function (subject) {
	    return Object.prototype.toString.call(subject) === '[object Array]'
	  })(subject)
	}

	function isArrayish (subject) {
	  return isArray(subject) || Buffer.isBuffer(subject) ||
	      subject && typeof subject === 'object' &&
	      typeof subject.length === 'number'
	}

	function toHex (n) {
	  if (n < 16) return '0' + n.toString(16)
	  return n.toString(16)
	}

	function utf8ToBytes (str) {
	  var byteArray = []
	  for (var i = 0; i < str.length; i++) {
	    var b = str.charCodeAt(i)
	    if (b <= 0x7F) {
	      byteArray.push(b)
	    } else {
	      var start = i
	      if (b >= 0xD800 && b <= 0xDFFF) i++
	      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
	      for (var j = 0; j < h.length; j++) {
	        byteArray.push(parseInt(h[j], 16))
	      }
	    }
	  }
	  return byteArray
	}

	function asciiToBytes (str) {
	  var byteArray = []
	  for (var i = 0; i < str.length; i++) {
	    // Node's code seems to be doing this and not & 0x7F..
	    byteArray.push(str.charCodeAt(i) & 0xFF)
	  }
	  return byteArray
	}

	function utf16leToBytes (str) {
	  var c, hi, lo
	  var byteArray = []
	  for (var i = 0; i < str.length; i++) {
	    c = str.charCodeAt(i)
	    hi = c >> 8
	    lo = c % 256
	    byteArray.push(lo)
	    byteArray.push(hi)
	  }

	  return byteArray
	}

	function base64ToBytes (str) {
	  return base64.toByteArray(str)
	}

	function blitBuffer (src, dst, offset, length) {
	  for (var i = 0; i < length; i++) {
	    if ((i + offset >= dst.length) || (i >= src.length))
	      break
	    dst[i + offset] = src[i]
	  }
	  return i
	}

	function decodeUtf8Char (str) {
	  try {
	    return decodeURIComponent(str)
	  } catch (err) {
	    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
	  }
	}

	/*
	 * We have to make sure that the value is a valid integer. This means that it
	 * is non-negative. It has no fractional component and that it does not
	 * exceed the maximum allowed value.
	 */
	function verifuint (value, max) {
	  assert(typeof value === 'number', 'cannot write a non-number as a number')
	  assert(value >= 0, 'specified a negative value for writing an unsigned value')
	  assert(value <= max, 'value is larger than maximum value for type')
	  assert(Math.floor(value) === value, 'value has a fractional component')
	}

	function verifsint (value, max, min) {
	  assert(typeof value === 'number', 'cannot write a non-number as a number')
	  assert(value <= max, 'value larger than maximum allowed value')
	  assert(value >= min, 'value smaller than minimum allowed value')
	  assert(Math.floor(value) === value, 'value has a fractional component')
	}

	function verifIEEE754 (value, max, min) {
	  assert(typeof value === 'number', 'cannot write a non-number as a number')
	  assert(value <= max, 'value larger than maximum allowed value')
	  assert(value >= min, 'value smaller than minimum allowed value')
	}

	function assert (test, message) {
	  if (!test) throw new Error(message || 'Failed assertion')
	}
	
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(39).Buffer))

/***/ },
/* 77 */
/***/ function(module, exports, __webpack_require__) {

	exports.write = write
	exports.zeroFill = zeroFill

	exports.toString = toString

	function write (buffer, string, enc, start, from, to, LE) {
	  var l = (to - from)
	  if(enc === 'ascii' || enc === 'binary') {
	    for( var i = 0; i < l; i++) {
	      buffer[start + i] = string.charCodeAt(i + from)
	    }
	  }
	  else if(enc == null) {
	    for( var i = 0; i < l; i++) {
	      buffer[start + i] = string[i + from]
	    }
	  }
	  else if(enc === 'hex') {
	    for(var i = 0; i < l; i++) {
	      var j = from + i
	      buffer[start + i] = parseInt(string[j*2] + string[(j*2)+1], 16)
	    }
	  }
	  else if(enc === 'base64') {
	    throw new Error('base64 encoding not yet supported')
	  }
	  else
	    throw new Error(enc +' encoding not yet supported')
	}

	//always fill to the end!
	function zeroFill(buf, from) {
	  for(var i = from; i < buf.length; i++)
	    buf[i] = 0
	}



/***/ },
/* 78 */
/***/ function(module, exports, __webpack_require__) {

	exports.read = function (buffer, offset, isLE, mLen, nBytes) {
	  var e, m
	  var eLen = nBytes * 8 - mLen - 1
	  var eMax = (1 << eLen) - 1
	  var eBias = eMax >> 1
	  var nBits = -7
	  var i = isLE ? (nBytes - 1) : 0
	  var d = isLE ? -1 : 1
	  var s = buffer[offset + i]

	  i += d

	  e = s & ((1 << (-nBits)) - 1)
	  s >>= (-nBits)
	  nBits += eLen
	  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

	  m = e & ((1 << (-nBits)) - 1)
	  e >>= (-nBits)
	  nBits += mLen
	  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

	  if (e === 0) {
	    e = 1 - eBias
	  } else if (e === eMax) {
	    return m ? NaN : ((s ? -1 : 1) * Infinity)
	  } else {
	    m = m + Math.pow(2, mLen)
	    e = e - eBias
	  }
	  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
	}

	exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
	  var e, m, c
	  var eLen = nBytes * 8 - mLen - 1
	  var eMax = (1 << eLen) - 1
	  var eBias = eMax >> 1
	  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
	  var i = isLE ? 0 : (nBytes - 1)
	  var d = isLE ? 1 : -1
	  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

	  value = Math.abs(value)

	  if (isNaN(value) || value === Infinity) {
	    m = isNaN(value) ? 1 : 0
	    e = eMax
	  } else {
	    e = Math.floor(Math.log(value) / Math.LN2)
	    if (value * (c = Math.pow(2, -e)) < 1) {
	      e--
	      c *= 2
	    }
	    if (e + eBias >= 1) {
	      value += rt / c
	    } else {
	      value += rt * Math.pow(2, 1 - eBias)
	    }
	    if (value * c >= 2) {
	      e++
	      c /= 2
	    }

	    if (e + eBias >= eMax) {
	      m = 0
	      e = eMax
	    } else if (e + eBias >= 1) {
	      m = (value * c - 1) * Math.pow(2, mLen)
	      e = e + eBias
	    } else {
	      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
	      e = 0
	    }
	  }

	  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

	  e = (e << mLen) | m
	  eLen += mLen
	  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

	  buffer[offset + i - d] |= s * 128
	}


/***/ },
/* 79 */
/***/ function(module, exports, __webpack_require__) {

	var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

	;(function (exports) {
		'use strict';

	  var Arr = (typeof Uint8Array !== 'undefined')
	    ? Uint8Array
	    : Array

		var PLUS   = '+'.charCodeAt(0)
		var SLASH  = '/'.charCodeAt(0)
		var NUMBER = '0'.charCodeAt(0)
		var LOWER  = 'a'.charCodeAt(0)
		var UPPER  = 'A'.charCodeAt(0)
		var PLUS_URL_SAFE = '-'.charCodeAt(0)
		var SLASH_URL_SAFE = '_'.charCodeAt(0)

		function decode (elt) {
			var code = elt.charCodeAt(0)
			if (code === PLUS ||
			    code === PLUS_URL_SAFE)
				return 62 // '+'
			if (code === SLASH ||
			    code === SLASH_URL_SAFE)
				return 63 // '/'
			if (code < NUMBER)
				return -1 //no match
			if (code < NUMBER + 10)
				return code - NUMBER + 26 + 26
			if (code < UPPER + 26)
				return code - UPPER
			if (code < LOWER + 26)
				return code - LOWER + 26
		}

		function b64ToByteArray (b64) {
			var i, j, l, tmp, placeHolders, arr

			if (b64.length % 4 > 0) {
				throw new Error('Invalid string. Length must be a multiple of 4')
			}

			// the number of equal signs (place holders)
			// if there are two placeholders, than the two characters before it
			// represent one byte
			// if there is only one, then the three characters before it represent 2 bytes
			// this is just a cheap hack to not do indexOf twice
			var len = b64.length
			placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

			// base64 is 4/3 + up to two characters of the original data
			arr = new Arr(b64.length * 3 / 4 - placeHolders)

			// if there are placeholders, only get up to the last complete 4 chars
			l = placeHolders > 0 ? b64.length - 4 : b64.length

			var L = 0

			function push (v) {
				arr[L++] = v
			}

			for (i = 0, j = 0; i < l; i += 4, j += 3) {
				tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
				push((tmp & 0xFF0000) >> 16)
				push((tmp & 0xFF00) >> 8)
				push(tmp & 0xFF)
			}

			if (placeHolders === 2) {
				tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
				push(tmp & 0xFF)
			} else if (placeHolders === 1) {
				tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
				push((tmp >> 8) & 0xFF)
				push(tmp & 0xFF)
			}

			return arr
		}

		function uint8ToBase64 (uint8) {
			var i,
				extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
				output = "",
				temp, length

			function encode (num) {
				return lookup.charAt(num)
			}

			function tripletToBase64 (num) {
				return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
			}

			// go through the array every three bytes, we'll deal with trailing stuff later
			for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
				temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
				output += tripletToBase64(temp)
			}

			// pad the end with zeros, but make sure to not forget the extra bytes
			switch (extraBytes) {
				case 1:
					temp = uint8[uint8.length - 1]
					output += encode(temp >> 2)
					output += encode((temp << 4) & 0x3F)
					output += '=='
					break
				case 2:
					temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
					output += encode(temp >> 10)
					output += encode((temp >> 4) & 0x3F)
					output += encode((temp << 2) & 0x3F)
					output += '='
					break
			}

			return output
		}

		exports.toByteArray = b64ToByteArray
		exports.fromByteArray = uint8ToBase64
	}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))


/***/ }
/******/ ])