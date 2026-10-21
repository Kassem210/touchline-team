/* Touchline Team: the app for coaches and players.
   Accounts use Firebase Authentication (email + password); club data lives in Firestore.
   Security rules for all of this are in firestore.rules. */

// The Firebase project's web settings live in firebase-config.js
const FIREBASE_CONFIG = window.TEAM_FIREBASE_CONFIG || {};
const CONFIG_READY = !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && !/PASTE/.test(FIREBASE_CONFIG.apiKey));
const FB_VER = "12.19.0";
// Bump this when the privacy policy or terms change in a way people need to agree to again
const LEGAL_VERSION = "2026-10-19";
// Gemini models for the food estimate, tried in order (the alias keeps working as Google releases new versions)
const AI_MODELS = ["gemini-flash-latest", "gemini-2.5-flash"];
const FB_BASE = window.TEAM_FB_BASE || `https://www.gstatic.com/firebasejs/${FB_VER}`;
const EMU = window.TEAM_EMULATOR || null; // local testing only: { host, authPort, fsPort }

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "html") e.innerHTML = v; // only ever static or numeric markup
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return e;
}
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
let TODAY = iso(new Date());
const addDays = (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); };
const dObj = s => new Date(s + "T12:00:00");
const fmtDay = s => dObj(s).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const rel = s => s === TODAY ? "Today" : s === addDays(TODAY, -1) ? "Yesterday" : s === addDays(TODAY, 1) ? "Tomorrow" : fmtDay(s);
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
let toastT;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3600); }
const brandMark = () => el("img", { class: "brand-mark", src: "logo-mark.png", alt: "Touchline Team logo", width: 94, height: 44 });
const initials = n => (n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from(crypto.getRandomValues(new Uint32Array(6)), n => CODE_ALPHABET[n % CODE_ALPHABET.length]).join("");
const cleanCode = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
const appUrl = () => location.origin + location.pathname;

const SPORTS = {
  football:   { label: "Football",    match: "Match", stats: [["apps", "Apps"], ["goals", "Goals"], ["assists", "Assists"], ["mins", "Minutes"]] },
  basketball: { label: "Basketball",  match: "Game",  stats: [["games", "Games"], ["pts", "Points"], ["reb", "Rebounds"], ["ast", "Assists"]] },
  tennis:     { label: "Tennis",      match: "Match", stats: [["matches", "Matches"], ["wins", "Wins"], ["aces", "Aces"], ["sets", "Sets won"]] },
  gymnastics: { label: "Gymnastics",  match: "Meet",  stats: [["meets", "Meets"], ["best", "Best score"], ["avg", "Avg score"], ["medals", "Medals"]] },
  other:      { label: "Other sport", match: "Match", stats: [["games", "Games"], ["wins", "Wins"], ["points", "Points"], ["pbs", "Personal bests"]] },
};
const sport = () => SPORTS[S.club?.sport] || SPORTS.other;
const MEALS = ["Breakfast", "Lunch", "Dinner", "Snack", "Pre-session", "Recovery"];
const WORKOUTS = ["Team training", "Gym", "Run", "Skills", "Recovery", "Match", "Other"];
const STATUS = [["present", "Present"], ["late", "Late"], ["absent", "Absent"], ["excused", "Excused"]];

/* ---------- state ---------- */
const S = {
  phase: "boot",          // boot | auth | loading | clubs | club
  fbError: "", authMode: "signin", authMsg: null,
  user: null, profile: null, clubNames: {},
  demo: false, demoMe: "coach",
  clubId: null, club: null, role: null,
  members: [], sessions: [], announcements: [], plans: [], feedback: [],
  days: {}, att: {}, stats: {}, targets: {}, rsvp: {},
  view: null, focus: null, preview: null, err: "",
};
let F = null;            // { auth, db, a (auth module), f (firestore module) }
let unsubs = [];
let pendingJoin = cleanCode(new URLSearchParams(location.search).get("join"));
// links from the front page: app.html?start=signup or app.html?start=demo
const START = new URLSearchParams(location.search).get("start");
let pendingName = ""; // name typed at sign-up, used when the profile is first created
let pendingConsent = null; // consent given on the sign-up form, saved with the new profile

function resetClubData() {
  Object.assign(S, { club: null, role: null, members: [], sessions: [], announcements: [], plans: [], feedback: [], days: {}, att: {}, stats: {}, targets: {}, rsvp: {}, view: null, focus: null, preview: null, err: "" });
}

/* ---------- selectors ---------- */
const byId = id => S.members.find(m => m.id === id);
function me() { if (S.preview) return byId(S.preview); if (S.demo) return byId(S.demoMe); return S.user && byId(S.user.uid); }
const isCoach = () => me()?.role === "coach";
const isOwner = () => !S.demo && S.club && S.user && S.club.ownerUid === S.user.uid;
const players = () => S.members.filter(m => m.role === "player").sort((a, b) => (numOr(a.number)) - (numOr(b.number)) || a.name.localeCompare(b.name));
const coaches = () => S.members.filter(m => m.role === "coach").sort((a, b) => a.name.localeCompare(b.name));
const numOr = n => (n === "" || n == null || isNaN(+n)) ? 999 : +n;
const day = (id, date) => S.days[id]?.[date];
const mealsOn = (id, date) => day(id, date)?.meals || [];
const workoutsOn = (id, date) => day(id, date)?.workouts || [];
const MACROS = [["kcal", "Calories", "kcal"], ["protein", "Protein", "g"], ["carbs", "Carbs", "g"], ["fat", "Fat", "g"]];
const r0 = n => Math.round(+n || 0);
function totals(meals) { const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 }; meals.forEach(m => MACROS.forEach(([k]) => (t[k] += +m[k] || 0))); return t; }
const targetsOf = id => S.targets[id] || {};
const minutes7 = id => { let s = 0; for (let i = 0; i < 7; i++) workoutsOn(id, addDays(TODAY, -i)).forEach(w => (s += +w.duration || 0)); return s; };
function logsOf(id) {
  const out = [];
  for (const [date, d] of Object.entries(S.days[id] || {})) {
    (d.meals || []).forEach(x => out.push({ ...x, type: "meal", date }));
    (d.workouts || []).forEach(x => out.push({ ...x, type: "workout", date }));
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || (b.ts || 0) - (a.ts || 0));
}
const sessKey = s => s.date + " " + (s.time || "00:00");
const sessionsSorted = () => [...S.sessions].sort((a, b) => sessKey(a).localeCompare(sessKey(b)));
const upcoming = () => sessionsSorted().filter(s => s.date >= TODAY && !s.taken);
const pastTaken = () => sessionsSorted().filter(s => s.taken).reverse();
const needsRegister = () => sessionsSorted().filter(s => s.date < TODAY && !s.taken);
function register(id, n = 8) { return pastTaken().filter(s => S.att[s.id]?.[id]).slice(0, n).map(s => ({ s, a: S.att[s.id][id] })); }
function attPct(id) { const r = register(id, 60).filter(x => x.a.status !== "excused"); if (!r.length) return null; return Math.round(100 * r.filter(x => x.a.status === "present" || x.a.status === "late").length / r.length); }
function form(id, n = 5) { return register(id, 60).filter(x => x.a.rating).slice(0, n).map(x => +x.a.rating); }
const ratingCls = r => r >= 7.5 ? "good" : r >= 6 ? "mid" : "bad";
const scaleCls = (v, goodHigh) => { v = +v; if (goodHigh) return v >= 4 ? "good" : v >= 3 ? "" : "bad"; return v <= 2 ? "good" : v <= 3 ? "" : "bad"; };
const statsOf = id => S.stats[id] || {};
const openInstr = id => S.feedback.filter(f => f.uid === id && f.kind === "instruction" && !f.ack);
const rsvpOf = (sid, id) => S.rsvp[sid]?.[id];

/* ---------- Firebase ---------- */
async function initFirebase() {
  const [appM, a, f] = await Promise.all([import(`${FB_BASE}/firebase-app.js`), import(`${FB_BASE}/firebase-auth.js`), import(`${FB_BASE}/firebase-firestore.js`)]);
  const app = appM.initializeApp(FIREBASE_CONFIG, "team");
  const auth = a.getAuth(app);
  let db;
  if (EMU) db = f.getFirestore(app);
  else { try { db = f.initializeFirestore(app, { localCache: f.persistentLocalCache({ tabManager: f.persistentMultipleTabManager() }) }); } catch { db = f.getFirestore(app); } }
  if (EMU) { a.connectAuthEmulator(auth, `http://${EMU.host}:${EMU.authPort}`, { disableWarnings: true }); f.connectFirestoreEmulator(db, EMU.host, EMU.fsPort); }
  F = { app, auth, db, a, f };
}
const D = (...p) => F.f.doc(F.db, ...p);
const Col = (...p) => F.f.collection(F.db, ...p);
const CD = (...p) => D("clubs", S.clubId, ...p);
const CC = name => Col("clubs", S.clubId, name);

function authErr(e) {
  const c = (e && e.code) || "";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found") || c.includes("invalid-login")) return "That email and password don’t match an account. Check them, or reset your password.";
  if (c.includes("email-already-in-use")) return "There’s already an account with that email. Sign in instead.";
  if (c.includes("weak-password")) return "Use a password with at least 6 characters.";
  if (c.includes("invalid-email")) return "That email address doesn’t look right.";
  if (c.includes("too-many-requests")) return "Too many attempts. Wait a few minutes and try again.";
  if (c.includes("network")) return "Couldn’t reach the server. Check your internet connection.";
  if (c.includes("operation-not-allowed") || c.includes("admin-restricted")) return "Email sign-in is switched off. The site owner needs to turn on Email/Password in Firebase → Authentication → Sign-in method.";
  if (c.includes("unauthorized-domain")) return "This website isn’t on Firebase’s list of allowed sites. Add it under Authentication → Settings → Authorized domains.";
  if (c.includes("missing-password")) return "Enter your password.";
  return "Something went wrong (" + (c || "unknown error") + "). Try again.";
}
function fsErr(e) {
  const c = (e && e.code) || "";
  if (c.includes("permission-denied")) return "You don’t have permission to do that. If you’re the site owner, check the Firestore rules are published.";
  if (c.includes("unavailable")) return "You’re offline. Changes will sync when you reconnect.";
  if (c.includes("not-found") || c.includes("failed-precondition")) return "The database isn’t set up yet. Create it under Firestore Database in Firebase.";
  if (c.includes("resource-exhausted")) return "The club has hit today’s free usage limit. Try again tomorrow.";
  return "That didn’t save (" + (c || "unknown error") + "). Try again.";
}

/* ---------- boot + auth ---------- */
const count = (field, once) => { try { window.tlCount && window.tlCount(field, once); } catch {} };
async function boot() {
  count("appVisits", true);
  if (START === "signup") S.authMode = "signup";
  if (START === "demo") startDemo(); else render();
  if (!CONFIG_READY && !EMU) { S.fbError = "This site isn’t connected to Firebase yet. The site owner needs to paste the project settings into firebase-config.js (see the README). You can still look around the demo team."; if (!S.demo) { S.phase = "auth"; render(); } return; }
  try { await initFirebase(); }
  catch (e) { console.error(e); S.fbError = "Couldn’t load the sign-in service. Check your internet connection and reload the page."; if (!S.demo) { S.phase = "auth"; render(); } return; }
  F.a.onAuthStateChanged(F.auth, async u => {
    if (S.demo) return;
    stopClub(); S.user = u;
    if (!u) { S.profile = null; S.phase = "auth"; render(); return; }
    S.phase = "loading"; render();
    try { await loadProfile(); } catch (e) { console.error(e); S.phase = "clubs"; S.err = fsErr(e); render(); return; }
    await checkAdmin();
    afterProfile();
  });
}
const consentOk = p => !!(p && p.consent && p.consent.version === LEGAL_VERSION);
function afterProfile() {
  if (!consentOk(S.profile)) { S.phase = "consent"; render(); return; }
  if (pendingJoin) { S.phase = "clubs"; render(); openJoin(pendingJoin); return; }
  const last = store.get("team.lastClub." + S.user.uid);
  const clubs = S.profile.clubs || [];
  if (last && clubs.includes(last)) return openClub(last);
  if (clubs.length === 1) return openClub(clubs[0]);
  S.phase = "clubs"; render();
}
let profileUnsub = null;
async function loadProfile() {
  const u = S.user; const ref = D("users", u.uid);
  const snap = await F.f.getDoc(ref);
  if (!snap.exists()) await F.f.setDoc(ref, { name: pendingName || u.displayName || (u.email || "").split("@")[0], email: u.email || "", created: TODAY }, { merge: true });
  if (pendingConsent) { await F.f.setDoc(ref, { consent: pendingConsent }, { merge: true }); pendingConsent = null; }
  try { const cur = (await F.f.getDoc(ref)).data() || {}; if (cur.lastSeen !== TODAY) await F.f.setDoc(ref, { lastSeen: TODAY }, { merge: true }); } catch (e) { console.warn(e); }
  const first = await F.f.getDoc(ref); S.profile = first.data();
  if (profileUnsub) profileUnsub();
  profileUnsub = F.f.onSnapshot(ref, s => { if (s.exists()) { S.profile = s.data(); if (S.phase === "clubs") { loadClubNames(); queueRender(); } } });
  await loadClubNames();
}
async function loadClubNames() {
  for (const id of S.profile?.clubs || []) {
    if (S.clubNames[id]) continue;
    try { const s = await F.f.getDoc(D("clubs", id)); S.clubNames[id] = s.exists() ? s.data() : { name: "Club no longer available", gone: true }; }
    catch { S.clubNames[id] = { name: "You’re no longer in this club", gone: true }; }
  }
  queueRender();
}
async function doSignOut() {
  closeModal(); stopClub(); if (profileUnsub) { profileUnsub(); profileUnsub = null; }
  S.clubNames = {}; S.authMode = "signin"; S.authMsg = null; pendingJoin = ""; pendingName = ""; pendingConsent = null;
  await F.a.signOut(F.auth);
}

/* ---------- club lifecycle ---------- */
function stopClub() { unsubs.forEach(u => { try { u(); } catch {} }); unsubs = []; resetClubData(); S.clubId = null; }
function listen(ref, fn) {
  unsubs.push(F.f.onSnapshot(ref, fn, e => { console.error(e); S.err = fsErr(e); queueRender(); }));
}
const docsOf = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));

async function openClub(id) {
  stopClub(); S.clubId = id; S.phase = "loading"; render();
  const uid = S.user.uid;
  let mem = null;
  try { mem = await F.f.getDoc(CD("members", uid)); } catch (e) { console.warn(e); }
  if (!mem || !mem.exists()) {
    await F.f.updateDoc(D("users", uid), { clubs: F.f.arrayRemove(id) }).catch(() => {});
    store.del("team.lastClub." + uid); S.clubId = null; S.phase = "clubs"; render();
    toast("You’re not a member of that club any more."); return;
  }
  S.role = mem.data().role;
  store.set("team.lastClub." + uid, id);
  const f = F.f; const cutoffLogs = addDays(TODAY, -42);
  listen(CD(), s => { if (s.exists()) { S.club = s.data(); queueRender(); } });
  listen(CC("members"), s => {
    S.members = docsOf(s);
    const mine = byId(uid);
    if (!mine) { stopClub(); S.phase = "clubs"; render(); toast("You were removed from the club."); f.updateDoc(D("users", uid), { clubs: f.arrayRemove(id) }).catch(() => {}); return; }
    if (mine.role !== S.role) { openClub(id); return; } // promoted or demoted: reload what we can see
    queueRender();
  });
  listen(CC("sessions"), s => { S.sessions = docsOf(s); queueRender(); });
  listen(CC("announcements"), s => { S.announcements = docsOf(s); queueRender(); });
  if (S.role === "coach") {
    listen(f.query(CC("logs"), f.where("date", ">=", cutoffLogs)), s => { setDays(docsOf(s)); });
    listen(CC("plans"), s => { S.plans = docsOf(s); queueRender(); });
    listen(CC("feedback"), s => { S.feedback = docsOf(s); queueRender(); });
    listen(CC("registers"), s => { const att = {}; docsOf(s).forEach(r => (att[r.id] = r.records || {})); S.att = att; queueRender(); });
    listen(CC("stats"), s => { const st = {}, tg = {}; docsOf(s).forEach(x => { st[x.id] = x.values || {}; tg[x.id] = x.targets || {}; }); S.stats = st; S.targets = tg; queueRender(); });
    listen(f.query(CC("rsvp"), f.where("date", ">=", addDays(TODAY, -7))), s => { setRsvp(docsOf(s)); });
  } else {
    const mine = col => f.query(CC(col), f.where("uid", "==", uid));
    listen(mine("logs"), s => setDays(docsOf(s)));
    listen(mine("plans"), s => { S.plans = docsOf(s); queueRender(); });
    listen(mine("feedback"), s => { S.feedback = docsOf(s); queueRender(); });
    listen(mine("attendance"), s => { const att = {}; docsOf(s).forEach(a => ((att[a.sid] ||= {})[uid] = { status: a.status, rating: a.rating })); S.att = att; queueRender(); });
    listen(CD("stats", uid), s => { const d = s.exists() ? s.data() : {}; S.stats = { [uid]: d.values || {} }; S.targets = { [uid]: d.targets || {} }; queueRender(); });
    listen(mine("rsvp"), s => setRsvp(docsOf(s)));
  }
  S.phase = "club"; render();
}
function setDays(list) { const days = {}; list.forEach(d => ((days[d.uid] ||= {})[d.date] = d)); S.days = days; queueRender(); }
function setRsvp(list) { const r = {}; list.forEach(x => ((r[x.sid] ||= {})[x.uid] = { going: x.going, reason: x.reason || "" })); S.rsvp = r; queueRender(); }

