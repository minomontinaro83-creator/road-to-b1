/* ============================================================
   Lista lessicale B1: scelta degli elementi da introdurre ogni giorno.
   È la "spina dorsale" del percorso: garantisce che parole, phrasal verbs,
   verbi irregolari e costruzioni del B1 vengano coperti in modo sistematico,
   mentre il tema della scena lo decide la storia.
   ============================================================ */
import { LEXICON } from './lexicon-data.js';
import { clamp, normText } from './util.js';

let _items = null;

export function lexiconItems() {
  if (_items) return _items;
  const out = [];
  const seen = new Set();
  const push = (it) => { if (!seen.has(it.id)) { seen.add(it.id); out.push(it); } };
  for (const k of Object.keys(LEXICON).map(Number).sort((a, b) => a - b)) {
    const t = LEXICON[k];
    for (const [word, pos, note, theme] of t.w) push({ id: 'w:' + normText(word), kind: 'word', text: word, pos, note, theme, tappa: k, a2: 0 });
    for (const [verb, example, a2] of t.p) push({ id: 'p:' + normText(verb), kind: 'phrasal', text: verb, example: String(example).split(' | ')[0], tappa: k, a2 });
    for (const [base, past, pp, a2] of t.i) push({ id: 'i:' + normText(base), kind: 'irregular', text: base, note: 'past: ' + past + '; participle: ' + pp, tappa: k, a2 });
    for (const [verbs, schema, example] of t.s) push({ id: 's:' + normText(verbs), kind: 'pattern', text: verbs, note: schema, example, tappa: k, a2: 0 });
  }
  _items = out;
  return out;
}

export const lexiconTotal = () => lexiconItems().length;

/** livello 1-10 → "tappa" 1-9 della lista (la lista va dal più semplice al più avanzato) */
export function lexTappa(level) {
  return clamp(Math.round((level / 10) * 9), 1, 9);
}

const THEME_HINTS = [
  [/airport|passport|customs|baggage|luggage|suitcase|plane|flight|train|taxi|bus|metro|station|ticket|transport|hotel|hostel|check-in|travel|shuttle|rental/i, ['Travel and Transport', 'Services']],
  [/restaurant|caf[eé]|coffee|bakery|supermarket|market|breakfast|dinner|lunch|food|kitchen|order|menu/i, ['Food and Drink', 'Shopping']],
  [/pharmacy|doctor|\bill\b|sick|hospital|health|medicine/i, ['Health', 'Medicine and Exercise']],
  [/gym|sport|match|\brun|jog|hik|bike|bicycle|swim/i, ['Sport', 'Medicine and Exercise', 'Hobbies and Leisure']],
  [/cinema|film|movie|theatre|theater|concert|museum|gallery|music|show/i, ['Entertainment and Media', 'Hobbies and Leisure']],
  [/shop|clothes|mall|souvenir|fitting|store|buy|bank|post office|laundr/i, ['Shopping', 'Clothes and Accessories', 'Services']],
  [/phone|\bsim\b|wifi|wi-fi|internet|laptop|message|call|email/i, ['Communications and Technology']],
  [/park|beach|trail|countryside|garden|weather|rain|snow|nature/i, ['The Natural World', 'Weather', 'Places: Countryside']],
  [/home|flat|apartment|room|host family|house|neighbo|heating|kitchen/i, ['House and Home']],
  [/party|friend|date|meet|introduc|small talk|feel|birthday|invitation/i, ['Personal Feelings', 'Opinions and Experiences (Adjectives)']],
  [/work|office|job|interview|cowork|colleague/i, ['Work and Jobs']],
  [/school|class|language exchange|library|course|study/i, ['Education', 'Language']]
];

export function themesFor(setting) {
  const out = new Set();
  for (const [re, themes] of THEME_HINTS) if (re.test(setting || '')) themes.forEach((t) => out.add(t));
  return out;
}

/**
 * Sceglie gli elementi della lista da introdurre oggi.
 * Vicini al livello attuale, non ancora introdotti, preferibilmente coerenti con il luogo della scena.
 * @returns elementi {id, kind, text, note, example, tappa}
 */
export function pickTargets(introduced, level, setting, n = 8, rnd = Math.random) {
  const target = lexTappa(level);
  const themes = themesFor(setting);
  const pool = lexiconItems().filter((i) => !introduced[i.id]);
  const score = (i) => {
    let d = Math.abs(i.tappa - target) + (i.a2 ? 1.5 : 0) + rnd() * 1.5;
    if (i.kind === 'word' && i.theme && i.theme.split(',').some((t) => themes.has(t.trim()))) d -= 2.2;
    return d;
  };
  const take = (kind, count) => pool.filter((i) => i.kind === kind)
    .map((i) => ({ i, d: score(i) })).sort((a, b) => a.d - b.d).slice(0, count).map((x) => x.i);

  const quota = { phrasal: n >= 6 ? 1 : 0, irregular: n >= 6 ? 1 : 0, pattern: level >= 4 && rnd() < 0.5 ? 1 : 0 };
  const chosen = [];
  for (const kind of Object.keys(quota)) chosen.push(...take(kind, quota[kind]));
  const words = take('word', Math.max(0, n - chosen.length));
  chosen.push(...words);
  // se le parole sono finite, completa con qualsiasi altro elemento
  if (chosen.length < n) {
    const used = new Set(chosen.map((c) => c.id));
    chosen.push(...pool.filter((i) => !used.has(i.id)).slice(0, n - chosen.length));
  }
  return chosen.slice(0, n);
}

/** quanti elementi della lista sono già stati introdotti */
export function lexiconProgress(introduced) {
  const total = lexiconTotal();
  return { total, introduced: Object.keys(introduced).length };
}
