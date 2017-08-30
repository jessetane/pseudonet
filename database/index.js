var Emitter = require('events')
var getRandomValues = require('get-random-values')

module.exports = class Database extends Emitter {
  constructor (opts = {}) {
    super()
    this.objects = opts.objects || {}
  }

  create (n = 2) {
    var id = genId(n)
    while (this.objects[id]) id = genId(n)
    return id
  }

  forEach (query, fn) {
    for (var id in this.objects) {
      var object = this.objects[id]
      var matches = true
      for (var key in query) {
        if (object[key] !== query[key]) {
          matches = false
          break
        }
      }
      if (matches) {
        fn(object)
      }
    }
  }

  select (query, cb) {
    var objects = []
    this.forEach(query, objects.push.bind(objects))
    if (cb) cb(null, objects)
    return objects
  }

  update (patch) {
    for (var id in patch) {
      var object = patch[id]
      if (object === null) {
        delete this.objects[id]
      } else {
        this.objects[id] = object
      }
    }
    this.emit('change', patch)
  }
}

function genId (n) {
  // XXX hex only gives us 16 possibilities per byte
  // we should be able to do a bit better than that
  // e.g. A-Za-z0-9
  return Array.from(
    getRandomValues(new Uint8Array(n))
  ).map(c => c.toString(16)).join('')
}
