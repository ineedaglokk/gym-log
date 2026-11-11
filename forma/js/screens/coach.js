/* Assistants: two separate chats — a trainer and a nutritionist — each with its own role and context.
   Until the server is deployed the screen says so instead of pretending to work. */

import { replace, back } from "../core/router.js";
import { $, esc, actions, on } from "../core/dom.js";
import { icon } from "../ui/icons.js";
import { confirmSheet, toast } from "../ui/sheet.js";
import { ROLES, coachReady, askCoach, chatOf, pushChat, clearChat } from "../domain/coach.js";

let root, role, busy = false;

/* escaped text with the little markdown models like to use: **bold**, lists, line breaks */
function rich(text) {
  return esc(text).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").split(/\n{2,}/).map(block => {
    const lines = block.split("\n");
    if (lines.every(l => /^\s*([-•*]|\d+[.)])\s+/.test(l))) return `<ul>${lines.map(l => `<li>${l.replace(/^\s*([-•*]|\d+[.)])\s+/, "")}</li>`).join("")}</ul>`;
    return `<p>${lines.join("<br>")}</p>`;
  }).join("");
}

function messages() {
  const R = ROLES[role], list = chatOf(role);
  const intro = `<div class="chat__intro"><span class="chat__ava" style="--c:${R.color}">${icon(R.ico, 26)}</span><h2 class="h2 mt12">${R.n}</h2><p class="c2 mt4">${R.hello}</p>
${coachReady() ? `<div class="chat__chips">${R.chips.map(c => `<button class="chip" data-act="chip">${esc(c)}</button>`).join("")}</div>` : ""}</div>`;
  const bubbles = list.map(m => `<div class="msg msg--${m.r === "u" ? "me" : "ai"}${m.err ? " msg--err" : ""}">${m.r === "u" ? `<p>${esc(m.t)}</p>` : rich(m.t)}</div>`).join("");
  return `${list.length ? "" : intro}${bubbles}${busy ? `<div class="msg msg--ai msg--typing"><i></i><i></i><i></i></div>` : ""}`;
}

function draw() {
  const ready = coachReady();
  root.innerHTML = `<div class="topbar"><button class="iconbtn" data-act="back" aria-label="Назад">${icon("left", 22)}</button><div class="topbar__title">Помощники</div>${chatOf(role).length ? `<button class="iconbtn" data-act="clear" aria-label="Очистить чат">${icon("trash", 20)}</button>` : `<span class="topbar__spacer"></span>`}</div>
<div class="seg">${Object.entries(ROLES).map(([k, r]) => `<button class="${role === k ? "is-on" : ""}" data-act="role" data-k="${k}">${r.n}</button>`).join("")}</div>
<div class="chat${ready ? "" : " chat--idle"}" data-chat>${messages()}</div>
${ready ? `<form class="chat__bar" data-form><textarea class="input" data-in rows="1" maxlength="1000" placeholder="Спроси ${role === "trainer" ? "про тренировки" : "про питание"}…" enterkeyhint="send"></textarea><button class="chat__send" type="submit" aria-label="Отправить">${icon("send", 20)}</button></form>
<p class="c3 t11 center chat__note">С вопросом уходит сводка твоих записей за последние недели. На сервере она не хранится. Советы — не медицинская консультация.</p>`
    : `<div class="card chat__setup"><div class="row row--top"><span class="item__ico">${icon("shield", 20)}</span><div class="grow"><b>Помощники ещё не подключены</b><p class="c2 t13 mt4">Им нужен сервер с языковой моделью (Qwen на Cloudflare — в пределах бесплатной дневной нормы). Код сервера уже лежит в проекте, осталось его выложить — после этого помощники заработают сами, без настроек.</p></div></div></div>`}`;
  scrollDown();
}
const scrollDown = () => requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }));
const redrawChat = () => { $("[data-chat]", root).innerHTML = messages(); scrollDown(); };

async function send(text) {
  text = String(text || "").trim();
  if (!text || busy || !coachReady()) return;
  const asked = role;
  pushChat(asked, { r: "u", t: text });
  busy = true; redrawChat();
  try {
    const reply = await askCoach(asked, chatOf(asked));
    pushChat(asked, { r: "a", t: reply });
  } catch (err) {
    pushChat(asked, { r: "a", t: err.message || "Не получилось получить ответ", err: true });
  }
  busy = false;
  if (role === asked) { if (chatOf(asked).length <= 2) draw(); else redrawChat(); }
}

export default {
  depth: 1,
  mount(el, params) {
    root = el; role = ROLES[params.role] ? params.role : "trainer"; busy = false;
    actions(el, {
      back: () => back("today"),
      role: t => { if (t.dataset.k !== role && !busy) replace("coach/" + t.dataset.k); else if (busy) toast("Подожди ответ", { ico: "info" }); },
      chip: t => send(t.textContent),
      async clear() { if (await confirmSheet({ title: `Очистить чат: ${ROLES[role].n.toLowerCase()}?`, text: "Переписка удалится насовсем.", ok: "Очистить", danger: true })) { clearChat(role); draw(); } },
    });
    on(el, "submit", "[data-form]", e => { e.preventDefault(); const inp = $("[data-in]", root); const v = inp.value; inp.value = ""; inp.style.height = ""; send(v); });
    on(el, "keydown", "[data-in]", (e, t) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); t.form.requestSubmit(); } });
    on(el, "input", "[data-in]", (e, t) => { t.style.height = "auto"; t.style.height = Math.min(140, t.scrollHeight) + "px"; });
    draw();
  },
  update(topic) { if (topic === "account") draw(); },
};
