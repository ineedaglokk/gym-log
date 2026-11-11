/* Profile and settings: personal data, daily targets, trackers on the home screen, theme,
   the account (sync state, new password, sign out), assistants, backup / restore, report, wipe. */

import { S, save, exportData, importData, wipe } from "../core/store.js";
import { go, back, replace } from "../core/router.js";
import { $, esc, actions, download, typingIn } from "../core/dom.js";
import { icon } from "../ui/icons.js";
import { toast, confirmSheet, numberSheet, choiceSheet, textSheet } from "../ui/sheet.js";
import { askWeight } from "../ui/trackers.js";
import { targets, calcTargets, GOALS, ACTIVITY } from "../domain/nutrition.js";
import { totals, planStreak } from "../domain/summary.js";
import { coachReady } from "../domain/coach.js";
import { account, accountsOn, signedIn, errorText } from "../core/account.js";
import { syncInfo, syncNow } from "../core/sync.js";
import { signOut, changePassword } from "../domain/session.js";
import { APP } from "../config.js";
import { today } from "../core/dates.js";
import { num, litres, kg, initials, plural } from "../core/format.js";

let root;
const patch = p => save("profile", { ...S.profile, ...p });
const setting = p => save("settings", { ...S.settings, ...p });

const item = (act, ico, name, val = "", extra = "") => `<button class="item" data-act="${act}"${extra}><span class="item__ico">${icon(ico, 19)}</span><span class="grow b5">${name}</span><span class="item__val">${val}</span><span class="item__chev">${icon("right", 18)}</span></button>`;

/* is everything typed on this device already in the account */
function syncBadge() {
  const i = syncInfo(), wait = i.pending ? ` · ждёт ${i.pending}` : "";
  if (i.state === "syncing") return '<span class="badge">сохраняю…</span>';
  if (i.state === "offline") return `<span class="badge badge--warn">нет связи${wait}</span>`;
  if (i.state === "error") return `<span class="badge badge--warn">сбой${wait}</span>`;
  return i.pending ? `<span class="badge">сохраняю…</span>` : '<span class="badge badge--good">сохранено</span>';
}

/* a daily target: typed by hand it is marked, and can be reset to the calculated value */
const TARGETS = [
  ["kcal", "flame", "Калории", "ккал", v => num(v), 9000], ["p", "dumbbell", "Белки", "г", v => v, 500], ["f", "drop", "Жиры", "г", v => v, 400], ["c", "leaf", "Углеводы", "г", v => v, 1200],
  ["water", "drop", "Вода", "мл", v => litres(v) + " л", 8000], ["sleep", "moon", "Сон", "ч", v => kg(v), 14], ["steps", "steps", "Шаги", "", v => num(v), 60000],
];

