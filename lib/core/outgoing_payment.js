var RippleRestClient = require('ripple-rest-client');
var uuid = require('node-uuid');
var async = require('async');
var gateway = require(__dirname+'/../../');
var hotWallet = gateway.config.get('HOT_WALLET');

function OutgoingPayment(outgoingPaymentRecord) {
  this.record = outgoingPaymentRecord,
  this.rippleRestClient = new RippleRestClient({
    account: hotWallet.address,
    secret: hotWallet.secret
  });
}

OutgoingPayment.prototype = {

  processOutgoingPayment: function(callback) {
    var self = this;
    async.waterfall([
      function(next) {
        self._getRippleAddressRecord(next);
      },
      function(address, next) {
        self._buildPayment(address, next);
      },
      function(payment, next) {
        self._sendPayment(payment, next);
      },
      function(response, next) {
        self._markRecordAsSent(response, next);
      },
      function(response, next) {
        self._confirmSuccessfulPayment(response, next);
      }
    ], function(error, response) {
      if (error) {
        self._handleRippleRestFailure(error, function() {
          console.log('payments:outgoing:failure', self.record.toJSON());
          callback(error, self.record);
        });
      } else {
        console.log('payments:outgoing:success', self.record.toJSON());
        callback(error, self.record);
      }
    })
  },

  _recordAcceptanceOrRejectionStatus: function(payment, callback) {
    var self = this;
    self.record.transaction_state = payment.result;
    self.record.transaction_hash = payment.hash;
    switch(self.record.transaction_state) {
    case 'tesSUCCESS':
      self.record.state = 'succeeded';
      break;
    default:
      self.record.state = 'failed';
    }
    self.record.save().complete(function(error, record){
      //depositCallbackJob.perform([self.record.id], console.log);
      callback(null, record);
    });
  },
  
  _confirmSuccessfulPayment: function(response, callback) {
    var statusUrl = response.status_url;
    var self = this;
    self.rippleRestClient.pollPaymentStatus(statusUrl, function(error, paymentStatus) {
      if (error) {
        return callback(error, null);
      } 
      self._recordAcceptanceOrRejectionStatus(paymentStatus, function(error, record) {
        callback(null, record);
      });
    });
  },

  _markRecordAsSent: function(response, callback) {
    var self = this;
    var statusUrl = response.status_url;
    self.record.state = 'sent';
    self.record.uid = response.client_resource_id;
    self.record.save().complete(function(){
      callback(null, response)
    });
  },

  _handleRippleRestFailure: function(error, callback) {
    var self = this;
    if (typeof error === 'string' && error.match('No paths found')){
      error = 'noPathFound';
    }
    switch(error) {
      case 'retry':
        self.record.state = 'outgoing';
        break;
      case 'noPathFound':
        self.record.transaction_state = 'tecPATH_DRY';
        self.record.state = 'failed';
        break;
      default:
        self.record.state = 'failed';
    }
    self.record.save().complete(function(){
      //depositCallbackJob.perform([self.record.id], console.log);
      callback();
    });
  },

  _getRippleAddressRecord: function(callback) {
    var self = this;
    gateway.data.rippleAddresses.read(self.record.to_address_id, callback);
  },
  
  _buildPayment: function(address, callback) {
    var self = this;
    self.rippleRestClient.buildPayment({
      amount: self.record.to_amount,
      currency: self.record.to_currency,
      issuer: gateway.config.get('COLD_WALLET'),
      account: hotWallet.address,
      recipient: address.address
    }, function(error, response) {
      if (error) { 
        return callback(error.message, null); 
      }
      if (response.success) {
        callback(null, response.payments[0]);
      } else {
        callback(response.message, null);
      }
    });
  },
  
  _sendPayment: function(payment, callback) {
    var self = this;
    self.rippleRestClient.sendPayment({
      payment: payment,
      client_resource_id: uuid.v4(),
      secret: hotWallet.secret
    }, function(error, response){
      if (error) {
        callback(error, null);
      } else if (response.success){
        callback(null, response);
      } else {
        callback(response.message, null);
      }
    });
  }

}

module.exports = OutgoingPayment;