/* ---------- actions (Firestore, or local in the demo) ---------- */
async function act(fn, okMsg, opts) {
  if (S.preview) { toast("This is a preview. Players make this change from their own account."); return false; }
  if (!(opts && opts.always) && locked()) { toast(lockedMsg()); return false; }
  try { await fn(); if (okMsg) toast(okMsg); queueRender(); return true; }
  catch (e) { console.error(e); toast(fsErr(e)); return false; }
}
const ALWAYS = { always: true }; // allowed even when the club is read-only
const myId = () => me().id;
const cleanItem = o => JSON.parse(JSON.stringify(o)); // drops undefined values Firestore rejects

const A = {
  saveDay: (date, d) => act(async () => {
    const id = myId(); const body = { uid: id, date, meals: d.meals || [], workouts: d.workouts || [] };
    if (S.demo) { (S.days[id] ||= {})[date] = body; return; }
    await F.f.setDoc(CD("logs", id + "_" + date), cleanItem(body));
  }),
  tickPlan: (p, ticks) => act(async () => { if (S.demo) { p.ticks = ticks; return; } await F.f.updateDoc(CD("plans", p.id), { ticks }); }),
  ackFb: f => act(async () => { if (S.demo) { f.ack = true; return; } await F.f.updateDoc(CD("feedback", f.id), { ack: true }); }, "Your coach can see you’ve read it"),
  setRsvp: (s, going, reason) => act(async () => {
    const id = myId(); const body = { uid: id, sid: s.id, date: s.date, going, reason: reason || "" };
    if (S.demo) { (S.rsvp[s.id] ||= {})[id] = body; return; }
    await F.f.setDoc(CD("rsvp", s.id + "_" + id), body);
  }, going ? "Marked as available" : "Your coach knows you can’t make it"),

  createPlan: (uids, data) => act(async () => {
    const base = { ...data, author: me().name, date: TODAY, ts: Date.now(), ticks: data.items.map(() => false) };
    if (S.demo) { uids.forEach(uid => S.plans.push({ id: rid(), uid, ...base })); return; }
    const b = F.f.writeBatch(F.db); uids.forEach(uid => b.set(CD("plans", rid()), { uid, ...base })); await b.commit();
  }, uids.length > 1 ? `Plan sent to ${uids.length} players` : "Plan sent"),
  deletePlan: p => act(async () => { if (S.demo) { S.plans = S.plans.filter(x => x !== p); return; } await F.f.deleteDoc(CD("plans", p.id)); }, "Plan deleted", ALWAYS),
  sendFb: (uid, kind, text) => act(async () => {
    const body = { uid, kind, text, author: me().name, authorUid: myId(), date: TODAY, ts: Date.now(), ack: false };
    if (S.demo) { S.feedback.push({ id: rid(), ...body }); return; }
    await F.f.setDoc(CD("feedback", rid()), body);
  }, "Sent to " + (byId(uid)?.name || "player")),
  deleteFb: f => act(async () => { if (S.demo) { S.feedback = S.feedback.filter(x => x !== f); return; } await F.f.deleteDoc(CD("feedback", f.id)); }, "Deleted", ALWAYS),
  saveStats: (uid, values) => act(async () => { if (S.demo) { S.stats[uid] = values; return; } await F.f.setDoc(CD("stats", uid), { uid, values, updated: TODAY }, { mergeFields: ["uid", "values", "updated"] }); }, "Stats updated"),
  saveTargets: (uid, targets) => act(async () => { if (S.demo) { S.targets[uid] = targets; return; } await F.f.setDoc(CD("stats", uid), { uid, targets }, { mergeFields: ["uid", "targets"] }); }, "Targets saved"),
  saveRegister: (s, records) => act(async () => {
    const summary = { present: 0, late: 0, absent: 0, excused: 0 }; Object.values(records).forEach(r => summary[r.status]++);
    const prev = S.att[s.id] || {};
    if (S.demo) { S.att[s.id] = records; s.taken = true; s.summary = summary; return; }
    const b = F.f.writeBatch(F.db);
    b.set(CD("registers", s.id), { sid: s.id, date: s.date, records });
    for (const [uid, r] of Object.entries(records)) b.set(CD("attendance", s.id + "_" + uid), { uid, sid: s.id, date: s.date, status: r.status, rating: r.rating ?? null });
    for (const uid of Object.keys(prev)) if (!records[uid]) b.delete(CD("attendance", s.id + "_" + uid));
    b.update(CD("sessions", s.id), { taken: true, summary });
    await b.commit();
  }, `Register saved · ${Object.keys(records).length} players`),
  saveSession: (s, data) => act(async () => {
    if (S.demo) { if (s) Object.assign(s, data); else S.sessions.push({ id: rid(), ...data, taken: false }); return; }
    if (s) await F.f.updateDoc(CD("sessions", s.id), data); else await F.f.setDoc(CD("sessions", rid()), { ...data, taken: false });
  }, s ? "Session updated" : "Session added"),
  deleteSession: s => act(async () => {
    const prev = S.att[s.id] || {};
    if (S.demo) { S.sessions = S.sessions.filter(x => x !== s); delete S.att[s.id]; return; }
    const b = F.f.writeBatch(F.db); b.delete(CD("sessions", s.id)); b.delete(CD("registers", s.id));
    Object.keys(prev).forEach(uid => b.delete(CD("attendance", s.id + "_" + uid))); await b.commit();
  }, "Session deleted", ALWAYS),
  postAnn: data => act(async () => {
    const body = { ...data, author: me().name, authorUid: myId(), date: TODAY, ts: Date.now() };
    if (S.demo) { S.announcements.push({ id: rid(), ...body }); return; }
    await F.f.setDoc(CD("announcements", rid()), body);
  }, "Posted to the board"),
  deleteAnn: a => act(async () => { if (S.demo) { S.announcements = S.announcements.filter(x => x !== a); return; } await F.f.deleteDoc(CD("announcements", a.id)); }, "Deleted", ALWAYS),
  saveMember: (m, data) => act(async () => {
    if (S.demo) { Object.assign(m, data); return; }
    await F.f.updateDoc(CD("members", m.id), data);
    if (m.id === S.user.uid && data.name) await F.f.updateDoc(D("users", m.id), { name: data.name }).catch(() => {});
  }, "Saved", ALWAYS),
  setRole: (m, role) => act(async () => { if (S.demo) { m.role = role; return; } await F.f.updateDoc(CD("members", m.id), { role }); }, role === "coach" ? `${m.name} is now a coach` : `${m.name} is now a player`, ALWAYS),
  removeMember: m => act(async () => { if (S.demo) { S.members = S.members.filter(x => x !== m); return; } await F.f.deleteDoc(CD("members", m.id)); }, `${m.name} removed from the club`, ALWAYS),
  saveClub: data => act(async () => { if (S.demo) { Object.assign(S.club, data); return; } await F.f.updateDoc(CD(), data); }, "Club updated", ALWAYS),
  newJoinCode: () => act(async () => {
    if (S.demo) { S.club.joinCode = newCode(); return; }
    const old = S.club.joinCode; const code = newCode();
    await F.f.setDoc(D("joinCodes", code), { club: S.clubId, name: S.club.name, created: TODAY });
    await F.f.updateDoc(CD(), { joinCode: code });
    if (old) await F.f.deleteDoc(D("joinCodes", old)).catch(() => {});
  }, "New code ready. The old one no longer works."),
};
async function addLogItem(type, date, item) {
  const id = myId(); const cur = day(id, date) || {};
  const next = { meals: [...(cur.meals || [])], workouts: [...(cur.workouts || [])] };
  if (type === "meal") next.meals.push(item); else next.workouts.push(item);
  return A.saveDay(date, next);
}
async function deleteLogItem(item) {
  const id = myId(); const cur = day(id, item.date); if (!cur) return;
  const next = { meals: (cur.meals || []).filter(x => x.id !== item.id), workouts: (cur.workouts || []).filter(x => x.id !== item.id) };
  return A.saveDay(item.date, next);
}

/* ---------- create / join / leave clubs ---------- */
async function createClub(data, coachName) {
  const f = F.f; const uid = S.user.uid; const ref = f.doc(Col("clubs")); const code = newCode();
  await f.setDoc(ref, { name: data.name, sport: data.sport, season: data.season, ownerUid: uid, joinCode: code, created: TODAY, createdAt: f.serverTimestamp() });
  await f.setDoc(D("clubs", ref.id, "members", uid), { uid, name: coachName, role: "coach", number: "", position: "Head coach", joined: TODAY });
  await f.setDoc(D("joinCodes", code), { club: ref.id, name: data.name, created: TODAY });
  await f.updateDoc(D("users", uid), { clubs: f.arrayUnion(ref.id), name: coachName });
  S.clubNames[ref.id] = { name: data.name };
  return ref.id;
}
async function joinClub(code, info) {
  const f = F.f; const uid = S.user.uid;
  const c = await f.getDoc(D("joinCodes", code));
  if (!c.exists()) throw { code: "app/bad-code" };
  const clubId = c.data().club;
  const existing = await f.getDoc(D("clubs", clubId, "members", uid)).catch(() => null);
  if (!existing || !existing.exists()) await f.setDoc(D("clubs", clubId, "members", uid), { uid, name: info.name, role: "player", number: info.number, position: info.position, code, joined: TODAY });
  await f.updateDoc(D("users", uid), { clubs: f.arrayUnion(clubId) });
  return clubId;
}
async function leaveClub() {
  const f = F.f; const uid = S.user.uid; const id = S.clubId;
  try {
    await f.deleteDoc(CD("members", uid));
    await f.updateDoc(D("users", uid), { clubs: f.arrayRemove(id) });
    store.del("team.lastClub." + uid); closeModal(); stopClub(); S.phase = "clubs"; render(); toast("You left the club.");
  } catch (e) { toast(fsErr(e)); }
}

/* ---------- small components ---------- */
function jersey(m, lg) {
  if (!m) return el("div", { class: "jersey" }, "?");
  if (m.role === "coach") return el("div", { class: "jersey coach" + (lg ? " lg" : ""), title: "Coach" }, initials(m.name));
  return el("div", { class: "jersey" + (lg ? " lg" : "") }, (m.number !== "" && m.number != null) ? m.number : initials(m.name));
}
function who(m, sub) { return el("div", { class: "who" }, jersey(m), el("div", { class: "n" }, el("b", {}, m ? m.name : "Former member"), el("span", {}, sub ?? (m ? (m.role === "coach" ? (m.position || "Coach") : m.position || "Player") : "")))); }
function regDots(id, n = 6) {
  const r = register(id, n).reverse();
  return el("div", { class: "reg", title: "Last sessions, oldest to newest" }, r.length ? r.map(x => el("i", { class: x.a.status, title: `${fmtDay(x.s.date)} · ${x.s.title}: ${x.a.status}` })) : el("span", { class: "muted" }, "—"));
}
function formChips(id) { const f = form(id).reverse(); return el("div", { class: "form" }, f.length ? f.map(r => el("b", { class: ratingCls(r) }, r % 1 ? r.toFixed(1) : r)) : el("span", { class: "muted" }, "—")); }
function field(label, input) { return el("label", { class: "field" }, el("span", {}, label), input); }
function seg(name, opts, val) { return el("div", { class: "seg", role: "radiogroup" }, opts.map(([v, l]) => el("label", {}, el("input", { type: "radio", name, value: v, checked: String(val) === String(v) }), el("span", {}, l)))); }
function sel(id, name, opts, val) { return el("select", { id, name }, opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return el("option", { value: v, selected: String(v) === String(val) }, l); })); }
function tile(label, v, unit, sub) { return el("div", { class: "tile" }, el("div", { class: "label" }, label), el("div", { class: "v" }, v, unit ? el("small", {}, unit) : null), sub ? el("div", { class: "s" }, sub) : null); }
function copyBtn(text, label = "Copy") {
  return el("button", { type: "button", class: "btn small", onclick: async e => {
    const b = e.currentTarget;
    try { await navigator.clipboard.writeText(text); b.textContent = "Copied"; setTimeout(() => (b.textContent = label), 1500); }
    catch { const i = b.parentElement.querySelector("input"); if (i) { i.select(); toast("Press Ctrl+C (or Cmd+C) to copy"); } }
  } }, label);
}

