/* Copyright (c) 2012-2013 Cristian Ianto, MIT License */
"use strict";

var _              = require('underscore');
var URL            = require('url');
var qs             = require('querystring');

var PaypalExpress  = require('paypal-express').PaypalExpress;

var name = "pay-paypal-express"


module.exports = function(options){
  var seneca = this;

  var endpoints = {
    pay: '/pay/paypal-express/pay',
    completeCallback: '/pay/paypal-express/callback-complete',
    cancelCallback: '/pay/paypal-express/callback-cancel'
  }

  var paypalExpress;

  seneca.add({role:name, cmd:'init-gateway'}, function (args, done) {
    var options = args.options;

    if (options) {
      paypalExpress = new PaypalExpress(
        options.username,
        options.password,
        options.signature);

      paypalExpress.useSandbox(options.useSandbox);
    }

    done(null, paypalExpress)
  })

  var hostUrl;
  var successUrl, failUrl;

  seneca.add({role:name, cmd:'init-routes'}, function (args, done) {
    var routes = args.routes;

    if(args.redirect) {

      hostUrl = args.redirect.hostUrl;
      successUrl = args.redirect.success;
      failUrl = args.redirect.fail;

    } else {
      hostUrl = options.redirect.hostUrl;
      successUrl = options.redirect.success;
      failUrl = options.redirect.fail;
      
    }

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

    var input = req.body;

    var transactionData = {
      refno:input.refno,
      status:'created',
      customer: {
        name: input.name,
        company: input.company,
        email: input.email
      },
      item: {
        amount: input.itemAmount || item.amount,
        qty: input.itemQty || '1',
        description: input.itemDescription
      },
      description: input.description,
      priceTag: input.priceTag,
      amount: input.amount,
      currencyCode: input.currencyCode,
      plan: input.plan
    };

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
          'L_PAYMENTREQUEST_0_NAME0': input.itemName,
          'L_PAYMENTREQUEST_0_DESC0': (input.itemDescription || '').substring(0, 127),
          'L_PAYMENTREQUEST_0_AMT0': input.itemAmount || item.amount,
          'L_PAYMENTREQUEST_0_QTY0': input.itemQty || '1',
          'PAYMENTREQUEST_0_ITEMAMT': input.itemAmount || item.amount,
          'PAYMENTREQUEST_0_TAXAMT': input.taxAmount || '0.00',
          'PAYMENTREQUEST_0_AMT': input.amount,
          'PAYMENTREQUEST_0_DESC': (input.description || '').substring(0, 127),
          'PAYMENTREQUEST_0_CURRENCYCODE': 'USD'
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

  function makePayPalRequest(options, done) {
    paypalExpress.nvpreq.makeRequest(options, function(err, data) {
      if (err) return done(err);

      var response = qs.parse(data.toString());

      if (response.ACK === 'Success' || response.ACK === 'SuccessWithWarning') {
        done(null, { success:true, data:response })
      }
      else {
        done(null, { success:false, data:response })
      }
    })
  }

  function completeCallbackHandler(req, res, next) {

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

    function onDoExpressPaymentFailure(err) {
      seneca.log.error('complete-callback', 'pay-paypal-express', 'error', err, {token:token})

      transaction.status = 'failed';
      seneca.act({role:'transaction', cmd:'update', id:transaction.id, data:transaction}, function(err) {

        res.redirect(urlappend(failUrl, 'refno', refno));
      })
    }


    var getExpressCheckoutDetailsOptions = {
      'METHOD': 'GetExpressCheckoutDetails',
      'TOKEN': token
    };
    makePayPalRequest(getExpressCheckoutDetailsOptions, function(err, result) {

      if (err || !result.success) {
        onDoExpressPaymentFailure(err || new Error(result.data['L_LONGMESSAGE0']));
        return
      }

      var doExpressCheckoutPaymentOptions = {
        'METHOD': 'DoExpressCheckoutPayment',
        'TOKEN': token,
        'PAYMENTACTION': 'Sale',
  
        'PAYERID': result.data['PAYERID'],
        'PAYMENTREQUEST_0_AMT': result.data['PAYMENTREQUEST_0_AMT'],
        'PAYMENTREQUEST_0_ITEMAMT': result.data['PAYMENTREQUEST_0_ITEMAMT'],
        'PAYMENTREQUEST_0_TAXAMT': result.data['PAYMENTREQUEST_0_TAXAMT'],
        'PAYMENTREQUEST_0_CURRENCYCODE': result.data['PAYMENTREQUEST_0_CURRENCYCODE'],
  
        'PAYMENTREQUEST_0_SHIPTONAME': result.data['PAYMENTREQUEST_0_SHIPTONAME'],
        'PAYMENTREQUEST_0_SHIPTOSTREET': result.data['PAYMENTREQUEST_0_SHIPTOSTREET'],
        'PAYMENTREQUEST_0_SHIPTOSTREET2': result.data['PAYMENTREQUEST_0_SHIPTOSTREET2'],
        'PAYMENTREQUEST_0_SHIPTOCITY': result.data['PAYMENTREQUEST_0_SHIPTOCITY'],
        'PAYMENTREQUEST_0_SHIPTOSTATE': result.data['PAYMENTREQUEST_0_SHIPTOSTATE'],
        'PAYMENTREQUEST_0_SHIPTOZIP': result.data['PAYMENTREQUEST_0_SHIPTOZIP'],
        'PAYMENTREQUEST_0_SHIPTOCOUNTRYCODE': result.data['PAYMENTREQUEST_0_SHIPTOCOUNTRYCODE'],
        'PAYMENTREQUEST_0_SHIPTOPHONENUM': result.data['PAYMENTREQUEST_0_SHIPTOPHONENUM'],
        'PAYMENTREQUEST_0_PAYMENTACTION': 'Sale'
      };
      makePayPalRequest(doExpressCheckoutPaymentOptions, function(err, result) {

        if (err || !result.success) {
          onDoExpressPaymentFailure(err || new Error(result.data['L_LONGMESSAGE0']));
          return
        }

        transaction.status = 'completed';
        seneca.act({role:'transaction', cmd:'update', id:transaction.id, data:transaction}, function(err) {

          res.redirect(urlappend(successUrl, 'refno', transaction.refno));

        })
      })

    })
    })

  }

  function cancelCallbackHandler(req, res, next) {

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

      seneca.act({
        role:'transaction',
        cmd:'update',
        id:transaction.id,
        data:transaction
      }, function(err) {
        res.redirect(urlappend(failUrl, 'refno', refno));
      })
    })
  }
}
