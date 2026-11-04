/* ============================================================
   Archiviazione sul telefono (nessun server):
   - impostazioni e chiavi API → localStorage (lettura immediata)
   - stato, episodi, immagini → IndexedDB (capiente, adatto alle immagini)
   Se IndexedDB non è disponibile si ripiega su localStorage/memoria.
   ============================================================ */
import { debounce, dayStr, monthKey } from './util.js';

export const bus = new EventTarget();
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

/* ---------------- impostazioni ---------------- */
const SETTINGS_KEY = 'rtb1_settings_v1';

export const DEFAULT_SETTINGS = {
  // chiavi e modelli
  apiKey: '', openaiKey: '', pollinationsKey: '', geminiKey: '', geminiModel: 'gemini-2.5-flash-image', veoModel: 'veo-3.0-fast-generate-001', imageEngine: 'pollinations', // pollinations | openai | gemini
  textModel: 'claude-haiku-5-5',
  chatModel: 'claude-haiku-5-5',
  articleModel: 'claude-sonnet-5-5',
  imageModelScene: 'gpt-image-1.5',
  imageModelCard: 'gpt-image-1-mini',
  imageModelTutor: 'gpt-image-1.5',
  // testo
  font: 'serif', margin: 8, pageInner: 14, fullWidth: true, fontSize: 19, lineHeight: 1.7, theme: 'light', color: 'blue', effects: false,
  // audio e fonetica
  accent: 'us', voiceURI: '', ttsRate: 0.9, ttsPitch: 1, ttsEngine: 'natural',
  phonetics: 'sentence', // sentence | word | off
  dictIpa: true,
  // percorso
  userName: 'Mino', destinations: '', sceneLength: 'long', customWords: 1200, testQuestions: 10, levelBias: 0, focus: 'mix', strictness: 'normal', naturalVoice: 'nova', tutorStyle: 'sober', listenFirst: true,
  showTranslation: false, explainLang: 'it',
  reviewPerDay: 20, newPerDay: 8, targetMinutes: 25,
  // tutor e immagini
  tutorName: 'Marco', avatar: 'mono', autoLesson: true, vibrate: true, tutorLook: '', tutorAuto: true, autoSpeakTutor: true,
  imagesOn: false, sceneImages: true, cardImages: true, maxImagesPerDay: 8,
  cardImageQuality: 'low', sceneImageQuality: 'medium',
  onboarded: false
};

let settingsCache = null;
export function getSettings() {
  if (!settingsCache) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch (e) { /* ignora */ }
    // migrazioni: nuova voce naturale come predefinita; vecchi colori vivaci → sobri
    if (!saved.ttsV2) { if (!saved.ttsEngine || saved.ttsEngine === 'auto') saved.ttsEngine = 'natural'; saved.ttsV2 = 1; }
    if (['coral', 'green', 'violet'].includes(saved.color)) saved.color = 'blue';
    if (['ollie', 'sofia', 'max', 'emma', 'leo', 'rose', 'fox', 'bot'].includes(saved.avatar) && !saved.avatarV2) { saved.avatar = 'marco'; saved.avatarV2 = 1; if (saved.tutorName === 'Ollie') saved.tutorName = 'Marco'; }
    if (!saved.imgV2) { saved.imagesOn = false; saved.imgV2 = 1; }
    if (!saved.avatarV4) { if (!saved.avatar || saved.avatar === 'mono') saved.avatar = 'marco'; saved.avatarV4 = 1; }
    settingsCache = Object.assign({}, DEFAULT_SETTINGS, saved);
  }
  return settingsCache;
}
export function setSettings(patch) {
  const s = getSettings();
  Object.assign(s, patch);
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* ignora */ }
  emit('settings', patch);
  return s;
}

/* ---------------- IndexedDB (con ripiego) ---------------- */
const DB_NAME = 'rtb1';
const STORES = ['kv', 'episodes', 'images'];
let dbPromise = null;
const mem = { kv: new Map(), episodes: new Map(), images: new Map() };
let useMemory = false;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { useMemory = true; return resolve(null); }
    let req;
    try { req = indexedDB.open(DB_NAME, 1); } catch (e) { useMemory = true; return resolve(null); }
    req.onupgradeneeded = () => { STORES.forEach((s) => { if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s); }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { useMemory = true; resolve(null); };
    req.onblocked = () => { useMemory = true; resolve(null); };
  });
  return dbPromise;
}

