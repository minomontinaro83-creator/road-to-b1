/* ============================================================
   Motore: genera episodi, test, risposte del tutor, parole e traduzioni.
   Tiene la storia coerente (diario) e prepara in anticipo l'episodio successivo.
   ============================================================ */
import { state, saveState, getSettings, putEpisode, getEpisode, lexCache, saveLex, emit } from './store.js';
import { claudeTool, hasAnthropicKey } from './api.js';
import { dayStr, normText, shuffle } from './util.js';
import { seasonInfo, pickSetting } from './story.js';
import { pickTargets } from './lexicon.js';
import { GRAMMAR_TOPICS, adaptLevel, grammarTopic } from './levels.js';
import * as P from './prompts.js';

const jobs = new Map();
const once = (key, fn) => {
  if (jobs.has(key)) return jobs.get(key);
  const p = fn().finally(() => jobs.delete(key));
  jobs.set(key, p);
  return p;
};
export const isBusy = (key) => jobs.has(key);

/* ---------------- episodio ---------------- */
export function weakGrammar() {
  return GRAMMAR_TOPICS.filter((t) => {
    const h = (state.grammar[t.id] || {}).hist || [];
    return h.length >= 3 && h.filter(Boolean).length / h.length < 0.6;
  }).slice(0, 3);
}

function reviewWords(n = 8) {
  const pool = state.cards.filter((c) => (c.kind === 'word' || c.kind === 'phrase') && !c.cons && c.reviews > 0);
  return shuffle(pool).slice(0, n).map((c) => c.en);
}

function normaliseEpisode(raw, meta) {
  const sentences = (raw.sentences || [])
    .map((s) => (typeof s === 'string' ? { en: s } : s))
    .filter((s) => s && typeof s.en === 'string' && s.en.trim())
    .map((s) => ({ en: s.en.trim(), ipa: String(s.ipa || '').replace(/^\/|\/$/g, '').trim(), newPara: !!s.newPara }));
  if (sentences.length) sentences[0].newPara = true;
  const text = sentences.map((s) => s.en).join(' ').toLowerCase();
  const seen = new Set();
  const glossary = (raw.glossary || []).filter((g) => {
    if (!g || !g.surface || !g.it) return false;
    const k = normText(g.surface);
    if (seen.has(k) || !text.includes(String(g.surface).toLowerCase())) return false;
    seen.add(k);
    return true;
  }).map((g) => ({ surface: String(g.surface).trim(), it: String(g.it).trim(), ipa: String(g.ipa || '').replace(/^\/|\/$/g, '').trim(), kind: g.kind || 'word', visual: !!g.visual }));
  const rp = raw.roleplay || {};
  return {
    id: meta.id, number: meta.number, season: meta.season, index: meta.index,
    title: raw.title || ('Episode ' + meta.number), location: raw.location || meta.setting,
    setting: meta.setting, level: meta.level, created: dayStr(),
    sentences, glossary,
    roleplay: { situation_en: rp.situation_en || '', tutor_role_en: rp.tutor_role_en || '', opening_en: rp.opening_en || '', hints: Array.isArray(rp.hints) ? rp.hints : [] },
    teaser_it: raw.teaser_it || '', hook_en: raw.hook_en || '',
    diary: raw.diary || { summary_en: '', threads: [] },
    image_prompt: raw.image_prompt || '', grammar_focus: raw.grammar_focus || [],
    targets: meta.targets, hasIpa: !!meta.needIpa,
    imageKey: null, test: null, result: null, completed: false
  };
}