/* ---------- modal ---------- */
function closeModal() { const m = $("#modal"); m.hidden = true; m.replaceChildren(); }
function modal(title, body, opts = {}) {
  const m = $("#modal"); m.replaceChildren();
  const f = el("form", { class: "sheet", novalidate: opts.novalidate || null, onsubmit: async e => {
    e.preventDefault(); if (!opts.submit) return;
    if (!f.checkValidity()) { f.reportValidity(); return; }
    const btn = f.querySelector("footer button.primary"); if (btn) btn.disabled = true;
    let ok; try { ok = await opts.submit(new FormData(f), f); } finally { if (btn) btn.disabled = false; }
    if (ok !== false) closeModal();
  } },
    el("header", {}, el("h2", {}, title), el("button", { type: "button", class: "icon-btn", "aria-label": "Close", onclick: closeModal }, "×")),
    el("div", { class: "sheet-body" }, body),
    opts.submit ? el("footer", {}, opts.extra || null, el("button", { type: "button", class: "btn ghost", onclick: closeModal }, "Cancel"), el("button", { class: "btn primary" + (opts.danger ? " danger-fill" : "") }, opts.label || "Save")) : null);
  m.append(f); m.hidden = false;
  const first = f.querySelector(".sheet-body input:not([type=radio]):not([type=checkbox]):not([readonly]), .sheet-body textarea, .sheet-body select");
  if (first && matchMedia("(min-width:640px)").matches) first.focus();
}
$("#modal").addEventListener("mousedown", e => { if (e.target.id === "modal") closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#modal").hidden) closeModal(); });
function confirmDel(msg, fn, label = "Delete") { modal("Are you sure?", el("p", { style: "margin:0" }, msg), { label, submit: () => fn() }); }

/* ---------- render ---------- */
let rq = false;
function queueRender() { if (rq) return; rq = true; requestAnimationFrame(() => { rq = false; render(); }); }
function go(view, focus) { S.view = view; S.focus = focus || null; render(); scrollTo({ top: 0 }); }

function render() {
  const nowDay = iso(new Date()); if (nowDay !== TODAY) TODAY = nowDay;
  const app = $("#app");
  if (S.phase === "boot" || S.phase === "loading") { app.replaceChildren(el("div", { class: "loading" }, el("div", {}, brandMark(), el("h2", {}, S.phase === "boot" ? "Touchline Team" : "Opening the clubhouse"), el("p", { class: "muted" }, "Loading…")))); return; }
  if (S.phase === "auth") { app.replaceChildren(authPage()); return; }
  if (S.phase === "clubs") { app.replaceChildren(clubsPage()); return; }
  if (S.phase === "consent") { app.replaceChildren(consentPage()); return; }
  if (S.phase === "admin") { app.replaceChildren(adminPage()); return; }
  if (!S.club || !me()) { app.replaceChildren(el("div", { class: "loading" }, el("div", {}, brandMark(), el("h2", {}, "Opening the clubhouse"), el("p", { class: "muted" }, "Loading your squad…")))); return; }
  const coach = isCoach();
  const tabs = coach ? [["today", "Today"], ["squad", "Squad"], ["schedule", "Schedule"], ["board", "Board"]] : [["home", "Home"], ["log", "My log"], ["me", "My season"], ["board", "Board"]];
  if (!S.view || (!tabs.some(t => t[0] === S.view) && S.view !== "player")) S.view = tabs[0][0];
  if (S.view === "player" && (!coach || !byId(S.focus))) S.view = tabs[0][0];
  const homeBadge = coach ? 0 : openInstr(me().id).length;
  const nav = el("nav", { class: "tabs", "aria-label": "Sections" }, tabs.map(([k, l]) => el("button", { "aria-current": (S.view === k || (S.view === "player" && k === "today")) ? "page" : null, onclick: () => go(k) }, l, k === "home" && homeBadge ? el("span", { class: "count" }, homeBadge) : null)));
  const views = { today: vToday, squad: vSquad, schedule: vSchedule, board: vBoard, player: () => vPlayer(S.focus, true), home: vHome, log: vLog, me: () => vPlayer(me().id, false) };
  app.replaceChildren(...[header(), banner(), nav, el("main", { class: "stack" }, views[S.view]())].filter(Boolean));
}

function header() {
  const c = S.club || {}; const m = me();
  return el("header", { class: "top" },
    el("div", { class: "crest", "aria-hidden": "true" }, initials(c.name || "Touchline")),
    el("div", { class: "club" }, el("h1", {}, c.name || "Touchline"), el("div", { class: "meta" }, [sport().label, c.season && `Season ${c.season}`, `${players().length} player${players().length === 1 ? "" : "s"}`].filter(Boolean).join(" · "))),
    m ? el("button", { class: "whoami", onclick: S.demo ? openDemoPicker : openAccount, title: S.demo ? "Switch who you’re viewing as" : "Your account" }, jersey(m), el("span", { class: "t" }, el("b", {}, m.name), el("span", {}, S.demo ? (m.role === "coach" ? "Coach view · switch" : "Player view · switch") : (m.role === "coach" ? "Coach · account" : "Player · account")))) : null);
}
function banner() {
  if (S.err) return el("div", { class: "banner", style: "background:var(--bad-soft);border-color:var(--bad)" }, el("p", {}, S.err), el("button", { class: "btn", onclick: () => { S.err = ""; render(); } }, "Dismiss"));
  if (S.preview) return el("div", { class: "banner" }, el("p", {}, el("b", {}, "Preview"), `You’re seeing what ${byId(S.preview)?.name || "this player"} sees. Nothing can be changed here.`), el("button", { class: "btn primary", onclick: () => { const id = S.preview; S.preview = null; go("player", id); } }, "Exit preview"));
  const bill = billing();
  if (bill.state === "expired") return el("div", { class: "banner locked" }, el("p", {}, el("b", {}, "Read-only"), isOwner() ? (bill.wasPaid ? "Your subscription has ended. " : "Your 30-day free trial has ended. ") + "Everyone can still see and download their data, but nothing new can be added until you subscribe." : "This club’s subscription has ended, so nothing new can be added for now. Your data is safe. The club owner can renew it."), isOwner() ? payButton() : null);
  if (bill.state === "trial" && bill.days <= 7 && isOwner()) return el("div", { class: "banner" }, el("p", {}, el("b", {}, bill.days <= 1 ? "Last day of your trial" : `${bill.days} days left`), payReady() ? "of your free trial. Subscribe to keep using everything after it ends." : "of your free trial. Get in touch and we’ll keep your club running."), payButton());
  if (S.demo) return el("div", { class: "banner" }, el("p", {}, el("b", {}, "Demo team"), "Everything here is example data and resets when you leave. Switch between the coach and a player with the button in the top corner."), el("button", { class: "btn", onclick: openDemoPicker }, "Switch view"), el("button", { class: "btn primary", onclick: exitDemo }, "Create an account"));
  return null;
}

/* ---------- sign-in page ---------- */
function authPage() {
  const mode = S.authMode; // signin | signup | reset
  const msg = S.authMsg;
  const err = el("div", { class: "err", hidden: !(msg && msg.err) }, msg?.err || "");
  const ok = el("div", { class: "ok", hidden: !(msg && msg.ok) }, msg?.ok || "");
  const setMode = m => { S.authMode = m; S.authMsg = null; render(); };
  const submit = async e => {
    e.preventDefault(); const fd = new FormData(e.currentTarget); const btn = e.currentTarget.querySelector("button.primary"); btn.disabled = true;
    const email = String(fd.get("email") || "").trim(); const pw = String(fd.get("password") || "");
    S.authEmail = email; S.authName = String(fd.get("name") || S.authName || "");
    try {
      if (mode === "signin") await F.a.signInWithEmailAndPassword(F.auth, email, pw);
      else if (mode === "signup") {
        const name = String(fd.get("name") || "").trim();
        if (pw !== fd.get("password2")) throw { code: "app/mismatch" };
        const consent = readConsent(fd); if (consent.error) throw { code: "app/consent", message: consent.error };
        pendingName = name; pendingConsent = consent; const code = cleanCode(fd.get("code")); if (code) pendingJoin = code;
        const cred = await F.a.createUserWithEmailAndPassword(F.auth, email, pw);
        await F.a.updateProfile(cred.user, { displayName: name }).catch(() => {});
      } else {
        await F.a.sendPasswordResetEmail(F.auth, email);
        S.authMsg = { ok: "Check your inbox for a link to reset your password. It can take a minute, and may land in spam." }; render(); return;
      }
    } catch (ex) {
      S.authMsg = { err: ex.code === "app/mismatch" ? "The two passwords don’t match." : ex.code === "app/consent" ? ex.message : authErr(ex) };
      if (mode === "signup") pendingConsent = null;
      // show the message without redrawing, so passwords and ticked boxes stay filled in
      ok.hidden = true; err.textContent = S.authMsg.err; err.hidden = false; err.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } finally { btn.disabled = false; }
  };
  const inputs = [];
  if (mode === "signup") inputs.push(field("Your name", el("input", { id: "a-name", name: "name", required: true, autocomplete: "name", placeholder: "e.g. Sam Patel", value: S.authName || "" })));
  inputs.push(field("Email", el("input", { id: "a-email", name: "email", type: "email", required: true, autocomplete: "email", inputmode: "email", value: S.authEmail || "" })));
  if (mode !== "reset") inputs.push(field("Password", el("input", { id: "a-pw", name: "password", type: "password", required: true, minlength: mode === "signup" ? 6 : null, autocomplete: mode === "signup" ? "new-password" : "current-password" })));
  if (mode === "signup") {
    inputs.push(field("Repeat password", el("input", { id: "a-pw2", name: "password2", type: "password", required: true, minlength: 6, autocomplete: "new-password" })));
    inputs.push(field("Club code (players, optional)", el("input", { id: "a-code", name: "code", value: pendingJoin || "", autocomplete: "off", placeholder: "e.g. K7P2QX", style: "text-transform:uppercase" })));
    inputs.push(consentFields());
  }
  const titles = { signin: "Sign in", signup: "Create your account", reset: "Reset your password" };
  return el("div", { class: "auth" }, el("div", { class: "auth-card" },
    el("div", { class: "auth-brand" }, brandMark(), el("div", {}, el("h1", {}, "Touchline Team"), el("p", {}, "Training, food, attendance and form for coaches and players."))),
    S.fbError ? el("div", { class: "err" }, S.fbError) : null,
    pendingJoin && mode !== "reset" ? el("div", { class: "ok" }, `You’ve been invited to join a club (code ${pendingJoin}). Sign in or create an account to join.`) : null,
    el("h2", {}, titles[mode]),
    err, ok,
    el("form", { onsubmit: submit }, inputs, el("button", { class: "btn primary", disabled: !F || null }, mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link")),
    mode === "signin" ? el("div", { class: "row", style: "justify-content:space-between" }, el("button", { class: "linkish", onclick: () => setMode("reset") }, "Forgot password?"), el("span", { class: "muted", style: "font-size:14px" }, "New here? ", el("button", { class: "linkish", onclick: () => setMode("signup") }, "Create an account")))
      : el("div", {}, el("button", { class: "linkish", onclick: () => setMode("signin") }, "← Back to sign in")),
    el("div", { class: "divider" }, "or"),
    el("button", { class: "btn", style: "justify-content:center", onclick: startDemo }, "Look around a demo team first"),
    legalLinks()));
}

/* ---------- legal: consent, links, data export, deleting accounts and clubs ---------- */
function legalLinks() {
  return el("div", { class: "legal-links" }, el("a", { href: "privacy.html", target: "_blank", rel: "noopener" }, "Privacy policy"), el("span", { "aria-hidden": "true" }, "·"), el("a", { href: "terms.html", target: "_blank", rel: "noopener" }, "Terms of use"));
}
function consentFields() {
  const guardian = el("div", { class: "guardian", hidden: true },
    el("p", { class: "muted", style: "margin:0;font-size:13px" }, "Because you’re under 16, a parent or guardian needs to agree. Please fill this in together with them."),
    field("Parent or guardian’s name", el("input", { id: "c-gname", name: "gname", autocomplete: "off", maxlength: 80 })),
    field("Parent or guardian’s email", el("input", { id: "c-gemail", name: "gemail", type: "email", autocomplete: "off", maxlength: 120 })),
    el("label", { class: "check" }, el("input", { type: "checkbox", name: "gok", id: "c-gok" }), el("span", {}, "I’m this player’s parent or guardian. I’ve read the privacy policy and I agree to them using Touchline Team.")));
  const age = el("div", { class: "field" }, el("span", {}, "Your age"), seg("age", [["adult", "16 or older"], ["child", "Under 16"]], ""));
  age.addEventListener("change", e => { if (e.target.name === "age") guardian.hidden = e.target.value !== "child"; });
  return el("div", { class: "consent" }, age, guardian,
    el("label", { class: "check" }, el("input", { type: "checkbox", name: "share", id: "c-share" }), el("span", {}, "I agree that what I log (meals, nutrition, workouts and availability) can be seen by the coaches of clubs I join.")),
    el("label", { class: "check" }, el("input", { type: "checkbox", name: "terms", id: "c-terms" }), el("span", {}, "I agree to the ", el("a", { href: "terms.html", target: "_blank", rel: "noopener" }, "Terms of use"), " and I’ve read the ", el("a", { href: "privacy.html", target: "_blank", rel: "noopener" }, "Privacy policy"), ".")));
}
function readConsent(fd) {
  const age = fd.get("age");
  if (!age) return { error: "Tell us whether you’re 16 or older, or under 16." };
  const out = { version: LEGAL_VERSION, at: new Date().toISOString(), adult: age === "adult", share: true, terms: true };
  if (age === "child") {
    const gname = String(fd.get("gname") || "").trim(), gemail = String(fd.get("gemail") || "").trim();
    if (!gname || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(gemail)) return { error: "Players under 16 need a parent or guardian’s name and email." };
    if (!fd.get("gok")) return { error: "Your parent or guardian needs to tick the box to agree." };
    out.guardianName = gname; out.guardianEmail = gemail;
  }
  if (!fd.get("share")) return { error: "Please agree to coaches seeing what you log. The app can’t work for a club without it." };
  if (!fd.get("terms")) return { error: "Please agree to the Terms of use and Privacy policy to continue." };
  return out;
}
function consentPage() {
  const err = el("div", { class: "err", hidden: !S.authMsg?.err }, S.authMsg?.err || "");
  const updated = !!S.profile?.consent;
  return el("div", { class: "auth" }, el("div", { class: "auth-card" },
    el("div", { class: "auth-brand" }, brandMark(), el("div", {}, el("h1", {}, updated ? "We’ve updated our terms" : "Before you start"), el("p", {}, S.user?.email || ""))),
    el("p", { style: "margin:0" }, updated ? "Please read the updated privacy policy and terms and agree to continue." : "Please confirm a few things so we can look after your data properly."),
    err,
    el("form", { onsubmit: async e => {
      e.preventDefault(); const c = readConsent(new FormData(e.currentTarget));
      if (c.error) { S.authMsg = { err: c.error }; render(); return; }
      try { await F.f.setDoc(D("users", S.user.uid), { consent: c }, { merge: true }); S.profile = { ...S.profile, consent: c }; S.authMsg = null; afterProfile(); }
      catch (ex) { S.authMsg = { err: fsErr(ex) }; render(); }
    } }, consentFields(), el("button", { class: "btn primary" }, "Continue")),
    el("div", { class: "row", style: "justify-content:space-between" }, el("button", { class: "linkish", onclick: doSignOut }, "Sign out"), el("button", { class: "linkish", style: "color:var(--bad)", onclick: openDeleteAccount }, "Delete my account")),
    legalLinks()));
}

const MEMBER_DATA = ["logs", "rsvp", "plans", "feedback", "attendance"];
const CLUB_SUBS = ["sessions", "announcements", "registers", "logs", "rsvp", "plans", "feedback", "attendance", "stats"];
async function exportMyData() {
  const f = F.f; const uid = S.user.uid;
  toast("Gathering your data…");
  try {
    const out = { exported: new Date().toISOString(), app: "Touchline Team", account: { uid, email: S.user.email }, profile: S.profile, clubs: [] };
    for (const id of S.profile?.clubs || []) {
      const c = { clubId: id };
      try {
        const club = await f.getDoc(D("clubs", id)); c.club = club.exists() ? { name: club.data().name, sport: club.data().sport, season: club.data().season } : null;
        const mem = await f.getDoc(D("clubs", id, "members", uid)); c.membership = mem.exists() ? mem.data() : null;
        for (const col of MEMBER_DATA) c[col] = (await f.getDocs(f.query(Col("clubs", id, col), f.where("uid", "==", uid)))).docs.map(d => ({ id: d.id, ...d.data() }));
        const st = await f.getDoc(D("clubs", id, "stats", uid)); c.stats = st.exists() ? st.data() : null;
      } catch (e) { c.error = "Couldn’t read this club (you may no longer be a member)."; }
      out.clubs.push(c);
    }
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = el("a", { href: URL.createObjectURL(blob), download: `touchline-team-my-data-${TODAY}.json` }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast("Your data has been downloaded");
  } catch (e) { console.error(e); toast(fsErr(e)); }
}
async function deleteInBatches(refs) {
  for (let i = 0; i < refs.length; i += 400) { const b = F.f.writeBatch(F.db); refs.slice(i, i + 400).forEach(r => b.delete(r)); await b.commit(); }
}
async function deleteClubData(id, joinCode) {
  const f = F.f; const uid = S.user.uid;
  for (const col of CLUB_SUBS) await deleteInBatches((await f.getDocs(Col("clubs", id, col))).docs.map(d => d.ref));
  if (joinCode) await f.deleteDoc(D("joinCodes", joinCode)).catch(() => {});
  const mems = (await f.getDocs(Col("clubs", id, "members"))).docs;
  await deleteInBatches(mems.filter(d => d.id !== uid).map(d => d.ref));
  await f.deleteDoc(D("clubs", id, "members", uid));
  await f.deleteDoc(D("clubs", id));
  await f.updateDoc(D("users", uid), { clubs: f.arrayRemove(id) }).catch(() => {});
}
async function deleteMyClubData(id) {
  const f = F.f; const uid = S.user.uid;
  const mine = col => f.getDocs(f.query(Col("clubs", id, col), f.where("uid", "==", uid))).then(s => s.docs.map(d => d.ref)).catch(() => []);
  const refs = []; for (const col of MEMBER_DATA) refs.push(...await mine(col));
  await deleteInBatches(refs);
  await f.deleteDoc(D("clubs", id, "stats", uid)).catch(() => {});
  // messages this person wrote as a coach stay with the club, without their name
  for (const col of ["feedback", "announcements"]) {
    const s = await f.getDocs(f.query(Col("clubs", id, col), f.where("authorUid", "==", uid))).catch(() => null);
    if (s) for (const d of s.docs) await f.updateDoc(d.ref, { author: "Former coach", authorUid: null }).catch(() => {});
  }
  await f.deleteDoc(D("clubs", id, "members", uid)).catch(() => {});
}
function openDeleteClub() {
  const name = S.club?.name || "this club";
  modal("Delete " + name, [
    el("p", { style: "margin:0" }, `This permanently deletes ${name} and everything in it: the squad list, sessions, registers, ratings, plans, feedback, announcements and every player’s logs. Players keep their accounts but lose access. This can’t be undone.`),
    field("Type the club name to confirm", el("input", { id: "dc-name", name: "name", required: true, autocomplete: "off" })),
  ], { label: "Delete club", submit: async fd => {
    if (fd.get("name").trim() !== S.club.name) { toast("The name doesn’t match"); return false; }
    const id = S.clubId, code = S.club.joinCode;
    try { stopClub(); S.phase = "loading"; render(); await deleteClubData(id, code); delete S.clubNames[id]; store.del("team.lastClub." + S.user.uid); S.phase = "clubs"; render(); toast(`${name} has been deleted`); return true; }
    catch (e) { console.error(e); S.phase = "clubs"; render(); toast(fsErr(e)); return false; }
  } });
}
async function openDeleteAccount() {
  const uid = S.user.uid; const owned = [];
  for (const id of S.profile?.clubs || []) { try { const c = await F.f.getDoc(D("clubs", id)); if (c.exists() && c.data().ownerUid === uid) owned.push({ id, ...c.data() }); } catch {} }
  modal("Delete my account", [
    el("p", { style: "margin:0" }, "This permanently deletes your account, your profile and everything you’ve logged: meals, workouts, availability, and the plans, feedback, attendance, ratings and stats your coaches recorded about you. Messages you wrote to a club as a coach stay with the club without your name. This can’t be undone."),
    owned.length ? el("div", { class: "err" }, `You own ${owned.map(c => c.name).join(", ")}. Deleting your account also deletes ${owned.length > 1 ? "these clubs" : "this club"} and all ${owned.length > 1 ? "their" : "its"} data for every member. To keep a club going, contact us first to make someone else the owner.`) : null,
    el("p", { class: "muted", style: "margin:0;font-size:13px" }, "Want a copy first? ", el("button", { type: "button", class: "linkish", onclick: exportMyData }, "Download my data")),
    field("Enter your password to confirm", el("input", { id: "da-pw", name: "pw", type: "password", required: true, autocomplete: "current-password" })),
  ], { label: "Delete my account", submit: async fd => {
    const a = F.a;
    try { await a.reauthenticateWithCredential(S.user, a.EmailAuthProvider.credential(S.user.email, fd.get("pw"))); }
    catch (e) { toast(authErr(e)); return false; }
    try {
      stopClub(); S.phase = "loading"; render();
      for (const id of S.profile?.clubs || []) {
        const c = owned.find(o => o.id === id);
        try { if (c) await deleteClubData(id, c.joinCode); else await deleteMyClubData(id); } catch (e) { console.warn("club cleanup", id, e); }
      }
      if (profileUnsub) { profileUnsub(); profileUnsub = null; }
      await F.f.deleteDoc(D("users", uid));
      store.del("team.lastClub." + uid);
      await a.deleteUser(S.user);
      closeModal(); S.authMode = "signin"; S.authMsg = { ok: "Your account and data have been deleted." }; S.phase = "auth"; render();
      return true;
    } catch (e) { console.error(e); S.phase = "clubs"; render(); toast(fsErr(e)); return false; }
  } });
}

/* ---------- my clubs page ---------- */
function clubsPage() {
  const clubs = S.profile?.clubs || [];
  return el("div", { class: "auth" }, el("div", { class: "auth-card" },
    el("div", { class: "auth-brand" }, el("div", { class: "crest" }, initials(S.profile?.name || "TL")), el("div", {}, el("h1", {}, `Hi, ${(S.profile?.name || "there").split(" ")[0]}`), el("p", {}, S.user?.email || ""))),
    S.err ? el("div", { class: "err" }, S.err) : null,
    clubs.length ? [el("div", { class: "label" }, "Your clubs"), el("div", { class: "club-list" }, clubs.map(id => { const c = S.clubNames[id] || { name: "Loading…" }; return el("button", { onclick: () => openClub(id), disabled: c.gone || null }, el("div", { class: "crest" }, initials(c.name)), el("div", {}, el("b", {}, c.name), el("div", { class: "muted", style: "font-size:12px" }, c.sport ? `${(SPORTS[c.sport] || SPORTS.other).label}${c.ownerUid === S.user.uid ? " · you’re the owner" : ""}` : ""))); }))] : el("p", { class: "muted", style: "margin:0" }, "You’re not in a club yet. Players: ask your coach for the club code. Coaches: create your club."),
    el("div", { class: "stack", style: "gap:8px" },
      el("button", { class: "btn primary", style: "justify-content:center", onclick: () => openJoin("") }, "Join a club with a code"),
      el("button", { class: "btn", style: "justify-content:center", onclick: openCreate }, "Create a club (coaches)")),
    el("div", { class: "row", style: "justify-content:space-between" }, el("button", { class: "linkish", onclick: openProfileEdit }, "Edit my name"), el("button", { class: "linkish", onclick: () => openFeedback() }, "Send feedback"), el("a", { class: "linkish", href: "help.html", target: "_blank", rel: "noopener", style: "text-decoration:none" }, "Help"), el("button", { class: "linkish", onclick: doSignOut }, "Sign out")),
    el("div", { class: "row", style: "justify-content:space-between" }, el("button", { class: "linkish", onclick: exportMyData }, "Download my data"), el("button", { class: "linkish", style: "color:var(--bad)", onclick: openDeleteAccount }, "Delete my account")),
    S.isAdmin ? el("button", { class: "btn", style: "justify-content:center", onclick: openAdmin }, "Admin dashboard") : null,
    legalLinks()));
}
function openCreate() {
  modal("Create your club", [
    el("p", { class: "muted", style: "margin:0" }, "You’ll be the head coach. Afterwards you’ll get a code to share with your players."),
    ...clubFields(null),
    field("Your name, as players will see it", el("input", { id: "c-coach", name: "coach", required: true, value: S.profile?.name || "", placeholder: "e.g. Coach Sam Patel" })),
    el("label", { class: "check" }, el("input", { type: "checkbox", name: "organiser", required: true }), el("span", {}, "I’m allowed to set this up for my club or team, and I’ll make sure players (and parents of players under 16) know what the app records and who can see it.")),
  ], { label: "Create club", submit: async fd => {
    try { const id = await createClub({ name: fd.get("name").trim(), sport: fd.get("sport"), season: fd.get("season").trim() }, fd.get("coach").trim()); closeModal(); await openClub(id); S.view = "squad"; render(); toast("Club created. Share the code with your players."); return true; }
    catch (e) { console.error(e); toast(fsErr(e)); return false; }
  } });
}
function openJoin(code) {
  pendingJoin = "";
  if (code) history.replaceState(null, "", location.pathname);
  const status = el("div", { class: "muted", style: "font-size:14px" });
  const codeInput = el("input", { id: "j-code", name: "code", required: true, value: code || "", autocomplete: "off", placeholder: "6 letters or numbers", style: "text-transform:uppercase;font-size:20px;letter-spacing:.12em", maxlength: 8 });
  const lookup = async () => {
    const c = cleanCode(codeInput.value); if (c.length < 6) { status.textContent = ""; return; }
    status.textContent = "Checking…";
    try { const s = await F.f.getDoc(D("joinCodes", c)); status.textContent = s.exists() ? `✓ ${s.data().name}` : "No club uses that code. Check it with your coach."; status.style.color = s.exists() ? "var(--good)" : "var(--bad)"; }
    catch { status.textContent = ""; }
  };
  codeInput.addEventListener("input", lookup);
  modal("Join a club", [
    field("Club code from your coach", codeInput), status,
    field("Your name", el("input", { id: "j-name", name: "name", required: true, value: S.profile?.name || "" })),
    el("div", { class: "fields2" }, field("Shirt number (optional)", el("input", { id: "j-num", name: "number", type: "number", min: 0, max: 999 })), field("Position or event (optional)", el("input", { id: "j-pos", name: "position", placeholder: "e.g. Midfielder" }))),
  ], { label: "Join club", submit: async fd => {
    const c = cleanCode(fd.get("code"));
    try { const id = await joinClub(c, { name: fd.get("name").trim(), number: fd.get("number") || "", position: (fd.get("position") || "").trim() }); closeModal(); await openClub(id); toast("Welcome to the club!"); return true; }
    catch (e) { toast(e.code === "app/bad-code" ? "No club uses that code. Check it with your coach." : fsErr(e)); return false; }
  } });
  if (code) lookup();
}
function openProfileEdit() {
  modal("Your name", field("Name", el("input", { id: "pf-name", name: "name", required: true, value: S.profile?.name || "" })), { submit: async fd => {
    const name = fd.get("name").trim();
    try { await F.f.updateDoc(D("users", S.user.uid), { name }); await F.a.updateProfile(S.user, { displayName: name }); toast("Saved"); return true; } catch (e) { toast(fsErr(e)); return false; }
  } });
}
function openAccount() {
  const m = me(); const owner = isOwner();
  modal("Your account", [
    el("div", { class: "who" }, jersey(m), el("div", { class: "n" }, el("b", {}, m.name), el("span", {}, S.user?.email || ""))),
    el("div", { class: "stack", style: "gap:8px" },
      el("button", { type: "button", class: "btn", onclick: () => editMember(m, true) }, "Edit my details in this club"),
      el("button", { type: "button", class: "btn", onclick: () => { closeModal(); stopClub(); S.phase = "clubs"; loadClubNames(); render(); } }, "My clubs · join or create another"),
      !owner ? el("button", { type: "button", class: "btn danger", onclick: () => confirmDel(`Leave ${S.club.name}? Your coach will no longer see your logs.`, leaveClub, "Leave club") }, "Leave this club") : null,
      S.isAdmin ? el("button", { type: "button", class: "btn primary", onclick: () => { closeModal(); openAdmin(); } }, "Admin dashboard") : null,
      el("button", { type: "button", class: "btn", onclick: () => { closeModal(); openFeedback(); } }, "Send feedback"),
      el("a", { class: "btn", href: "help.html", target: "_blank", rel: "noopener" }, "Help and guides"),
      el("button", { type: "button", class: "btn", onclick: doSignOut }, "Sign out")),
    el("div", { class: "row", style: "justify-content:space-between" }, el("button", { type: "button", class: "linkish", onclick: exportMyData }, "Download my data"), el("button", { type: "button", class: "linkish", style: "color:var(--bad)", onclick: () => { closeModal(); openDeleteAccount(); } }, "Delete my account")),
    legalLinks(),
  ]);
}

/* ---------- COACH: today ---------- */
function rsvpCounts(s) {
  const r = S.rsvp[s.id] || {}; let inN = 0, outN = 0;
  players().forEach(p => { const x = r[p.id]; if (x) x.going ? inN++ : outN++; });
  return { inN, outN, none: players().length - inN - outN };
}
function nextCard(s, coach) {
  if (!s) return el("div", { class: "next" }, el("div", { class: "info" }, el("h3", {}, "Nothing scheduled"), el("div", { class: "m" }, coach ? "Add your next training or match in Schedule." : "Your coach hasn’t added the next session yet.")), coach ? el("button", { class: "btn", onclick: () => editSession(null) }, "Add session") : null);
  const d = dObj(s.date); const mine = !coach && rsvpOf(s.id, me().id);
  let extra = null;
  if (coach) { const c = rsvpCounts(s); extra = el("div", { class: "m" }, `${c.inN} available · ${c.outN} can’t make it · ${c.none} no reply`); }
  return el("div", { class: "next" },
    el("div", { class: "date" }, el("div", { class: "d" }, d.getDate()), el("div", { class: "w" }, d.toLocaleDateString(undefined, { weekday: "short" }))),
    el("div", { class: "info" }, el("div", { class: "row" }, el("span", { class: "pill " + (s.kind === "match" ? "match" : "") }, s.kind === "match" ? sport().match + " day" : "Training"), el("span", { class: "m" }, rel(s.date))), el("h3", {}, s.title), el("div", { class: "m" }, [s.time, s.location].filter(Boolean).join(" · ")), extra,
      !coach ? el("div", { class: "m" }, mine ? (mine.going ? "You said you’ll be there" : "You said you can’t make it" + (mine.reason ? `: ${mine.reason}` : "")) : "Let your coach know if you’re coming") : null),
    coach ? el("button", { class: "btn", onclick: () => takeAttendance(s) }, "Take register") : el("div", { class: "row" }, el("button", { class: "btn", onclick: () => A.setRsvp(s, true, "") }, "I’ll be there"), el("button", { class: "btn", style: "background:transparent;color:inherit;border-color:currentColor", onclick: () => cantMake(s) }, "Can’t make it")));
}
function cantMake(s) {
  modal("Can’t make it", [el("p", { class: "muted", style: "margin:0" }, `${s.title}, ${fmtDay(s.date)}`), field("Reason (your coach sees this)", el("input", { id: "rs-reason", name: "reason", required: true, placeholder: "e.g. School exam, ill, family event" }))], { label: "Tell my coach", submit: fd => A.setRsvp(s, false, fd.get("reason").trim()) });
}
function flags() {
  const out = [];
  needsRegister().slice(-3).forEach(s => out.push({ sev: "info", text: `Register not taken for ${s.title} (${fmtDay(s.date)})`, act: () => takeAttendance(s) }));
  const next = upcoming()[0]; const late = new Date().getHours() >= 20;
  players().forEach(p => {
    const r = register(p.id, 2);
    if (r.length === 2 && r.every(x => x.a.status === "absent")) out.push({ sev: "bad", m: p, text: `${p.name} missed the last 2 sessions without an excuse` });
    if (next) { const x = rsvpOf(next.id, p.id); if (x && !x.going) out.push({ sev: "warn", m: p, text: `${p.name} can’t make ${next.title}${x.reason ? ": " + x.reason : ""}` }); }
    const tg = targetsOf(p.id); const t = totals(mealsOn(p.id, TODAY));
    if (late && tg.protein && t.protein < tg.protein * 0.7) out.push({ sev: "warn", m: p, text: `${p.name} is well under their protein target today (${r0(t.protein)} of ${tg.protein} g)` });
    const last = logsOf(p.id)[0];
    if (!last || last.date < addDays(TODAY, -2)) out.push({ sev: "info", m: p, text: last ? `${p.name} hasn’t logged anything since ${fmtDay(last.date)}` : `${p.name} hasn’t logged anything recently` });
    const oi = openInstr(p.id).filter(f => f.date < TODAY);
    if (oi.length) out.push({ sev: "info", m: p, text: `${p.name} hasn’t confirmed ${oi.length === 1 ? "your instruction" : oi.length + " instructions"}` });
  });
  const order = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.sev] - order[b.sev]);
}
function vToday() {
  const ps = players(); const fl = flags();
  if (!ps.length) return [nextCard(upcoming()[0], true), invitePanel(true)];
  const fed = ps.filter(p => mealsOn(p.id, TODAY).length);
  const avg = k => fed.length ? fed.reduce((s, p) => s + totals(mealsOn(p.id, TODAY))[k], 0) / fed.length : null;
  const pcts = ps.map(p => attPct(p.id)).filter(v => v != null);
  const teamAtt = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  const aK = avg("kcal"), aP = avg("protein");
  return [
    nextCard(upcoming()[0], true),
    el("div", { class: "tiles" },
      tile("Logged food today", fed.length, `/${ps.length}`, "Players with at least one meal"),
      tile("Avg calories today", aK == null ? "—" : r0(aK), aK == null ? "" : "kcal", "Players who logged food"),
      tile("Avg protein today", aP == null ? "—" : r0(aP), aP == null ? "" : "g", "Players who logged food"),
      tile("Attendance", teamAtt == null ? "—" : teamAtt, teamAtt == null ? "" : "%", "Squad average, recorded sessions")),
    fl.length ? el("section", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, "Needs attention"), el("span", { class: "pill " + (fl.some(f => f.sev === "bad") ? "bad" : "warn") }, fl.length)),
      el("ul", { class: "flags" }, fl.slice(0, 10).map(f => el("li", { class: "flag " + f.sev, tabindex: 0, onclick: f.act || (() => go("player", f.m.id)), onkeydown: e => e.key === "Enter" && e.currentTarget.click() }, f.m ? jersey(f.m) : el("span", { class: "pill accent" }, "Register"), el("span", {}, f.text))))) : null,
    el("section", { class: "panel" },
      el("div", { class: "panel-head" }, el("h3", {}, "Squad today"), el("span", { class: "muted" }, fmtDay(TODAY) + " · tap a player for their full profile")),
      el("div", {}, el("div", { class: "sq-head label" }, ["Player", "Calories", "Protein", "Carbs · fat", "Training today", "Register", "Form"].map(h => el("div", {}, h))), ps.map(p => squadRow(p)))),
  ];
}
function vsTarget(v, tg, unit) {
  return [el("b", { class: "num" }, `${r0(v)}${tg ? " / " + tg : ""} ${unit}`), tg ? el("div", { class: "bar" }, el("span", { style: `width:${Math.min(100, Math.round(100 * v / tg))}%` })) : null];
}
function squadRow(p) {
  const meals = mealsOn(p.id, TODAY); const wo = workoutsOn(p.id, TODAY); const t = totals(meals); const tg = targetsOf(p.id);
  const c = (l, ...k) => el("div", { class: "cell" }, el("span", { class: "l" }, l), ...k);
  const none = el("span", { class: "muted" }, "No meals yet");
  return el("div", { class: "sq-row", tabindex: 0, onclick: () => go("player", p.id), onkeydown: e => e.key === "Enter" && go("player", p.id) },
    el("div", { class: "cell" }, who(p)),
    c("Calories", meals.length ? [...vsTarget(t.kcal, tg.kcal, "kcal"), el("span", { class: "muted trunc", style: "font-size:12px" }, `${meals.length} meal${meals.length > 1 ? "s" : ""}`)] : none),
    c("Protein", meals.length ? vsTarget(t.protein, tg.protein, "g") : el("span", { class: "muted" }, "—")),
    c("Carbs · fat", meals.length ? el("span", { class: "num" }, `${r0(t.carbs)} g · ${r0(t.fat)} g`) : el("span", { class: "muted" }, "—")),
    c("Training today", wo.length ? [el("b", {}, wo.map(x => x.kind).join(", ")), el("span", { class: "muted trunc" }, `${wo.reduce((s, x) => s + (+x.duration || 0), 0)} min`)] : el("span", { class: "muted" }, "Nothing yet")),
    c("Register", regDots(p.id)),
    c("Form", formChips(p.id)));
}

/* ---------- player profile ---------- */
function vPlayer(id, asCoach) {
  const p = byId(id); if (!p) return el("div", { class: "empty" }, "Player not found.");
  const st = statsOf(id); const pct = attPct(id); const f = form(id, 10); const avg = f.length ? f.reduce((a, b) => a + b, 0) / f.length : null;
  const plans = S.plans.filter(x => x.uid === id).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const fbs = S.feedback.filter(x => x.uid === id).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return [
    asCoach ? el("div", {}, el("button", { class: "back", onclick: () => go("today") }, "← Back to squad")) : null,
    el("section", { class: "panel phero" }, jersey(p, true),
      el("div", { class: "n" }, el("div", { class: "label" }, p.position || "Player"), el("h2", {}, p.name), el("div", { class: "muted" }, `Attendance ${pct == null ? "—" : pct + "%"} · Trained ${minutes7(id)} min this week · Avg rating ${avg == null ? "—" : avg.toFixed(1)}`)),
      asCoach ? el("div", { class: "row" }, el("button", { class: "btn ghost", onclick: () => { S.preview = id; S.view = "home"; render(); scrollTo({ top: 0 }); } }, "See their view"), el("button", { class: "btn", onclick: () => editPlan(id) }, "New plan"), el("button", { class: "btn primary", onclick: () => giveFeedback(id) }, "Give feedback")) : null),
    el("section", { class: "panel" },
      el("div", { class: "panel-head" }, el("h3", {}, `Season ${S.club?.season || ""} stats`), asCoach ? el("button", { class: "btn small", onclick: () => editStats(id) }, "Update stats") : null),
      el("div", { class: "tiles" }, sport().stats.map(([k, l]) => tile(l, st[k] ?? "—")))),
    el("div", { class: "grid2" },
      el("section", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, "Recent form"), el("span", { class: "muted" }, "Coach rating per session, 1–10")), formChart(id)),
      el("section", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, "Calories"), el("span", { class: "muted" }, "Last 14 days" + (targetsOf(id).kcal ? " · line is the target" : ""))), kcalChart(id))),
    el("section", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, "Food today"), asCoach ? el("button", { class: "btn small", onclick: () => editTargets(id) }, "Set daily targets") : el("span", { class: "muted" }, Object.keys(targetsOf(id)).length ? "Targets set by your coach" : "")), foodToday(id)),
    el("div", { class: "grid2" },
      el("section", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, "Plans")), plans.length ? el("div", { class: "stack" }, plans.map(pl => planCard(pl, asCoach))) : el("div", { class: "empty" }, asCoach ? "No plans yet. Use “New plan” to set one." : "Your coach hasn’t set a plan yet.")),
      el("section", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, "Feedback & instructions")), fbs.length ? el("div", { class: "stack" }, fbs.map(x => fbCard(x, asCoach))) : el("div", { class: "empty" }, "No feedback yet."))),
    el("div", { class: "grid2" },
      el("section", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, "Register"), el("span", { class: "muted" }, "Recent sessions")), registerList(id)),
      el("section", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, "Recent activity")), logList(logsOf(id).slice(0, 15), !asCoach && !S.preview))),
  ];
}
function formChart(id) {
  const r = register(id, 60).filter(x => x.a.rating).slice(0, 10).reverse();
  if (!r.length) return el("div", { class: "empty" }, "No ratings yet. Coaches add them when taking the register.");
  const W0 = 320, H = 130, L = 22, B = 18, bw = (W0 - L) / 10;
  let s = `<svg class="chart" viewBox="0 0 ${W0} ${H}" role="img" aria-label="Ratings for the last ${r.length} sessions">`;
  [2, 4, 6, 8, 10].forEach(v => { const y = (H - B) - v / 10 * (H - B - 6); s += `<line x1="${L}" x2="${W0}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${y + 3}" text-anchor="end">${v}</text>`; });
  r.forEach((x, i) => { const v = +x.a.rating; const h = v / 10 * (H - B - 6); const cx = L + i * bw + 4; const col = v >= 7.5 ? "var(--good)" : v >= 6 ? "var(--muted)" : "var(--bad)"; const d = dObj(x.s.date);
    s += `<rect x="${cx}" y="${H - B - h}" width="${bw - 8}" height="${h}" rx="3" fill="${col}"/><text x="${cx + (bw - 8) / 2}" y="${H - 5}" text-anchor="middle">${d.getDate()}/${d.getMonth() + 1}</text>`; });
  return el("div", { html: s + "</svg>" });
}
function kcalChart(id) {
  const days = [...Array(14)].map((_, i) => addDays(TODAY, i - 13));
  const vals = days.map(d => totals(mealsOn(id, d)).kcal); const tg = +targetsOf(id).kcal || 0;
  if (!vals.some(Boolean)) return el("div", { class: "empty" }, "No meals logged in the last 14 days.");
  const top = Math.ceil(Math.max(1000, tg * 1.15, ...vals) / 500) * 500; const W0 = 320, H = 130, L = 34, B = 18, bw = (W0 - L) / 14;
  const y = v => (H - B) - v / top * (H - B - 6);
  let s = `<svg class="chart" viewBox="0 0 ${W0} ${H}" role="img" aria-label="Calories per day for the last 14 days">`;
  [0, top / 2, top].forEach(v => { s += `<line x1="${L}" x2="${W0}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 5}" y="${y(v) + 3}" text-anchor="end">${v}</text>`; });
  vals.forEach((v, i) => { const x = L + i * bw + 2;
    s += `<rect x="${x}" y="${y(v)}" width="${bw - 4}" height="${Math.max((H - B) - y(v), 0)}" rx="2" fill="${days[i] === TODAY ? "var(--card)" : "var(--accent)"}"/>`;
    if (i % 2 === 1) s += `<text x="${x + (bw - 4) / 2}" y="${H - 5}" text-anchor="middle">${dObj(days[i]).getDate()}</text>`; });
  if (tg) s += `<line x1="${L}" x2="${W0}" y1="${y(tg)}" y2="${y(tg)}" stroke="var(--good)" stroke-width="2" stroke-dasharray="5 4"/>`;
  return el("div", { html: s + "</svg>" });
}
function foodToday(id) {
  const meals = mealsOn(id, TODAY); const t = totals(meals); const tg = targetsOf(id);
  return el("div", { class: "macros" }, MACROS.map(([k, l, u]) => el("div", { class: "macro" },
    el("div", { class: "label" }, l),
    el("div", { class: "v num" }, r0(t[k]), el("small", {}, tg[k] ? ` / ${tg[k]} ${u}` : ` ${u}`)),
    el("div", { class: "bar" }, el("span", { style: `width:${tg[k] ? Math.min(100, Math.round(100 * t[k] / tg[k])) : 0}%;${tg[k] && t[k] > tg[k] * 1.1 ? "background:var(--warn)" : ""}` })))));
}
function editTargets(id) {
  const tg = targetsOf(id);
  modal("Daily targets · " + byId(id).name, [
    el("p", { class: "muted", style: "margin:0" }, "The player sees these on their home screen and you see progress in the squad table. Leave a box empty for no target."),
    el("div", { class: "fields2" }, MACROS.map(([k, l, u]) => field(`${l} (${u})`, el("input", { id: "t-" + k, name: k, type: "number", min: 0, max: k === "kcal" ? 8000 : 800, value: tg[k] ?? "" })))),
  ], { submit: fd => { const t = {}; MACROS.forEach(([k]) => { const v = fd.get(k); if (v !== "") t[k] = +v; }); return A.saveTargets(id, t); } });
}
function registerList(id) {
  const r = register(id, 10);
  if (!r.length) return el("div", { class: "empty" }, "No attendance recorded yet.");
  const cls = { present: "good", late: "warn", absent: "bad", excused: "" };
  return el("ul", { class: "list" }, r.map(({ s, a }) => el("li", {}, el("div", { class: "li-main" }, el("div", { class: "t" }, s.title), el("div", { class: "muted", style: "font-size:13px" }, `${fmtDay(s.date)} · ${s.kind === "match" ? sport().match : "Training"}`)),
    a.rating ? el("span", { class: "chip" }, "★ " + a.rating) : null, el("span", { class: "pill " + cls[a.status] }, a.status))));
}
function planCard(pl, asCoach) {
  const items = pl.items || []; const ticks = items.map((_, i) => !!(pl.ticks || [])[i]); const done = ticks.filter(Boolean).length;
  const canTick = !asCoach && !S.preview && pl.uid === me().id;
  return el("div", { class: "plan" },
    el("div", { class: "row", style: "justify-content:space-between" }, el("h4", {}, pl.title), el("span", { class: "muted", style: "font-size:12px" }, `${done}/${items.length} done${pl.due ? " · by " + fmtDay(pl.due) : ""}`)),
    pl.note ? el("p", { class: "muted", style: "margin:4px 0 0;font-size:13px" }, pl.note) : null,
    el("ul", {}, items.map((text, i) => el("li", {}, el("label", {}, el("input", { type: "checkbox", checked: ticks[i], disabled: !canTick, onchange: e => { const next = ticks.slice(); next[i] = e.target.checked; A.tickPlan(pl, next); } }), el("span", { class: ticks[i] ? "done" : "" }, text))))),
    el("div", { class: "progress" }, el("span", { style: `width:${items.length ? Math.round(100 * done / items.length) : 0}%` })),
    el("div", { class: "row", style: "margin-top:8px;justify-content:space-between" }, el("span", { class: "muted", style: "font-size:12px" }, `From ${pl.author || "your coach"} · ${rel(pl.date)}`), asCoach ? el("button", { class: "btn small danger", onclick: () => confirmDel("Delete this plan?", () => A.deletePlan(pl)) }, "Delete") : null));
}
function fbCard(x, asCoach) {
  return el("div", { class: "fb " + x.kind },
    el("div", { class: "row", style: "justify-content:space-between" }, el("span", { class: "pill " + (x.kind === "instruction" ? "accent" : "") }, x.kind === "instruction" ? "Instruction" : "Feedback"), el("span", { class: "muted", style: "font-size:12px" }, `${x.author || "Coach"} · ${rel(x.date)}`)),
    el("p", {}, x.text),
    x.kind === "instruction" ? el("div", { class: "row", style: "margin-top:8px;justify-content:flex-end" },
      x.ack ? el("span", { class: "pill good" }, "✓ Got it") : (!asCoach && !S.preview && x.uid === me().id ? el("button", { class: "btn small primary", onclick: () => A.ackFb(x) }, "Got it") : el("span", { class: "pill warn" }, "Not confirmed yet"))) : null,
    asCoach ? el("div", { class: "row", style: "justify-content:flex-end;margin-top:4px" }, el("button", { class: "btn small ghost danger", onclick: () => confirmDel("Delete this message?", () => A.deleteFb(x)) }, "Delete")) : null);
}

