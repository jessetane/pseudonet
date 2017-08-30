var Emitter = require('events')
var ws = require('uws')
var Rpc = require('rpc-events')

module.exports = class WebSocketServer extends Emitter {
  constructor (opts = {}) {
    super()
    this.bus = opts.bus
    this.host = opts.host || '::'
    this.port = opts.port || 8080
    this.clients = {}
    this.server = new ws.Server({
      host: this.host,
      port: this.port
    }, err => {
      if (err) throw err
      console.log(`websocket server listening on ${this.host}:${this.port}`)
    })
    this.server.on('connection', socket => {
      var id = `${socket.remoteAddress}:${socket.remotePort}`
      var client = this.clients[id] = new Rpc({
        id,
        serialize: JSON.stringify,
        deserialize: JSON.parse,
        send: socket.send.bind(socket),
        socket
      })
      socket.on('message', evt => client.receive(evt))
      socket.on('close', () => {
        client.close()
        delete this.clients[client.id]
      })
      this.bus.emit('client', client)
    })
    this.server.on('listening', () => this.emit('listening'))
  }
}
