module.exports = function (opts) {
  var driver = opts.driver || 'machined'
  return new (require('./' + driver))(opts)
}