/* ---------- logs ---------- */
function logLine(l) {
  if (l.type === "meal") {
    const has = MACROS.some(([k]) => l[k]);
    return [el("div", { class: "kind-ico meal" }, "M"), el("div", { class: "li-main" },
      el("div", { class: "row", style: "gap:6px" }, el("span", { class: "t" }, l.kind), l.ai ? el("span", { class: "pill accent", title: "Numbers estimated by AI" }, l.ai === "photo" ? "From photo" : "AI estimate") : null),
      el("p", {}, l.text),
      has ? el("div", { class: "chips", style: "margin-top:4px" }, el("span", { class: "chip" }, r0(l.kcal) + " kcal"), el("span", { class: "chip" }, "P " + r0(l.protein) + " g"), el("span", { class: "chip" }, "C " + r0(l.carbs) + " g"), el("span", { class: "chip" }, "F " + r0(l.fat) + " g")) : null)];
  }
  return [el("div", { class: "kind-ico workout" }, "W"), el("div", { class: "li-main" }, el("div", { class: "t" }, l.kind), el("div", { class: "chips", style: "margin-top:3px" }, el("span", { class: "chip" }, l.duration + " min")), l.notes ? el("p", {}, l.notes) : null)];
}
function logList(ls, canDelete) {
  if (!ls.length) return el("div", { class: "empty" }, "Nothing logged yet.");
  const out = []; let d = null;
  ls.forEach(l => { if (l.date !== d) { d = l.date; out.push(el("div", { class: "dayhead" }, rel(d))); }
    out.push(el("ul", { class: "list" }, el("li", {}, logLine(l), canDelete ? el("button", { class: "icon-btn", "aria-label": "Delete entry", title: "Delete", onclick: () => confirmDel("Delete this entry?", () => deleteLogItem(l)) }, "×") : null))); });
  return el("div", {}, out);
}
function addLog(type) {
  if (S.preview) { toast("This is a preview. Players log from their own account."); return; }
  if (locked()) { toast(lockedMsg()); return; }
  if (type === "meal") return addMeal();
  modal("Log a workout", [
    el("div", { class: "fields2" }, field("Type", sel("f-kind", "kind", WORKOUTS, "Gym")), field("Date", el("input", { id: "f-date", type: "date", name: "date", value: TODAY, max: TODAY, required: true })), field("Minutes", el("input", { id: "f-dur", type: "number", name: "duration", min: 1, max: 600, value: 45, required: true }))),
    field("Notes (optional)", el("textarea", { id: "f-notes", name: "notes", maxlength: 400, placeholder: "e.g. 5×5 squats at 80 kg, felt strong" })),
  ], { submit: async fd => {
    const d = Object.fromEntries(fd.entries()); const date = d.date && d.date <= TODAY ? d.date : TODAY;
    const ok = await addLogItem("workout", date, { id: rid(), kind: d.kind, duration: +d.duration, notes: (d.notes || "").trim(), ts: Date.now() });
    if (ok) toast("Workout logged"); return ok;
  } });
}