/** genera l'episodio numero (done+1). Un solo lavoro alla volta. */
export function generateEpisode() {
  const number = state.done + 1;
  return once('episode:' + number, async () => {
    const s = getSettings();
    if (!hasAnthropicKey()) return { ok: false, error: 'Inserisci la chiave API Anthropic nelle impostazioni per generare gli episodi.', needKey: true };
    const info = seasonInfo(state.done);
    const setting = pickSetting(info, state.recentLocations);
    const level = Math.min(10, Math.max(1, state.level + (Number(s.levelBias) || 0)));
    const targets = pickTargets(state.introduced, level, setting, s.newPerDay);
    const req = P.buildEpisodeRequest({
      settings: s, info, setting, level, targets,
      review: reviewWords(), weak: weakGrammar(),
      diary: state.diary, hook: state.hook
    });
    let tries = 0;
    const r = await claudeTool({
      model: s.textModel, system: req.system, messages: req.messages, tool: req.tool, maxTokens: req.maxTokens, timeoutMs: Math.min(420000, 90000 + req.words * 140),
      validate: (inp) => {
        tries++;
        if (!inp.sentences || inp.sentences.length < 10) return 'Episodio troppo corto.';
        if (!inp.glossary || !inp.glossary.length) return 'Glossario mancante.';
        const n = inp.sentences.map((x) => (typeof x === 'string' ? x : (x && x.en) || '')).join(' ').split(/\s+/).length;
        return n < req.words * (tries > 1 ? 0.3 : 0.55) ? 'Episodio troppo corto (' + n + ' parole).' : null;
      }
    });
    if (!r.ok) return { ok: false, error: r.error };
    const ep = normaliseEpisode(r.input, { id: 'e' + number, number, season: info.season, index: info.index, setting, level, targets: targets.map((t) => t.id), needIpa: req.needIpa });
    if (ep.sentences.length < 8) return { ok: false, error: 'Episodio incompleto, riprova.' };
    await putEpisode(ep);
    state.currentEpisodeId = ep.id;
    saveState();
    emit('episode', ep.id);
    return { ok: true, ep };
  });
}

export async function loadCurrentEpisode() {
  if (!state.currentEpisodeId) return null;
  const ep = await getEpisode(state.currentEpisodeId);
  return ep || null;
}

/** episodio corrente: lo carica o lo genera */
export async function ensureEpisode() {
  const cur = await loadCurrentEpisode();
  if (cur && !cur.completed) return { ok: true, ep: cur };
  return generateEpisode();
}

export async function saveEpisode(ep) { await putEpisode(ep); }

/** episodio finito: aggiorna storia, livello, lessico; poi prepara il prossimo */
export async function completeEpisode(ep, testPct) {
  if (ep.completed) return;
  ep.completed = true;
  ep.completedOn = dayStr();
  await putEpisode(ep);
  const d = ep.diary || {};
  if (d.summary_en) {
    state.diary.recent = (state.diary.recent || []).concat(d.summary_en).slice(-4);
    state.diary.summary = [state.diary.summary, d.summary_en].filter(Boolean).join(' ').split(/(?<=[.!?])\s+/).slice(-14).join(' ');
  }
  if (Array.isArray(d.characters) && d.characters.length) {
    const byName = new Map((state.diary.characters || []).map((c) => [c.name, c]));
    d.characters.forEach((c) => { if (c && c.name) byName.set(c.name, Object.assign(byName.get(c.name) || {}, c)); });
    state.diary.characters = Array.from(byName.values()).slice(-12);
  }
  if (Array.isArray(d.threads) && d.threads.length) state.diary.threads = d.threads.slice(0, 5);
  state.hook = { en: ep.hook_en || '', it: ep.teaser_it || '' };
  state.recentLocations = [ep.setting].concat(state.recentLocations).slice(0, 12);
  (ep.targets || []).forEach((id) => { state.introduced[id] = dayStr(); });
  if (typeof testPct === 'number') state.level = Math.round(adaptLevel(state.level, testPct) * 100) / 100;
  state.done += 1;
  state.currentEpisodeId = null;
  saveState();
  emit('state');
  prefetchNext();
}

/** prepara l'episodio successivo in silenzio, così domani è già pronto */
export function prefetchNext() {
  if (!hasAnthropicKey() || state.currentEpisodeId) return Promise.resolve(null);
  return generateEpisode().catch(() => null);
}

/* ---------------- test ---------------- */
function validateTest(inp) {
  if (!inp.questions || inp.questions.length < 5) return 'Test troppo corto.';
  return null;
}

