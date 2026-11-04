/* ============================================================
   Carte (flashcard): creazione da parole toccate, glossario ed errori.
   Gli errori diventano SEMPRE carte (con priorità), tranne quelli banali.
   ============================================================ */
import { state, saveState, emit, getSettings } from './store.js';
import { dayStr, normText, isTrivialCorrection } from './util.js';
import { makeCard, cardKey, penalize, applyReview, buildQueue, isDue } from './srs.js';
import { recordGrammar } from './levels.js';

export const findCard = (id) => state.cards.find((c) => c.id === id) || null;

/** aggiunge una carta (o, se esiste già, la rafforza). Restituisce {card, created} */
export function ensureCard(kind, fields, opts = {}) {
  const today = dayStr();
  const id = cardKey(kind, fields);
  const existing = findCard(id);
  if (existing) {
    if (opts.penalize) { penalize(existing, today); existing.prio = 1; }
    if (fields.it && !existing.it) existing.it = fields.it;
    if (fields.ipa && !existing.ipa) existing.ipa = fields.ipa;
    if (fields.ctx && !existing.ctx) existing.ctx = fields.ctx;
    saveState();
    return { card: existing, created: false };
  }
  const card = makeCard(kind, fields, today);
  if (opts.prio) card.prio = 1;
  state.cards.push(card);
  saveState();
  emit('cards');
  return { card, created: true };
}

const cleanCtx = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** carta di parola o espressione */
export function addWordCard({ en, it, ipa, ctx, visual, kind, source }) {
  const text = String(en || '').trim();
  if (!text) return null;
  const isPhrase = (kind && kind !== 'word') || text.split(/\s+/).length > 1;
  return ensureCard(isPhrase ? 'phrase' : 'word', {
    en: text, it: it || '', ipa: ipa || '', ctx: cleanCtx(ctx), visual: !!visual && !isPhrase, source: source || 'tocco'
  }).card;
}

/** quante carte nuove da lessico sono già state create oggi */
export function newWordsToday() {
  const t = dayStr();
  return state.cards.filter((c) => c.created === t && (c.source === 'glossario' || c.source === 'tocco') && (c.kind === 'word' || c.kind === 'phrase')).length;
}

/** dopo la lettura: le parole del glossario non ancora note diventano carte, entro il tetto giornaliero */
export function addGlossaryCards(ep) {
  const cap = getSettings().newPerDay;
  const out = [];
  for (const g of ep.glossary || []) {
    if (newWordsToday() >= cap) break;
    const key = normText(g.surface);
    if (state.known[key]) continue;
    const id = cardKey(g.surface.split(/\s+/).length > 1 || (g.kind && g.kind !== 'word') ? 'phrase' : 'word', { en: g.surface });
    if (findCard(id)) continue;
    const sentence = (ep.sentences.find((s) => s.en.toLowerCase().includes(g.surface.toLowerCase())) || {}).en || '';
    const card = addWordCard({ en: g.surface, it: g.it, ipa: g.ipa, ctx: sentence, visual: g.visual, kind: g.kind, source: 'glossario' });
    if (card) out.push(card);
  }
  return out;
}

export function markKnown(word) {
  state.known[normText(word)] = dayStr();
  saveState();
}

/** correzione "sostanziale" (dal tutor o dal test) → carta di errore */
export function addCorrectionCard({ wrong, right, rule, expl, source }) {
  if (!wrong || !right || isTrivialCorrection(wrong, right)) return null;
  const r = ensureCard('error', { wrong: String(wrong).trim(), right: String(right).trim(), rule: rule || '', expl: expl || '', en: String(right).trim(), source: source || 'errore' }, { penalize: true, prio: true });
  if (rule) recordGrammar(state.grammar, rule, false);
  saveState();
  return r.card;
}

/** errore in una domanda del test: crea le carte giuste a seconda del tipo */
export function cardsFromTestError(q, userAnswer, ctx = {}) {
  const made = [];
  const push = (c) => { if (c) made.push(c); };
  const expl = q.explanation_it || '';
  if (q.rule) recordGrammar(state.grammar, q.rule, false);
  if (q.focus === 'grammar' || q.rule) {
    if (q.type === 'cloze') {
      const filled = (a) => String(q.prompt || '').replace('___', a);
      push(addCorrectionCard({ wrong: filled(userAnswer || '…'), right: filled(q.answer), rule: q.rule, expl, source: 'test' }));
    } else if (q.type === 'translate' || q.type === 'order') {
      push(addCorrectionCard({ wrong: userAnswer || '…', right: q.answer, rule: q.rule, expl, source: 'test' }));
    } else {
      push(ensureCard('error', { wrong: q.prompt || q.target, right: q.answer, rule: q.rule || '', expl, en: q.answer, source: 'test' }, { penalize: true, prio: true }).card);
    }
  } else if (q.target) {
    const isPhrase = q.focus === 'phrase' || q.target.trim().split(/\s+/).length > 1;
    const r = ensureCard(isPhrase ? 'phrase' : 'word', { en: q.target.trim(), it: q.target_it || '', ctx: ctx.sentence || '', source: 'test' }, { penalize: true, prio: true });
    r.card.prio = 1;
    push(r.card);
  } else if (q.type === 'translate' || q.type === 'listen') {
    push(addCorrectionCard({ wrong: userAnswer || '…', right: q.answer, expl, source: 'test' }));
  }
  saveState();
  return made;
}

/** domanda azzeccata: se riguarda una carta esistente la rafforziamo come ricordata fuori ripasso (nessun avanzamento) */
export function noteCorrect(q) {
  if (q.rule) recordGrammar(state.grammar, q.rule, true);
}

/* -------------------- ripasso -------------------- */
export function reviewQueue() {
  return buildQueue(state.cards, dayStr(), getSettings().reviewPerDay);
}
export function answerCard(card, known, retry = false) {
  applyReview(card, known, dayStr(), retry);
  saveState();
}
export function dueTotal() {
  const t = dayStr();
  return state.cards.filter((c) => isDue(c, t)).length;
}

export function removeCard(id) {
  const i = state.cards.findIndex((c) => c.id === id);
  if (i >= 0) { state.cards.splice(i, 1); saveState(); emit('cards'); }
}