/* ---------- meals: nutrition by hand, from a description, or from a photo ---------- */
let aiCache = null;
async function getFoodModel(modelName) {
  if (!aiCache) {
    const m = await import(`${FB_BASE}/firebase-ai.js`);
    const ai = m.getAI(F.app, { backend: new m.GoogleAIBackend() });
    const Sc = m.Schema;
    const schema = Sc.object({ properties: {
      isFood: Sc.boolean(),
      summary: Sc.string(),
      items: Sc.array({ items: Sc.object({ properties: { name: Sc.string(), portion: Sc.string(), kcal: Sc.number(), protein: Sc.number(), carbs: Sc.number(), fat: Sc.number() } }) }),
    } });
    aiCache = { m, ai, schema, models: {} };
  }
  if (!aiCache.models[modelName]) aiCache.models[modelName] = aiCache.m.getGenerativeModel(aiCache.ai, { model: modelName, generationConfig: { responseMimeType: "application/json", responseSchema: aiCache.schema, temperature: 0.2 } });
  return aiCache.models[modelName];
}
const FOOD_PROMPT = `You are a sports nutritionist helping athletes log what they eat.
Identify every food and drink in the meal and estimate a realistic portion for each one. If a portion isn't clear, assume a normal serving for an active teenager or adult.
For each item give: name, portion (e.g. "150 g", "1 cup", "2 slices"), kcal, and grams of protein, carbs and fat. Use whole numbers.
"summary" is a short plain description of the whole meal, like "Grilled chicken, rice and broccoli".
If there is no food or drink at all, set isFood to false and return an empty items list.`;
async function estimateFood({ text, image }) {
  if (window.TEAM_AI_MOCK) return window.TEAM_AI_MOCK({ text, image });
  const parts = [FOOD_PROMPT];
  if (text) parts.push(`The athlete describes the meal as: "${text.slice(0, 400)}"`);
  if (image) parts.push({ inlineData: { mimeType: "image/jpeg", data: image } });
  let lastErr;
  for (const name of AI_MODELS) {
    try {
      const model = await getFoodModel(name);
      const res = await model.generateContent(parts);
      return JSON.parse(res.response.text());
    } catch (e) {
      lastErr = e; console.warn("food estimate failed with", name, e);
      if (!/not.?found|404|unsupported|deprecated/i.test(String(e && (e.message || e.code)))) break; // only move on to the next model if this one doesn't exist
    }
  }
  throw lastErr;
}
function aiErr(e) {
  const msg = String((e && e.message) || "") + " " + String((e && e.code) || "");
  if (/quota|\b429\b|RESOURCE_EXHAUSTED/i.test(msg)) return "The food scanner is busy or has hit today’s limit. Try again in a minute, or fill in the numbers yourself.";
  if (/Failed to fetch|NetworkError|network error|Load failed|ERR_/i.test(msg)) return "Couldn’t reach the food scanner. Check your connection and try again.";
  if (/api-not-enabled|has not been used|SERVICE_DISABLED|is disabled|\b403\b|PERMISSION_DENIED/i.test(msg)) return "Food scanning isn’t switched on yet. The site owner needs to turn on AI Logic in Firebase.";
  return "The food scanner couldn’t work this one out. Try a clearer photo or add a description.";
}
async function shrinkImage(file, max = 1024) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("That file isn’t a photo the browser can open.")); i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL("image/jpeg", 0.82);
    return { dataUrl, base64: dataUrl.split(",")[1] };
  } finally { URL.revokeObjectURL(url); }
}
// Food scanning sends content to Google's AI, so it's only offered to people who said they're 16 or older
const canScan = () => S.demo || S.profile?.consent?.adult === true;
function addMeal() {
  const hr = new Date().getHours();
  let photo = null, aiSource = null;
  const text = el("textarea", { id: "f-text", name: "text", required: true, maxlength: 400, placeholder: "e.g. Chicken breast, a bowl of rice, broccoli and a glass of orange juice" });
  const nums = {}; MACROS.forEach(([k, l, u]) => (nums[k] = el("input", { id: "f-" + k, name: k, type: "number", min: 0, max: k === "kcal" ? 5000 : 500, inputmode: "numeric", placeholder: "0" })));
  const status = el("div", { class: "ai-status", hidden: true });
  const result = el("div", { class: "ai-result", hidden: true });
  const preview = el("img", { class: "meal-photo", alt: "Your meal photo", hidden: true });
  const fileIn = el("input", { type: "file", accept: "image/*", hidden: true, id: "f-photo" });
  const photoBtn = el("button", { type: "button", class: "btn", onclick: () => fileIn.click() }, el("span", { "aria-hidden": "true", html: camIcon }), "Scan a photo");
  const textBtn = el("button", { type: "button", class: "btn", onclick: () => run(false) }, el("span", { "aria-hidden": "true", html: sparkIcon }), "Use my description");
  const setBusy = (on, msg) => { photoBtn.disabled = textBtn.disabled = on; status.hidden = !msg; status.className = "ai-status" + (on ? " busy" : ""); status.textContent = msg || ""; };
  async function run(usePhoto) {
    const desc = text.value.trim();
    if (!usePhoto && !desc) { text.focus(); setBusy(false, "Describe the meal first, or scan a photo."); return; }
    setBusy(true, usePhoto ? "Looking at your photo…" : "Working out the nutrition…");
    try {
      const r = await estimateFood({ text: desc, image: usePhoto ? photo : null });
      const items = (r && r.items) || [];
      if (r && r.isFood === false || !items.length) { setBusy(false, usePhoto ? "No food found in that photo. Try another one, or describe the meal." : "Couldn’t recognise any food in that description."); return; }
      const t = totals(items);
      MACROS.forEach(([k]) => (nums[k].value = r0(t[k])));
      if (!desc && r.summary) text.value = r.summary.slice(0, 400);
      aiSource = usePhoto ? "photo" : "text";
      result.replaceChildren(el("div", { class: "label" }, "What the scanner found · check and adjust"),
        el("ul", {}, items.map(it => el("li", {}, el("span", {}, `${it.name}${it.portion ? " · " + it.portion : ""}`), el("span", { class: "num muted" }, `${r0(it.kcal)} kcal · P ${r0(it.protein)} · C ${r0(it.carbs)} · F ${r0(it.fat)}`)))));
      result.hidden = false; setBusy(false, "");
    } catch (e) { console.error(e); setBusy(false, aiErr(e)); }
  }
  fileIn.addEventListener("change", async () => {
    const f = fileIn.files && fileIn.files[0]; fileIn.value = ""; if (!f) return;
    try { const im = await shrinkImage(f); photo = im.base64; preview.src = im.dataUrl; preview.hidden = false; run(true); }
    catch (e) { setBusy(false, e.message || "Couldn’t open that photo."); }
  });
  modal("Log a meal", [
    el("div", { class: "fields2" }, field("Meal", sel("f-kind", "kind", MEALS, hr < 11 ? "Breakfast" : hr < 16 ? "Lunch" : "Dinner")), field("Date", el("input", { id: "f-date", type: "date", name: "date", value: TODAY, max: TODAY, required: true }))),
    canScan() ? el("div", { class: "scan-row" }, photoBtn, textBtn, fileIn) : el("p", { class: "muted", style: "margin:0;font-size:13px" }, "Photo and description scanning is available for players aged 16 and over. Fill in the numbers below, or ask a parent or coach to help."), preview, status,
    field("What did you eat?", text),
    result,
    el("div", { class: "field" }, el("span", {}, "Nutrition (fill in or let the scanner do it)"), el("div", { class: "fields2 macro-inputs" }, MACROS.map(([k, l, u]) => field(`${l} (${u})`, nums[k])))),
    el("p", { class: "muted", style: "margin:0;font-size:12px" }, "Scanning sends the photo or description to Google’s Gemini AI to work out the numbers. We don’t save photos. Numbers are estimates, not medical or dietary advice."),
  ], { submit: async fd => {
    const d = Object.fromEntries(fd.entries()); const date = d.date && d.date <= TODAY ? d.date : TODAY;
    const item = { id: rid(), kind: d.kind, text: d.text.trim(), ts: Date.now(), ai: aiSource };
    MACROS.forEach(([k]) => (item[k] = d[k] === "" || d[k] == null ? null : Math.max(0, +d[k])));
    const ok = await addLogItem("meal", date, item); if (ok) toast("Meal logged"); return ok;
  } });
}
const camIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
const sparkIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></svg>';

