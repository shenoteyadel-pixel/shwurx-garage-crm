// Test-only preload: Next.js supplies "server-only" at build time; under plain
// Node it is absent, so resolve it to an empty module for route-level tests.
// Covers both ESM resolution and tsx's CommonJS require path.
import Module, { registerHooks } from "node:module"
import { fileURLToPath } from "node:url"

const EMPTY = fileURLToPath(new URL("./empty-module.cjs", import.meta.url))

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: new URL("./empty-module.cjs", import.meta.url).href, shortCircuit: true }
    return next(specifier, context)
  },
})

const original = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return EMPTY
  return original.call(this, request, ...rest)
}
