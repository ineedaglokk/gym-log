/* Sign in / sign up: a nickname and a password. Typed once per device — after that the device
   signs in by itself. Shown whenever a server exists and nobody is signed in on this device. */

import { S } from "../core/store.js";
import { replace } from "../core/router.js";
import { $, esc, actions, on } from "../core/dom.js";
import { icon } from "../ui/icons.js";
import { account, errorText } from "../core/account.js";
import { signIn, signUp } from "../domain/session.js";

let root, mode, busy, f;

/* "someone has signed in on this device before" — only to open the right tab; survives signing out */
const SEEN = "forma:signed-in-before";
function seenBefore() { try { return localStorage.getItem(SEEN) === "1"; } catch { return false; } }
function rememberSeen() { try { localStorage.setItem(SEEN, "1"); } catch (err) { console.warn("could not remember the sign-in tab", err); } }

const MODES = {
  in: {
    title: "С возвращением", text: "Войди — и все записи будут на месте.", btn: "Войти", wait: "Вхожу…",
    hint: "Пароль вводится один раз — дальше это устройство входит само.", nick: "твой ник", pass: "пароль", auto: "current-password",
  },
  up: {
    title: "Создай аккаунт", text: "Тренировки, еда и прогресс сохраняются в нём и открываются с любого устройства.", btn: "Создать аккаунт", wait: "Создаю…",
    hint: "Пароль — любой, от 4 символов. Запомни его: он понадобится для входа с другого устройства.", nick: "например, vlad", pass: "от 4 символов", auto: "new-password",
  },
};

function draw() {
  const m = MODES[mode];
  root.innerHTML = `<div class="auth">
<div class="auth__hero">
  <div class="ob__logo auth__logo"><svg viewBox="0 0 64 64" width="44" height="44"><path d="M18 46V18h28M18 32h20" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
  <h1 class="h1 auth__title">${m.title}</h1>
  <p class="c2 mt8">${m.text}</p>
</div>
<div class="seg">${[["up", "Регистрация"], ["in", "Вход"]].map(([k, n]) => `<button type="button" data-act="mode" data-v="${k}" class="${mode === k ? "is-on" : ""}" aria-pressed="${mode === k}">${n}</button>`).join("")}</div>
<form class="stack mt20" data-form novalidate>
  <label class="field"><span class="field__label">Никнейм</span><input class="input" data-f="nick" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="20" enterkeyhint="next" placeholder="${m.nick}" value="${esc(f.nick)}"></label>
  <div class="field"><label class="field__label" for="auth-pass">Пароль</label><div class="auth__pass"><input class="input" id="auth-pass" data-f="pass" name="password" type="password" autocomplete="${m.auto}" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="64" enterkeyhint="go" placeholder="${m.pass}" value="${esc(f.pass)}"><button class="iconbtn auth__eye" type="button" data-act="eye" aria-label="Показать пароль" aria-pressed="false">${icon("eye", 20)}</button></div></div>
  <p class="auth__msg" data-msg role="status"></p>
  <button class="btn" type="submit" data-go>${m.btn}</button>
</form>
</div>`;
  say("");
}

/* the line under the fields: an error, or the hint of the current mode */
function say(error) {
  const el = $("[data-msg]", root), known = account();
  el.classList.toggle("is-err", !!error);
  el.textContent = error || (mode === "in" && known && !known.token ? "На этом устройстве нужно войти заново: пароль сменили или вход устарел." : MODES[mode].hint);
}
function setBusy(on) {
  busy = on;
  const b = $("[data-go]", root);
  b.disabled = on; b.textContent = on ? MODES[mode].wait : MODES[mode].btn;
}

/* the same rules as on the server, so an obvious slip is caught before the request → [field, text] or null */
function slip() {
  const nick = f.nick.trim();
  if (nick.length < 3) return ["nick", "Ник — от 3 символов"];
  if (!/^[a-zа-яё0-9_.-]{3,20}$/i.test(nick)) return ["nick", "В нике — только буквы, цифры и знаки _ . - (без пробелов)"];
  if (f.pass.length < 4) return ["pass", "Пароль — от 4 символов"];
  return null;
}

async function submit() {
  if (busy) return;
  const bad = slip();
  if (bad) { say(bad[1]); $(`[data-f="${bad[0]}"]`, root).focus(); return; }
  say(""); setBusy(true);
  try {
    await (mode === "in" ? signIn : signUp)(f.nick.trim(), f.pass);
    rememberSeen();
    replace(S.profile ? "today" : "welcome");
  } catch (err) {
    if (!err || !err.code) console.error("sign-in failed", err);
    setBusy(false);
    say(err && err.code === "nick taken" ? "Такой ник уже занят. Если он твой — открой «Вход»" : errorText(err));
  }
}

export default {
  mount(el) {
    root = el; busy = false;
    /* a new device opens on "Регистрация"; one that was signed in before — on "Вход", and if only
       the session ended, with the nickname filled in */
    const known = account();
    mode = known || seenBefore() ? "in" : "up"; f = { nick: known ? known.name : "", pass: "" };
    actions(el, {
      mode: t => { if (busy || t.dataset.v === mode) return; mode = t.dataset.v; draw(); },
      eye(t) {
        const inp = $('[data-f="pass"]', root), show = inp.type === "password";
        inp.type = show ? "text" : "password";
        t.innerHTML = icon(show ? "eyeoff" : "eye", 20);
        t.setAttribute("aria-pressed", String(show)); t.setAttribute("aria-label", show ? "Скрыть пароль" : "Показать пароль");
      },
    });
    on(el, "input", "[data-f]", (e, t) => { f[t.dataset.f] = t.value; });
    on(el, "submit", "[data-form]", e => { e.preventDefault(); submit(); });
    draw();
  },
};