async function idbGet(store, key) {
  const db = await openDB();
  if (!db) return mem[store].get(key);
  return new Promise((resolve) => {
    try {
      const r = db.transaction(store, 'readonly').objectStore(store).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(undefined);
    } catch (e) { resolve(undefined); }
  });
}
async function idbPut(store, key, value) {
  const db = await openDB();
  if (!db) { mem[store].set(key, value); return true; }
  return new Promise((resolve) => {
    try {
      const t = db.transaction(store, 'readwrite');
      t.objectStore(store).put(value, key);
      t.oncomplete = () => resolve(true);
      t.onerror = () => resolve(false);
      t.onabort = () => resolve(false);
    } catch (e) { resolve(false); }
  });
}
async function idbDel(store, key) {
  const db = await openDB();
  if (!db) { mem[store].delete(key); return true; }
  return new Promise((resolve) => {
    try {
      const t = db.transaction(store, 'readwrite');
      t.objectStore(store).delete(key);
      t.oncomplete = () => resolve(true);
      t.onerror = () => resolve(false);
    } catch (e) { resolve(false); }
  });
}
async function idbKeys(store) {
  const db = await openDB();
  if (!db) return Array.from(mem[store].keys());
  return new Promise((resolve) => {
    try {
      const r = db.transaction(store, 'readonly').objectStore(store).getAllKeys();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => resolve([]);
    } catch (e) { resolve([]); }
  });
}

export const kv = {
  get: (k) => idbGet('kv', k),
  set: (k, v) => idbPut('kv', k, v),
  del: (k) => idbDel('kv', k)
};
export const putEpisode = (ep) => idbPut('episodes', ep.id, ep);
export const getEpisode = (id) => idbGet('episodes', id);
export const listEpisodeIds = () => idbKeys('episodes');
export const putImage = (id, blob) => idbPut('images', id, blob);
export const getImage = (id) => idbGet('images', id);
export const delImage = (id) => idbDel('images', id);
export const storageMode = () => (useMemory ? 'memory' : 'indexeddb');

/* ---------------- stato ---------------- */
export function newState() {
  return {
    v: 1,
    created: new Date().toISOString(),
    level: 3.5,                 // difficoltà adattiva 1-10
    done: 0,                    // episodi completati
    currentEpisodeId: null,
    diary: { summary: '', characters: [], threads: [], recent: [] },
    hook: { en: '', it: '' },
    recentLocations: [],
    introduced: {},             // elementi della lista lessicale già introdotti
    cards: [],
    known: {},                  // parole segnalate come "già note"
    grammar: {},                // argomento → {hist:[bool]}
    days: {},                   // 'AAAA-MM-GG' → {ms, session, reviewed, saved, testPct}
    streak: { count: 0, best: 0, last: null, graceWeeks: [] },
    achievements: {},
    checkpoints: [],
    chat: { messages: [], scenario: null },
    today: null,                // piano della sessione di oggi
    imgUsage: {},               // 'AAAA-MM-GG' → immagini generate
    usage: {},                  // 'AAAA-MM' → {in, out, calls, images}
    tutorImgs: null,
    tutorSets: null,
    tutorVids: null,
    tutorAutoFail: null,
    ann: {},                    // libroId → [{k:'bm'|'hl'|'note', ch, pg, si, t, col, txt, d}]
    lastBackup: null
  };
}

export function migrate(s) {
  const base = newState();
  const m = Object.assign(base, s && typeof s === 'object' ? s : {});
  ['introduced', 'known', 'grammar', 'days', 'achievements', 'imgUsage', 'usage', 'ann'].forEach((k) => { if (!m[k] || typeof m[k] !== 'object' || Array.isArray(m[k])) m[k] = {}; });
  ['cards', 'checkpoints', 'recentLocations'].forEach((k) => { if (!Array.isArray(m[k])) m[k] = []; });
  m.diary = Object.assign({ summary: '', characters: [], threads: [], recent: [] }, m.diary || {});
  m.streak = Object.assign({ count: 0, best: 0, last: null, graceWeeks: [] }, m.streak || {});
  m.chat = Object.assign({ messages: [], scenario: null }, m.chat || {});
  m.hook = Object.assign({ en: '', it: '' }, m.hook || {});
  m.v = 1;
  return m;
}