function draw() {
  const p = S.profile, t = targets(), custom = p.targets || {}, tt = totals(), streak = planStreak(), tk = S.settings.trackers;
  const acc = accountsOn() && signedIn() ? account() : null;
  const sw = (k, ico, c, name) => `<button class="item" data-act="tracker" data-k="${k}" role="switch" aria-checked="${tk[k]}"><span class="item__ico" style="color:${c}">${icon(ico, 19)}</span><span class="grow b5">${name}</span><span class="switch${tk[k] ? " is-on" : ""}"></span></button>`;
  root.innerHTML = `<div class="topbar"><button class="iconbtn" data-act="back" aria-label="Назад">${icon("left", 22)}</button><div class="topbar__title">Профиль</div><span class="topbar__spacer"></span></div>
<section class="phero"><div class="avatar phero__ava">${esc(initials(p.name))}</div><h1 class="h1 mt12">${esc(p.name)}</h1><div class="c2 mt4">${(GOALS.find(g => g.k === p.goal) || GOALS[1]).n} · ${kg(p.weight)} кг</div></section>
<section class="minis mt16"><div class="mini"><b class="num">${tt.workouts}</b><span>${plural(tt.workouts, "тренировка", "тренировки", "тренировок")}</span></div><div class="mini"><b class="num">${streak}</b><span>${plural(streak, "неделя", "недели", "недель")} по плану подряд</span></div><div class="mini"><b class="num">${tt.foodDays}</b><span>${plural(tt.foodDays, "день", "дня", "дней")} с дневником еды</span></div></section>

<section class="section"><div class="section__head"><h2 class="h2">Мои данные</h2></div><div class="list">
${item("name", "user", "Имя", esc(p.name))}${item("sex", "user", "Пол", p.sex === "f" ? "женский" : "мужской")}${item("age", "calendar", "Возраст", `${p.age} лет`)}${item("height", "trend", "Рост", `${p.height} см`)}${item("weight", "scale", "Вес", `${kg(p.weight)} кг`)}
${item("goal", "target", "Цель", (GOALS.find(g => g.k === p.goal) || GOALS[1]).n)}${item("activity", "zap", "Активность", (ACTIVITY.find(a => a.k === String(p.activity)) || ACTIVITY[1]).short)}
</div></section>

<section class="section"><div class="section__head"><h2 class="h2">Цели на день</h2>${Object.keys(custom).length ? `<button class="section__link" data-act="auto">Вернуть расчётные</button>` : `<span class="c3 t13">посчитаны по твоим данным</span>`}</div><div class="list">
${TARGETS.map(([k, ico, name, , fmt]) => item("target", ico, name, `${fmt(t[k])}${k in custom ? ' <span class="badge badge--accent">своё</span>' : ""}`, ` data-k="${k}"`)).join("")}
</div></section>

<section class="section"><div class="section__head"><h2 class="h2">На главном экране</h2></div><div class="list">
${sw("water", "drop", "var(--m-water)", "Вода")}${sw("sleep", "moon", "var(--m-sleep)", "Сон")}${sw("steps", "steps", "var(--m-steps)", "Шаги")}${sw("weight", "scale", "var(--accent)", "Вес тела")}
${item("glass", "drop", "Размер стакана", `${S.settings.glass} мл`)}
</div></section>

<section class="section"><div class="section__head"><h2 class="h2">Оформление</h2></div>
<div class="seg">${[["auto", "Как в системе"], ["light", "Светлое"], ["dark", "Тёмное"]].map(([k, n]) => `<button class="${S.settings.theme === k ? "is-on" : ""}" data-act="theme" data-k="${k}">${n}</button>`).join("")}</div></section>

${acc ? `<section class="section"><div class="section__head"><h2 class="h2">Аккаунт</h2></div><div class="list">
<div class="item"><span class="item__ico" style="color:var(--accent)">${icon("cloud", 19)}</span><span class="grow b5">${esc(acc.name)}</span><span data-sync>${syncBadge()}</span></div>
${item("password", "lock", "Сменить пароль")}${item("logout", "logout", "Выйти из аккаунта")}
</div><p class="c3 t13 mt8" style="margin-left:2px">Всё, что ты записываешь, сохраняется в аккаунте. Пароль на этом устройстве больше не спросят.</p></section>` : ""}

<section class="section"><div class="section__head"><h2 class="h2">Помощники</h2></div><div class="list">
${item("coach", "spark", "Тренер и нутрициолог", coachReady() ? '<span class="badge badge--good">подключены</span>' : '<span class="badge">не подключены</span>')}
</div></section>

<section class="section"><div class="section__head"><h2 class="h2">Данные</h2></div><div class="list">
${item("report", "file", "Отчёт для тренера, PDF")}${item("export", "download", "Скачать копию данных")}
<label class="item"><span class="item__ico">${icon("upload", 19)}</span><span class="grow b5">Восстановить из копии</span><span class="item__chev">${icon("right", 18)}</span><input type="file" accept="application/json,.json" hidden data-import></label>
<button class="item" data-act="wipe"><span class="item__ico cb">${icon("trash", 19)}</span><span class="grow b5 cb">Удалить все данные</span></button>
</div><p class="c3 t13 mt8" style="margin-left:2px">${acc ? "Записи лежат в аккаунте и на этом устройстве. Копию можно скачать на всякий случай." : "Записи хранятся на этом устройстве. Раз в пару недель скачивай копию — так они переживут смену телефона или очистку браузера."}</p></section>

<section class="section center c3 t13"><div class="b6">${APP.name} ${APP.version}</div><div class="mt4">Каталог упражнений и техника — fitpush.ru, фото — Free Exercise DB.<br>Продукты из интернета — Open Food Facts.</div>
<div class="mt12">Чтобы открывать как приложение: «Поделиться» → «На экран Домой».</div></section>`;
}

async function editTarget(k) {
  const [, , name, unit, , max] = TARGETS.find(x => x[0] === k), t = targets(), auto = calcTargets(S.profile);
  const v = await numberSheet({ title: `${name} в день`, unit, value: t[k], max, hint: `Расчётное значение — ${k === "kcal" || k === "steps" || k === "water" ? num(auto[k]) : auto[k]}${unit ? " " + unit : ""}. Своё значение помечается и не меняется при пересчёте.` });
  if (v == null || !v) return;
  patch({ targets: { ...(S.profile.targets || {}), [k]: k === "sleep" ? v : Math.round(v) } });
}