function cleanQuestions(list, count) {
  const out = [];
  for (const q of list) {
    if (!q || !q.answer || !q.type) continue;
    q.answer = String(q.answer).trim();
    q.distractors = (q.distractors || []).map((x) => String(x).trim()).filter((x) => x && normText(x) !== normText(q.answer));
    if ((q.type === 'mcq' || q.type === 'cloze') && q.distractors.length < 2) continue;
    if (q.type === 'cloze' && !String(q.prompt || '').includes('___')) continue;
    if (q.type === 'order') {
      if (!Array.isArray(q.words) || q.words.length < 3) continue;
      q.answer = q.words.join(' ');
    }
    if (q.type === 'listen' && q.distractors.length < 1) continue;
    if (q.type === 'translate' && !q.prompt) continue;
    if (q.type === 'mcq' && !q.prompt) continue;
    if (!['vocab', 'phrase', 'grammar'].includes(q.focus)) q.focus = 'vocab';
    if (q.rule && !grammarTopic(q.rule)) q.rule = '';
    out.push(q);
  }
  return out.slice(0, count);
}

/** test di fine episodio: si genera mentre l'utente legge; il risultato è salvato nell'episodio */
export function generateTest(ep, opts = {}) {
  return once('test:' + ep.id + (opts.checkpoint ? ':cp' : ''), async () => {
    const s = getSettings();
    const count = opts.count || s.testQuestions || 10;
    const todayWords = (ep.glossary || []).slice(0, 8).map((g) => ({ en: g.surface, it: g.it }));
    const recentErr = state.cards.filter((c) => c.kind === 'error').slice(-4).map((c) => ({ wrong: c.wrong, right: c.right }));
    let reviewItems = state.cards.filter((c) => (c.kind === 'word' || c.kind === 'phrase') && c.reviews > 0).slice(-12).map((c) => ({ en: c.en, it: c.it }));
    if (opts.checkpoint) reviewItems = shuffle(state.cards.filter((c) => c.kind === 'word' || c.kind === 'phrase')).slice(0, 14).map((c) => ({ en: c.en, it: c.it }));
    const req = P.buildTestRequest({
      settings: s, level: state.level, count,
      sceneSentences: shuffle(ep.sentences.filter((x) => x.en.split(' ').length >= 5)).slice(0, 8).map((x) => x.en),
      todayWords: opts.checkpoint ? [] : todayWords, reviewItems, weak: weakGrammar(), errors: recentErr
    });
    const r = await claudeTool({ model: s.textModel, system: req.system, messages: req.messages, tool: req.tool, maxTokens: req.maxTokens, validate: validateTest });
    if (!r.ok) return { ok: false, error: r.error };
    const qs = cleanQuestions(r.input.questions, count);
    if (qs.length < 5) return { ok: false, error: 'Test incompleto, riprova.' };
    if (!opts.checkpoint) { ep.test = qs; await putEpisode(ep); }
    return { ok: true, questions: qs };
  });
}

/* ---------------- tutor ---------------- */
export async function tutorTurn(history, scenario) {
  const s = getSettings();
  if (!hasAnthropicKey()) return { ok: false, error: 'Inserisci la chiave API Anthropic nelle impostazioni.' };
  const req = P.buildTutorRequest({ settings: s, level: state.level, history, scenario });
  const r = await claudeTool({
    model: s.chatModel, system: req.system, messages: req.messages, tool: req.tool, maxTokens: req.maxTokens, retries: 2,
    validate: (i) => (typeof i.reply_en === 'string' && i.reply_en.trim() ? null : 'Risposta vuota.')
  });
  if (!r.ok) return r;
  const i = r.input;
  return {
    ok: true,
    reply: {
      text: i.reply_en.trim(), it: i.reply_it || '', ipa: String(i.reply_ipa || '').replace(/^\/|\/$/g, ''),
      corrections: Array.isArray(i.corrections) ? i.corrections.filter((c) => c && c.wrong && c.correct) : [],
      hints: Array.isArray(i.hints) ? i.hints.filter((h) => h && h.en) : [], mood: i.mood || 'neutral'
    }
  };
}

