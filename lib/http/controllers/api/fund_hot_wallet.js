var gateway = require(__dirname+'/../../../../');

module.exports = function(req, res) {

  var amount = req.body.amount;
  var currency = req.body.currency;
  var secret = req.body.secret;

  gateway.api.fundHotWallet(amount, currency, secret, function(err, resp){
    if (err) {
      res.send(500, {error: err});
    } else {
      res.send({ hotWallet: resp });
    }
  });
  
};