/* ---------- PLAYER: home + log ---------- */
function quickLog() {
  return el("div", { class: "quick two" },
    el("button", { onclick: () => addLog("meal") }, el("span", { class: "kind-ico meal" }, "M"), "Log a meal"),
    el("button", { onclick: () => addLog("workout") }, el("span", { class: "kind-ico workout" }, "W"), "Log a workout"));
}
function vHome() {
  const m = me(); const next = upcoming()[0]; const instr = openInstr(m.id);
  const plans = S.plans.filter(p => p.uid === m.id && (p.items || []).some((_, i) => !(p.ticks || [])[i])).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const squadAnn = [...S.announcements].filter(a => a.kind === "squad").sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
  const inSquad = squadAnn && (squadAnn.squad || []).includes(m.id);
  const todayLogs = logsOf(m.id).filter(l => l.date === TODAY); const hr = new Date().getHours();
  return [
    el("div", {}, el("div", { class: "label" }, dObj(TODAY).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })), el("h2", { style: "font-size:32px" }, `${hr < 12 ? "Morning" : hr < 18 ? "Afternoon" : "Evening"}, ${m.name.split(" ")[0]}`)),
    instr.length ? el("section", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, "From your coach"), el("span", { class: "pill bad" }, instr.length + " new")), el("div", { class: "stack" }, instr.map(x => fbCard(x, false)))) : null,
    squadAnn ? el("div", { class: "banner", style: inSquad ? "background:var(--card);border-color:#1d1600;color:#1d1600" : "" }, el("p", {}, el("b", { style: inSquad ? "color:#1d1600" : "" }, inSquad ? "You’re in the squad" : "Squad announced"), squadAnn.title), el("button", { class: "btn", onclick: () => go("board") }, "See squad")) : null,
    nextCard(next, false),
    el("section", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, "Today’s food"), el("span", { class: "muted" }, Object.keys(targetsOf(m.id)).length ? "Your targets are set by your coach" : "")), foodToday(m.id), el("div", { style: "margin-top:14px" }, quickLog()), todayLogs.length ? el("div", { style: "margin-top:8px" }, logList(todayLogs, !S.preview)) : null),
    el("section", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, "Your plan"), el("button", { class: "btn small ghost", onclick: () => go("me") }, "All plans")), plans.length ? el("div", { class: "stack" }, plans.map(p => planCard(p, false))) : el("div", { class: "empty" }, "All caught up. No open plan items.")),
  ];
}
function vLog() {
  return [el("section", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, "Add to your log")), quickLog()),
    el("section", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, "History"), el("span", { class: "muted" }, "Only you and your coaches can see this")), logList(logsOf(me().id).slice(0, 120), !S.preview))];
}

/* ---------- COACH: squad ---------- */
function invitePanel(first) {
  const code = S.club?.joinCode || "";
  const link = `${appUrl()}?join=${code}`;
  return el("section", { class: "panel" },
    el("div", { class: "panel-head" }, el("h3", {}, first ? "Add your players" : "Invite players"), (isOwner() || S.demo) ? el("button", { class: "btn small ghost", onclick: () => confirmDel("Make a new code? The current code and link will stop working for anyone who hasn’t joined yet.", A.newJoinCode, "Make new code") }, "New code") : null),
    el("p", { class: "muted", style: "margin:0 0 10px" }, "Players create a free account and enter this code, or just open the link. They appear in your squad as soon as they join."),
    el("div", { class: "row", style: "gap:16px;align-items:center" }, el("div", { class: "code", "aria-label": "Club code" }, code), el("div", { class: "copyrow", style: "flex:1;min-width:220px" }, el("input", { id: "invite-link", value: link, readonly: true, "aria-label": "Invite link" }), copyBtn(link, "Copy link"))),
    el("p", { class: "muted", style: "margin:10px 0 0;font-size:13px" }, "Assistant coaches join with the same code. The club owner can then make them a coach."));
}
function vSquad() {
  const owner = isOwner() || S.demo;
  const row = m => el("li", {}, el("div", { class: "li-main" }, who(m)),
    m.role === "player" ? el("button", { class: "btn small", onclick: () => go("player", m.id) }, "Profile") : null,
    el("button", { class: "btn small", onclick: () => editMember(m) }, "Edit"));
  return [
    S.demo ? null : billingPanel(),
    invitePanel(false),
    el("section", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, `Players (${players().length})`)), players().length ? el("ul", { class: "list" }, players().map(row)) : el("div", { class: "empty" }, "No players yet. Share the code above.")),
    el("section", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, "Coaching staff")), el("ul", { class: "list" }, coaches().map(row))),
    el("section", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, "Club"), owner ? el("button", { class: "btn small", onclick: openClubEdit }, "Edit club") : null),
      el("div", { class: "muted" }, `${S.club?.name || ""} · ${sport().label} · Season ${S.club?.season || "—"}`),
      isOwner() ? el("div", { class: "row", style: "margin-top:12px" }, el("button", { class: "btn small danger", onclick: openDeleteClub }, "Delete club and all its data")) : null),
  ];
}
function editMember(m, self) {
  const ownerUid = S.demo ? "coach" : S.club.ownerUid;
  const canRole = (isOwner() || (S.demo && isCoach())) && m.id !== ownerUid;
  const canRemove = !self && isCoach() && m.id !== ownerUid && m.id !== me().id && (m.role === "player" || isOwner() || S.demo);
  modal(self ? "My details" : "Edit " + m.name, [
    field("Full name", el("input", { id: "m-name", name: "name", required: true, value: m.name || "", maxlength: 60 })),
    el("div", { class: "fields2" }, field("Shirt number", el("input", { id: "m-num", name: "number", type: "number", min: 0, max: 999, value: m.number ?? "" })), field(m.role === "coach" ? "Title" : "Position or event", el("input", { id: "m-pos", name: "position", value: m.position || "", maxlength: 40 }))),
    canRole ? el("div", { class: "field" }, el("span", {}, "Role"), seg("role", [["player", "Player"], ["coach", "Coach (sees everyone’s data)"]], m.role)) : null,
  ], { extra: canRemove ? el("button", { type: "button", class: "btn ghost danger", style: "margin-right:auto", onclick: () => confirmDel(`Remove ${m.name} from the club? They lose access straight away. Their past logs stay saved.`, () => A.removeMember(m), "Remove") }, "Remove") : null,
    submit: async fd => {
      const data = { name: fd.get("name").trim(), number: fd.get("number") ?? "", position: (fd.get("position") || "").trim() };
      const ok = await A.saveMember(m, data); if (!ok) return false;
      const role = fd.get("role"); if (canRole && role && role !== m.role) return A.setRole(m, role);
      return true;
    } });
}
function editPlan(forId) {
  modal("New plan", [
    field("Title", el("input", { id: "p-title", name: "title", required: true, maxlength: 100, placeholder: "e.g. Week 7: return from hamstring tightness" })),
    field("One task per line", el("textarea", { id: "p-items", name: "items", required: true, style: "min-height:130px", placeholder: "Mon: 20 min easy bike + mobility\nTue: Team training, no sprints\nWed: Gym, lower body at 70%\nDaily: 3 L water, 8+ hours sleep" })),
    el("div", { class: "fields2" }, field("Finish by", el("input", { id: "p-due", type: "date", name: "due", value: addDays(TODAY, 7) })), field("Note (optional)", el("input", { id: "p-note", name: "note", maxlength: 200 }))),
    el("div", { class: "field" }, el("span", {}, "Give this plan to"), el("div", { class: "checks" }, players().map(p => el("label", {}, el("input", { type: "checkbox", name: "to", value: p.id, checked: p.id === forId }), `#${p.number || "–"} ${p.name}`)))),
  ], { label: "Send plan", submit: async fd => {
    const to = fd.getAll("to"); if (!to.length) { toast("Pick at least one player"); return false; }
    const items = fd.get("items").split("\n").map(s => s.trim()).filter(Boolean).slice(0, 40);
    if (!items.length) { toast("Add at least one task"); return false; }
    return A.createPlan(to, { title: fd.get("title").trim(), items, due: fd.get("due") || null, note: fd.get("note").trim() });
  } });
}
function giveFeedback(id) {
  const p = byId(id);
  modal("Message " + p.name, [
    el("div", { class: "field" }, el("span", {}, "Type"), seg("kind", [["feedback", "Feedback"], ["instruction", "Instruction (they confirm)"]], "feedback")),
    field("Message", el("textarea", { id: "fb-text", name: "text", required: true, maxlength: 2000, style: "min-height:120px", placeholder: "e.g. Great pressing on Saturday. Next step: scan before you receive." })),
  ], { label: "Send", submit: fd => A.sendFb(id, fd.get("kind"), fd.get("text").trim()) });
}
function editStats(id) {
  const st = statsOf(id);
  modal("Season stats · " + byId(id).name, el("div", { class: "fields2" }, sport().stats.map(([k, l]) => field(l, el("input", { id: "s-" + k, name: k, type: "number", step: "any", min: 0, value: st[k] ?? "" })))),
    { submit: fd => { const values = {}; sport().stats.forEach(([k]) => { const v = fd.get(k); if (v !== "") values[k] = +v; }); return A.saveStats(id, values); } });
}

/* ---------- schedule + register ---------- */
function sessRow(s, coach) {
  const d = dObj(s.date); const sm = s.summary || {}; const isPast = s.date < TODAY;
  const summary = s.taken ? `${(sm.present || 0) + (sm.late || 0)} in · ${sm.absent || 0} absent${sm.excused ? " · " + sm.excused + " excused" : ""}` : isPast ? "Register not taken" : (() => { const c = rsvpCounts(s); return `${c.inN} available · ${c.outN} can’t · ${c.none} no reply`; })();
  const att = !coach && S.att[s.id]?.[me().id]; const r = !coach && rsvpOf(s.id, me().id);
  return el("div", { class: "sess" },
    el("div", { class: "date" }, el("div", { class: "d" }, d.getDate()), el("div", { class: "w" }, d.toLocaleDateString(undefined, { month: "short" }))),
    el("div", { class: "info" }, el("div", { class: "row" }, el("span", { class: "pill " + (s.kind === "match" ? "match" : "") }, s.kind === "match" ? sport().match : "Training"), el("b", {}, s.title)),
      el("div", { class: "muted", style: "font-size:13px" }, [rel(s.date), s.time, s.location].filter(Boolean).join(" · ")),
      coach ? el("div", { style: "font-size:13px;color:" + (isPast && !s.taken ? "var(--warn)" : "var(--muted)") }, summary) : null),
    att ? el("span", { class: "pill " + ({ present: "good", late: "warn", absent: "bad" }[att.status] || "") }, att.status) : null,
    !coach && !s.taken && s.date >= TODAY ? el("div", { class: "row" },
      r ? el("span", { class: "pill " + (r.going ? "good" : "bad") }, r.going ? "Going" : "Can’t make it") : null,
      (!r || !r.going) ? el("button", { class: "btn small", onclick: () => A.setRsvp(s, true, "") }, "I’ll be there") : null,
      (!r || r.going) ? el("button", { class: "btn small ghost", onclick: () => cantMake(s) }, "Can’t make it") : null) : null,
    coach ? el("div", { class: "row" }, el("button", { class: "btn small " + (isPast && !s.taken ? "primary" : ""), onclick: () => takeAttendance(s) }, s.taken ? "Edit register" : "Register"), el("button", { class: "btn small ghost", onclick: () => editSession(s) }, "Edit")) : null);
}
function vSchedule() {
  const all = sessionsSorted(); const up = all.filter(s => s.date >= TODAY); const done = all.filter(s => s.date < TODAY).reverse();
  return [
    el("section", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, "Coming up"), el("button", { class: "btn primary small", onclick: () => editSession(null) }, "Add session")), up.length ? el("div", {}, up.map(s => sessRow(s, true))) : el("div", { class: "empty" }, "Nothing scheduled.")),
    el("section", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, "Past sessions")), done.length ? el("div", {}, done.slice(0, 30).map(s => sessRow(s, true))) : el("div", { class: "empty" }, "No past sessions yet.")),
  ];
}
function editSession(s) {
  const repeat = !s ? field("Repeat weekly", sel("se-rep", "repeat", [["1", "Just once"], ["4", "4 weeks"], ["8", "8 weeks"], ["12", "12 weeks"]], "1")) : null;
  modal(s ? "Edit session" : "Add session", [
    el("div", { class: "field" }, el("span", {}, "Type"), seg("kind", [["training", "Training"], ["match", sport().match]], s?.kind || "training")),
    field("Title", el("input", { id: "se-title", name: "title", required: true, maxlength: 80, value: s?.title || "", placeholder: "e.g. Tactical session, or vs Northgate" })),
    el("div", { class: "fields2" }, field("Date", el("input", { id: "se-date", type: "date", name: "date", required: true, value: s?.date || TODAY })), field("Time", el("input", { id: "se-time", type: "time", name: "time", value: s?.time || "18:00" })), repeat),
    field("Location", el("input", { id: "se-loc", name: "location", maxlength: 80, value: s?.location || "", placeholder: "e.g. Pitch 2" })),
  ], { extra: s ? el("button", { type: "button", class: "btn ghost danger", style: "margin-right:auto", onclick: () => confirmDel("Delete this session and its register?", () => A.deleteSession(s)) }, "Delete") : null,
    submit: async fd => {
      const data = { kind: fd.get("kind"), title: fd.get("title").trim(), date: fd.get("date"), time: fd.get("time"), location: fd.get("location").trim() };
      if (s) return A.saveSession(s, data);
      const n = +(fd.get("repeat") || 1);
      for (let i = 0; i < n; i++) { const ok = await A.saveSession(null, { ...data, date: addDays(data.date, i * 7) }); if (!ok) return false; }
      return true;
    } });
}
function takeAttendance(s) {
  const a = S.att[s.id] || {}; const r = S.rsvp[s.id] || {};
  const pre = p => a[p.id]?.status || (r[p.id] && !r[p.id].going ? "excused" : "");
  modal("Register · " + s.title, [
    el("p", { class: "muted", style: "margin:0;font-size:13px" }, `${fmtDay(s.date)}${s.time ? " · " + s.time : ""}. Players who said they can’t make it start as excused. Ratings are optional (1–10), private to each player, and feed their form.`),
    el("div", { class: "row" }, el("button", { type: "button", class: "btn small", onclick: e => e.currentTarget.closest("form").querySelectorAll(".att-row").forEach(row => { if (!row.querySelector("input[type=radio]:checked")) row.querySelector("input[value=present]").checked = true; }) }, "Mark the rest present")),
    players().length ? el("div", {}, players().map(p => el("div", { class: "att-row" }, who(p, r[p.id] && !r[p.id].going ? `Said: ${r[p.id].reason || "can’t make it"}` : undefined), seg("st-" + p.id, STATUS, pre(p)), el("input", { type: "number", name: "rt-" + p.id, min: 1, max: 10, step: 0.5, value: a[p.id]?.rating ?? "", placeholder: "★", "aria-label": "Rating for " + p.name })))) : el("div", { class: "empty" }, "No players in the squad yet."),
  ], { label: "Save register", submit: fd => {
    const att = {}; players().forEach(p => { const st = fd.get("st-" + p.id); if (!st) return; const rt = fd.get("rt-" + p.id); att[p.id] = { status: st }; if (rt && st !== "absent" && st !== "excused") att[p.id].rating = Math.min(10, Math.max(1, +rt)); });
    if (!Object.keys(att).length) { toast("Mark at least one player"); return false; }
    return A.saveRegister(s, att);
  } });
}

