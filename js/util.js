/* ============================================================
   Utilità comuni: testo, date, confronto risposte, tokenizzazione
   (funzioni pure, testabili anche fuori dal browser)
   ============================================================ */

export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sample(arr, n, rnd = Math.random) {
  return shuffle(arr, rnd).slice(0, Math.max(0, n));
}

export function debounce(fn, ms) {
  let t = null;
  const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  d.flush = (...args) => { clearTimeout(t); fn(...args); };
  return d;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- date (sempre giorno locale, formato YYYY-MM-DD) ---------- */
const p2 = (n) => String(n).padStart(2, '0');
export function dayStr(d = new Date()) {
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
}
export function parseDay(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0); // mezzogiorno: immune ai cambi d'ora
}
export function addDays(s, n) {
  const d = parseDay(s);
  d.setDate(d.getDate() + n);
  return dayStr(d);
}
/** giorni da a a b (b - a) */
export function diffDays(a, b) {
  return Math.round((parseDay(b) - parseDay(a)) / 86400000);
}
/** chiave della settimana ISO, es. 2026-W43 (la settimana inizia il lunedì) */
export function isoWeekKey(s) {
  const d = parseDay(s);
  const day = (d.getDay() + 6) % 7; // lunedì = 0
  d.setDate(d.getDate() - day + 3);  // giovedì della stessa settimana
  const firstThu = new Date(d.getFullYear(), 0, 4, 12);
  const week = 1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getDay() + 6) % 7)) / 7);
  return d.getFullYear() + '-W' + p2(week);
}
export const monthKey = (s = dayStr()) => s.slice(0, 7);
/** 0 = lunedì … 6 = domenica */
export const weekdayIdx = (s) => (parseDay(s).getDay() + 6) % 7;

export function fmtMin(ms) {
  const m = Math.round(ms / 60000);
  return m < 1 ? '<1 min' : m + ' min';
}

/* ---------- testo ---------- */
export function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** minuscole, apostrofi uniformi, senza punteggiatura */
export function normText(t) {
  return String(t == null ? '' : t).toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/[.,!?;:"“”()\[\]…–—]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

/** normalizzazione per il confronto: espande le contrazioni non ambigue */
export function normCompare(t) {
  let s = normText(t);
  s = s.replace(/\bcan't\b/g, 'can not').replace(/\bcannot\b/g, 'can not')
    .replace(/\bwon't\b/g, 'will not').replace(/\bshan't\b/g, 'shall not')
    .replace(/n't\b/g, ' not')
    .replace(/'m\b/g, ' am').replace(/'re\b/g, ' are').replace(/'ve\b/g, ' have').replace(/'ll\b/g, ' will');
  return s.replace(/\s+/g, ' ').trim();
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1), cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

export function similarity(a, b) {
  const x = normCompare(a), y = normCompare(b);
  if (!x || !y) return 0;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

/** Due parole sono "un refuso" solo se differiscono per un carattere e sono lunghe
    (così "bought"/"brought" resta un errore vero). */
function isTransposition(a, b) {
  if (a.length !== b.length) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return i < a.length - 1 && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
}
function typoPair(a, b) {
  if (a === b) return true;
  const min = Math.min(a.length, b.length);
  if (min < 6) return false;
  if (isTransposition(a, b)) return true;          // "restaurnat"
  return min >= 8 && levenshtein(a, b) <= 1;       // parole lunghe: una lettera di troppo/di meno
}

/**
 * Confronta la risposta dell'utente con quella attesa (e le alternative accettate).
 * Ignora maiuscole, punteggiatura, contrazioni e refusi evidenti: conta solo la sostanza.
 * @returns {{ok:boolean, exact:boolean, typo:boolean}}
 */
export function answerMatches(user, answer, accepts = []) {
  const u = normCompare(user);
  if (!u) return { ok: false, exact: false, typo: false };
  const cands = [answer].concat(accepts || []).filter(Boolean);
  let typo = false;
  for (const c of cands) {
    const t = normCompare(c);
    if (u === t) return { ok: true, exact: true, typo: false };
    const uw = u.split(' '), tw = t.split(' ');
    if (uw.length === tw.length) {
      let bad = 0, fuzzy = 0;
      for (let i = 0; i < uw.length; i++) {
        if (uw[i] === tw[i]) continue;
        if (typoPair(uw[i], tw[i])) fuzzy++; else bad++;
      }
      if (!bad && fuzzy <= 2) typo = true;
    }
  }
  return typo ? { ok: true, exact: false, typo: true } : { ok: false, exact: false, typo: false };
}

/** true se la "correzione" è banale (solo maiuscole/punteggiatura/refuso): da non trasformare in flashcard */
export function isTrivialCorrection(wrong, right) {
  const a = normCompare(wrong), b = normCompare(right);
  if (!a || !b) return true;
  if (a === b) return true;
  const aw = a.split(' '), bw = b.split(' ');
  if (aw.length !== bw.length) return false;
  for (let i = 0; i < aw.length; i++) {
    if (aw[i] !== bw[i] && !typoPair(aw[i], bw[i])) return false;
  }
  return true;
}

/* ---------- tokenizzazione per il lettore ---------- */
const WORD_RE = /[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+)*/g;

/** divide una frase in segmenti {t, w} (w = è una parola toccabile) */
export function tokenize(text) {
  const out = [];
  let last = 0, m;
  WORD_RE.lastIndex = 0;
  const s = String(text || '');
  while ((m = WORD_RE.exec(s))) {
    if (m.index > last) out.push({ t: s.slice(last, m.index), w: false });
    out.push({ t: m[0], w: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: s.slice(last), w: false });
  return out;
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Trova nel testo le espressioni del glossario (anche più parole).
 * @returns {{start:number,end:number,idx:number}[]} intervalli non sovrapposti, in ordine
 */
export function findSpans(text, surfaces) {
  const found = [];
  const order = surfaces.map((s, i) => ({ s: String(s || '').trim(), i })).filter((x) => x.s)
    .sort((a, b) => b.s.length - a.s.length);
  for (const { s, i } of order) {
    const pat = escRe(s).replace(/['’]/g, "['’]").replace(/\s+/g, '\\s+');
    const re = new RegExp('(?<![A-Za-z])' + pat + '(?![A-Za-z])', 'gi');
    let m;
    while ((m = re.exec(text))) {
      const start = m.index, end = start + m[0].length;
      if (!found.some((f) => start < f.end && end > f.start)) found.push({ start, end, idx: i });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

/** forma base approssimata per cercare una parola toccata nel glossario/nelle carte */
export function wordKey(w) {
  return normText(w).replace(/^'+|'+$/g, '');
}

/** è un sostantivo/azione "disegnabile"? Usato solo come ripiego quando il modello non lo dice */
export function looksLikeSentence(text) {
  return normText(text).split(' ').length >= 5;
}
