/* ============================================================
   Progressi: serie di giorni (con un giorno di tolleranza a settimana),
   percentuale verso il B1, traguardi, calendario, checkpoint mensile.
   Funzioni pure dove possibile, per poterle verificare con i test.
   ============================================================ */
import { state, saveState, emit } from './store.js';
import { dayStr, addDays, diffDays, isoWeekKey, parseDay, weekdayIdx } from './util.js';
import { counts } from './srs.js';
import { GRAMMAR_TOPICS, topicMastered } from './levels.js';
import { lexiconTotal } from './lexicon.js';
import { EPISODES_PER_SEASON } from './story.js';

export const B1_WORDS_TARGET = 2000;
export const B1_EPISODES_TARGET = EPISODES_PER_SEASON * 6;
export const MIN_ACTIVE_MS = 5 * 60 * 1000;

/** un giorno "conta" se c'è stata attività vera */
export const dayActive = (d) => !!(d && (d.active || (d.ms || 0) >= MIN_ACTIVE_MS));

/**
 * Serie di giorni consecutivi. Un solo giorno saltato per settimana (ISO) non rompe la serie.
 * Oggi non ancora fatto non interrompe nulla.
 */
export function streakInfo(days, today = dayStr()) {
  const dates = Object.keys(days).filter((k) => dayActive(days[k])).sort();
  if (!dates.length) return { current: 0, best: 0, todayDone: false, graceUsed: false, atRisk: false };
  const graceWeeks = new Set();
  let run = 0, best = 0, d = dates[0];
  while (d <= today) {
    if (dayActive(days[d])) { run++; best = Math.max(best, run); }
    else if (d === today) { /* la giornata non è finita */ }
    else {
      const wk = isoWeekKey(d);
      if (run > 0 && !graceWeeks.has(wk)) graceWeeks.add(wk);
      else run = 0;
    }
    d = addDays(d, 1);
  }
  const todayDone = dayActive(days[today]);
  const yesterday = addDays(today, -1);
  const missedYesterday = !dayActive(days[yesterday]) && run > 0 && dates[0] <= yesterday;
  return { current: run, best, todayDone, graceUsed: graceWeeks.has(isoWeekKey(today)), atRisk: !todayDone && missedYesterday };
}
export const getStreak = () => streakInfo(state.days);

function day(d = dayStr()) {
  return state.days[d] || (state.days[d] = { ms: 0, active: false, reviewed: 0, saved: 0, session: false, testPct: null, chat: 0 });
}
export const getDay = (d = dayStr()) => state.days[d] || { ms: 0, active: false, reviewed: 0, saved: 0, session: false, testPct: null, chat: 0 };

/** segna attività; restituisce true se con questo gesto la giornata è diventata "valida" */
export function markActive(patch = {}) {
  const d = day();
  const was = dayActive(d);
  Object.keys(patch).forEach((k) => {
    if (typeof patch[k] === 'number' && ['ms', 'reviewed', 'saved', 'chat'].includes(k)) d[k] = (d[k] || 0) + patch[k];
    else d[k] = patch[k];
  });
  if (patch.session || patch.reviewed || patch.chat || patch.testPct != null) d.active = true;
  const now = dayActive(d);
  const cur = streakInfo(state.days);
  state.streak.count = cur.current;
  state.streak.best = Math.max(state.streak.best || 0, cur.best);
  state.streak.last = dayStr();
  saveState();
  if (now && !was) emit('dayDone');
  return now && !was;
}

/** tempo attivo: si aggiorna ogni pochi secondi dalla schermata visibile */
export function addTime(ms) {
  if (ms <= 0 || ms > 60000) return;
  const d = day();
  d.ms = (d.ms || 0) + ms;
  saveState();
}

/* ---------------------- percentuale B1 ---------------------- */
export function b1Progress() {
  const c = counts(state.cards);
  const grammarDone = GRAMMAR_TOPICS.filter((t) => topicMastered(state.grammar[t.id])).length;
  const last = state.checkpoints.length ? state.checkpoints[state.checkpoints.length - 1] : null;
  const parts = [
    { key: 'words', label: 'Parole consolidate', icon: '', value: Math.min(1, c.consolidated / B1_WORDS_TARGET), weight: 0.35, detail: c.consolidated + ' / ' + B1_WORDS_TARGET },
    { key: 'grammar', label: 'Argomenti di grammatica', icon: '', value: grammarDone / GRAMMAR_TOPICS.length, weight: 0.25, detail: grammarDone + ' / ' + GRAMMAR_TOPICS.length },
    { key: 'episodes', label: 'Episodi completati', icon: '', value: Math.min(1, state.done / B1_EPISODES_TARGET), weight: 0.2, detail: state.done + ' / ' + B1_EPISODES_TARGET },
    { key: 'checkpoint', label: 'Verifica mensile', icon: '', value: last ? last.pct / 100 : 0, weight: 0.2, detail: last ? last.pct + '%' : 'non ancora fatta' }
  ];
  const pct = Math.round(parts.reduce((a, p) => a + p.value * p.weight, 0) * 100);
  return { pct: Math.min(100, pct), parts, consolidated: c.consolidated, grammarDone, counts: c };
}

/** quanti elementi della lista B1 sono stati incontrati */
export function lexiconCoverage() {
  const total = lexiconTotal();
  const n = Object.keys(state.introduced).length;
  return { total, n, pct: total ? Math.round((n / total) * 100) : 0 };
}

