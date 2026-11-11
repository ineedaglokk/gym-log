/* Boot: open storage, load state, start the account sync, register screens, draw the bottom nav. */

import { openBackend } from "./core/db.js";
import { S, init, subscribe, onSaveError } from "./core/store.js";
import { route, start, go, replace, current } from "./core/router.js";
import { accountsOn, signedIn } from "./core/account.js";
import { startSync, syncNow } from "./core/sync.js";
import { $ } from "./core/dom.js";
import { icon } from "./ui/icons.js";
import { toast } from "./ui/sheet.js";
import { openQuickAdd } from "./screens/quick-add.js";

import auth from "./screens/auth.js";
import onboarding from "./screens/onboarding.js";
import todayScreen from "./screens/today.js";
import gym from "./screens/gym.js";
import workout from "./screens/workout.js";
import program from "./screens/program.js";
import library from "./screens/library.js";
import exercise from "./screens/exercise.js";
import food from "./screens/food.js";
import foodAdd from "./screens/food-add.js";
import recipes from "./screens/recipes.js";
import recipe from "./screens/recipe.js";
import stats from "./screens/stats.js";
import calendar from "./screens/calendar.js";
import profile from "./screens/profile.js";
import coach from "./screens/coach.js";
import report from "./screens/report.js";

const NAV = [
  { tab: "today", path: "today", n: "Сегодня", ico: "home" },
  { tab: "gym", path: "gym", n: "Зал", ico: "dumbbell" },
  null,
  { tab: "food", path: "food", n: "Еда", ico: "food" },
  { tab: "stats", path: "stats", n: "Итоги", ico: "chart" },
];

function drawNav(active) {
  $("#nav").innerHTML = NAV.map(i => i
    ? `<button class="nav__item${i.tab === active ? " is-on" : ""}" data-path="${i.path}"${i.tab === active ? ' aria-current="page"' : ""}>${icon(i.ico, 24)}<span>${i.n}</span></button>`
    : `<button class="nav__plus" data-plus aria-label="Быстро добавить">${icon("plus", 26, { sw: 2.4 })}</button>`).join("");
}

function applyTheme() {
  const t = S.settings.theme, root = document.documentElement;
  if (t === "light" || t === "dark") root.dataset.theme = t; else delete root.dataset.theme;
  const dark = t === "dark" || (t !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  $('meta[name="theme-color"]').content = dark ? "#0A0C11" : "#F1F3F8";
}

async function boot() {
  await init(await openBackend());
  applyTheme();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
  subscribe(topic => { if (topic === "settings" || topic === "import") applyTheme(); });
  onSaveError(() => toast("Не удалось сохранить на этом устройстве", { ico: "info", ms: 5000 }));

  /* with a server: records live in the person's account, the device keeps a copy and works offline */
  if (accountsOn()) {
    startSync();
    syncNow();
    /* the session ended (signed out, or the password was changed on another device) → the sign-in screen */
    subscribe(topic => { if (topic === "account" && !signedIn() && current() && current().path !== "login") replace("login"); });
  }

  route("login", auth);
  route("welcome", onboarding);
  route("today", todayScreen);
  route("gym", gym);
  route("workout/:date", workout);
  route("program", program);
  route("library", library);
  route("exercise/:id", exercise);
  route("food", food);
  route("food/add/:meal", foodAdd);
  route("recipes", recipes);
  route("recipe/:id", recipe);
  route("stats", stats);
  route("calendar", calendar);
  route("profile", profile);
  route("coach/:role", coach);
  route("report", report);

  $("#nav").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.plus != null) openQuickAdd(); else go(b.dataset.path);
  });
  start({
    viewEl: $("#view"),
    /* with accounts on, nothing opens before signing in; then nobody gets past the welcome screen
       without a profile, and nobody with one sees it again */
    guard: path => {
      if (accountsOn() && !signedIn()) return path === "login" ? null : "login";
      const home = S.profile ? "today" : "welcome";
      return path === "login" || path === "welcome" ? (path === home ? null : home) : S.profile ? null : "welcome";
    },
    onChange: drawNav,
  });

  /* offline cache — only on a real host, so local development always sees fresh files */
  if ("serviceWorker" in navigator && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    navigator.serviceWorker.register("sw.js").catch(e => console.warn("service worker not registered", e));
  }
}

boot().catch(err => {
  console.error(err);
  $("#view").innerHTML = `<div class="empty" style="margin-top:30vh"><h2 class="h3">Не получилось запуститься</h2><p>Обнови страницу. Если не помогло — напиши, что здесь написано: ${String(err && err.message || err).replace(/[<>&]/g, "")}</p></div>`;
});
