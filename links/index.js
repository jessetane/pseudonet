module.exports = class Links {
  constructor (opts) {
    this.bus = opts.bus
  }

  add (startMachineId, endMachineId, cb) {
    if (typeof cb !== 'function') return
    var db = this.bus.database
    var start = db.objects[startMachineId]
    if (!start || start.type !== 'machine') {
      cb(new Error('start machine not found'))
      return
    }
    var end = db.objects[endMachineId]
    if (!end) {
      cb(new Error('end machine not found'))
      return
    }
    var id = db.create()
    var patch = {
      [id]: {
        id,
        type: 'link',
        enabled: true,
        start: startMachineId,
        end: endMachineId
      }
    }
    db.update(patch)
    cb(null, id)
  }

  remove (id, cb) {
    if (typeof cb !== 'function') return
    var db = this.bus.database
    var link = db.objects[id]
    if (!link || link.type !== 'link') {
      cb(new Error('link not found'))
      return
    }
    db.update({ [id]: null })
    cb()
  }

  list (machineId, cb) {
    if (typeof machineId === 'function') {
      cb = machineId
      machineId = undefined
    }
    if (typeof cb !== 'function') return
    var links = []
    this.bus.database.select({ type: 'link' }, link => links.push(link))
    if (machineId) {
      links = links.filter(link => link.start === machineId || link.end === machineId)
    }
    cb(null, links)
  }
}
