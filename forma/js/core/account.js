/* The account on this device and the calls to the FORMA server.
   The device never keeps the password: after signing in it holds a random session token
   (device-only record "@account": { nick, name, token }). An empty token means "signed out, but the
   nickname is remembered" — the server no longer accepts this device (the password was changed elsewhere). */

import { API_URL, DEV_API_PORT } from "../config.js";
import { getMeta, setMeta, emit } from "./store.js";

/* development: the app is opened from this computer or by its home-network address / .local name */
const DEV_HOST = /^(localhost|127\.0\.0\.1|10(\.\d+){3}|192\.168(\.\d+){2}|172\.(1[6-9]|2\d|3[01])(\.\d+){2}|[a-z0-9-]+\.local)$/i;
function devApi() {
  const host = globalThis.location?.hostname || "";
  return DEV_HOST.test(host) ? `http://${host}:${DEV_API_PORT}` : "";
}
export const apiUrl = () => (API_URL || devApi()).replace(/\/+$/, "");
/* false until a server exists: the app then works as before, without accounts */
export const accountsOn = () => !!apiUrl();
export const account = () => getMeta("@account");
export const signedIn = () => !!account()?.token;
export const setAccount = a => { setMeta("@account", a); emit("account"); };

/* status 0 = the server could not be reached; code is the server's { error } or "offline" / "timeout" */
export class ApiError extends Error {
  constructor(status, code, data = {}) { super(code); this.status = status; this.code = code; this.data = data; }
}

/* POST JSON to the server → the parsed answer; throws ApiError. A 401 on a signed request means the
   session is over: the device is marked as signed out and the app shows the sign-in screen. */
export async function api(path, body = {}, { auth = true, timeout = 20000 } = {}) {
  const headers = { "content-type": "application/json" }, text = JSON.stringify(body);
  if (auth) headers.authorization = "Bearer " + (account()?.token || "");
  let res;
  try {
    /* keepalive lets a small request finish even if the app is being closed */
    res = await fetch(apiUrl() + path, { method: "POST", headers, body: text, signal: AbortSignal.timeout(timeout), keepalive: text.length < 30000 });
  } catch (err) {
    throw new ApiError(0, err && err.name === "TimeoutError" ? "timeout" : "offline");
  }
  let data = null;
  try { data = await res.json(); }
  catch (err) { console.warn("server answered with something that is not JSON", res.status, err); }
  if (res.ok && data) return data;
  if (res.status === 401 && auth && signedIn()) setAccount({ ...account(), token: "" });
  throw new ApiError(res.status, (data && data.error) || "bad answer", data || {});
}

const wait = sec => (sec >= 3600 ? `${Math.ceil(sec / 3600)} ч` : `${Math.max(1, Math.ceil(sec / 60))} мин`);

/* what to tell the person when a call failed */
export function errorText(err) {
  if (!(err instanceof ApiError)) return "Что-то пошло не так — попробуй ещё раз";
  const retry = err.data.retry;
  switch (err.code) {
    case "offline": case "timeout": return "Нет связи с сервером — проверь интернет и попробуй ещё раз";
    case "bad nick": return "Ник: от 3 до 20 букв или цифр, без пробелов";
    case "bad password": return "Пароль: от 4 символов";
    case "nick taken": return "Такой ник уже занят — придумай другой";
    case "wrong password": return retry ? `Неверный ник или пароль. Следующая попытка — через ${wait(retry)}` : "Неверный ник или пароль";
    case "locked": return `Слишком много попыток. Попробуй через ${wait(retry)}`;
    case "signup closed": return "Регистрация сейчас закрыта";
    case "no free places": return "Свободных мест не осталось";
    case "account is full": return "В аккаунте закончилось место";
    case "no session": return "Нужно войти заново";
    case "no records": return "Не получилось загрузить записи — попробуй ещё раз";
    default: return "Сервер не ответил как надо — попробуй позже";
  }
}
