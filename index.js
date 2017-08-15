var Emitter = require('events')
var Database = require('./database/server')
var ContainerEngine = require('./container-engine')
var WebSocketServer = require('./websocket-server')
var Auth = require('./auth')
var Networks = require('./networks')
var Machines = require('./machines')
var Links = require('./links')

var bus = module.exports = new Emitter()

bus.database = new Database({
  bus,
  dataFile: process.env.DATA_FILE
})

bus.containerEngine = new ContainerEngine({
  bus,
  driver: process.env.CONTAINER_ENGINE
})

bus.webSocketServer = new WebSocketServer({
  bus,
  host: process.env.HOST,
  port: process.env.PORT
})

bus.auth = new Auth({
  bus,
  secret: process.env.SECRET
})

bus.networks = new Networks({ bus })
bus.machines = new Machines({ bus })
bus.links = new Links({ bus })
