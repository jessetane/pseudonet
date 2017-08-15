var dbus = require('dbus-native')
var Queue = require('queue')
var parallel = require('run-parallel')
var exec = require('child_process').exec

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
    this._lookupDbusInterfaces(this.sync)
    this.bus.database.on('change', this.sync)
    this._syncInterval = setInterval(this.sync, 5000)
  }

  close () {
    clearInterval(this._syncInterval)
  }

  sync () {
    if (!this.machined || !this.systemd || this.queue.length > 1) return
    this.queue.push(this._sync)
  }

  _sync (cb) {
    this._startAndStopMachines(err => {
      if (err) return cb(err)
      this._addAndRemoveLinks(cb)
    })
  }

  _lookupDbusInterfaces (cb) {
    var systemd = this.dbus.getService('org.freedesktop.systemd1')
    var machined = this.dbus.getService('org.freedesktop.machine1')
    parallel([
      cb => systemd.getInterface('/org/freedesktop/systemd1', 'org.freedesktop.systemd1.Manager', cb),
      cb => machined.getInterface('/org/freedesktop/machine1', 'org.freedesktop.machine1.Manager', cb)
    ], (err, results) => {
      if (err) return cb(err)
      this.systemd = systemd
      systemd.Manager = results[0]
      this.machined = machined
      machined.Manager = results[1]
      if (cb) cb()
    })
  }

  _listMachines (cb) {
    this.machined.Manager.ListMachines((err, _machines) => {
      if (err) return cb(err)
      var machines = {
        list: [],
        map: {}
      }
      var jobs = []
      _machines.forEach(machine => {
        var name = machine[0]
        if (name.indexOf('pn-') < 0) return
        var id = name.split('pn-')[1]
        var objectPath = machine[3]
        machine = { id, name, objectPath }
        machines.list.push(machine)
        machines.map[id] = machine
      })
      cb(null, machines)
    })
  }

  _listMachinesWithPids (cb) {
    this._listMachines((err, machines) => {
      if (err) return cb(err)
      var jobs = []
      machines.list.forEach(machine => {
        jobs.push(cb => {
          this.machined.getInterface(machine.objectPath, 'org.freedesktop.machine1.Machine', (err, iface) => {
            iface.Leader((err, pid) => {
              if (err) return cb(err)
              machine.pid = pid
              cb()
            })
          })
        })
      })
      parallel(jobs, err => {
        if (err) return cb(err)
        cb(null, machines)
      })
    })
  }

  _listMachinesWithLinks (cb) {
    this._listMachinesWithPids((err, machines) => {
      if (err) return cb(err)
      var jobs = []
      machines.list.forEach(machine => {
        jobs.push(cb => {
          exec(`nsenter -n -t ${machine.pid} ip link`, (err, stdout, stderr) => {
            if (err) return cb(err)
            var links = {}
            var lines = stdout.split('\n')
            for (var i = 0; i < lines.length; i += 2) {
              var line1 = lines[i]
              if (!line1) continue
              var name = line1.split(': ')[1]
              if (!name || name.indexOf('pn-') !== 0) continue
              var id = name.split('pn-')[1].split('@')[0]
              links[id] = {
                up: line1.split('<')[1].split('>')[0].split(',').indexOf('UP') > -1
              }
            }
            machine.links = links
            cb()
          })
        })
      })
      parallel(jobs, err => {
        if (err) return cb(err)
        cb(null, machines)
      })
    })
  }

  _startAndStopMachines (cb) {
    this._listMachines((err, runningMachines) => {
      if (err) return cb(err)
      var jobs = []
      var machinesById = {}
      this.bus.database.select({ type: 'machine' }, machine => {
        machinesById[machine.id] = machine
      })
      runningMachines.list.forEach(runningMachine => {
        var id = runningMachine.id
        var machine = machinesById[id]
        delete machinesById[id]
        if (machine && machine.enabled) return
        jobs.push(cb => {
          this.machined.Manager.TerminateMachine(runningMachine.name, cb)
        })
      })
      Object.keys(machinesById).forEach(id => {
        var machine = machinesById[id]
        if (!machine.enabled) return
        jobs.push(cb => {
          this.systemd.Manager.StartUnit(`pn-machine@${machine.image}_pn-${id}.service`, 'replace', cb)
        })
      })
      parallel(jobs, cb)
    })
  }

  _addAndRemoveLinks (cb) {
    this._listMachinesWithLinks((err, machines) => {
      if (err) return cb(err)
      var jobs = []
      machines.list.forEach(machine => {
        Object.keys(machine.links).forEach(idToPeer => {
          var parts = idToPeer.split('-')
          var linkId = parts[0]
          var link = this.bus.database.objects[linkId]
          var peerId = parts[1]
          var peer = machines.map[peerId]
          var idFromPeer = peer ? `${linkId}-${machine.id}` : null
          if (!link) {
            if (peer && peer.links) {
              delete peer.links[idFromPeer]
            }
            jobs.push(cb => {
              var cmd = `nsenter -n -t ${machine.pid} ip link del pn-${idToPeer}`
              exec(cmd, (err, stdout, stderr) => {
                if (err) return cb(err)
                delete machine.links[idToPeer]
                cb()
              })
            })
          } else if (!link.enabled && machine.links[idToPeer].up) {
            jobs.push(cb => {
              var cmd = `nsenter -n -t ${machine.pid} ip link set down dev pn-${idToPeer}`
              exec(cmd, (err, stdout, stderr) => {
                if (err) return cb(err)
                machine.links[idToPeer].up = false
                cb()
              })
            })
          }
        })
        this.bus.database.select({ type: 'link', start: machine.id }, link => {
          var peer = machines.map[link.end]
          if (!peer) return
          var idToPeer = `${link.id}-${peer.id}`
          var idFromPeer = `${link.id}-${machine.id}`
          var existingLink = machine.links[idToPeer]
          if (!existingLink) {
            jobs.push(cb => {
              var cmd = `ip link add name pn-${idToPeer} netns ${machine.pid} type veth peer name pn-${idFromPeer} netns ${peer.pid}`
              exec(cmd, (err, stdout, stderr) => {
                if (err) return cb(err)
                machine.links[idToPeer] = { up: false }
                peer.links[idFromPeer] = { up: false }
                setLinksUp(cb)
              })
            })
          } else if (link.enabled && !existingLink.up) {
            jobs.push(setLinksUp)
          }
          function setLinksUp (cb) {
            parallel([
              cb => exec(`nsenter -n -t ${machine.pid} ip link set up pn-${idToPeer}`, cb),
              cb => exec(`nsenter -n -t ${peer.pid} ip link set up pn-${idFromPeer}`, cb)
            ], err => {
              if (err) return cb(err)
              machine.links[idToPeer].up = true
              peer.links[idFromPeer].up = true
            })
            cb()
          }
        })
      })
      parallel(jobs, cb)
    })
  }
}
