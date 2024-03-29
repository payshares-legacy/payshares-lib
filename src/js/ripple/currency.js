var extend    = require('extend');
var UInt160 = require('./uint160').UInt160;
var utils = require('./utils');
var Float = require('./ieee754').Float;

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
