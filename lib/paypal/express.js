/* Copyright (c) 2012-2013 Cristian Ianto, MIT License */
"use strict";

var _              = require('underscore');
var URL            = require('url');

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

  function urlappend(url, name, value) {
    var urlobj = URL.parse(url, true);
    if (typeof value !== 'undefined' && value !== null) {
      urlobj.query[name] = value;
    }
    return URL.format(urlobj);
  }

  function payHandler(req, res, next) {
    console.log('pay handler');

    var input = req.body;
    var transactionData = { refno:input.refno, status:'created' };

    seneca.act({role:'transaction', cmd:'create', data:transactionData}, function(err, out) {
      if (err) {
        res.redirect(urlappend(failUrl, 'refno', input.refno));
        return
      }

      var transaction = out.transaction;

      var host = hostUrl;
      if (!host && req.headers.host) {
        host = (req.connection.encrypted ? 'https' : 'http') + '://' + req.headers.host;
      }

      var completeCallbackUrl = urlappend(urljoin(host, endpoints.completeCallback), 'refno', transaction.refno);
      var cancelCallbackUrl = urlappend(urljoin(host, endpoints.cancelCallback), 'refno', transaction.refno);

      paypalExpress.beginInstantPayment({
          'RETURNURL': completeCallbackUrl,
          'CANCELURL': cancelCallbackUrl,
          'CURRENCYCODE': input.currencyCode,
          'PAYMENTREQUEST_0_AMT': input.amount,
          'PAYMENTREQUEST_0_ITEMAMT': input.itemAmount,
          'PAYMENTREQUEST_0_TAXAMT': input.taxAmount,
          'PAYMENTREQUEST_0_DESC': input.description
        },
        function(err, data) {
          if (err) {
            seneca.log.debug('beginPayment: error', err);
            res.redirect(urlappend(failUrl, 'refno', input.refno));
          }
          else {
            seneca.log.debug('beginPayment: init transaction', data.payment_url);

            transaction.expressCheckout = data;
            transaction.status = 'started';

            seneca.act({role:'transaction', cmd:'update', id:transaction.id, data:transaction}, function(err) {
              seneca.log.debug('beginPayment: redirecting to', data.payment_url);

              res.redirect(data.payment_url)
            })
          }
        }
      )
    })
  }

  function completeCallbackHandler(req, res, next) {
    console.log('complete handler');

    var token = req.query['token'];
    var payerID = req.query['PayerID'];
    var refno = req.query['refno'];

    seneca.act({role:'transaction', cmd:'find', q:{'refno':refno}}, function(err, out) {
      if (err) {
        seneca.log.error('find', 'transaction', 'error', err, {token:token})
        res.redirect(urlappend(failUrl, 'refno', refno));
        return
      }

    var transaction = out.transaction;
    transaction.expressCheckout.PayerID = payerID;
    transaction.status = 'completed';

    seneca.act({role:'transaction', cmd:'update', id:transaction.id, data:transaction}, function(err) {

      res.redirect(urlappend(successUrl, 'refno', transaction.refno));

    }) })
  }

  function cancelCallbackHandler(req, res, next) {
    console.log('cancel handler');

    var token = req.query['token'];
    var payerID = req.query['PayerID'];
    var refno = req.query['refno'];

    seneca.act({role:'transaction', cmd:'find', q:{'refno':refno}}, function(err, out) {
      if (err) {
        seneca.log.error('find', 'transaction', 'error', err, {token:token})
        res.redirect(urlappend(failUrl, 'refno', refno));
        return
      }

    var transaction = out.transaction;
    transaction.expressCheckout.PayerID = payerID;
    transaction.status = 'cancelled';

    seneca.act({role:'transaction', cmd:'update', id:transaction.id, data:transaction}, function(err) {

      res.redirect(urlappend(failUrl, 'refno', refno));

    }) })
  }

}
