var utils  = require('./utils');
var extend = require('extend');
var UInt   = require('./uint').UInt;

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
