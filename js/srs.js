/* ============================================================
   Ripetizione dilazionata (spaced repetition) — logica pura.
   Intervalli crescenti 1 · 3 · 8 · 16 · 30 · 60 · 120 · 240 giorni.
   - "la so"      → si passa all'intervallo successivo
   - "non la so"  → si torna indietro di due gradini e si rivede domani
   - una carta è CONSOLIDATA quando la ricordi dopo aver aspettato almeno 30 giorni
   ============================================================ */
import { addDays, diffDays, normText, normCompare, hash } from './util.js';

export const INTERVALS = [1, 3, 8, 16, 30, 60, 120, 240];
export const CONSOLIDATE_AFTER_DAYS = 30;

export function cardKey(kind, f) {
  if (kind === 'word') return 'w:' + normText(f.en);
  if (kind === 'phrase') return 'p:' + normText(f.en);
  if (kind === 'error') return 'e:' + hash(normCompare(f.wrong) + '>' + normCompare(f.right));
  if (kind === 'grammar') return 'g:' + f.rule;
  return 'x:' + hash(JSON.stringify(f));
}

/** crea una carta: la prima ripetizione è domani */
export function makeCard(kind, fields, today) {
  const card = Object.assign({
    kind, en: '', it: '', ipa: '', ctx: '', expl: '', wrong: '', right: '', rule: '',
    examples: [], img: null, visual: false, source: 'tocco', prio: kind === 'error' || kind === 'grammar' ? 1 : 0
  }, fields);
  card.id = cardKey(kind, card);
  card.created = today;
  card.stage = 0;
  card.ivl = 1;
  card.due = addDays(today, 1);
  card.reviews = 0;
  card.lapses = 0;
  card.cons = false;
  card.last = null;
  return card;
}

export const isDue = (card, today) => card.due <= today;

export function applyReview(card, known, today, retry = false) {
  const elapsed = Math.max(1, diffDays(card.last || card.created, today));
  if (!known) {
    card.lapses++;
    card.stage = Math.max(0, card.stage - 2);
    card.ivl = 1;
    card.due = addDays(today, 1);
    card.cons = false;
  } else if (retry) {
    // seconda possibilità nella stessa sessione dopo un errore: non fa avanzare la carta
    card.ivl = 1;
    card.due = addDays(today, 1);
  } else {
    card.stage = Math.min(card.stage + 1, INTERVALS.length - 1);
    const cap = Math.max(3, 3 * elapsed); // niente salti enormi dopo una pausa breve
    card.ivl = Math.min(INTERVALS[card.stage], cap);
    card.due = addDays(today, card.ivl);
    if (elapsed >= CONSOLIDATE_AFTER_DAYS) card.cons = true;
  }
  card.reviews++;
  card.last = today;
  return card;
}

/** un errore commesso fuori dal ripasso (test, chat) conta come dimenticanza */
export function penalize(card, today) {
  card.lapses++;
  card.stage = Math.max(0, card.stage - 2);
  card.ivl = 1;
  if (card.due > addDays(today, 1)) card.due = addDays(today, 1);
  card.cons = false;
  return card;
}

/** priorità di ripasso: più è alta, più la carta rischia di essere dimenticata */
export function riskScore(card, today) {
  if (!isDue(card, today)) return 0;
  const overdue = Math.max(0, diffDays(card.due, today));
  const ivl = card.ivl || 1;
  return 1 + overdue / ivl + 0.35 * Math.min(card.lapses, 6) + (card.prio ? 0.8 : 0) + (card.stage <= 1 ? 0.15 : 0);
}

/** le carte del giorno: solo quelle in scadenza, le più a rischio per prime, con un tetto */
export function buildQueue(cards, today, limit) {
  return cards
    .filter((c) => isDue(c, today))
    .map((c) => ({ c, r: riskScore(c, today) }))
    .sort((a, b) => b.r - a.r || (a.c.created < b.c.created ? -1 : 1))
    .slice(0, limit)
    .map((x) => x.c);
}

export function cardState(card) {
  if (card.cons) return 'consolidated';
  return card.reviews === 0 ? 'new' : 'learning';
}

export function counts(cards) {
  const out = { total: cards.length, new: 0, learning: 0, consolidated: 0, due: 0, byKind: { word: 0, phrase: 0, error: 0, grammar: 0 } };
  for (const c of cards) {
    out[cardState(c)]++;
    out.byKind[c.kind] = (out.byKind[c.kind] || 0) + 1;
  }
  return out;
}

export function countDue(cards, today) {
  let n = 0;
  for (const c of cards) if (isDue(c, today)) n++;
  return n;
}
