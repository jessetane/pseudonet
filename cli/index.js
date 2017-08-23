#!/usr/bin/env node

process.env.HOST = process.env.HOST || '127.0.0.1'
process.env.PORT = process.env.PORT || 8080
process.env.SECRET = process.env.SECRET || 'pseudonet'

var args = process.argv.slice(2)

var WebSocket = require('uws')
var Rpc = require('rpc-events')

var socket = new WebSocket('ws://' + process.env.HOST + ':' + process.env.PORT)
socket.onmessage = evt => client.receive(evt.data)
socket.onerror = err => { throw err }
socket.onopen = () => {
  client.call('authenticate', process.env.SECRET, err => {
    if (err) throw err
    client.call.apply(client, args.concat(function (err, result) {
      if (err) {
        console.error(err.message)
        process.exit(1)
      }
      console.log(result || 'ok')
      socket.close()
    }))
  })
}

var client = new Rpc({
  serialize: JSON.stringify,
  deserialize: JSON.parse,
  send: socket.send.bind(socket),
  timeout: 1000
})