/* ---------- board ---------- */
function vBoard() {
  const coach = isCoach(); const list = [...S.announcements].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const ups = !coach ? sessionsSorted().filter(s => s.date >= TODAY).slice(0, 8) : [];
  return [
    el("section", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, "Team board"), coach ? el("button", { class: "btn primary small", onclick: postAnn }, "Post") : null),
      list.length ? el("div", { class: "stack" }, list.map(a => annCard(a, coach))) : el("div", { class: "empty" }, coach ? "Nothing posted yet. Post a notice or a match-day squad." : "No announcements yet.")),
    !coach ? el("section", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, "Schedule"), el("span", { class: "muted" }, "Tell your coach if you can make it")), ups.length ? el("div", {}, ups.map(s => sessRow(s, false))) : el("div", { class: "empty" }, "Nothing scheduled.")) : null,
  ];
}
function annCard(a, coach) {
  const squad = (a.squad || []).map(byId).filter(Boolean).sort((x, y) => numOr(x.number) - numOr(y.number));
  return el("article", { class: "ann " + (a.kind === "squad" ? "squad" : "") },
    el("div", { class: "row" }, el("span", { class: "pill " + (a.kind === "squad" ? "match" : "") }, a.kind === "squad" ? sport().match + "-day squad" : "Notice"), el("span", { class: "muted", style: "font-size:12px" }, `${a.author || "Coach"} · ${rel(a.date)}`)),
    el("h3", {}, a.title), a.body ? el("p", {}, a.body) : null,
    squad.length ? el("div", { class: "chips" }, squad.map(m => el("span", { class: "sqchip" + (m.id === me().id ? " me" : "") }, el("i", {}, m.number || "–"), m.name))) : null,
    coach ? el("div", { class: "row", style: "margin-top:8px" }, el("button", { class: "btn small ghost danger", onclick: () => confirmDel("Delete this post?", () => A.deleteAnn(a)) }, "Delete")) : null);
}
function postAnn() {
  const box = el("div", { class: "field", hidden: true }, el("span", {}, "Squad"), el("div", { class: "checks" }, players().map(p => el("label", {}, el("input", { type: "checkbox", name: "squad", value: p.id }), `#${p.number || "–"} ${p.name}`))));
  const kind = seg("kind", [["general", "Notice"], ["squad", sport().match + "-day squad"]], "general");
  kind.addEventListener("change", e => (box.hidden = e.target.value !== "squad"));
  modal("Post to the team", [el("div", { class: "field" }, el("span", {}, "Type"), kind),
    field("Title", el("input", { id: "a-title", name: "title", required: true, maxlength: 120, placeholder: "e.g. Squad for Saturday vs Northgate" })),
    field("Details", el("textarea", { id: "a-body", name: "body", maxlength: 3000, placeholder: "e.g. Meet 9:45 at the clubhouse. Bring home and away kit." })), box],
    { label: "Post", submit: fd => { const k = fd.get("kind"); const squad = k === "squad" ? fd.getAll("squad") : [];
      if (k === "squad" && !squad.length) { toast("Pick the players in the squad"); return false; }
      return A.postAnn({ kind: k, title: fd.get("title").trim(), body: fd.get("body").trim(), squad }); } });
}

/* ---------- club settings ---------- */
function clubFields(c) {
  return [field("Club or team name", el("input", { id: "c-name", name: "name", required: true, maxlength: 60, value: c?.name || "", placeholder: "e.g. Northside Tennis Academy" })),
    el("div", { class: "fields2" }, field("Sport", sel("c-sport", "sport", Object.entries(SPORTS).map(([k, v]) => [k, v.label]), c?.sport || "football")), field("Season", el("input", { id: "c-season", name: "season", maxlength: 20, value: c?.season || "2026/27" })))];
}
function openClubEdit() { modal("Edit club", clubFields(S.club), { submit: fd => A.saveClub({ name: fd.get("name").trim(), sport: fd.get("sport"), season: fd.get("season").trim() }) }); }

/* ---------- feedback from testers ---------- */
function openFeedback(kind = "Idea", text = "") {
  if (S.demo || !S.user) { const e = contactEmail(); toast(e ? `Sign in to send feedback, or email ${e}` : "Create an account to send feedback."); return; }
  modal("Send feedback", [
    el("p", { class: "muted", style: "margin:0" }, "Tell us what works, what’s confusing or what you’d like next. It goes straight to the people who build Touchline Team."),
    el("div", { class: "field" }, el("span", {}, "What kind?"), seg("kind", [["Idea", "Idea"], ["Problem", "Something’s wrong"], ["Question", "Question"], ["Praise", "Something I like"]], kind)),
    field("Your message", el("textarea", { id: "fb-msg", name: "text", required: true, maxlength: 2000, style: "min-height:130px", placeholder: "e.g. It would help if coaches could…" }, text)),
  ], { label: "Send", submit: async fd => {
    const m = me();
    try {
      await F.f.setDoc(F.f.doc(Col("appFeedback")), { uid: S.user.uid, email: S.user.email || "", name: m?.name || S.profile?.name || "", role: m?.role || "", clubId: S.clubId || "", clubName: S.club?.name || "", kind: fd.get("kind") || "Idea", text: String(fd.get("text")).trim().slice(0, 2000), view: S.phase === "club" ? S.view || "" : S.phase, ua: navigator.userAgent.slice(0, 200), at: F.f.serverTimestamp(), ts: Date.now() });
      toast("Thanks! Your feedback has been sent."); return true;
    } catch (e) { toast(fsErr(e)); return false; }
  } });
}

/* ---------- subscription ---------- */
const SITE = window.TEAM_SITE || {};
const TRIAL_DAYS = 30;
const price = () => SITE.price || "$20/month";
const tsDate = t => !t ? null : t.toDate ? t.toDate() : new Date(t);
function billing(club = S.club) {
  if (!club || S.demo) return { state: "demo" };
  const now = Date.now(); const created = tsDate(club.createdAt); const paid = tsDate(club.paidUntil);
  if (paid && paid.getTime() > now) return { state: "paid", until: paid };
  if (!created) return { state: "legacy" };
  const trialEnd = new Date(created.getTime() + TRIAL_DAYS * 864e5);
  if (trialEnd.getTime() > now) return { state: "trial", until: trialEnd, days: Math.ceil((trialEnd.getTime() - now) / 864e5) };
  return { state: "expired", wasPaid: !!paid };
}
const locked = () => billing().state === "expired";
const lockedMsg = () => isOwner() ? "Your club is read-only until you subscribe. Open Squad → Subscription." : "The club is read-only right now. The club owner needs to renew the subscription.";
const fmtDate = d => d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
const checkoutLink = () => SITE.checkoutLink || SITE.stripeLink || "";
const portalLink = () => SITE.billingPortal || SITE.stripePortal || "";
const payReady = () => /^https:\/\//.test(checkoutLink());
function subscribe() {
  if (!payReady()) { toast(SITE.email && !/^FILL IN/.test(SITE.email) ? `Online payment isn’t set up yet. Email ${SITE.email} to subscribe.` : "Online payment isn’t set up yet. Please contact us to subscribe."); return; }
  const u = new URL(checkoutLink());
  if (/lemonsqueezy/.test(u.hostname)) { // Lemon Squeezy: custom data comes back on the order, email is prefilled
    u.searchParams.set("checkout[custom][club_id]", S.clubId);
    if (S.user?.email) u.searchParams.set("checkout[email]", S.user.email);
  } else { // Stripe Payment Links
    u.searchParams.set("client_reference_id", S.clubId);
    if (S.user?.email) u.searchParams.set("prefilled_email", S.user.email);
  }
  window.open(u.toString(), "_blank", "noopener");
  toast("Opening secure checkout. Your club unlocks as soon as payment is confirmed.");
}
function billingPanel() {
  const b = billing(); const owner = isOwner();
  const status = {
    trial: [`Free trial · ${b.days} day${b.days === 1 ? "" : "s"} left`, "accent", `Ends ${b.until ? fmtDate(b.until) : ""}. Subscribe any time to keep everything running after that.`],
    paid: ["Subscribed", "good", `Paid until ${b.until ? fmtDate(b.until) : ""}. Renews automatically each month.`],
    expired: ["Read-only", "bad", "Nothing new can be added until the club subscribes. All data is kept and can still be viewed, downloaded or deleted."],
    legacy: ["Early access", "good", "Your club joined before subscriptions started. Thanks for being one of the first!"],
  }[b.state] || ["", "", ""];
  return el("section", { class: "panel" },
    el("div", { class: "panel-head" }, el("h3", {}, "Subscription"), el("span", { class: "pill " + status[1] }, status[0])),
    el("p", { class: "muted", style: "margin:0 0 12px" }, status[2]),
    owner ? el("div", { class: "row" },
      b.state !== "paid" && b.state !== "legacy" ? payButton() : null,
      /^https:\/\//.test(portalLink()) ? el("a", { class: "btn", href: portalLink(), target: "_blank", rel: "noopener" }, "Manage billing") : null)
      : el("p", { class: "muted", style: "margin:0;font-size:13px" }, "Only the club owner can manage the subscription."),
    owner && !payReady() && b.state !== "paid" && b.state !== "legacy" ? el("p", { class: "muted", style: "margin:12px 0 0;font-size:13px" }, "Online payment is coming soon. While we’re testing with our first clubs, just get in touch before your trial ends and we’ll keep your club running.") : null,
    owner ? el("p", { class: "muted", style: "margin:12px 0 0;font-size:12px" }, `${price()} per club, unlimited players and coaches. Cancel any time. Club reference: `, el("code", {}, S.clubId)) : null);
}
const contactEmail = () => (SITE.email && !/^FILL IN/.test(SITE.email)) ? SITE.email : "";
// Subscribe when payments are set up; otherwise a way to get in touch
function payButton() {
  if (payReady()) return el("button", { class: "btn primary", onclick: subscribe }, `Subscribe · ${price()}`);
  const e = contactEmail();
  return e ? el("a", { class: "btn primary", href: `mailto:${e}?subject=${encodeURIComponent("Keep our club running: " + (S.club?.name || ""))}&body=${encodeURIComponent("Club reference: " + S.clubId + "\n")}` }, "Get in touch")
    : el("button", { class: "btn primary", onclick: () => openFeedback("Question", `Please keep our club (${S.club?.name || ""}) running after the trial.`) }, "Get in touch");
}

/* ---------- admin: every club's trial and payment status (site owner only) ---------- */
let adminState = { clubs: [], q: "", loading: false };
async function checkAdmin() {
  try { S.isAdmin = (await F.f.getDoc(D("admins", S.user.uid))).exists(); } catch { S.isAdmin = false; }
}
async function openAdmin() {
  stopClub(); S.phase = "admin"; adminState.loading = true; render();
  try {
    const snap = await F.f.getDocs(Col("clubs"));
    const clubs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    await Promise.all(clubs.map(async c => {
      try { const u = await F.f.getDoc(D("users", c.ownerUid)); c.owner = u.exists() ? u.data() : {}; } catch { c.owner = {}; }
      try { c.count = (await F.f.getCountFromServer(Col("clubs", c.id, "members"))).data().count; } catch { c.count = "?"; }
    }));
    clubs.sort((a, b) => (tsDate(b.createdAt)?.getTime() || 0) - (tsDate(a.createdAt)?.getTime() || 0));
    adminState.clubs = clubs;
    try { adminState.feedback = (await F.f.getDocs(F.f.query(Col("appFeedback"), F.f.orderBy("ts", "desc"), F.f.limit(100)))).docs.map(d => ({ id: d.id, ...d.data() })); } catch (e) { console.warn(e); adminState.feedback = []; }
    try { adminState.usage = await loadUsage(clubs); } catch (e) { console.warn(e); adminState.usage = null; }
  } catch (e) { console.error(e); toast(fsErr(e)); }
  adminState.loading = false; render();
}
async function loadUsage(clubs) {
  const f = F.f; const users = Col("users");
  const cnt = async q => { try { return (await f.getCountFromServer(q)).data().count; } catch (e) { console.warn(e); return null; } };
  const d1 = TODAY, d7 = addDays(TODAY, -6), d14 = addDays(TODAY, -13), d30 = addDays(TODAY, -29);
  const metrics = {};
  (await f.getDocs(f.query(Col("metrics"), f.where(f.documentId(), ">=", d30), f.where(f.documentId(), "<=", d1)))).docs.forEach(d => (metrics[d.id] = d.data()));
  const recent = (await f.getDocs(f.query(users, f.where("created", ">=", d30)))).docs.map(d => d.data()).filter(u => u.created <= d1);
  const sum = (key, from) => Object.entries(metrics).filter(([day]) => day >= from && day <= d1).reduce((a, [, m]) => a + (m[key] || 0), 0);
  const days = [...Array(14)].map((_, i) => addDays(d14, i));
  return {
    days,
    visits: days.map(d => metrics[d]?.landingVisits || 0),
    signups: days.map(d => recent.filter(u => u.created === d).length),
    visitorsToday: sum("landingVisits", d1), visitors7: sum("landingVisits", d7), visitors30: sum("landingVisits", d30),
    views30: sum("landingViews", d30), app30: sum("appVisits", d30), demo30: sum("demoOpens", d30),
    signups7: recent.filter(u => u.created >= d7).length, signups30: recent.length,
    clubs30: clubs.filter(c => (c.created || "") >= d30).length,
    totalUsers: await cnt(users),
    active1: await cnt(f.query(users, f.where("lastSeen", "==", d1))),
    active7: await cnt(f.query(users, f.where("lastSeen", ">=", d7))),
    active30: await cnt(f.query(users, f.where("lastSeen", ">=", d30))),
    members: clubs.reduce((a, c) => a + (typeof c.count === "number" ? c.count : 0), 0),
  };
}
function usageChart(u) {
  const W0 = 640, H = 170, L = 30, B = 22, n = u.days.length, gw = (W0 - L) / n;
  const top = Math.max(4, ...u.visits, ...u.signups); const step = top <= 10 ? 2 : top <= 50 ? 10 : Math.ceil(top / 5 / 10) * 10; const max = Math.ceil(top / step) * step;
  const y = v => (H - B) - v / max * (H - B - 8);
  let svg = `<svg class="chart" viewBox="0 0 ${W0} ${H}" role="img" aria-label="Visitors and new accounts per day for the last 14 days">`;
  for (let v = 0; v <= max; v += step) svg += `<line x1="${L}" x2="${W0}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${v}</text>`;
  u.days.forEach((d, i) => {
    const x = L + i * gw + 4, bw = (gw - 10) / 2;
    svg += `<rect x="${x}" y="${y(u.visits[i])}" width="${bw}" height="${(H - B) - y(u.visits[i])}" rx="2" fill="var(--accent)"><title>${fmtDay(d)}: ${u.visits[i]} visitors</title></rect>`;
    svg += `<rect x="${x + bw + 2}" y="${y(u.signups[i])}" width="${bw}" height="${(H - B) - y(u.signups[i])}" rx="2" fill="var(--brand)"><title>${fmtDay(d)}: ${u.signups[i]} new accounts</title></rect>`;
    if (i % 2 === 1 || i === n - 1) svg += `<text x="${x + gw / 2 - 5}" y="${H - 6}" text-anchor="middle">${dObj(d).getDate()}/${dObj(d).getMonth() + 1}</text>`;
  });
  return el("div", {}, el("div", { html: svg + "</svg>" }),
    el("div", { class: "row", style: "gap:16px;font-size:13px;margin-top:4px" }, el("span", { class: "row", style: "gap:6px" }, el("i", { style: "width:10px;height:10px;border-radius:2px;background:var(--accent);display:inline-block" }), "Visitors to the front page"), el("span", { class: "row", style: "gap:6px" }, el("i", { style: "width:10px;height:10px;border-radius:2px;background:var(--brand);display:inline-block" }), "New accounts")));
}
function usagePanel() {
  const u = adminState.usage;
  if (!u) return el("section", { class: "panel" }, el("h3", {}, "Usage"), el("div", { class: "empty" }, "Usage numbers couldn’t be loaded. Check the latest firestore.rules are published."));
  const n = v => v == null ? "—" : v.toLocaleString();
  const steps = [["Visited the front page", u.visitors30], ["Opened the app", u.app30], ["Tried the demo", u.demo30], ["Created an account", u.signups30], ["Created a club", u.clubs30]];
  const base = Math.max(1, u.visitors30);
  return el("section", { class: "stack" },
    el("div", { class: "tiles" },
      tile("Visitors today", n(u.visitorsToday), "", `${n(u.visitors7)} this week · ${n(u.visitors30)} in 30 days`),
      tile("Accounts", n(u.totalUsers), "", `${n(u.signups7)} new this week · ${n(u.signups30)} in 30 days`),
      tile("Active users", n(u.active7), "", `this week · ${n(u.active1)} today · ${n(u.active30)} in 30 days`),
      tile("Clubs", n(adminState.clubs.length), "", `${n(u.members)} members in total`)),
    el("div", { class: "grid2" },
      el("section", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, "Last 14 days")), usageChart(u)),
      el("section", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, "Last 30 days"), el("span", { class: "muted" }, "From visit to club")),
        el("div", { class: "stack", style: "gap:10px" }, steps.map(([label, v]) => el("div", {},
          el("div", { class: "row", style: "justify-content:space-between;font-size:14px" }, el("span", {}, label), el("b", { class: "num" }, `${n(v)}${v != null && u.visitors30 ? ` · ${Math.round(100 * v / base)}%` : ""}`)),
          el("div", { class: "bar", style: "height:8px" }, el("span", { style: `width:${v ? Math.min(100, Math.round(100 * v / base)) : 0}%` }))))),
        el("p", { class: "muted", style: "margin:12px 0 0;font-size:12px" }, `Visitors are counted once per browser tab per day, without cookies (${n(u.views30)} page views in 30 days). People with “Do Not Track” switched on aren’t counted. Active means signed in to the app that day.`))));
}
async function setPaid(c, mode) {
  const f = F.f; let until = null;
  if (mode !== "end") {
    const base = new Date(Math.max(Date.now(), tsDate(c.paidUntil)?.getTime() || 0));
    until = new Date(base); if (mode === "year") until.setFullYear(until.getFullYear() + 1); else until.setMonth(until.getMonth() + 1);
  }
  try {
    await f.updateDoc(D("clubs", c.id), { paidUntil: until ? f.Timestamp.fromDate(until) : null, billingNote: c.billingNote || "" });
    c.paidUntil = until; toast(until ? `${c.name} paid until ${fmtDate(until)}` : `${c.name}’s subscription ended`); render();
  } catch (e) { toast(fsErr(e)); }
}
function adminPage() {
  const q = adminState.q.toLowerCase();
  const list = adminState.clubs.filter(c => !q || [c.name, c.id, c.owner?.email, c.owner?.name].some(x => String(x || "").toLowerCase().includes(q)));
  const counts = { trial: 0, paid: 0, expired: 0, legacy: 0 }; adminState.clubs.forEach(c => counts[billing(c).state]++);
  const pill = { trial: "accent", paid: "good", expired: "bad", legacy: "" };
  const search = el("input", { id: "adm-q", value: adminState.q, placeholder: "Search by club, owner email or club reference", style: "width:100%", oninput: e => { adminState.q = e.target.value; clearTimeout(adminState.t); adminState.t = setTimeout(() => { render(); const i = $("#adm-q"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); } });
  return el("div", { class: "stack", style: "padding-block:20px" },
    el("div", { class: "row", style: "justify-content:space-between" }, el("div", {}, el("div", { class: "label" }, "Admin"), el("h2", {}, "Admin dashboard")), el("div", { class: "row" }, el("button", { class: "btn", onclick: openAdmin }, "Refresh"), el("button", { class: "btn", onclick: () => { S.phase = "clubs"; render(); } }, "Back"))),
    adminState.loading ? null : usagePanel(),
    el("h3", { style: "margin-top:8px" }, "Subscriptions"),
    el("div", { class: "tiles" }, tile("Paying", counts.paid), tile("On trial", counts.trial), tile("Read-only", counts.expired), tile("Early access", counts.legacy)),
    el("section", { class: "panel" },
      el("p", { class: "muted", style: "margin:0 0 10px;font-size:14px" }, "When you get a payment email, find the club here by its reference (shown on the order as club_id, or client_reference_id on Stripe) or the owner’s email, then press +1 month or +1 year. Each payment extends from today or from the current paid-until date, whichever is later."),
      el("div", { class: "field" }, search)),
    adminState.loading ? el("div", { class: "empty" }, "Loading clubs…") : list.length ? el("section", { class: "panel" }, el("ul", { class: "list" }, list.map(c => {
      const b = billing(c);
      const when = b.state === "trial" ? `Trial ends ${fmtDate(b.until)}` : b.state === "paid" ? `Paid until ${fmtDate(b.until)}` : b.state === "expired" ? "Trial or subscription over" : "Joined before subscriptions";
      return el("li", { style: "flex-wrap:wrap" },
        el("div", { class: "li-main", style: "min-width:220px" }, el("div", { class: "row", style: "gap:8px" }, el("b", {}, c.name), el("span", { class: "pill " + pill[b.state] }, { legacy: "early access", expired: "read-only", trial: "trial", paid: "paid" }[b.state])),
          el("div", { class: "muted", style: "font-size:13px" }, `${c.owner?.name || "Unknown owner"} · ${c.owner?.email || "no email"} · ${c.count} member${c.count === 1 ? "" : "s"}`),
          el("div", { class: "muted", style: "font-size:13px" }, when, " · ref ", el("code", {}, c.id))),
        el("div", { class: "row" }, el("button", { class: "btn small", onclick: () => setPaid(c, "month") }, "+1 month"), el("button", { class: "btn small", onclick: () => setPaid(c, "year") }, "+1 year"), b.state === "paid" ? el("button", { class: "btn small ghost danger", onclick: () => confirmDel(`End ${c.name}’s subscription now? The club becomes read-only straight away unless it’s still in its trial.`, () => setPaid(c, "end").then(() => true), "End subscription") }, "End") : null));
    }))) : el("div", { class: "empty" }, "No clubs match."),
    el("section", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, "Feedback from users"), el("span", { class: "muted" }, `${(adminState.feedback || []).length} latest`)),
      (adminState.feedback || []).length ? el("ul", { class: "list" }, adminState.feedback.map(f => el("li", {},
        el("div", { class: "li-main" }, el("div", { class: "row", style: "gap:8px" }, el("span", { class: "pill " + ({ Problem: "bad", Idea: "accent", Praise: "good" }[f.kind] || "") }, f.kind || "Note"), el("b", {}, f.name || "Someone"), el("span", { class: "muted", style: "font-size:12px" }, `${f.role ? f.role + " · " : ""}${f.clubName || "no club"} · ${f.ts ? new Date(f.ts).toLocaleString() : ""}`)),
          el("p", {}, f.text), el("div", { class: "muted", style: "font-size:12px" }, f.email || "")),
        el("button", { class: "icon-btn", title: "Delete", "aria-label": "Delete feedback", onclick: async () => { try { await F.f.deleteDoc(D("appFeedback", f.id)); adminState.feedback = adminState.feedback.filter(x => x !== f); render(); } catch (e) { toast(fsErr(e)); } } }, "×")))) : el("div", { class: "empty" }, "No feedback yet.")));
}

