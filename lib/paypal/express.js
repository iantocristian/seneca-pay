/* Copyright (c) 2012-2013 Cristian Ianto, MIT License */
"use strict";

var _              = require('underscore')

var PaypalExpress  = require('paypal-express').PaypalExpress;

var name = "pay-paypal-express"


module.exports = function(){
  var seneca = this;

  var endpoints = {
    pay: '/pay/paypal-express/pay',
    completeCallback: '/pay/paypal-express/callback-complete',
    cancelCallback: '/pay/paypal-express/callback-cancel'
  }

  var paypalExpress;

  seneca.add({role:name, cmd:'init-gateway'}, function (args, done) {
    var options = args.options;

    paypalExpress = new PaypalExpress(
      options.username,
      options.password,
      options.signature);

    paypalExpress.useSandbox(options.useSandbox);

    done(null, paypalExpress)
  })

  var hostUrl;
  var successUrl, failUrl;

  seneca.add({role:name, cmd:'init-routes'}, function (args, done) {
    var routes = args.routes;

    hostUrl = args.redirect.hostUrl;
    successUrl = args.redirect.success;
    failUrl = args.redirect.fail;

    routes[endpoints.pay] = { POST: payHandler };
    routes[endpoints.completeCallback] = { GET: completeCallbackHandler };
    routes[endpoints.cancelCallback] = { GET: cancelCallbackHandler };

    done(null, routes)
  })

  function urljoin () {
    var args = [].slice.call(arguments)
    return args.join('/').replace(/\/+/g, '/').replace(/:\//,'://')
  }

  function payHandler(req, res, next) {
    console.log('pay handler');

    var host = hostUrl;
    if (!host && req.headers.host) {
      host = (req.connection.encrypted ? 'https' : 'http') + '://' + req.headers.host;
    }

    var completeCallbackUrl = urljoin(host, endpoints.completeCallback);
    var cancelCallbackUrl = urljoin(host, endpoints.cancelCallback);

    var input = req.body;
    
    paypalExpress.beginInstantPayment({
        'RETURNURL': completeCallbackUrl,
        'CANCELURL': cancelCallbackUrl,
        'PAYMENTREQUEST_0_AMT': input.amount,
        'PAYMENTREQUEST_0_ITEMAMT': input.itemAmount,
        'PAYMENTREQUEST_0_CURRENCYCODE': input.currencyCode,
        'PAYMENTREQUEST_0_TAXAMT': input.taxAmount,
        'PAYMENTREQUEST_0_DESC': input.description
      },
      function(err, data) {
        if (err) {
          seneca.log.debug('beginPayment: error', err);
          res.redirect(failUrl)
        }
        else {
          seneca.log.debug('beginPayment: init transaction', data.payment_url);

          var transactionData = {
            expressCheckout: data,
            status: 'started'
          };

          seneca.act({role:'transaction', cmd:'create', data:transactionData}, function(err) {
            seneca.log.debug('beginPayment: redirecting to', data.payment_url);

            res.redirect(data.payment_url)
          })
        }
      }
    )
  }

  function completeCallbackHandler(req, res, next) {
    console.log('complete handler');

    var token = req.query['token'];
    var payerID = req.query['PayerID']

    seneca.act({role:'transaction', cmd:'find', q:{'expressCheckout.token':token}}, function(err, out) {
      if (err) {
        seneca.log.error('find', 'transaction', 'error', err, {token:token})
        res.redirect(failUrl);
        return
      }

    var transaction = out.transaction;
    transaction.expressCheckout.PayerID = payerID;
    transaction.status = 'completed';

    seneca.act({role:'transaction', cmd:'update', id:transaction.id, data:transaction}, function(err) {

      res.redirect(successUrl)

    }) })
  }

  function cancelCallbackHandler(req, res, next) {
    console.log('cancel handler');

    var token = req.query['token'];
    var payerID = req.query['PayerID']

    seneca.act({role:'transaction', cmd:'find', q:{'expressCheckout.token':token}}, function(err, out) {
      if (err) {
        seneca.log.error('find', 'transaction', 'error', err, {token:token})
        res.redirect(failUrl);
        return
      }

    var transaction = out.transaction;
    transaction.expressCheckout.PayerID = payerID;
    transaction.status = 'cancelled';

    seneca.act({role:'transaction', cmd:'update', id:transaction.id, data:transaction}, function(err) {

      res.redirect(failUrl)

    }) })
  }

}
