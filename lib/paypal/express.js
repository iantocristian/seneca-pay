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
    options = args.options;

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
    successUrl = args.redirect.successUrl;
    failUrl = args.redirect.failUrl;

    routes[endpoints.pay] = { POST: payHandler };
    routes[endpoints.completeCallback] = {/*...*/};
    routes[endpoints.cancelCallback] = {/*...*/};

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

    completeCallbackUrl = urljoin(host, endpoints.completeCallback);
    cancelCallbackUrl = urljoin(host, endpoints.cancelCallback);

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
          seneca.log.debug('beginPayment: redirecting to', data.payment_url);
          res.redirect(data.payment_url)
        }
      }
    )
  }
}
