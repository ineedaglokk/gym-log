/* App-wide constants. */

export const APP = { name: "ФОРМА", version: "0.2.0" };

/* Address of the FORMA server (server/worker.js on Cloudflare): accounts, journal sync, assistants.
   Empty until the server is deployed — the app then works without accounts and keeps records on the device only. */
export const API_URL = "";

/* Port of the local stand-in (`node server/dev.js`). It is used when the app itself is opened from this
   computer or from its home-network address (a phone in the same Wi-Fi): same host, this port. */
export const DEV_API_PORT = 8787;
