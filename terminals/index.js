var pty = require('pty.js')

var terminals = {}

module.exports = class Terminals {
  constructor (opts) {
    this.bus = opts.bus
    this.client = opts.client
  }

  open (machineId, cb) {
    if (typeof cb !== 'function') return
    var machine = this.bus.database.objects[machineId]
    if (!machine || machine.type !== 'machine' || !machine.enabled) {
      cb(new Error('invalid machine'))
      return
    }
    var client = this.client
    var socket = client.socket
    var id = Math.random()
    var terminal = terminals[id] = pty.spawn('/usr/bin/machinectl', [ 'login', `${process.env.PREFIX}-${machineId}` ])
    terminal.on('error', err => {
      console.error(err)
      terminal.destroy()
      socket.close()
    })
    cb(null, id)
    client.close()
    client.close = () => {
      terminal.destroy()
      delete terminals[id]
    }
    client.receive = message => {
      terminal.write(message)
    }
    terminal.on('data', data => socket.send(data))
  }

  resize (id, x, y, cb) {
    if (typeof cb !== 'function') return
    var terminal = terminals[id]
    if (!terminal) {
      cb(new Error('terminal not found'))
      return
    }
    try {
      terminal.resize(x, y)
      cb()
    } catch (err) {
      cb(err)
    }
  }
}
