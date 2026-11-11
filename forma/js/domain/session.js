/* Signing up, in and out: what happens to the account and to the records on the device.
   - The password is typed once per device; after that the device signs in by itself (core/account.js).
   - Records made on the device before it had an account move into the account.
   - One device never mixes two people: signing in as someone else first clears the local copy.
   - Signing out clears the local copy; the account keeps everything. */

import { resetLocal, flush } from "../core/store.js";
import { api, account, setAccount, ApiError } from "../core/account.js";
import { startSync, syncNow, adoptLocal } from "../core/sync.js";

/* a. the server accepted the nickname and password; b. bring the device and the account together.
   If the records could not be loaded the sign-in does not count: the person would see an empty app. */
async function enter(a) {
  const prev = account();
  if (prev && prev.nick !== a.nick) await resetLocal();
  startSync();
  setAccount({ nick: a.nick, name: a.name, token: a.token });
  adoptLocal();
  if (await syncNow()) { await flush(); return; }
  api("/auth/logout").catch(err => console.warn("could not end the unused session", err));
  setAccount({ nick: a.nick, name: a.name, token: "" });
  throw new ApiError(0, "no records");
}

export const signUp = async (nick, password) => enter(await api("/auth/register", { nick, password }, { auth: false }));
export const signIn = async (nick, password) => enter(await api("/auth/login", { nick, password }, { auth: false }));

/* a new password from this (signed-in) device; every other device has to sign in again */
export const changePassword = password => api("/auth/password", { password });

/* ends the session on the server (best effort: without a connection the device still signs out) and clears the device */
export async function signOut() {
  try { await api("/auth/logout"); }
  catch (err) { console.warn("the server did not confirm the sign-out", err); }
  await resetLocal();
  startSync();
  setAccount(null);
}