/** stima in mesi per arrivare al B1 al ritmo attuale (ultime 4 settimane) */
export function etaMonths() {
  const t = dayStr();
  let consolidated = 0;
  const since = addDays(t, -28);
  state.cards.forEach((c) => { if (c.cons && c.last && c.last >= since) consolidated++; });
  const c = counts(state.cards).consolidated;
  const remaining = Math.max(0, B1_WORDS_TARGET - c);
  if (!remaining) return 0;
  if (consolidated < 3) return null;
  const perMonth = consolidated; // in 28 giorni
  return Math.max(1, Math.round(remaining / perMonth));
}

/* ---------------------- traguardi ---------------------- */
export const ACHIEVEMENTS = [
  { id: 'ep1', icon: '', title: 'Atterrato!', desc: 'Primo episodio completato', test: (s) => s.done >= 1 },
  { id: 'ep10', icon: '', title: 'Esploratore', desc: '10 episodi completati', test: (s) => s.done >= 10 },
  { id: 'ep40', icon: '', title: 'Stagione 1 finita', desc: '40 episodi completati', test: (s) => s.done >= 40 },
  { id: 'ep120', icon: '', title: 'Giramondo', desc: '120 episodi completati', test: (s) => s.done >= 120 },
  { id: 'st3', icon: '', title: 'Si accende', desc: '3 giorni di fila', test: (s) => s.streak.best >= 3 },
  { id: 'st7', icon: '', title: 'Una settimana!', desc: '7 giorni di fila', test: (s) => s.streak.best >= 7 },
  { id: 'st14', icon: '', title: 'Due settimane', desc: '14 giorni di fila', test: (s) => s.streak.best >= 14 },
  { id: 'st30', icon: '', title: 'Un mese intero', desc: '30 giorni di fila', test: (s) => s.streak.best >= 30 },
  { id: 'st100', icon: '', title: 'Cento giorni', desc: '100 giorni di fila', test: (s) => s.streak.best >= 100 },
  { id: 'w10', icon: '', title: 'Prime radici', desc: '10 parole consolidate', test: (s) => counts(s.cards).consolidated >= 10 },
  { id: 'w100', icon: '', title: 'Cento parole', desc: '100 parole consolidate', test: (s) => counts(s.cards).consolidated >= 100 },
  { id: 'w500', icon: '', title: 'Cinquecento', desc: '500 parole consolidate', test: (s) => counts(s.cards).consolidated >= 500 },
  { id: 'w1000', icon: '', title: 'Mille parole', desc: '1000 parole consolidate', test: (s) => counts(s.cards).consolidated >= 1000 },
  { id: 'w2000', icon: '', title: 'Duemila!', desc: '2000 parole consolidate', test: (s) => counts(s.cards).consolidated >= 2000 },
  { id: 'perfect', icon: '', title: 'Test perfetto', desc: 'Nessun errore in un test', test: () => false },
  { id: 'chat10', icon: '', title: 'Chiacchierone', desc: '10 messaggi al tutor', test: (s) => Object.values(s.days).reduce((a, d) => a + (d.chat || 0), 0) >= 10 },
  { id: 'cp1', icon: '', title: 'Prima verifica', desc: 'Verifica mensile completata', test: (s) => s.checkpoints.length >= 1 },
  { id: 'b50', icon: '', title: 'A metà strada', desc: '50% verso il B1', test: () => b1Progress().pct >= 50 },
  { id: 'b100', icon: '', title: 'Livello B1!', desc: '100% verso il B1', test: () => b1Progress().pct >= 100 }
];

/** controlla i traguardi; restituisce quelli appena ottenuti */
export function checkAchievements(extra = {}) {
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (state.achievements[a.id]) continue;
    let ok = false;
    if (a.id === 'perfect') ok = !!extra.perfect;
    else { try { ok = a.test(state); } catch (e) { ok = false; } }
    if (ok) { state.achievements[a.id] = dayStr(); fresh.push(a); }
  }
  if (fresh.length) { saveState(); emit('achievement', fresh); }
  return fresh;
}

/* ---------------------- calendario ---------------------- */
/** griglia del mese: array di settimane (lun-dom) con {date, inMonth, active, today} */
export function monthGrid(year, month, days = state.days) {
  const first = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  let d = addDays(first, -weekdayIdx(first));
  const today = dayStr();
  const rows = [];
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let i = 0; i < 7; i++) {
      const dt = parseDay(d);
      row.push({ date: d, n: dt.getDate(), inMonth: dt.getMonth() === month, active: dayActive(days[d]), today: d === today, future: d > today });
      d = addDays(d, 1);
    }
    if (w >= 4 && !row.some((c) => c.inMonth)) break;
    rows.push(row);
  }
  return rows;
}

/* ---------------------- verifica mensile ---------------------- */
export function checkpointDue() {
  const last = state.checkpoints.length ? state.checkpoints[state.checkpoints.length - 1].date : null;
  if (!last) return state.done >= 20;
  return diffDays(last, dayStr()) >= 28;
}
export function addCheckpoint(pct, detail = {}) {
  state.checkpoints.push(Object.assign({ date: dayStr(), pct }, detail));
  saveState();
}

/** totale minuti degli ultimi n giorni (per il grafico) */
export function lastDays(n) {
  const out = [];
  const t = dayStr();
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(t, -i);
    out.push({ date: d, min: Math.round(((state.days[d] || {}).ms || 0) / 60000), active: dayActive(state.days[d]) });
  }
  return out;
}