/* ---------------- parole ---------------- */
async function dictionaryIpa(word) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2500);
    const res = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word.toLowerCase()), { signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok) return '';
    const data = await res.json();
    const ph = (data[0] && data[0].phonetics || []).map((p) => p.text).filter(Boolean);
    return ph.length ? ph[0].replace(/^\/|\/$/g, '') : '';
  } catch (e) { return ''; }
}

/** significato + fonetica di una parola toccata. Prima il glossario, poi la memoria, poi l'IA. */
export async function lookupWord(word, sentence, ep) {
  const key = normText(word) + '|' + normText(sentence || '').slice(0, 90);
  const g = ep && (ep.glossary || []).find((x) => normText(x.surface) === normText(word));
  if (g) return { ok: true, it: g.it, ipa: g.ipa, pos: g.kind === 'word' ? '' : g.kind, visual: g.visual, surface: g.surface, src: 'glossario' };
  const cached = lexCache[key];
  if (cached) return Object.assign({ ok: true, src: 'memoria' }, cached);
  const s = getSettings();
  if (!hasAnthropicKey()) return { ok: false, error: 'Per tradurre le parole serve la chiave API.' };
  const req = P.buildLookupRequest(word, sentence, s);
  const [r, dip] = await Promise.all([
    claudeTool({ model: s.textModel, system: req.system, messages: req.messages, tool: req.tool, maxTokens: req.maxTokens, retries: 1 }),
    false ? dictionaryIpa(word) : Promise.resolve('')
  ]);
  if (!r.ok) return r;
  const phrase = String(r.input.phrase || '').trim();
  const isPhrase = phrase && normText(phrase) !== normText(word) && phrase.split(/\s+/).length > 1;
  const out = { it: r.input.it, ipa: isPhrase ? String(r.input.ipa || '').replace(/^\/|\/$/g, '') : (dip || String(r.input.ipa || '').replace(/^\/|\/$/g, '')), pos: r.input.pos || '', base: r.input.base || '', visual: isPhrase ? false : !!r.input.visual, surface: isPhrase ? phrase : undefined };
  lexCache[key] = out;
  const ks = Object.keys(lexCache);
  if (ks.length > 4000) ks.slice(0, 800).forEach((k) => delete lexCache[k]);
  saveLex();
  return Object.assign({ ok: true, src: 'ia' }, out);
}

/** traduce frasi dell'episodio (e le conserva nell'episodio) */
export async function translateSentences(ep, idxs) {
  const need = idxs.filter((i) => ep.sentences[i] && !ep.sentences[i].it);
  if (!need.length) return { ok: true };
  const s = getSettings();
  const req = P.buildTranslateRequest(need.map((i) => ep.sentences[i].en));
  const r = await claudeTool({ model: s.textModel, system: req.system, messages: req.messages, tool: req.tool, maxTokens: req.maxTokens, retries: 1 });
  if (!r.ok) return r;
  need.forEach((i, k) => { ep.sentences[i].it = (r.input.translations || [])[k] || ''; });
  await putEpisode(ep);
  return { ok: true };
}

/** spiegazione di una regola (cache nelle impostazioni dello stato) */
export async function explainRule(ruleId, wrong, right) {
  state.ruleCache = state.ruleCache || {};
  const ck = ruleId + '|' + normText(wrong || '') ;
  if (state.ruleCache[ck]) return { ok: true, rule: state.ruleCache[ck] };
  const s = getSettings();
  const req = P.buildRuleRequest(ruleId, wrong, right);
  const r = await claudeTool({ model: s.chatModel, system: req.system, messages: req.messages, tool: req.tool, maxTokens: req.maxTokens, retries: 1 });
  if (!r.ok) return r;
  state.ruleCache[ck] = r.input;
  saveState();
  return { ok: true, rule: r.input };
}

