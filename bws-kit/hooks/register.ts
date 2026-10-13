// bws-kit is a folder of vendored modules, not a plugin. The test runner needs a hooks module to load, so this one
// registers nothing; the kit's tests import the pure modules beside it directly.
export function register() {}
