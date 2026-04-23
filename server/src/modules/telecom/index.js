// Public surface of the telecom module.
// Other modules must import from this file, not from internal paths.

module.exports = {
  // Router
  simcardsRoutes: require('./simcards.routes'),
};
