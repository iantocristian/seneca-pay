/* Copyright (c) 2012-2013 Cristian Ianto, MIT License */
"use strict";

var _       = require('underscore')
var uuid    = require('node-uuid')

var name = "transaction"

module.exports = function(options) {
  var seneca = this;

  options = _.extend({
    transaction:{
      zone:null,
      base:'sys',
      name:'transaction'
    }
  },options)

  var log = seneca.log

  var transaction_ent


  function cmd_create(args, cb) {
    var tx = transaction_ent.make$()

    var data = _.omit(args.data,['id'])
    _.map(data, function(val,key){
      if( !key.match(/\$/) ) {
        tx[key] = val
      }
    })

    if (!tx['refno']) {
      tx['refno'] = new Buffer(uuid.v1(null, [])).toString('hex');
    }

    tx.save$(function(err, savedtx){
      log.info('transaction created')
      cb(err,{ok:!err,transaction:savedtx})
    })
  }

  function cmd_find(args,cb){
    var tx = transaction_ent.make$()

    var q = args.q

    tx.load$(q, function(err, tx) {
      if (err) {
        log.error('load','load','error','transaction', err, q)
        return cb(err);
      }
      if (!tx) {
        log.info('not found','transaction', q, tx)
        return cb(null, {transaction: null, ok:false})
      }

      log.info('load','transaction', q, tx)
      cb(null, {transaction:tx, ok:true})
    })
  }

  function cmd_update(args, cb){
    var tx = transaction_ent.make$()

    var q = {id:args.id}
    tx.load$(q, function(err, tx){

      if( err ) return cb(err,{ok:false})
      if( !tx ) return cb(new Error('not found'),{ok:false})

      var data = _.omit(args.data,['id'])
      _.map(data,function(val,key){
        if( !key.match(/\$/) ) {
          tx[key]=val
        }
      })

      tx.save$(function(err,tx){
        cb(err,{ok:!err, transaction:tx})
      })

    })
  }

  function cmd_clean(args, cb){
    var tx = args.transaction.data$()
    delete tx.$
    cb(null, tx)
  }


  transaction_ent  = seneca.make(options.transaction.zone, options.transaction.base, options.transaction.name);


  seneca.add({role:name, cmd:'create'}, cmd_create);
  seneca.add({role:name, cmd:'update'}, cmd_update);
  seneca.add({role:name, cmd:'find'}, cmd_find);
  seneca.add({role:name, cmd:'clean'}, cmd_clean);


  seneca.add({role:name, cmd:'entity'},function(args,cb) {
    cb(null, transaction_ent )
  })

}
