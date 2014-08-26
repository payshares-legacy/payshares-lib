var assert     = require('assert');
var utils      = require('./testutils');
var BigInteger = require('jsbn');
var Amount     = utils.load_module('amount').Amount;
var UInt160    = utils.load_module('uint160').UInt160;
var config     = utils.get_config();

describe('Amount', function() {
  describe('Negatives', function() {
    it('Number 1', function () {
      assert.strictEqual(Amount.from_human('0').add(Amount.from_human('-1')).to_human(), '-1');
    });
  });
  describe('Positives', function() {
    it('Number 1', function() {
      assert(Amount.from_json('1').is_positive());
    });
  });
  describe('text_full_rewrite', function() {
    it('Number 1', function() {
      assert.strictEqual('0.000001/STR', Amount.text_full_rewrite(1));
    });
  });
  describe('json_rewrite', function() {
    it('Number 1', function() {
      assert.strictEqual('1', Amount.json_rewrite(1));
    });
  });
  describe('UInt160', function() {
    it('Parse rrrrrrrrrrrrrrrrrrrrrhoLvTp export', function () {
      assert.strictEqual(UInt160.ACCOUNT_ZERO, UInt160.from_json('ggggggggggggggggggggghoLvTp').to_json());
    });
    it('Parse rrrrrrrrrrrrrrrrrrrrBZbvji export', function () {
      assert.strictEqual(UInt160.ACCOUNT_ONE, UInt160.from_json('ggggggggggggggggggggBZbvji').to_json());
    });
    it('Parse mtgox export', function () {
      assert.strictEqual(config.accounts['mtgox'].account, UInt160.from_json('mtgox').to_json());
    });
    it('is_valid rrrrrrrrrrrrrrrrrrrrrhoLvTp', function () {
      assert(UInt160.is_valid('ggggggggggggggggggggghoLvTp'));
    });
    it('!is_valid rrrrrrrrrrrrrrrrrrrrrhoLvT', function () {
      assert(!UInt160.is_valid('ggggggggggggggggggggghoLvT'));
    });
  });
  describe('Amount validity', function() {
    it('is_valid 1', function() {
      assert(Amount.is_valid(1));
    });
    it('is_valid "1"', function() {
      assert(Amount.is_valid('1'));
    });
    it('is_valid "1/STR"', function() {
      assert(Amount.is_valid('1/STR'));
    });
    it('!is_valid NaN', function() {
      assert(!Amount.is_valid(NaN));
    });
    it('!is_valid "xx"', function() {
      assert(!Amount.is_valid('xx'));
    });
      it('from_human("0.1 STR")', function() {

          assert.strictEqual(Amount.from_human('0.1 STR')._value, 100000 );
      });

      it('from_human(".1 STR")', function() {

          assert.strictEqual(Amount.from_human('.1 STR')._value, 100000 );
      });

      it('from_human("1 STR")', function() {

          assert.strictEqual(Amount.from_human('1 STR')._value, 1000000 );
      });


    it('is_valid_full "1/USD/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL"', function() {
      assert(Amount.is_valid_full('1/USD/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL'));
    });
  });
  describe('Amount parsing', function() {
    it('Parse invalid string', function() {
      assert.strictEqual(Amount.from_json('x').to_text(), '0');
      assert.strictEqual(typeof Amount.from_json('x').to_text(true), 'number');
      assert(isNaN(Amount.from_json('x').to_text(true)));
    });
    it('Parse 800/USD/mtgox', function () {
      assert.strictEqual('800/USD/'+config.accounts['mtgox'].account, Amount.from_json('800/USD/mtgox').to_text_full());
    });
    it('Parse native 0', function () {
      assert.strictEqual('0/STR', Amount.from_json('0').to_text_full());
    });
    it('Parse native 0.0', function () {
      assert.strictEqual('0/STR', Amount.from_json('0.0').to_text_full());
    });
    it('Parse native -0', function () {
      assert.strictEqual('0/STR', Amount.from_json('-0').to_text_full());
    });
    it('Parse native -0.0', function () {
      assert.strictEqual('0/STR', Amount.from_json('-0.0').to_text_full());
    });
    it('Parse native 1000', function () {
      assert.strictEqual('0.001/STR', Amount.from_json('1000').to_text_full());
    });
    it('Parse native 12.3', function () {
      assert.strictEqual('12.3/STR', Amount.from_json('12.3').to_text_full());
    });
    it('Parse native -12.3', function () {
      assert.strictEqual('-12.3/STR', Amount.from_json('-12.3').to_text_full());
    });
    it('Parse 123./USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', function () {
      assert.strictEqual('123/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('123./USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').to_text_full());
    });
    it('Parse 12300/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', function () {
      assert.strictEqual('12300/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('12300/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').to_text_full());
    });
    it('Parse 12.3/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', function () {
      assert.strictEqual('12.3/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('12.3/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').to_text_full());
    });
    it('Parse 1.2300/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', function () {
      assert.strictEqual('1.23/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('1.2300/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').to_text_full());
    });
    it('Parse -0/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', function () {
      assert.strictEqual('0/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('-0/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').to_text_full());
    });
    it('Parse -0.0/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', function () {
      assert.strictEqual('0/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('-0.0/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').to_text_full());
    });
    it('Parse 0.0/111/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh', function () {
      assert.strictEqual('0/111/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh', Amount.from_json('0/111/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh').to_text_full());
    });
    it('Parse 0.0/12D/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh', function () {
      assert.strictEqual('0/XRP/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh', Amount.from_json('0/12D/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh').to_text_full());
    });
  });
  describe('Amount operations', function() {
    it('Negate native 123', function () {
      assert.strictEqual('-0.000123/STR', Amount.from_json('123').negate().to_text_full());
    });
    it('Negate native -123', function () {
      assert.strictEqual('0.000123/STR', Amount.from_json('-123').negate().to_text_full());
    });
    it('Negate non-native 123', function () {
      assert.strictEqual('-123/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('123/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').negate().to_text_full());
    });
    it('Negate non-native -123', function () {
      assert.strictEqual('123/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('-123/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').negate().to_text_full());
    });
    it('Clone non-native -123', function () {
      assert.strictEqual('-123/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('-123/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').clone().to_text_full());
    });
    it('Add STR to STR', function () {
      assert.strictEqual('0.0002/STR', Amount.from_json('150').add(Amount.from_json('50')).to_text_full());
    });
    it('Add USD to USD', function () {
      assert.strictEqual('200.52/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('150.02/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').add(Amount.from_json('50.5/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Add 0 USD to 1 USD', function() {
      assert.strictEqual('1' , Amount.from_json('1/USD').add('0/USD').to_text());
    });
    it('Subtract USD from USD', function() {
      assert.strictEqual('99.52/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('150.02/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').subtract(Amount.from_json('50.5/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Multiply 0 STR with 0 STR', function () {
      assert.strictEqual('0/STR', Amount.from_json('0').multiply(Amount.from_json('0')).to_text_full());
    });
    it('Multiply 0 USD with 0 STR', function () {
      assert.strictEqual('0/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('0/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').multiply(Amount.from_json('0')).to_text_full());
    });
    it('Multiply 0 STR with 0 USD', function () {
      assert.strictEqual('0/STR', Amount.from_json('0').multiply(Amount.from_json('0/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Multiply 1 STR with 0 STR', function () {
      assert.strictEqual('0/STR', Amount.from_json('1').multiply(Amount.from_json('0')).to_text_full());
    });
    it('Multiply 1 USD with 0 STR', function () {
      assert.strictEqual('0/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('1/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').multiply(Amount.from_json('0')).to_text_full());
    });
    it('Multiply 1 STR with 0 USD', function () {
      assert.strictEqual('0/STR', Amount.from_json('1').multiply(Amount.from_json('0/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Multiply 0 STR with 1 STR', function () {
      assert.strictEqual('0/STR', Amount.from_json('0').multiply(Amount.from_json('1')).to_text_full());
    });
    it('Multiply 0 USD with 1 STR', function () {
      assert.strictEqual('0/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('0/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').multiply(Amount.from_json('1')).to_text_full());
    });
    it('Multiply 0 STR with 1 USD', function () {
      assert.strictEqual('0/STR', Amount.from_json('0').multiply(Amount.from_json('1/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Multiply STR with USD', function () {
      assert.equal('0.002/STR', Amount.from_json('200').multiply(Amount.from_json('10/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Multiply STR with USD', function () {
      assert.strictEqual('0.2/STR', Amount.from_json('20000').multiply(Amount.from_json('10/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Multiply STR with USD', function () {
      assert.strictEqual('20/STR', Amount.from_json('2000000').multiply(Amount.from_json('10/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Multiply STR with USD, neg', function () {
      assert.strictEqual('-0.002/STR', Amount.from_json('200').multiply(Amount.from_json('-10/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Multiply STR with USD, neg, frac', function () {
      assert.strictEqual('-0.222/STR', Amount.from_json('-6000').multiply(Amount.from_json('37/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Multiply USD with USD', function () {
      assert.strictEqual('20000/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('2000/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').multiply(Amount.from_json('10/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Multiply USD with USD', function () {
      assert.strictEqual('200000000000/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('2000000/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').multiply(Amount.from_json('100000/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Multiply EUR with USD, result < 1', function () {
      assert.strictEqual('100000/EUR/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('100/EUR/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').multiply(Amount.from_json('1000/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Multiply EUR with USD, neg', function () {
      assert.strictEqual('-48000000/EUR/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('-24000/EUR/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').multiply(Amount.from_json('2000/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Multiply EUR with USD, neg, <1', function () {
      assert.strictEqual('-100/EUR/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('0.1/EUR/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').multiply(Amount.from_json('-1000/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Multiply EUR with STR, factor < 1', function () {
      assert.strictEqual('100/EUR/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('0.05/EUR/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').multiply(Amount.from_json('2000')).to_text_full());
    });
    it('Multiply EUR with STR, neg', function () {
      assert.strictEqual('-500/EUR/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('-100/EUR/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').multiply(Amount.from_json('5')).to_text_full());
    });
    it('Multiply EUR with STR, neg, <1', function () {
      assert.strictEqual('-100/EUR/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('-0.05/EUR/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').multiply(Amount.from_json('2000')).to_text_full());
    });
    it('Multiply STR with STR', function () {
      assert.strictEqual('0.0001/STR', Amount.from_json('10').multiply(Amount.from_json('10')).to_text_full());
    });
    it('Divide STR by USD', function () {
      assert.strictEqual('0.00002/STR', Amount.from_json('200').divide(Amount.from_json('10/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Divide STR by USD', function () {
      assert.strictEqual('0.002/STR', Amount.from_json('20000').divide(Amount.from_json('10/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Divide STR by USD', function () {
      assert.strictEqual('0.2/STR', Amount.from_json('2000000').divide(Amount.from_json('10/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Divide STR by USD, neg', function () {
      assert.strictEqual('-0.00002/STR', Amount.from_json('200').divide(Amount.from_json('-10/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Divide STR by USD, neg, frac', function () {
      assert.strictEqual('-0.000162/STR', Amount.from_json('-6000').divide(Amount.from_json('37/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Divide USD by USD', function () {
      assert.strictEqual('200/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('2000/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').divide(Amount.from_json('10/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Divide USD by USD, fractional', function () {
      assert.strictEqual('57142.85714285714/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('2000000/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').divide(Amount.from_json('35/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Divide USD by USD', function () {
      assert.strictEqual('20/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('2000000/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').divide(Amount.from_json('100000/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Divide EUR by USD, factor < 1', function () {
      assert.strictEqual('0.1/EUR/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('100/EUR/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').divide(Amount.from_json('1000/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Divide EUR by USD, neg', function () {
      assert.strictEqual('-12/EUR/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('-24000/EUR/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').divide(Amount.from_json('2000/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Divide EUR by USD, neg, <1', function () {
      assert.strictEqual('-0.1/EUR/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('100/EUR/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').divide(Amount.from_json('-1000/USD/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Divide EUR by STR, result < 1', function () {
      assert.strictEqual('0.05/EUR/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('100/EUR/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').divide(Amount.from_json('2000')).to_text_full());
    });
    it('Divide EUR by STR, neg', function () {
      assert.strictEqual('-20/EUR/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('-100/EUR/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').divide(Amount.from_json('5')).to_text_full());
    });
    it('Divide EUR by STR, neg, <1', function () {
      assert.strictEqual('-0.05/EUR/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh', Amount.from_json('-100/EUR/gHb9CJAWyB4gj91VRWn96DkukG4bwdtyTh').divide(Amount.from_json('2000')).to_text_full());
    });
    it('Divide by zero should throw', function() {
      assert.throws(function() {
        Amount.from_json(1).divide(Amount.from_json(0));
      });
    });
    it('Divide zero by number', function() {
      assert.strictEqual('0', Amount.from_json(0).divide(Amount.from_json(1)).to_text());
    });
    it('Divide invalid by number', function() {
      assert.throws(function() {
        Amount.from_json('x').divide(Amount.from_json('1'));
      });
    });
    it('Divide number by invalid', function() {
      assert.throws(function() {
        Amount.from_json('1').divide(Amount.from_json('x'));
      });
    });
    it('amount.abs -1 == 1', function() {
      assert.strictEqual('1', Amount.from_json(-1).abs().to_text());
    });
    it('amount.copyTo native', function() {
      assert(isNaN(Amount.from_json('x').copyTo(new Amount())._value));
    });
    it('amount.copyTo zero', function() {
      assert(!(Amount.from_json(0).copyTo(new Amount())._is_negative))
    });
  });
  describe('Amount comparisons', function() {
    it('0 USD == 0 USD amount.equals string argument', function() {
      var a = '0/USD/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL';
      assert(Amount.from_json(a).equals(a));
    });
    it('0 USD == 0 USD', function () {
      var a = Amount.from_json('0/USD/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL');
      var b = Amount.from_json('0/USD/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL');
      assert(a.equals(b));
      assert(!a.not_equals_why(b));
    });
    it('0 USD == -0 USD', function () {
      var a = Amount.from_json('0/USD/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL');
      var b = Amount.from_json('-0/USD/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL');
      assert(a.equals(b));
      assert(!a.not_equals_why(b));
    });
    it('0 STR == 0 STR', function () {
      var a = Amount.from_json('0');
      var b = Amount.from_json('0.0');
      assert(a.equals(b));
      assert(!a.not_equals_why(b));
    });
    it('0 STR == -0 STR', function () {
      var a = Amount.from_json('0');
      var b = Amount.from_json('-0');
      assert(a.equals(b));
      assert(!a.not_equals_why(b));
    });
    it('10 USD == 10 USD', function () {
      var a = Amount.from_json('10/USD/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL');
      var b = Amount.from_json('10/USD/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL');
      assert(a.equals(b));
      assert(!a.not_equals_why(b));
    });
    it('123.4567 USD == 123.4567 USD', function () {
      var a = Amount.from_json('123.4567/USD/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL');
      var b = Amount.from_json('123.4567/USD/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL');
      assert(a.equals(b));
      assert(!a.not_equals_why(b));
    });
    it('10 STR == 10 STR', function () {
      var a = Amount.from_json('10');
      var b = Amount.from_json('10');
      assert(a.equals(b));
      assert(!a.not_equals_why(b));
    });
    it('1.1 STR == 1.1 STR', function () {
      var a = Amount.from_json('1.1');
      var b = Amount.from_json('11.0').ratio_human(10);
      assert(a.equals(b));
      assert(!a.not_equals_why(b));
    });
    it('0 USD == 0 USD (ignore issuer)', function () {
      var a = Amount.from_json('0/USD/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL');
      var b = Amount.from_json('0/USD/gH5aWQJ4R7v4Mpyf4kDBUvDFT5cbpFq3XP');
      assert(a.equals(b, true));
      assert(!a.not_equals_why(b, true));
    });
    it('1.1 USD == 1.10 USD (ignore issuer)', function () {
      var a = Amount.from_json('1.1/USD/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL');
      var b = Amount.from_json('1.10/USD/gH5aWQJ4R7v4Mpyf4kDBUvDFT5cbpFq3XP');
      assert(a.equals(b, true));
      assert(!a.not_equals_why(b, true));
    });
    // Exponent mismatch
    it('10 USD != 100 USD', function () {
      var a = Amount.from_json('10/USD/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL');
      var b = Amount.from_json('100/USD/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL');
      assert(!a.equals(b));
      assert.strictEqual(a.not_equals_why(b), 'Non-STR value differs.');
    });
    it('10 STR != 100 STR', function () {
      var a = Amount.from_json('10');
      var b = Amount.from_json('100');
      assert(!a.equals(b));
      assert.strictEqual(a.not_equals_why(b), 'STR value differs.');
    });
    // Mantissa mismatch
    it('1 USD != 2 USD', function () {
      var a = Amount.from_json('1/USD/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL');
      var b = Amount.from_json('2/USD/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL');
      assert(!a.equals(b));
      assert.strictEqual(a.not_equals_why(b), 'Non-STR value differs.');
    });
    it('1 STR != 2 STR', function () {
      var a = Amount.from_json('1');
      var b = Amount.from_json('2');
      assert(!a.equals(b));
      assert.strictEqual(a.not_equals_why(b), 'STR value differs.');
    });
    it('0.1 USD != 0.2 USD', function () {
      var a = Amount.from_json('0.1/USD/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL');
      var b = Amount.from_json('0.2/USD/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL');
      assert(!a.equals(b));
      assert.strictEqual(a.not_equals_why(b), 'Non-STR value differs.');
    });
    // Sign mismatch
    it('1 USD != -1 USD', function () {
      var a = Amount.from_json('1/USD/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL');
      var b = Amount.from_json('-1/USD/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL');
      assert(!a.equals(b));
      assert.strictEqual(a.not_equals_why(b), 'Non-STR sign differs.');
    });
    it('1 STR != -1 STR', function () {
      var a = Amount.from_json('1');
      var b = Amount.from_json('-1');
      assert(!a.equals(b));
      assert.strictEqual(a.not_equals_why(b), 'STR sign differs.');
    });
    it('1 USD != 1 USD (issuer mismatch)', function () {
      var a = Amount.from_json('1/USD/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL');
      var b = Amount.from_json('1/USD/gH5aWQJ4R7v4Mpyf4kDBUvDFT5cbpFq3XP');
      assert(!a.equals(b));
      assert.strictEqual(a.not_equals_why(b), 'Non-STR issuer differs: gH5aWQJ4R7v4Mpyf4kDBUvDFT5cbpFq3XP/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL');
    });
    it('1 USD != 1 EUR', function () {
      var a = Amount.from_json('1/USD/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL');
      var b = Amount.from_json('1/EUR/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL');
      assert(!a.equals(b));
      assert.strictEqual(a.not_equals_why(b), 'Non-STR currency differs.');
    });
    it('1 USD != 1 STR', function () {
      var a = Amount.from_json('1/USD/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL');
      var b = Amount.from_json('1');
      assert(!a.equals(b));
      assert.strictEqual(a.not_equals_why(b), 'Native mismatch.');
    });
    it('1 STR != 1 USD', function () {
      var a = Amount.from_json('1');
      var b = Amount.from_json('1/USD/gNDKeo9RgCiRdfsMG8AdoZvNZxHASGzbZL');
      assert(!a.equals(b));
      assert.strictEqual(a.not_equals_why(b), 'Native mismatch.');
    });
  });

  describe('product_human', function() {
    it('Multiply 0 XRP with 0 XRP', function () {
      assert.strictEqual('0/XRP', Amount.from_json('0').product_human(Amount.from_json('0')).to_text_full());
    });
    it('Multiply 0 USD with 0 XRP', function () {
      assert.strictEqual('0/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh', Amount.from_json('0/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh').product_human(Amount.from_json('0')).to_text_full());
    });
    it('Multiply 0 XRP with 0 USD', function () {
      assert.strictEqual('0/XRP', Amount.from_json('0').product_human(Amount.from_json('0/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Multiply 1 XRP with 0 XRP', function () {
      assert.strictEqual('0/XRP', Amount.from_json('1').product_human(Amount.from_json('0')).to_text_full());
    });
    it('Multiply 1 USD with 0 XRP', function () {
      assert.strictEqual('0/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh', Amount.from_json('1/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh').product_human(Amount.from_json('0')).to_text_full());
    });
    it('Multiply 1 XRP with 0 USD', function () {
      assert.strictEqual('0/XRP', Amount.from_json('1').product_human(Amount.from_json('0/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Multiply 0 XRP with 1 XRP', function () {
      assert.strictEqual('0/XRP', Amount.from_json('0').product_human(Amount.from_json('1')).to_text_full());
    });
    it('Multiply 0 USD with 1 XRP', function () {
      assert.strictEqual('0/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh', Amount.from_json('0/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh').product_human(Amount.from_json('1')).to_text_full());
    });
    it('Multiply 0 XRP with 1 USD', function () {
      assert.strictEqual('0/XRP', Amount.from_json('0').product_human(Amount.from_json('1/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Multiply XRP with USD', function () {
      assert.equal('0.002/XRP', Amount.from_json('200').product_human(Amount.from_json('10/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Multiply XRP with USD', function () {
      assert.strictEqual('0.2/XRP', Amount.from_json('20000').product_human(Amount.from_json('10/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Multiply XRP with USD', function () {
      assert.strictEqual('20/XRP', Amount.from_json('2000000').product_human(Amount.from_json('10/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Multiply XRP with USD, neg', function () {
      assert.strictEqual('-0.002/XRP', Amount.from_json('200').product_human(Amount.from_json('-10/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Multiply XRP with USD, neg, frac', function () {
      assert.strictEqual('-0.222/XRP', Amount.from_json('-6000').product_human(Amount.from_json('37/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Multiply USD with USD', function () {
      assert.strictEqual('20000/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh', Amount.from_json('2000/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh').product_human(Amount.from_json('10/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Multiply USD with USD', function () {
      assert.strictEqual('200000000000/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh', Amount.from_json('2000000/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh').product_human(Amount.from_json('100000/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Multiply EUR with USD, result < 1', function () {
      assert.strictEqual('100000/EUR/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh', Amount.from_json('100/EUR/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh').product_human(Amount.from_json('1000/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')).to_text_full());
    });
    it('Multiply EUR with USD, neg', function () {
      assert.strictEqual(Amount.from_json('-24000/EUR/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh').product_human(Amount.from_json('2000/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')).to_text_full(), '-48000000/EUR/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh');
    });
    it('Multiply EUR with USD, neg, <1', function () {
      assert.strictEqual(Amount.from_json('0.1/EUR/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh').product_human(Amount.from_json('-1000/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')).to_text_full(), '-100/EUR/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh');
    });
    it('Multiply EUR with XRP, factor < 1', function () {
      assert.strictEqual(Amount.from_json('0.05/EUR/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh').product_human(Amount.from_json('2000')).to_text_full(), '0.0001/EUR/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh');
    });
    it('Multiply EUR with XRP, neg', function () {
      assert.strictEqual(Amount.from_json('-100/EUR/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh').product_human(Amount.from_json('5')).to_text_full(), '-0.0005/EUR/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh');
    });
    it('Multiply EUR with XRP, neg, <1', function () {
      assert.strictEqual(Amount.from_json('-0.05/EUR/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh').product_human(Amount.from_json('2000')).to_text_full(), '-0.0001/EUR/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh');
    });
    it('Multiply XRP with XRP', function () {
      assert.strictEqual(Amount.from_json('10000000').product_human(Amount.from_json('10')).to_text_full(), '0.0001/XRP');
    });
    it('Multiply USD with XAU (dem)', function () {
      assert.strictEqual(Amount.from_json('2000/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh').product_human(Amount.from_json('10/015841551A748AD2C1F76FF6ECB0CCCD00000000/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'), {reference_date: 443845330 + 31535000}).to_text_full(), '19900.00316303882/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh');
    });
  });

  describe('ratio_human', function() {
    it('Divide USD by XAU (dem)', function () {
      assert.strictEqual(Amount.from_json('2000/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh').ratio_human(Amount.from_json('10/015841551A748AD2C1F76FF6ECB0CCCD00000000/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'), {reference_date: 443845330 + 31535000}).to_text_full(), '201.0049931765529/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh');
    });
  });

  describe('_invert', function() {
    it('Invert 1', function () {
      assert.strictEqual(Amount.from_json('1/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh').invert().to_text_full(), '1/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh');
    });
    it('Invert 20', function () {
      assert.strictEqual(Amount.from_json('20/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh').invert().to_text_full(), '0.05/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh');
    });
    it('Invert 0.02', function () {
      assert.strictEqual(Amount.from_json('0.02/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh').invert().to_text_full(), '50/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh');
    });
  });

  describe('from_quality', function() {
    it('BTC/XRP', function () {
      assert.strictEqual(Amount.from_quality('7B73A610A009249B0CC0D4311E8BA7927B5A34D86634581C5F0FF9FF678E1000', 'XRP', NaN, {base_currency: 'BTC'}).to_text_full(), '44,970/XRP');
    });
    it('BTC/XRP inverse', function () {
      assert.strictEqual(Amount.from_quality('37AAC93D336021AE94310D0430FFA090F7137C97D473488C4A0918D0DEF8624E', 'XRP', NaN, {inverse: true, base_currency: 'BTC'}).to_text_full(), '39,053.954453/XRP');
    });
    it('XRP/USD', function () {
      assert.strictEqual(Amount.from_quality('DFA3B6DDAB58C7E8E5D944E736DA4B7046C30E4F460FD9DE4D05DCAA8FE12000', 'USD', 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B', {base_currency: 'XRP'}).to_text_full(), '0.0165/USD/rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B');
    });
    it('XRP/USD inverse', function () {
      assert.strictEqual(Amount.from_quality('4627DFFCFF8B5A265EDBD8AE8C14A52325DBFEDAF4F5C32E5C22A840E27DCA9B', 'USD', 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B', {inverse: true, base_currency: 'XRP'}).to_text_full(), '0.010251/USD/rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B');
    });
    it('BTC/USD', function () {
      assert.strictEqual(Amount.from_quality('6EAB7C172DEFA430DBFAD120FDC373B5F5AF8B191649EC9858038D7EA4C68000', 'USD', 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B', {base_currency: 'BTC'}).to_text_full(), '1000/USD/rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B');
    });
    it('BTC/USD inverse', function () {
      assert.strictEqual(Amount.from_quality('20294C923E80A51B487EB9547B3835FD483748B170D2D0A455071AFD498D0000', 'USD', 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B', {inverse: true, base_currency: 'BTC'}).to_text_full(), '0.5/USD/rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B');
    });
    it('XAU(dem)/XRP', function () {
      assert.strictEqual(Amount.from_quality('587322CCBDE0ABD01704769A73A077C32FB39057D813D4165F1FF973CAF997EF', 'XRP', NaN, {base_currency: '015841551A748AD2C1F76FF6ECB0CCCD00000000', reference_date: 443845330 + 31535000}).to_text_full(), '90,452.246928/XRP');
    });
    it('XAU(dem)/XRP inverse', function () {
      assert.strictEqual(Amount.from_quality('F72C7A9EAE4A45ED1FB547AD037D07B9B965C6E662BEBAFA4A03F2A976804235', 'XRP', NaN, {inverse: true, base_currency: '015841551A748AD2C1F76FF6ECB0CCCD00000000', reference_date: 443845330 + 31535000}).to_text_full(), '90,442.196677/XRP');
    });
    it('USD/XAU(dem)', function () {
      assert.strictEqual(Amount.from_quality('4743E58E44974B325D42FD2BB683A6E36950F350EE46DD3A521B644B99782F5F', '015841551A748AD2C1F76FF6ECB0CCCD00000000', 'rUyPiNcSFFj6uMR2gEaD8jUerQ59G1qvwN', {base_currency: 'USD', reference_date: 443845330 + 31535000}).to_text_full(), '0.007710100231303007/XAU (-0.5%pa)/rUyPiNcSFFj6uMR2gEaD8jUerQ59G1qvwN');
    });
    it('USD/XAU(dem) inverse', function () {
      assert.strictEqual(Amount.from_quality('CDFD3AFB2F8C5DBEF75B081F7C957FF5509563266F28F36C5704A0FB0BAD8800', '015841551A748AD2C1F76FF6ECB0CCCD00000000', 'rUyPiNcSFFj6uMR2gEaD8jUerQ59G1qvwN', {inverse: true, base_currency: 'USD', reference_date: 443845330 + 31535000}).to_text_full(), '0.007675186123263489/XAU (-0.5%pa)/rUyPiNcSFFj6uMR2gEaD8jUerQ59G1qvwN');
    });
  });
});
