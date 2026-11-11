/* The two assistants (trainer, nutritionist): what they are, what context they get, how they are asked.
   The model runs on the FORMA server (server/worker.js, Cloudflare Workers AI) and answers signed-in
   people only. Each question carries a text summary of the journal (domain/report.js); the question
   and the summary are not stored on the server. */

import { S, save } from "../core/store.js";
import { api, accountsOn, signedIn, ApiError } from "../core/account.js";
import { buildReport, reportText } from "./report.js";
import { dayFood, targets } from "./nutrition.js";
import { today, addDays, shortDate } from "../core/dates.js";

export const ROLES = {
  trainer: {
    n: "Тренер", ico: "dumbbell", color: "var(--m-gym)",
    hello: "Разберу твои тренировки: нагрузку, прогресс, технику и чем заменить упражнение.",
    chips: ["Как у меня с прогрессом за месяц?", "Застрял в жиме — что делать?", "Чем заменить приседания со штангой?", "Хватает ли объёма на спину?"],
  },
  nutri: {
    n: "Нутрициолог", ico: "leaf", color: "var(--m-food)",
    hello: "Помогу с калориями, белком и рационом под твою цель.",
    chips: ["Что съесть на ужин, чтобы закрыть белок?", "Разбери мой рацион за неделю", "Вес стоит — что поменять?", "Составь меню на завтра под мои цифры"],
  },
};
const MAX_HISTORY = 40, MAX_CONTEXT = 6000;

export const coachReady = () => accountsOn() && signedIn();

/* the journal summary sent with a question: 4 weeks for the trainer, 2 weeks plus recent meals for the nutritionist */
export function coachContext(role) {
  let text = reportText(buildReport(role === "trainer" ? 28 : 14), { maxWorkouts: role === "trainer" ? 8 : 2, title: false });
  if (role === "nutri") {
    const lines = [];
    for (let i = 0; i < 3; i++) {
      const d = addDays(today(), -i), f = dayFood(d);
      if (f.items.length) lines.push(`${shortDate(d)}: ${f.items.map(x => `${x.n}${x.g ? ` ${x.g} г` : ""}`).join(", ")} — ${Math.round(f.sum.k)} ккал, белок ${Math.round(f.sum.p)} г`);
    }
    if (lines.length) text += "\n\nЕда за последние дни:\n" + lines.join("\n");
    const f = dayFood(today()).sum, t = targets();
    text += `\nСегодня осталось: ${Math.round(t.kcal - f.k)} ккал, белка ${Math.round(t.p - f.p)} г.`;
  }
  return text.slice(0, MAX_CONTEXT);
}

const ERRORS = { 401: "Нужно войти в аккаунт заново", 429: "Лимит вопросов на сегодня исчерпан — попробуй завтра", 400: "Сервер не понял вопрос — попробуй короче" };

/* history: [{ r: "u" | "a", t: text }] ending with the new question; resolves the answer text */
export async function askCoach(role, history) {
  /* a failed exchange (the question and the error shown in its place) is not sent to the model again */
  const clean = [];
  history.forEach(m => { if (m.err) { if (clean.length && clean.at(-1).r === "u") clean.pop(); } else clean.push(m); });
  let data;
  try {
    data = await api("/chat", { role, context: coachContext(role), messages: clean.slice(-10).map(m => ({ role: m.r === "u" ? "user" : "assistant", content: m.t })) }, { timeout: 70000 });
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    if (err.status === 0) throw new Error(err.code === "timeout" ? "Помощник думал слишком долго — спроси ещё раз" : "Нет связи с сервером помощников");
    throw new Error(ERRORS[err.status] || "Модель сейчас недоступна — попробуй позже");
  }
  if (typeof data.reply !== "string" || !data.reply.trim()) throw new Error("Помощник вернул пустой ответ — спроси ещё раз");
  return data.reply.trim();
}

export const chatOf = role => S.chats[role] || [];
export function pushChat(role, msg) {
  save("chats", { ...S.chats, [role]: [...chatOf(role), { ...msg, at: Date.now() }].slice(-MAX_HISTORY) });
}
export const clearChat = role => save("chats", { ...S.chats, [role]: [] });
