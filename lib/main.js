/* Copyright (c) 2013 Cristian Ianto, MIT License */
"use strict";


var fs            = require('fs')
var dispatch      = require('dispatch')

var _              = require('underscore')
var PaypalExpress  = require('paypal-express');

var name = "pay"


module.exports = function(options, register) {
  var seneca = this

  options = this.util.deepextend({
    config: {},
    redirect: {
      success: '/',
      fail: '/'
    },
    paypalExpress: {
      useSandbox:true,
      username: 'sdk-three_api1.sdk.com',
      password: 'QFZCWN5HZM8VBG7Q',
      signature: 'A-IzJhZZjhg29XQ2qnhapuwxIDzyAZQ92FRP5dqBzVesOkzbdUONzmOU'
    },
    eventHandlers: {}
  },options)


  seneca.add({role:name,cmd:'checkout'}, function(args, done) {
    var seneca = this;

    function do_checkout() {
      var checkoutargs = _.extend({}, args, {cmd:null, hook:'checkout'});

      seneca.log.debug('checkout');
      seneca.act(checkoutargs,done);
    }
  })


  seneca.add({role:name, hook:'checkout'}, function(args, done) {

      done(null,{ok:true,details:null})
  })


  seneca.add({role:name, hook:'init'}, function(args, done) {
    var routes = {};
    var options = _.extend({}, args.options, {routes:routes});

    seneca.act({role:name, hook:'init', sub:'gateway', options:options}, function(err) {
    seneca.act({role:name,hook:'init', sub:'routes', options:options, routes:routes}, function( err, routes ){

      var dispatcher = dispatch(routes);

      var service = function(req,res,next) {

        // tmp hack // TODO: review ???
        if( req.url.match( /(\.js|\.ico|\.css|\.png|\.json)/ ) ) {
          return next()
        }

        dispatcher(req,res,next)
      }

      done(null, service)

    }) })
  })


  require('./paypal/express').call(seneca);


  seneca.add({role:name, hook:'init', sub:'gateway'}, function (args, done) {
    console.log('pay: init gateway')

    var actargs = {role:'pay-paypal-express', cmd:'init-gateway', options:args.options.paypalExpress};
    seneca.act(actargs, function(err) {
      done(err)
    })
  })

  seneca.add({role:name, hook:'init', sub:'routes'}, function (args, done) {
    console.log('pay: init routes')

    var actargs = {role:'pay-paypal-express', cmd:'init-routes', options:args.options, routes:args.routes, redirect:args.options.redirect};
    seneca.act(actargs, function(err, routes) {
      done(err, routes)
    })
  })


  process.nextTick(function() {
    seneca.act( {role:name,hook:'init',options:options}, function(err, service) {
      register(err,{
        name:name,
        service:service
      })
    })
  })

}