export let state = newState();
export let lexCache = {}; // traduzioni e fonetica delle parole già cercate

const writeState = async () => {
  const ok = await kv.set('state', state);
  if (!ok || useMemory) { try { localStorage.setItem('rtb1_state_fallback', JSON.stringify(state)); } catch (e) { /* ignora */ } }
};
const writeLex = () => kv.set('lex', lexCache);
const saveStateDebounced = debounce(writeState, 350);
const saveLexDebounced = debounce(writeLex, 800);
export const saveState = () => saveStateDebounced();
export const saveLex = () => saveLexDebounced();
export const flushState = () => { saveStateDebounced.flush(); saveLexDebounced.flush(); };

export async function initStore() {
  await openDB();
  let s = await kv.get('state');
  if (!s) {
    try { const fb = localStorage.getItem('rtb1_state_fallback'); if (fb) s = JSON.parse(fb); } catch (e) { /* ignora */ }
  }
  state = migrate(s);
  const lex = await kv.get('lex');
  lexCache = lex && typeof lex === 'object' ? lex : {};
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignora */ }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.hidden) flushState(); });
    window.addEventListener('pagehide', flushState);
  }
  return state;
}

/** sostituisce lo stato (importazione backup, reset) */
export function replaceState(s) {
  state = migrate(s);
  saveState();
  emit('state');
  return state;
}

/* ---------------- statistiche di consumo ---------------- */
export function trackUsage(delta) {
  const k = monthKey();
  const u = state.usage[k] || (state.usage[k] = { in: 0, out: 0, calls: 0, images: 0 });
  u.in += delta.in || 0;
  u.out += delta.out || 0;
  u.calls += delta.calls || 0;
  u.images += delta.images || 0;
  saveState();
}

export function imagesToday() {
  return state.imgUsage[dayStr()] || 0;
}
export function countImage() {
  const d = dayStr();
  state.imgUsage[d] = (state.imgUsage[d] || 0) + 1;
  // tiene solo gli ultimi 40 giorni
  const keys = Object.keys(state.imgUsage).sort();
  while (keys.length > 40) delete state.imgUsage[keys.shift()];
  trackUsage({ images: 1 });
}

/* ---------------- backup ---------------- */
export async function exportBackup() {
  const s = Object.assign({}, getSettings());
  delete s.apiKey; delete s.openaiKey; // le chiavi non finiscono mai nei file di backup
  const books = ((await kv.get('books')) || []).map((b) => ({ id: b.id, title: b.title, author: b.author, words: b.words, pos: b.pos, goal: b.goal || null, maxGp: b.maxGp || 0 }));
  return JSON.stringify({
    format: 'road-to-b1-backup', version: 2, exportedAt: new Date().toISOString(),
    state, settings: s, lex: lexCache, books
  }, null, 1);
}

/** dopo il ripristino: i libri già presenti riprendono posizione e obiettivo dal backup */
export async function restoreBooksMeta(list) {
  if (!Array.isArray(list) || !list.length) return 0;
  const cur = (await kv.get('books')) || [];
  let n = 0;
  cur.forEach((b) => { const m = list.find((x) => x.id === b.id); if (m) { b.pos = m.pos || b.pos; b.goal = m.goal || b.goal; b.maxGp = Math.max(b.maxGp || 0, m.maxGp || 0); n++; } });
  if (n) await kv.set('books', cur);
  return n;
}

/** importa un backup (della nuova app) oppure le carte della vecchia app */
export function parseBackup(text) {
  const data = JSON.parse(text);
  if (data && data.format === 'road-to-b1-backup' && data.state) return { type: 'new', data };
  const old = data && (data.state || data);
  if (old && Array.isArray(old.srs)) return { type: 'old', data: old };
  throw new Error('formato non riconosciuto');
}
