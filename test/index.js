process.env.DATA_FILE = process.env.DATA_FILE || `/tmp/${Math.random()}.json`
process.env.HOST = process.env.HOST || '127.0.0.1'
process.env.PORT = process.env.PORT || 7357
process.env.SECRET = 'test-secret'

var tape = require('tape')
var WebSocket = require('uws')
var Rpc = require('rpc-events')

var server = null
var client = null

tape('start server', t => {
  t.plan(1)
  server = require('../')
  server.webSocketServer.once('listening', t.pass)
})

tape('connect to server', t => {
  t.plan(1)
  var socket = new WebSocket('ws://' + process.env.HOST + ':' + process.env.PORT)
  client = new Rpc({
    serialize: JSON.stringify,
    deserialize: JSON.parse
  })
  client.send = socket.send.bind(socket)
  socket.onmessage = evt => client.receive(evt.data)
  socket.onerror = t.fail
  socket.onopen = t.pass
})

tape('signin', t => {
  t.plan(1)
  client.call('authenticate', process.env.SECRET, err => {
    t.error(err)
  })
})

tape('create network', t => {
  t.plan(7)
  var networkId = null
  client.subscribe('database.change', onchange)
  function onchange (changes) {
    t.ok(changes)
    t.equal(typeof changes, 'object')
    var ids = Object.keys(changes)
    t.equal(ids.length, 1)
    networkId = ids[0]
    client.unsubscribe('database.change', onchange)
  }
  client.call('networks.add', (err, id) => {
    t.error(err)
    t.ok(id)
    t.equal(id, networkId)
    t.equal(id, server.database.objects[id].id)
  })
})

tape('shutdown', t => {
  server.webSocketServer.server.close()
  server.containerEngine.close()
  t.end()
})
