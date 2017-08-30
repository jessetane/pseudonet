var Database = require('./')
var Emitter = require('events')
var Queue = require('queue')
var fs = require('fs')

module.exports = class ServerDatabase extends Database {
  constructor (opts = {}) {
    super(opts)
    this.dataFile = opts.dataFile || `${__dirname}/../data.json`
    try {
      this.objects = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'))
    } catch (err) {
      this.objects = {}
    }
    this.remoteInterface = new Emitter()
    this.remoteInterface.select = this.select.bind(this)
    this.queue = new Queue({
      concurrency: 1,
      autostart: true
    })
    this.on('change', patch => {
      this.remoteInterface.emit('change', patch)
      if (this.queue.length > 1) return
      this.queue.push(cb => {
        var json = JSON.stringify(this.objects, null, 2)
        fs.writeFile(this.dataFile, json, err => {
          if (err) {
            console.error('failed to persist database', err)
          }
          cb()
        })
      })
    })
  }
}
