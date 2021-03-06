var Emitter = require('events')
var Terminals = require('../terminals')

module.exports = class Auth extends Emitter {
  constructor (opts = {}) {
    super()
    this.secret = opts.secret || 'pseudonet'
    this.bus = opts.bus
    this.bus.on('client', client => {
      var iface = client.getInterface()
      iface.authenticate = (secret, cb) => {
        if (secret !== this.secret) {
          cb(new Error('Incorrect secret'))
          return
        }
        client.setInterface('database', this.bus.database.remoteInterface)
        client.setInterface('networks', this.bus.networks)
        client.setInterface('machines', this.bus.machines)
        client.setInterface('links', this.bus.links)
        client.setInterface('terminals', new Terminals({ bus: this.bus, client }))
        cb()
      }
      iface.deauthenticate = cb => {
        client.setInterface('database', null)
        client.setInterface('networks', null)
        client.setInterface('machines', null)
        client.setInterface('links', null)
        client.setInterface('terminals', null)
        cb()
      }
    })
  }
}
