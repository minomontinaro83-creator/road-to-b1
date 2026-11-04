/* ============================================================
   Livelli (difficoltà adattiva 1-10) e argomenti di grammatica B1
   ============================================================ */
import { clamp } from './util.js';

/** Descrizione di ciò che deve contenere un brano a ciascun livello (usata nei prompt) */
export const LEVELS = [
  null,
  { n: 1,  cefr: 'A2 (base)',  avgWords: 7,  maxWords: 12, grammar: 'present simple, basic past simple, can/can\'t, there is/are, simple questions, imperatives', vocab: 'only the most frequent everyday words' },
  { n: 2,  cefr: 'A2',         avgWords: 8,  maxWords: 13, grammar: 'present simple and continuous, past simple (regular and common irregular verbs), going to, comparatives', vocab: 'very common everyday words, concrete topics' },
  { n: 3,  cefr: 'A2',         avgWords: 9,  maxWords: 14, grammar: 'past simple, past continuous (simple uses), going to / will, can/could, comparatives and superlatives, some/any/much/many', vocab: 'common everyday words; explain nothing in the text, keep meaning clear from context' },
  { n: 4,  cefr: 'A2+',        avgWords: 10, maxWords: 15, grammar: 'present perfect (experience, for/since), have to/must/should, first conditional, used to, simple relative clauses', vocab: 'everyday vocabulary plus travel and service words' },
  { n: 5,  cefr: 'A2+/B1',     avgWords: 11, maxWords: 16, grammar: 'present perfect vs past simple, first conditional, modals of obligation and possibility, simple passive, gerund/infinitive after common verbs', vocab: 'travel, food, health, free time; a few phrasal verbs' },
  { n: 6,  cefr: 'B1 (basso)', avgWords: 12, maxWords: 18, grammar: 'second conditional, passive (present/past), relative clauses, reported speech (simple), past perfect (occasional), linking words', vocab: 'wider everyday vocabulary, common phrasal verbs and collocations' },
  { n: 7,  cefr: 'B1',         avgWords: 13, maxWords: 19, grammar: 'all common tenses, conditionals 0-2, passive, reported speech, relative clauses, indirect questions, question tags', vocab: 'B1 vocabulary, phrasal verbs, a few idioms' },
  { n: 8,  cefr: 'B1 (solido)',avgWords: 14, maxWords: 21, grammar: 'mixed tenses in the same passage, wish/hope, past perfect, longer sentences with linking words (although, however, as soon as)', vocab: 'B1 vocabulary with natural collocations, idiomatic expressions' },
  { n: 9,  cefr: 'B1 (alto)',  avgWords: 15, maxWords: 23, grammar: 'complex sentences, reported speech, passive in several tenses, gerund/infinitive contrasts', vocab: 'broad B1 vocabulary, idioms, informal spoken English' },
  { n: 10, cefr: 'B1+',        avgWords: 16, maxWords: 25, grammar: 'everything above with natural fluency, hints of B2 structures', vocab: 'rich B1+ vocabulary, idioms, phrasal verbs, natural spoken fillers' }
];

export function levelInfo(level) {
  return LEVELS[clamp(Math.round(level), 1, 10)];
}

/**
 * Adatta il livello al risultato del test:
 * molto bene → un po' più difficile; male → più semplice (il giorno dopo).
 */
export function adaptLevel(level, pct) {
  let d;
  if (pct >= 90) d = 0.4;
  else if (pct >= 80) d = 0.25;
  else if (pct >= 70) d = 0.1;
  else if (pct >= 60) d = -0.1;
  else if (pct >= 45) d = -0.3;
  else d = -0.5;
  return Math.round(clamp(level + d, 1, 10) * 100) / 100;
}