export default {
  depth: 1,
  mount(el) {
    root = el;
    actions(el, {
      back: () => back("today"),
      async name() { const v = await textSheet({ title: "Имя", value: S.profile.name, max: 24 }); if (v) patch({ name: v }); },
      async sex() { const v = await choiceSheet({ title: "Пол", value: S.profile.sex, options: [{ k: "m", n: "Мужской" }, { k: "f", n: "Женский" }] }); if (v) patch({ sex: v }); },
      async age() { const v = await numberSheet({ title: "Возраст", unit: "лет", value: S.profile.age, max: 90 }); if (v >= 12) patch({ age: Math.round(v) }); else if (v != null) toast("Возраст — от 12 до 90 лет", { ico: "info" }); },
      async height() { const v = await numberSheet({ title: "Рост", unit: "см", value: S.profile.height, max: 230 }); if (v >= 120) patch({ height: Math.round(v) }); else if (v != null) toast("Рост — от 120 до 230 см", { ico: "info" }); },
      weight: () => askWeight(today()),
      async goal() { const v = await choiceSheet({ title: "Цель", value: S.profile.goal, options: GOALS }); if (v) patch({ goal: v }); },
      async activity() { const v = await choiceSheet({ title: "Активность", value: String(S.profile.activity), options: ACTIVITY }); if (v) patch({ activity: v }); },
      target: t => editTarget(t.dataset.k),
      auto() { const p = { ...S.profile }; delete p.targets; save("profile", p); toast("Цели снова считаются по твоим данным"); },
      tracker: t => setting({ trackers: { ...S.settings.trackers, [t.dataset.k]: !S.settings.trackers[t.dataset.k] } }),
      async glass() { const v = await choiceSheet({ title: "Размер стакана", value: String(S.settings.glass), options: [200, 250, 330, 500].map(n => ({ k: String(n), n: `${n} мл` })) }); if (v) setting({ glass: Number(v) }); },
      theme: t => setting({ theme: t.dataset.k }),
      coach: () => go("coach/trainer"),
      async password() {
        const v = await textSheet({ title: "Новый пароль", placeholder: "от 4 символов", max: 64, caps: false, ok: "Сменить пароль", hint: "На других устройствах после этого нужно будет войти заново — уже с новым паролем." });
        if (v == null) return;
        if (v.length < 4) { toast("Пароль — от 4 символов", { ico: "info" }); return; }
        try { await changePassword(v); toast("Пароль изменён"); }
        catch (err) { if (!err || !err.code) console.error("password change failed", err); toast(errorText(err), { ico: "info", ms: 4000 }); }
      },
      async logout() {
        await syncNow();
        const n = syncInfo().pending;
        const text = n ? `Нет связи: последние изменения (${n}) ещё не сохранены в аккаунте и пропадут. Лучше выйти, когда появится интернет.` : "Записи останутся в аккаунте. Чтобы вернуться, понадобятся ник и пароль.";
        if (await confirmSheet({ title: "Выйти из аккаунта?", text, ok: "Выйти", danger: n > 0 })) await signOut();
      },
      report: () => go("report"),
      export() { download(`forma-${today()}.json`, JSON.stringify(exportData())); toast("Копия скачана"); },
      async wipe() {
        if (!(await confirmSheet({ title: "Удалить все данные?", text: `Профиль, программа, тренировки и дневник еды исчезнут ${accountsOn() ? "из аккаунта — на всех устройствах" : "с этого устройства"}. Вернуть можно будет только из скачанной копии.`, ok: "Удалить", danger: true }))) return;
        if (!(await confirmSheet({ title: "Точно удалить?", text: "Это нельзя отменить.", ok: "Да, удалить всё", danger: true }))) return;
        await wipe(); replace("welcome");
      },
    });
    el.addEventListener("change", async e => {
      const inp = e.target;
      if (!inp.matches("[data-import]") || !inp.files[0]) return;
      try {
        const obj = JSON.parse(await inp.files[0].text());
        const mode = await choiceSheet({ title: "Как восстановить", options: [{ k: "merge", n: "Добавить недостающее", d: "Записи на этом устройстве останутся, из копии добавятся дни, которых нет", ico: "plus" }, { k: "replace", n: "Заменить всё копией", d: "Устройство станет точной копией файла", ico: "swap" }] });
        if (!mode) return;
        const n = await importData(obj, mode);
        toast(`Восстановлено: ${n} ${plural(n, "день", "дня", "дней")}`);
      } catch (err) { console.warn("import failed", err); toast(err.message && /ФОРМЫ/.test(err.message) ? err.message : "Файл не подошёл", { ico: "info", ms: 4000 }); }
      finally { inp.value = ""; }
    });
    draw();
  },
  update(topic) {
    if (topic === "sync") { const b = $("[data-sync]", root); if (b) b.innerHTML = syncBadge(); return; }
    /* signed out: the profile is gone, the app is on its way to the sign-in screen */
    if (S.profile && ["profile", "settings", "import", "day"].includes(topic) && !typingIn(root)) draw();
  },
};
