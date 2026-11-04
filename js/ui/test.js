/* Test di fine episodio: 5 tipi di domande, spiegazione di ogni errore, errori → carte. */
import { h, clear, sheet, say, speakBtn, toast, confetti, vibrate } from './dom.js';
import { createTutor } from './tutor.js';
import { shuffle, answerMatches, normText } from '../util.js';
import { cardsFromTestError, noteCorrect } from '../cards.js';
import { explainRule } from '../engine.js';
import { grammarName } from '../levels.js';
import { speak } from '../tts.js';

export async function showRule(ruleId, wrong, right) {
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Preparo la spiegazione…'));
  const sh = sheet(body, { title: '' + (grammarName(ruleId) || 'Regola'), wide: true });
  const r = await explainRule(ruleId, wrong, right);
  clear(body);
  if (!r.ok) { body.append(h('p', { class: 'err' }, r.error || 'Spiegazione non disponibile.')); return sh; }
  const x = r.rule;
  const tut = createTutor({ size: 72 });
  setTimeout(() => tut.talkText(x.when_it), 300);
  body.append(
    h('div', { class: 'tutor-panel' }, tut.el, h('h3', null, x.name_it)),
    h('p', null, x.when_it),
    h('div', { class: 'formula' }, x.form_it),
    h('p', { class: 'tip' }, '' + x.mistake_it),
    h('div', { class: 'examples' }, (x.examples || []).map((e) => h('div', { class: 'ex' }, h('div', { class: 'en' }, e.en, ' ', speakBtn(e.en, { small: true })), h('div', { class: 'it' }, e.it))))
  );
  return sh;
}

/**
 * @param host contenitore
 * @param questions domande
 * @param opts {onFinish(result), sentence lookup, title}
 */
