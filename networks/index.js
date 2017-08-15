module.exports = class Networks {
  constructor (opts) {
    this.bus = opts.bus
  }

  add (cb) {
    if (typeof cb !== 'function') return
    var id = this.bus.database.create()
    this.bus.database.update({
      [id]: {
        id,
        type: 'network'
      }
    })
    cb(null, id)
  }

  remove (id, cb) {
    if (typeof cb !== 'function') return
    var db = this.bus.database
    var network = db.objects[id]
    if (!network || network.type !== 'network') {
      cb(new Error('network not found'))
      return
    }
    var patch = {}
    patch[id] = null
    db.select({ type: 'machine', network: id }, machine => {
      patch[machine.id] = null
      db.select({ type: 'link', start: machine.id }, link => {
        patch[link.id] = null
      })
    })
    db.update(patch)
    cb()
  }

  list (cb) {
    if (typeof cb !== 'function') return
    var networks = []
    this.bus.database.select({ type: 'network' }, network => networks.push(network))
    cb(null, networks)
  }

  setName (name, cb) {
    if (typeof cb !== 'function') return
    var db = this.bus.database
    var network = db.objects[id]
    if (!network || network.type !== 'network') {
      cb(new Error('network not found'))
      return
    }
    network.name = true
    db.update({ [id]: network })
    cb()
  }
}