/* ---------------- articolo ---------------- */
export async function generateArticle() {
  const s = getSettings();
  if (!hasAnthropicKey()) return { ok: false, error: 'Inserisci la chiave API Anthropic.' };
  const tool = P.articleTool(s.phonetics === 'sentence');
  const system = P.articleSystem(s, state.level);
  const today = dayStr();
  let r = await claudeTool({
    model: s.articleModel, system, tool, maxTokens: 4500, timeoutMs: 150000, retries: 1,
    messages: [{ role: 'user', content: 'Today is ' + today + '. Find a current, interesting and friendly news story from the last few days (technology, science, travel, culture, nature or sport), and write the reading. Include the real source name and URL.' }],
    search: true
  });
  if (!r.ok) {
    r = await claudeTool({
      model: s.articleModel, system, tool, maxTokens: 4500, timeoutMs: 150000, retries: 1,
      messages: [{ role: 'user', content: 'Write an original short feature article in the style of a friendly news story (travel, culture, science or curiosity), not tied to a specific date. Use "Original text" as the source and leave the URL empty.' }]
    });
    if (!r.ok) return r;
  }
  const a = r.input;
  const sentences = (a.sentences || []).map((x) => (typeof x === 'string' ? { en: x } : x)).filter((x) => x && x.en);
  if (sentences.length < 6) return { ok: false, error: 'Articolo incompleto, riprova.' };
  const text = sentences.map((x) => x.en).join(' ').toLowerCase();
  a.sentences = sentences.map((x) => ({ en: x.en.trim(), ipa: String(x.ipa || '').replace(/^\/|\/$/g, ''), newPara: !!x.newPara }));
  a.glossary = (a.glossary || []).filter((g) => g && g.surface && g.it && text.includes(g.surface.toLowerCase()));
  a.date = today;
  state.article = a;
  saveState();
  return { ok: true, article: a };
}


/* ---------------- libri ---------------- */
/** fonetica frase per frase (a pezzi, per non superare i limiti) */
export async function ipaSentences(content) {
  const need = content.sentences.map((x, i) => i).filter((i) => !content.sentences[i].ipa);
  const s = getSettings();
  for (let a = 0; a < need.length; a += 12) {
    const part = need.slice(a, a + 12);
    const req = P.buildIpaRequest(part.map((i) => content.sentences[i].en), s.accent);
    const r = await claudeTool({ model: s.textModel, system: req.system, messages: req.messages, tool: req.tool, maxTokens: req.maxTokens, retries: 1 });
    if (!r.ok) return r;
    part.forEach((i, k) => { content.sentences[i].ipa = String((r.input.ipa || [])[k] || '').replace(/^\/|\/$/g, ''); });
  }
  return { ok: true };
}
/** parole utili di una pagina di libro */
export async function bookPageWords(text) {
  if (!hasAnthropicKey()) return { ok: false, error: 'Serve la chiave API.' };
  const s = getSettings();
  const req = P.buildBookWordsRequest(text, state.level || 3.5);
  const r = await claudeTool({ model: s.textModel, system: req.system, messages: req.messages, tool: req.tool, maxTokens: req.maxTokens, retries: 1 });
  if (!r.ok) return r;
  const low = text.toLowerCase();
  const items = (r.input.items || []).filter((x) => x && x.surface && low.includes(String(x.surface).toLowerCase()));
  return { ok: true, items };
}
/** lezione guidata del tutor su una pagina di libro */
export async function pageLesson(text) {
  if (!hasAnthropicKey()) return { ok: false, error: 'Serve la chiave API.' };
  const s = getSettings();
  const req = P.buildLessonRequest(text, state.level || 3.5, s.tutorName || 'Marco', s.accent);
  const r = await claudeTool({ model: s.textModel, system: req.system, messages: req.messages, tool: req.tool, maxTokens: req.maxTokens, timeoutMs: 120000, retries: 1,
    validate: (i) => (i && typeof i.translation_it === 'string' && i.translation_it.length > 20 ? null : 'Lezione incompleta.') });
  if (!r.ok) return r;
  const low = text.toLowerCase();
  const L = r.input;
  L.words = (L.words || []).filter((x) => x && x.surface && low.includes(String(x.surface).toLowerCase()));
  return { ok: true, lesson: L };
}
