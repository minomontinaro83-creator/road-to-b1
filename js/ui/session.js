/* La sessione del giorno: ripasso → ascolto → lettura → conversazione → test → festa. */
import { h, clear, toast, confetti, ring, sheet } from './dom.js';
import { createTutor } from './tutor.js';
import { mountReader, openWordPopup } from './reader.js';
import { mountChat } from './chat.js';
import { runReview } from './review.js';
import { runTest, testSummary } from './test.js';
import { state, saveState, getSettings, putEpisode } from '../store.js';
import { dayStr } from '../util.js';
import { ensureEpisode, generateTest, completeEpisode, loadCurrentEpisode } from '../engine.js';
import { reviewQueue, addGlossaryCards } from '../cards.js';
import { markActive, getStreak, checkAchievements } from '../progress.js';
import { generateSceneImage, generateCardImage, imgUrl, imagesEnabled } from '../images.js';
import { seasonInfo } from '../story.js';
import { stopSpeech } from '../tts.js';

const STEPS = [['review', 'Ripasso'], ['listen', 'Ascolto'], ['read', 'Lettura'], ['chat', 'Parla'], ['test', 'Test'], ['done', 'Fatto']];

export function todayPlan() {
  const t = dayStr();
  if (!state.today || state.today.date !== t) { state.today = { date: t, step: 'review', bonus: false, newCards: 0 }; saveState(); }
  return state.today;
}
export function sessionLabel() {
  const p = todayPlan();
  if (p.step === 'done') return 'done';
  return p.step === 'review' && !p.started ? 'start' : 'continue';
}

let epPromise = null, testPromise = null, cur = null;

/** avvia la preparazione dell'episodio senza aspettare (mentre l'utente ripassa) */
export function warmUp() {
  if (!epPromise) epPromise = ensureEpisode().then((r) => { if (!r.ok) epPromise = null; return r; });
  return epPromise;
}

