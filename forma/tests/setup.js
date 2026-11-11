/* Loads the two browser scripts shared with the mini app (window.CAT, window.GymProgress) into Node.
   Import this file first in a test, before any module from js/domain. */
import { createRequire } from "node:module";

globalThis.window = globalThis;
const require = createRequire(import.meta.url);
require("../shared/cat.js");
require("../shared/progress.js");
