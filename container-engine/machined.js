var dbus = require('dbus-native')
var Queue = require('queue')
var exec = require('child_process').exec

var PREFIX = process.env.PREFIX = process.env.PREFIX || 'pn'
var DEBUG = false

module.exports = class ContainerEngine {
  constructor (opts) {
    this.bus = opts.bus
    this.sync = this.sync.bind(this)
    this._sync = this._sync.bind(this)
    if (process.env.DBUS_HOST) {
      // tcp
      this.dbus = dbus.createClient({
        host: process.env.DBUS_HOST,
        port: process.env.DBUS_PORT,
        authMethods: ['ANONYMOUS']
      })
    } else {
      // unix socket
      this.dbus = dbus.systemBus()
    }
    this.queue = new Queue({
      concurrency: 1,
      autostart: true
    })
    this.queue.on('error', err => {
      console.error(err)
    })
    this._setupDbusInterfaces(this.sync)
    this.bus.database.on('change', this.sync)
  }

  sync () {
    if (!this.machined || !this.systemd || this.queue.length > 1) return
    this.queue.push(this._sync)
  }

  _sync (cb) {
    var ctx = {}
    this._syncMachines(ctx, err => {
      if (err) return cb(err)
      this._syncLinks(ctx, cb)
    })
  }

  _syncMachines (ctx, cb) {
    this._listMachines((err, runningMachines) => {
      if (err) return cb(err)
      ctx.runningMachines = runningMachines
      var q = new Queue()
      Object.keys(runningMachines).forEach(id => {
        var runningMachine = runningMachines[id]
        var machine = this.bus.database.objects[runningMachine.id]
        if (machine && machine.enabled) return
        runningMachine.stopping = true
        q.push(cb => this.machined.Manager.TerminateMachine(runningMachine.name, function (err) {
          if (DEBUG) {
            console.log('TerminateMachine', runningMachine.name)
            console.log(Array.from(arguments))
          }
          cb(err)
        }))
      })
      this.bus.database.forEach({ type: 'machine' }, machine => {
        var id = machine.id
        if (!machine.enabled || runningMachines[id]) return
        var service = `${PREFIX}-machine@${machine.image}_${PREFIX}-${id}.service`
        q.push(cb => this.systemd.Manager.StartUnit(service, 'replace', function (err) {
          if (DEBUG) {
            console.log('StartUnit', service)
            console.log(Array.from(arguments))
          }
          cb(err)
        }))
      })
      q.start(cb)
    })
  }

  _syncLinks (ctx, cb) {
    var runningMachines = ctx.runningMachines
    var removing = {}
    var q = new Queue()
    Object.keys(runningMachines).forEach(id => {
      var runningMachine = runningMachines[id]
      if (runningMachine.stopping) return
      q.push(cb => {
        var qq = new Queue({ concurrency: 1 })
        qq.push(cb => this._updatePidForMachine(runningMachine, cb))
        qq.push(cb => this._updateLinkStateForMachine(runningMachine, cb))
        qq.start(err => {
          if (err) return cb(err)
          Object.keys(runningMachine.links).forEach(id => {
            var link = this.bus.database.objects[id]
            if (link || removing[id]) return
            removing[id] = true
            link = runningMachine.links[id]
            var peer = runningMachines[link.end]
            if (peer && peer.stopping) return
            var cmd = `nsenter -n -t ${runningMachine.pid} ip link del ${link.name}`
            q.push(cb => exec(cmd, function (err) {
              if (DEBUG) {
                console.log(cmd)
                console.log(Array.from(arguments))
              }
              cb(err)
            }))
          })
          cb()
        })
      })
    })
    q.start(err => {
      if (err) return cb(err)
      q = new Queue()
      Object.keys(runningMachines).forEach(id => {
        var runningMachine = runningMachines[id]
        if (runningMachine.stopping) return
        this.bus.database.forEach({ type: 'link', start: runningMachine.id }, link => {
          var peer = runningMachines[link.end]
          if (!peer || !peer.pid || peer.stopping || runningMachine.links[link.id]) return
          peer.links[link.id] = {}
          var cmd = `nsenter -n -t ${runningMachine.pid}
ip link add name ${PREFIX}-${link.id}-${link.end} netns ${runningMachine.pid} type veth
peer name ${PREFIX}-${link.id}-${link.start} netns ${peer.pid}`.replace(/\n/g, ' ')
          q.push(cb => exec(cmd, function (err) {
            if (DEBUG) {
              console.log(cmd)
              console.log(Array.from(arguments))
            }
            cb(err)
          }))
        })
      })
      q.start(cb)
    })
  }

  _updatePidForMachine (machine, cb) {
    this.machined.getInterface(machine.objectPath, 'org.freedesktop.machine1.Machine', (err, iface) => {
      if (err) return cb(err)
      iface.Leader((err, pid) => {
        if (err) return cb(err)
        machine.pid = pid
        cb()
      })
    })
  }

  _updateLinkStateForMachine (machine, cb) {
    var cmd = `nsenter -n -t ${machine.pid} ip link`
    exec(cmd, function (err, stdout) {
      if (DEBUG) {
        console.log(cmd)
        console.log(Array.from(arguments))
      }
      if (err) return cb(err)
      var links = {}
      var lines = stdout.split('\n')
      for (var i = 0; i < lines.length; i += 2) {
        var line1 = lines[i]
        if (!line1) continue
        var name = line1.split(': ')[1]
        if (!name || name.indexOf(`${PREFIX}-`) !== 0) continue
        name = name.split('@')[0]
        var parts = name.split('-')
        if (parts.length !== 3) continue
        var id = parts[1]
        var end = parts[2]
        links[id] = {
          name,
          end,
          // up: line1.split('<')[1].split('>')[0].split(',').indexOf('UP') > -1
        }
      }
      machine.links = links
      cb()
    })
  }

  _listMachines (cb) {
    this.machined.Manager.ListMachines((err, runningMachines) => {
      if (err) return cb(err)
      var machines = {}
      runningMachines.forEach(machine => {
        var name = machine[0]
        if (name.indexOf(`${PREFIX}-`) < 0) return
        var id = name.split(`${PREFIX}-`)[1]
        var objectPath = machine[3]
        machine = { id, name, objectPath }
        machines[id] = machine
      })
      cb(null, machines)
    })
  }

  _setupDbusInterfaces (cb) {
    var systemd = this.dbus.getService('org.freedesktop.systemd1')
    var machined = this.dbus.getService('org.freedesktop.machine1')
    var q = new Queue({ results: [] })
    q.push(
      cb => systemd.getInterface('/org/freedesktop/systemd1', 'org.freedesktop.systemd1.Manager', cb),
      cb => machined.getInterface('/org/freedesktop/machine1', 'org.freedesktop.machine1.Manager', cb)
    )
    q.start((err, results) => {
      if (err) return cb(err)
      this.systemd = systemd
      systemd.Manager = results[0][0]
      this.machined = machined
      machined.Manager = results[1][0]
      this.machined.Manager.on('MachineNew', this.sync)
      if (cb) cb()
    })
  }
}