/* ---------- demo team (local only, never saved) ---------- */
function startDemo() { count("demoOpens", true); S.demo = true; Object.assign(S, demoData()); S.demoMe = "coach"; S.view = null; S.phase = "club"; render(); }
function exitDemo() { S.demo = false; resetClubData(); S.authMode = "signup"; S.phase = S.user ? "clubs" : "auth"; render(); }
function openDemoPicker() {
  const btn = m => el("button", { type: "button", "aria-pressed": m.id === S.demoMe ? "true" : "false", onclick: () => { S.demoMe = m.id; S.view = null; closeModal(); render(); toast(`Now viewing as ${m.name}`); } }, who(m));
  modal("View the demo as…", [el("p", { class: "muted", style: "margin:0" }, "Coaches see the whole squad. Players see only their own log, plan and feedback."), el("div", { class: "label" }, "Coaches"), el("div", { class: "pick" }, coaches().map(btn)), el("div", { class: "label" }, "Players"), el("div", { class: "pick" }, players().map(btn))]);
}
function demoData() {
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const club = { name: "Riverside FC U18", sport: "football", season: "2026/27", ownerUid: "coach", joinCode: "DEMO42" };
  const members = [{ id: "coach", name: "Dana Reyes", role: "coach", position: "Head coach" }, { id: "c2", name: "Marco Lind", role: "coach", position: "Fitness coach" }];
  [[1, "Leo Marsh", "Goalkeeper"], [2, "Ty Delgado", "Right back"], [4, "Sami Okafor", "Centre back"], [5, "Jonas Berg", "Centre back"], [6, "Ollie Grant", "Defensive mid"], [8, "Mateo Ruiz", "Central mid"], [10, "Kai Nakamura", "Attacking mid"], [7, "Remy Duval", "Right wing"], [9, "Ade Bello", "Striker"]]
    .forEach(([n, name, pos], i) => members.push({ id: "p" + (i + 1), name, number: n, position: pos, role: "player" }));
  const ps = members.filter(m => m.role === "player");
  const opp = ["Northgate Utd", "St. Albans Rovers", "Hollow Park", "Eastfield Athletic", "Kingsway Colts", "Millbrook Town"];
  const sessions = []; let oi = 0;
  for (let i = -24; i <= 10; i++) {
    const date = addDays(TODAY, i); const wd = dObj(date).getDay();
    if (wd === 2 || wd === 4) sessions.push({ id: "s" + i, kind: "training", title: wd === 2 ? "Pressing & transitions" : "Set pieces + small-sided games", date, time: "18:00", location: "Pitch 2", taken: false });
    if (wd === 6) sessions.push({ id: "s" + i, kind: "match", title: (i % 14 === 0 ? "vs " : "@ ") + opp[oi++ % opp.length], date, time: "11:00", location: i % 14 === 0 ? "Riverside Park" : "Away", taken: false });
  }
  const att = {}; const pastS = sessions.filter(s => s.date < TODAY).sort((a, b) => a.date.localeCompare(b.date));
  pastS.forEach((s, si) => {
    if (si === pastS.length - 1) return; // leave the latest register for the coach to take
    const rec = {};
    ps.forEach(p => {
      let st = rnd() < .84 ? "present" : rnd() < .5 ? "late" : rnd() < .5 ? "excused" : "absent";
      if (p.id === "p8" && si >= pastS.length - 3) st = "absent";
      const a = { status: st };
      if ((st === "present" || st === "late") && (s.kind === "match" || rnd() < .6)) a.rating = Math.min(10, Math.round((5.5 + rnd() * 3.5 + (p.id === "p7" ? .8 : 0)) * 2) / 2);
      rec[p.id] = a;
    });
    att[s.id] = rec; s.taken = true; s.summary = { present: 0, late: 0, absent: 0, excused: 0 }; Object.values(rec).forEach(r => s.summary[r.status]++);
  });
  const days = {}; let li = 0;
  // [description, kcal, protein, carbs, fat]
  const foods = {
    Breakfast: [["Oats, banana, peanut butter", 520, 17, 78, 16], ["Scrambled eggs on toast, orange juice", 480, 24, 52, 19], ["Greek yoghurt, berries, granola", 410, 23, 55, 11]],
    Lunch: [["Chicken wrap, salad, apple", 610, 38, 72, 17], ["Tuna pasta with sweetcorn", 680, 36, 92, 15], ["Rice bowl with salmon and greens", 720, 40, 80, 24]],
    Dinner: [["Spaghetti bolognese, side salad", 760, 39, 95, 22], ["Grilled chicken, sweet potato, broccoli", 640, 48, 70, 14], ["Beef stir fry with noodles", 710, 41, 84, 20]],
    Snack: [["Protein shake with milk", 260, 32, 18, 6], ["Rice cakes and honey", 210, 3, 48, 1], ["Trail mix", 290, 8, 24, 19]] };
  ps.forEach(p => {
    days[p.id] = {};
    for (let dd = -13; dd <= 0; dd++) {
      const date = addDays(TODAY, dd); const isToday = dd === 0; const dayDoc = { uid: p.id, date, meals: [], workouts: [] };
      if (p.id === "p8" && dd > -4) continue;
      const nm = isToday ? (p.id === "p5" ? 0 : 1 + Math.floor(rnd() * 2)) : 2 + Math.floor(rnd() * 2);
      ["Breakfast", "Lunch", "Dinner", "Snack"].slice(0, nm).forEach(k => { const [text, kcal, protein, carbs, fat] = pick(foods[k]); const f = 0.85 + rnd() * 0.3; dayDoc.meals.push({ id: "m" + li, kind: k, text, kcal: r0(kcal * f), protein: r0(protein * f), carbs: r0(carbs * f), fat: r0(fat * f), ai: rnd() < .4 ? "photo" : null, ts: li++ }); });
      const wd = dObj(date).getDay();
      if (wd === 2 || wd === 4) dayDoc.workouts.push({ id: "w" + li, kind: "Team training", duration: 90, notes: "", ts: li++ });
      else if (wd === 6 && !isToday) dayDoc.workouts.push({ id: "w" + li, kind: "Match", duration: 60 + Math.floor(rnd() * 31), notes: "", ts: li++ });
      else if (rnd() < .45) dayDoc.workouts.push({ id: "w" + li, kind: pick(["Gym", "Run", "Recovery", "Skills"]), duration: pick([30, 40, 45, 60]), notes: pick(["", "", "Lower body, felt good", "Easy 5 km", "Foam roll + stretching"]), ts: li++ });
      days[p.id][date] = dayDoc;
    }
  });
  const nextMatch = sessions.filter(s => s.kind === "match" && s.date >= TODAY).sort((a, b) => a.date.localeCompare(b.date))[0];
  const rsvp = {};
  if (upcomingOf(sessions)) { const s = upcomingOf(sessions); rsvp[s.id] = { p1: { going: true }, p2: { going: true }, p4: { going: true }, p6: { going: true }, p7: { going: true }, p3: { going: false, reason: "School exam" } }; }
  const announcements = [
    { id: "a1", kind: "squad", title: `Squad for ${nextMatch ? nextMatch.title + ", " + rel(nextMatch.date) : "the next match"}`, body: "Meet 9:45 at the clubhouse. Bring both kits and shin pads. Remy, come and see me before the warm-up.", squad: ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p9"], author: "Dana Reyes", date: addDays(TODAY, -1), ts: 3 },
    { id: "a2", kind: "general", title: "New training kit collection", body: "Kit is in. Collect yours from the clubhouse after Tuesday’s session. Sizes are on the sheet by the door.", squad: [], author: "Marco Lind", date: addDays(TODAY, -3), ts: 2 },
    { id: "a3", kind: "general", title: "Hydration reminder for the heat", body: "Aim for 2.5–3 L a day this week and drink 500 ml in the two hours before training.", squad: [], author: "Dana Reyes", date: addDays(TODAY, -6), ts: 1 }];
  const plans = [
    { id: "pl1", uid: "p9", title: "Calf load management", note: "Tell me straight away if pain goes above 3/10.", due: addDays(TODAY, 5), items: ["Daily: calf raises 3×15, slow on the way down", "Mon: 20 min easy bike + mobility", "Tue: Team training, no sprinting drills", "Wed: Pool recovery session", "Every night: 8+ hours sleep"], ticks: [true, true, false, false, false], author: "Dana Reyes", date: addDays(TODAY, -2), ts: 5 },
    { id: "pl2", uid: "p5", title: "Strength block, week 3", note: "", due: addDays(TODAY, 6), items: ["Gym A: squat 4×6 at 75%", "Gym B: RDL + Nordic curls", "2 × 20 min tempo runs"], ticks: [true, false, false], author: "Marco Lind", date: addDays(TODAY, -1), ts: 4 },
    { id: "pl3", uid: "p7", title: "Finishing homework", note: "", due: addDays(TODAY, 4), items: ["50 finishes with your weaker foot after training", "Watch clip pack: runs in behind"], ticks: [false, true], author: "Dana Reyes", date: addDays(TODAY, -3), ts: 3 }];
  const feedback = [
    { id: "f1", uid: "p8", kind: "instruction", text: "You’ve missed the last few sessions. Message me today so we can sort it out.", author: "Dana Reyes", date: addDays(TODAY, -2), ts: 9, ack: false },
    { id: "f2", uid: "p7", kind: "feedback", text: "Brilliant last week. Your pressing triggered both turnovers that led to goals. Keep scanning before you receive.", author: "Dana Reyes", date: addDays(TODAY, -4), ts: 8, ack: false },
    { id: "f3", uid: "p7", kind: "instruction", text: "Pre-match meal at least 3 hours before kick-off: carbs plus some lean protein. No fried food.", author: "Marco Lind", date: TODAY, ts: 10, ack: false },
    { id: "f4", uid: "p9", kind: "instruction", text: "Skip sprints this week and follow the calf plan. We want you fit for the derby.", author: "Dana Reyes", date: addDays(TODAY, -3), ts: 7, ack: true }];
  const stats = {}; ps.forEach((p, i) => (stats[p.id] = p.position === "Goalkeeper" ? { apps: 9, goals: 0, assists: 0, mins: 810 } : { apps: 6 + (i % 4), goals: [0, 0, 1, 0, 1, 2, 5, 3, 7][i], assists: [0, 2, 0, 1, 2, 4, 6, 3, 2][i], mins: 420 + i * 40 }));
  const targets = {}; ps.forEach(p => (targets[p.id] = p.position === "Goalkeeper" ? { kcal: 2600, protein: 130, carbs: 320, fat: 85 } : { kcal: 3000, protein: 150, carbs: 400, fat: 90 }));
  return { club, members, sessions, att, days, rsvp, announcements, plans, feedback, stats, targets };
}
function upcomingOf(list) { return [...list].filter(s => s.date >= TODAY).sort((a, b) => sessKey(a).localeCompare(sessKey(b)))[0]; }

boot();