export function startSession(host, { onExit, forceStep } = {}) {
  const plan = todayPlan();
  plan.started = true;
  if (forceStep) { plan.step = forceStep; if (forceStep === 'listen') { plan.bonus = true; plan.newCards = 0; } }
  saveState();
  warmUp();
  let readerCtl = null;

  const header = h('div', { class: 'session-head' });
  const body = h('div', { class: 'session-body' });
  clear(host);
  host.append(header, body);

  function renderHeader() {
    clear(header);
    const idx = STEPS.findIndex((x) => x[0] === plan.step);
    header.append(
      h('button', { class: 'icon-btn', 'aria-label': 'Esci', onclick: () => { stopSpeech(); if (readerCtl) readerCtl.stop(); onExit && onExit(); } }, '✕'),
      h('div', { class: 'dots' }, STEPS.slice(0, 5).map((x, k) => h('span', { class: 'dot' + (k < idx ? ' past' : k === idx ? ' now' : '') , title: x[1] }))),
      h('div', { class: 'step-name' }, (STEPS[idx] || STEPS[0])[1]));
  }

  function go(step) {
    stopSpeech();
    if (readerCtl) { readerCtl.stop(); readerCtl = null; }
    plan.step = step; saveState();
    renderHeader();
    clear(body);
    body.scrollTop = 0;
    window.scrollTo(0, 0);
    ({ review: stepReview, listen: stepListen, read: stepRead, chat: stepChat, test: stepTest, done: stepDone })[step]();
  }

  /* ---------- carica episodio con attesa ---------- */
  async function withEpisode(then) {
    if (cur && state.currentEpisodeId === cur.id && !cur.completed) return then(cur);
    const wrap = h('div', { class: 'center-col' });
    const tutor = createTutor({ size: 130 });
    tutor.setMood('think');
    const msg = h('p', { class: 'loading-msg' }, 'Sto preparando la scena di oggi…');
    wrap.append(tutor.el, msg, h('div', { class: 'dotsload' }, h('i'), h('i'), h('i')), h('p', { class: 'muted small' }, 'Ci vogliono circa 20–40 secondi.'));
    body.append(wrap);
    const r = await warmUp();
    clear(body);
    if (!r.ok) {
      epPromise = null;
      body.append(h('div', { class: 'center-col' }, h('div', { class: 'big' }, ''), h('p', { class: 'err' }, r.error),
        h('div', { class: 'row' },
          r.needKey ? h('button', { class: 'btn ghost', onclick: () => { onExit && onExit('settings'); } }, 'Apri impostazioni') : null,
          h('button', { class: 'btn primary', onclick: () => { clear(body); withEpisode(then); } }, 'Riprova'))));
      return;
    }
    cur = r.ep;
    testPromise = null;
    then(cur);
  }
  const ensureTest = (ep) => {
    if (ep.test) return Promise.resolve({ ok: true, questions: ep.test });
    if (!testPromise) testPromise = generateTest(ep).then((r) => { if (!r.ok) testPromise = null; return r; });
    return testPromise;
  };

  /* ---------- 1. ripasso ---------- */
  function stepReview() {
    const q = reviewQueue();
    if (!q.length || plan.bonus) return go('listen');
    body.append(h('div', { class: 'stack' }, h('h2', { class: 'step-title' }, 'Ripasso di oggi'), h('p', { class: 'muted' }, 'Prima il ripasso: poco ma fatto bene.')));
    const host2 = h('div'); body.append(host2);
    runReview(host2, { queue: q, onDone: () => go('listen') });
  }

  /* ---------- 2. ascolto ---------- */
  function sceneHeader(ep) {
    const info = seasonInfo(ep.number - 1);
    const imgBox = h('div', { class: 'scene-img' });
    const put = async () => { const u = await imgUrl(ep.imageKey); if (u) { clear(imgBox); imgBox.append(h('img', { src: u, alt: ep.title })); imgBox.classList.add('has'); } };
    if (ep.imageKey) put();
    else if (imagesEnabled()) generateSceneImage(ep, async (e) => { await putEpisode(e); put(); });
    return h('div', { class: 'scene-head' }, imgBox,
      h('div', { class: 'ep-meta' }, 'Stagione ' + info.season + ' · Episodio ' + (info.index + 1) + ' · ' + info.title_it),
      h('h2', { class: 'ep-title' }, ep.title), h('div', { class: 'muted' }, '' + ep.location));
  }

  function stepListen() {
    withEpisode((ep) => {
      ensureTest(ep);
      if (!getSettings().listenFirst) return go('read');
      body.append(sceneHeader(ep));
      const tutor = createTutor({ size: 110 });
      const prog = h('div', { class: 'progress' }, h('i'));
      const status = h('div', { class: 'muted center' }, 'Ascolta la scena senza leggere. Poi la leggerai con calma.');
      const content = h('div');
      readerCtl = mountReader(content, ep, { ep, hidden: true });
      let playing = false;
      const play = h('button', { class: 'btn big-play primary', onclick: async () => {
        if (playing) { readerCtl.stop(); playing = false; play.textContent = '▶ Riprendi'; return; }
        playing = true; play.textContent = '⏸ Pausa';
        const r = await readerCtl.playScene(undefined, (i, n) => { prog.firstChild.style.width = Math.round(((i + 1) / n) * 100) + '%'; });
        playing = false;
        if (r && r.cancelled) return;
        if (r && !r.ok) { toast('Non riesco a riprodurre la voce. Controlla il volume o il motore voce nelle impostazioni.', 'err'); play.textContent = '▶ Riprova'; return; }
        play.textContent = 'Riascolta';
        status.textContent = 'Ottimo! Hai capito il senso? Adesso leggila.';
        next.classList.add('pulse');
      } }, '▶ Ascolta la scena');
      const next = h('button', { class: 'btn primary wide', onclick: () => go('read') }, 'Leggi la scena →');
      body.append(h('div', { class: 'center-col' }, tutor.el, play, prog, status), h('div', { class: 'hidden-reader' }, content), next,
        h('button', { class: 'btn link', onclick: () => go('read') }, 'Salta l\'ascolto'));
    });
  }

  /* ---------- 3. lettura ---------- */
  function stepRead() {
    withEpisode((ep) => {
      ensureTest(ep);
      body.append(sceneHeader(ep));
      const host2 = h('div', { class: 'reading page' });
      body.append(host2);
      readerCtl = mountReader(host2, ep, { ep, bar: true });
      body.append(h('div', { class: 'muted small center hint-tap' }, 'Tocca una parola per significato, fonetica e traduzione della frase'));
      if (ep.glossary.length) {
        body.append(h('div', { class: 'card glossary' }, h('h4', null, 'Parole e frasi di oggi'),
          h('div', { class: 'chips' }, ep.glossary.map((g) => h('button', { class: 'chipbtn', onclick: () => openWordPopup(g.surface, (ep.sentences.find((s) => s.en.toLowerCase().includes(g.surface.toLowerCase())) || {}).en || '', ep, () => readerCtl.refresh()) }, g.surface)))));
      }
      body.append(h('button', { class: 'btn primary wide', onclick: () => {
        const made = addGlossaryCards(ep);
        plan.newCards = (plan.newCards || 0) + made.length;
        saveState();
        if (made.length) toast('' + made.length + ' nuove carte per il ripasso');
        made.filter((c) => c.visual).forEach((c) => generateCardImage(c));
        markActive({ saved: made.length });
        go(ep.roleplay && ep.roleplay.opening_en ? 'chat' : 'test');
      } }, 'Ho finito di leggere →'));
    });
  }

  /* ---------- 4. conversazione ---------- */
  function stepChat() {
    withEpisode((ep) => {
      ensureTest(ep);
      const rp = ep.roleplay;
      body.append(h('h2', { class: 'step-title' }, 'Adesso tocca a te'), h('p', { class: 'muted' }, 'Prova a usare le frasi della scena. Il tutor ti corregge solo gli errori importanti.'));
      const c = h('div'); body.append(c);
      mountChat(c, { scenario: { situation: rp.situation_en, role: rp.tutor_role_en, opening: rp.opening_en, hints: rp.hints }, minTurns: 2, onEnd: () => go('test') });
    });
  }

  /* ---------- 5. test ---------- */
  function stepTest() {
    withEpisode(async (ep) => {
      const wrap = h('div', { class: 'center-col' });
      const tutor = createTutor({ size: 110 }); tutor.setMood('think');
      wrap.append(tutor.el, h('p', null, 'Preparo il test…'), h('div', { class: 'dotsload' }, h('i'), h('i'), h('i')));
      body.append(wrap);
      const r = await ensureTest(ep);
      clear(body);
      if (!r.ok) {
        body.append(h('div', { class: 'center-col' }, h('div', { class: 'big' }, ''), h('p', { class: 'err' }, r.error),
          h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => finishEpisode(ep, null) }, 'Salta il test'), h('button', { class: 'btn primary', onclick: () => go('test') }, 'Riprova'))));
        return;
      }
      body.append(h('h2', { class: 'step-title' }, 'Test'));
      const host2 = h('div'); body.append(host2);
      runTest(host2, r.questions, { onFinish: (res) => showResult(ep, res) });
    });
  }

  function showResult(ep, res) {
    clear(body);
    const before = state.level;
    const perfect = res.pct === 100;
    finishEpisode(ep, res.pct, true).then(() => {
      const after = state.level;
      const tutor = createTutor({ size: 100 }); tutor.setMood(res.pct >= 70 ? 'happy' : 'neutral');
      const msg = res.pct >= 80 ? 'Bravissimo! Domani proverò con un testo un po\' più ricco.' : res.pct >= 60 ? 'Buon lavoro. Il livello resta più o meno questo.' : 'Niente paura: domani il testo sarà un po\' più semplice, così consolidi.';
      body.append(h('div', { class: 'center-col' }, tutor.el, ring(res.pct, { size: 130, label: res.pct + '%', sub: res.ok + '/' + res.total }), h('p', { class: 'center' }, msg)), testSummary(res, { noScore: true }),
        h('button', { class: 'btn primary wide', onclick: () => go('done') }, 'Continua →'));
      if (res.pct >= 80) confetti(30);
      if (perfect) plan.perfect = true;
    });
  }

  async function finishEpisode(ep, pct, silent) {
    markActive({ session: true, testPct: pct == null ? null : pct });
    await completeEpisode(ep, pct == null ? undefined : pct);
    cur = null; epPromise = null; testPromise = null;
    plan.epId = ep.id;
    plan.step = 'done';
    plan.lastTitle = ep.title; plan.teaser = ep.teaser_it; plan.hook = ep.hook_en;
    saveState();
    if (!silent) go('done');
  }

  /* ---------- 6. fine ---------- */
  function stepDone() {
    const st = getStreak();
    confetti(50);
    setTimeout(() => { checkAchievements({ perfect: !!plan.perfect }); plan.perfect = false; }, 1200);
    const tutor = createTutor({ size: 120 }); tutor.setMood('happy'); tutor.cheer();
    body.append(h('div', { class: 'center-col done' },
      tutor.el,
      h('h2', null, 'Sessione completata!'),
      h('div', { class: 'streak-big' }, h('b', null, st.current), h('small', null, st.current === 1 ? 'giorno di fila' : 'giorni di fila')),
      h('p', null, '' + (plan.newCards || 0) + ' nuove carte oggi'),
      plan.teaser ? h('div', { class: 'teaser' }, h('b', null, 'Nel prossimo episodio… '), plan.teaser) : null,
      h('div', { class: 'stack wide' },
        h('button', { class: 'btn primary wide', onclick: () => { onExit && onExit('home'); } }, 'Torna alla home'),
        h('button', { class: 'btn ghost wide', onclick: () => { onExit && onExit('article'); } }, 'Notizia del giorno (extra)'),
        h('button', { class: 'btn ghost wide', onclick: () => { plan.bonus = true; plan.newCards = 0; epPromise = null; warmUp(); go('listen'); } }, 'Un altro episodio'))));
  }

  // riprende dal punto giusto
  const needsEp = ['listen', 'read', 'chat', 'test'];
  if (needsEp.includes(plan.step)) {
    loadCurrentEpisode().then((e) => { if (!e || e.completed) { if (plan.step !== 'listen') plan.step = 'listen'; } go(plan.step); });
  } else go(plan.step);
}