export function runTest(host, questions, opts = {}) {
  const results = [];
  let i = 0;
  clear(host);
  const bar = h('div', { class: 'progress' }, h('i'));
  const count = h('div', { class: 'muted small center' });
  const stage = h('div', { class: 'test-stage' });
  host.append(h('div', { class: 'stack' }, bar, count, stage));

  function advance() {
    i++;
    if (i >= questions.length) return finish();
    render();
  }

  function finish() {
    const ok = results.filter((r) => r.ok).length;
    const pct = Math.round((ok / questions.length) * 100);
    if (opts.onFinish) opts.onFinish({ pct, ok, total: questions.length, results });
  }

  function done(q, ok, userAnswer) {
    results.push({ q, ok, userAnswer });
    let created = [];
    if (!ok) created = cardsFromTestError(q, userAnswer, {});
    else noteCorrect(q);
    return created;
  }

  function feedback(q, ok, userAnswer, extra) {
    const tut = createTutor({ size: 64 });
    if (ok) { tut.cheer(); vibrate('good'); } else tut.oops();
    const verdict = ok ? 'Giusto! ✔' : 'Non esattamente';
    const fb = h('div', { class: 'feedback ' + (ok ? 'good' : 'bad') },
      h('div', { class: 'tutor-panel' }, tut.el, h('div', null, h('b', null, verdict), !ok && userAnswer ? h('div', { class: 'small' }, 'Tu hai scelto: ', h('i', null, String(userAnswer))) : null)),
      !ok ? h('div', { class: 'right-ans' }, 'Risposta: ', h('b', null, q.type === 'cloze' ? q.prompt.replace('___', q.answer) : q.answer), ' ', speakBtn(q.type === 'cloze' ? q.prompt.replace('___', q.answer) : q.answer, { small: true })) : null,
      q.explanation_it ? h('div', { class: 'expl' }, (ok ? '' : 'Dov\'è l\'errore: ') + q.explanation_it) : null,
      !ok ? h('div', { class: 'saved-note' }, 'Aggiunta alle carte di ripasso') : null,
      !ok && q.rule ? h('button', { class: 'btn small ghost', onclick: () => showRule(q.rule, userAnswer, q.answer) }, 'Spiega la regola') : null,
      extra || null);
    if (q.explanation_it) setTimeout(() => tut.talkText(q.explanation_it), 400);
    if (q.explanation_it) setTimeout(() => tut.talkText(q.explanation_it), 400);
    return fb;
  }

  function optionButtons(q, opts2, card, onPick) {
    const wrap = h('div', { class: 'options' });
    shuffle(opts2).forEach((o) => {
      const b = h('button', { class: 'opt', onclick: () => {
        wrap.querySelectorAll('button').forEach((x) => { x.disabled = true; if (normText(x.dataset.v) === normText(q.answer)) x.classList.add('right'); });
        const ok = normText(o) === normText(q.answer);
        if (!ok) b.classList.add('wrong');
        onPick(o, ok);
      } }, o);
      b.dataset.v = o;
      wrap.append(b);
    });
    return wrap;
  }

  function nextBtn() {
    return h('button', { class: 'btn primary wide', onclick: advance }, i + 1 >= questions.length ? 'Vedi il risultato' : 'Avanti');
  }

  function render() {
    clear(stage);
    const q = questions[i];
    bar.firstChild.style.width = Math.round((i / questions.length) * 100) + '%';
    count.textContent = 'Domanda ' + (i + 1) + ' di ' + questions.length;
    const card = h('div', { class: 'card q-card' });
    stage.append(card);
    const answerFlow = (ok, user) => { done(q, ok, user); card.append(feedback(q, ok, user), nextBtn()); };

    if (q.type === 'mcq') {
      card.append(h('div', { class: 'q-text' }, q.prompt));
      card.append(optionButtons(q, [q.answer].concat(q.distractors.slice(0, 3)), card, (o, ok) => answerFlow(ok, o)));
    } else if (q.type === 'cloze') {
      card.append(h('div', { class: 'q-label' }, 'Completa la frase'), h('div', { class: 'q-text en' }, q.prompt.replace('___', '_____')));
      card.append(optionButtons(q, [q.answer].concat(q.distractors.slice(0, 3)), card, (o, ok) => answerFlow(ok, o)));
    } else if (q.type === 'listen') {
      card.append(h('div', { class: 'q-label' }, 'Ascolta e scegli la frase giusta'));
      const play = h('button', { class: 'btn big-play', onclick: () => say(q.answer, { rate: 0.85 }) }, 'Ascolta');
      card.append(play);
      speak(q.answer, { rate: 0.85 });
      card.append(optionButtons(q, [q.answer].concat(q.distractors.slice(0, 3)), card, (o, ok) => answerFlow(ok, o)));
    } else if (q.type === 'order') {
      card.append(h('div', { class: 'q-label' }, 'Metti in ordine la frase'), q.prompt ? h('div', { class: 'q-it' }, q.prompt) : null);
      const built = h('div', { class: 'built' });
      const pool = h('div', { class: 'chips' });
      const chosen = [];
      shuffle(q.words.map((w, idx) => ({ w, idx }))).forEach((o) => {
        const b = h('button', { class: 'chipbtn', onclick: () => {
          if (b.dataset.used) { b.dataset.used = ''; b.classList.remove('used'); const k = chosen.indexOf(o); chosen.splice(k, 1); }
          else { b.dataset.used = '1'; b.classList.add('used'); chosen.push(o); }
          built.textContent = chosen.map((x) => x.w).join(' ');
          check.disabled = chosen.length !== q.words.length;
        } }, o.w);
        pool.append(b);
      });
      const check = h('button', { class: 'btn primary wide', disabled: true, onclick: () => {
        const user = chosen.map((x) => x.w).join(' ');
        const ok = normText(user) === normText(q.answer);
        pool.querySelectorAll('button').forEach((x) => { x.disabled = true; });
        check.remove();
        answerFlow(ok, user);
      } }, 'Controlla');
      card.append(built, pool, check);
    } else { // translate
      card.append(h('div', { class: 'q-label' }, 'Traduci in inglese'), h('div', { class: 'q-text' }, q.prompt));
      const input = h('textarea', { class: 'input', rows: 2, placeholder: 'Scrivi qui…', autocapitalize: 'sentences', spellcheck: 'false' });
      const check = h('button', { class: 'btn primary wide', onclick: () => {
        const v = input.value.trim();
        if (!v) { input.focus(); return; }
        const res = answerMatches(v, q.answer, q.accept || []);
        input.disabled = true; check.remove();
        answerFlow(res.ok, v);
      } }, 'Controlla');
      card.append(input, check);
      setTimeout(() => input.focus({ preventScroll: true }), 60);
    }
  }
  render();
}

export function testSummary(res, { noScore = false } = {}) {
  const wrong = res.results.filter((r) => !r.ok);
  return h('div', { class: 'stack' },
    noScore ? null : h('div', { class: 'score' }, h('b', null, res.pct + '%'), h('small', null, res.ok + ' su ' + res.total)),
    wrong.length ? h('div', { class: 'wrong-list' }, h('h4', null, 'Da ripassare (già nelle carte)'), wrong.map((w) => h('div', { class: 'wl' }, h('b', null, w.q.type === 'cloze' ? w.q.prompt.replace('___', w.q.answer) : w.q.answer), w.q.explanation_it ? h('div', { class: 'muted small' }, w.q.explanation_it) : null))) : h('p', { class: 'center' }, 'Nessun errore. Perfetto!')
  );
}