/** Argomenti di grammatica (45 = B1 completo). id usati nei test e nelle carte di grammatica */
export const GRAMMAR_TOPICS = [
  { id: 'present_simple', it: 'Present simple', en: 'present simple' },
  { id: 'present_continuous', it: 'Present continuous', en: 'present continuous' },
  { id: 'present_simple_vs_continuous', it: 'Present simple o continuous', en: 'present simple vs present continuous' },
  { id: 'past_simple', it: 'Past simple (regolari e irregolari)', en: 'past simple, regular and irregular' },
  { id: 'past_continuous', it: 'Past continuous', en: 'past continuous' },
  { id: 'past_simple_vs_continuous', it: 'Past simple o past continuous', en: 'past simple vs past continuous' },
  { id: 'present_perfect', it: 'Present perfect (esperienze, for/since)', en: 'present perfect' },
  { id: 'present_perfect_vs_past', it: 'Present perfect o past simple', en: 'present perfect vs past simple' },
  { id: 'past_perfect', it: 'Past perfect', en: 'past perfect' },
  { id: 'future_will_going_to', it: 'Futuro: will e be going to', en: 'will vs going to' },
  { id: 'present_continuous_future', it: 'Present continuous per il futuro', en: 'present continuous for future arrangements' },
  { id: 'zero_conditional', it: 'Zero conditional (fatti generali)', en: 'zero conditional' },
  { id: 'first_conditional', it: 'Primo periodo ipotetico (if + present, will)', en: 'first conditional' },
  { id: 'second_conditional', it: 'Secondo periodo ipotetico (if + past, would)', en: 'second conditional' },
  { id: 'modals_ability', it: 'can / could / be able to', en: 'can, could, be able to' },
  { id: 'modals_obligation', it: 'must / have to / should', en: 'must, have to, should, ought to' },
  { id: 'modals_possibility', it: 'may / might / could (possibilità)', en: 'may, might, could for possibility' },
  { id: 'requests_permission', it: 'Richieste e permessi (Could I…? Can you…?)', en: 'polite requests and permission' },
  { id: 'used_to', it: 'used to (abitudini passate)', en: 'used to and would for past habits' },
  { id: 'passive', it: 'Forma passiva', en: 'passive voice' },
  { id: 'reported_speech', it: 'Discorso indiretto', en: 'reported speech' },
  { id: 'relative_clauses', it: 'Frasi relative (who, which, that, where)', en: 'relative clauses' },
  { id: 'gerund_infinitive', it: 'Gerundio o infinito (enjoy doing, want to do)', en: 'gerund vs infinitive' },
  { id: 'comparatives_superlatives', it: 'Comparativi e superlativi', en: 'comparatives and superlatives' },
  { id: 'articles', it: 'Articoli (a, an, the, nessun articolo)', en: 'articles' },
  { id: 'quantifiers', it: 'some, any, much, many, a lot of, few, little', en: 'quantifiers' },
  { id: 'countable_uncountable', it: 'Nomi numerabili e non numerabili', en: 'countable and uncountable nouns' },
  { id: 'prepositions_time_place', it: 'Preposizioni di tempo e di luogo', en: 'prepositions of time and place' },
  { id: 'prepositions_dependent', it: 'Preposizioni dopo verbi e aggettivi', en: 'dependent prepositions' },
  { id: 'phrasal_verbs', it: 'Phrasal verbs', en: 'phrasal verbs' },
  { id: 'question_forms', it: 'Formare le domande (ausiliari e ordine)', en: 'question formation' },
  { id: 'indirect_questions', it: 'Domande indirette (Could you tell me where…?)', en: 'indirect questions' },
  { id: 'question_tags', it: 'Question tags (isn\'t it? don\'t you?)', en: 'question tags' },
  { id: 'linking_words', it: 'Connettivi (although, however, because, so)', en: 'linking words' },
  { id: 'word_order_adverbs', it: 'Ordine delle parole e avverbi', en: 'word order and adverbs' },
  { id: 'too_enough_so_such', it: 'too / enough / so / such', en: 'too, enough, so, such' },
  { id: 'possessives_pronouns', it: 'Possessivi e pronomi', en: 'possessives and pronouns' },
  { id: 'there_is_are', it: 'there is / there are', en: 'there is / there are' },
  { id: 'imperatives_suggestions', it: 'Imperativo e suggerimenti (Let\'s, How about…)', en: 'imperatives and suggestions' },
  { id: 'wish_hope', it: 'wish / hope / if only (desideri)', en: 'wish, hope, if only' },
  { id: 'verb_patterns', it: 'Costruzioni dei verbi (verbo + persona + to…)', en: 'verb patterns' },
  { id: 'adjectives_adverbs', it: 'Aggettivi e avverbi', en: 'adjectives and adverbs' },
  { id: 'conjunctions_time', it: 'Frasi di tempo (when, while, as soon as, until)', en: 'time clauses' },
  { id: 'so_neither', it: 'So do I / Neither do I (accordo)', en: 'so/neither agreement' }
];

export const GRAMMAR_IDS = GRAMMAR_TOPICS.map((t) => t.id);
const byId = Object.fromEntries(GRAMMAR_TOPICS.map((t) => [t.id, t]));
export const grammarTopic = (id) => byId[id] || null;
export const grammarName = (id) => (byId[id] ? byId[id].it : '');

/** Argomento di grammatica "padroneggiato": almeno 5 risposte recenti e almeno l'80% giuste */
export function topicMastered(stat) {
  if (!stat || !stat.hist || stat.hist.length < 5) return false;
  const ok = stat.hist.filter(Boolean).length;
  return ok / stat.hist.length >= 0.8;
}

/** registra l'esito di una risposta su un argomento (tiene le ultime 8) */
export function recordGrammar(grammarState, ruleId, correct) {
  if (!ruleId || !byId[ruleId]) return;
  const s = grammarState[ruleId] || (grammarState[ruleId] = { hist: [] });
  s.hist.push(!!correct);
  if (s.hist.length > 8) s.hist.shift();
}
