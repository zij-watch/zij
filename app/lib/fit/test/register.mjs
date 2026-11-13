// Lets Node run the library's TypeScript as it is: imports without an extension
// ("./m4", as Next.js wants them) are tried with ".ts".
//
//   node --import ./lib/fit/test/register.mjs --test lib/fit/test/     (from app/, Node 22.15 or later)

import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$|\.json$/.test(specifier)) {
      try {
        return nextResolve(specifier + ".ts", context);
      } catch {
        // not a TypeScript file: fall through to the usual error
      }
    }
    return nextResolve(specifier, context);
  },
});
