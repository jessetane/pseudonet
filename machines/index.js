module.exports = class Machines {
  constructor (opts) {
    this.bus = opts.bus
  }

  add (networkId, image, cb) {
    if (typeof cb !== 'function') return
    var db = this.bus.database
    var network = db.objects[networkId]
    if (!network) {
      cb(new Error('unknown network'))
      return
    }
    if (!image || typeof image !== 'string') {
      cb(new Error('invalid image'))
      return
    }
    var id = db.create()
    var patch = {
      [id]: {
        id,
        type: 'machine',
        enabled: true,
        network: networkId,
        image
      }
    }
    db.update(patch)
    cb(null, id)
  }

  remove (id, cb) {
    if (typeof cb !== 'function') return
    var db = this.bus.database
    var machine = db.objects[id]
    if (!machine || machine.type !== 'machine') {
      cb(new Error('machine not found'))
      return
    }
    var patch = {}
    patch[id] = null
    db.forEach({ type: 'link', start: machine.id }, link => {
      patch[link.id] = null
    })
    db.forEach({ type: 'link', end: machine.id }, link => {
      patch[link.id] = null
    })
    db.update(patch)
    cb()
  }

  list (networkId, cb) {
    if (typeof networkId === 'function') {
      cb = networkId
      networkId = undefined
    }
    if (typeof cb !== 'function') return
    var machines = []
    if (networkId) {
      this.bus.database.forEach({ type: 'machine', network: networkId }, machine => machines.push(machine))
    } else {
      this.bus.database.forEach({ type: 'machine' }, machine => machines.push(machine))
    }
    cb(null, machines)
  }

  start (id, cb) {
    if (typeof cb !== 'function') return
    var db = this.bus.database
    var machine = db.objects[id]
    if (!machine || machine.type !== 'machine') {
      cb(new Error('machine not found'))
      return
    }
    machine.enabled = true
    db.update({ [id]: machine })
    cb()
  }

  stop (id, cb) {
    if (typeof cb !== 'function') return
    var db = this.bus.database
    var machine = db.objects[id]
    if (!machine || machine.type !== 'machine') {
      cb(new Error('machine not found'))
      return
    }
    machine.enabled = false
    db.update({ [id]: machine })
    cb()
  }
}
