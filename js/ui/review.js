/* Ripasso con le carte: richiamo attivo (scrivi o ricorda), nessun avanzamento se sbagli. */
import { h, clear, say, speakBtn, toast, confetti, vibrate } from './dom.js';
import { state, getSettings } from '../store.js';
import { reviewQueue, answerCard } from '../cards.js';
import { answerMatches, normText } from '../util.js';
import { markActive } from '../progress.js';
import { grammarName } from '../levels.js';
import { imgUrl, generateCardImage } from '../images.js';
import { explainRule } from '../engine.js';
import { showRule } from './test.js';

const blankOut = (ctx, en) => {
  if (!ctx || !en) return '';
  const re = new RegExp(en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'i');
  return re.test(ctx) ? ctx.replace(re, '_____') : '';
};

export function runReview(host, { queue, onDone, title = 'Ripasso' } = {}) {
  const q = (queue || reviewQueue()).slice();
  const total = q.length;
  const failedOnce = new Set();
  let done = 0, right = 0, started = Date.now();
  clear(host);
  if (!total) {
    host.append(h('div', { class: 'empty' }, h('div', { class: 'big' }, ''), h('p', null, 'Nessuna carta da ripassare adesso.'), onDone ? h('button', { class: 'btn primary', onclick: () => onDone({ n: 0, right: 0 }) }, 'Avanti') : null));
    return;
  }
  const bar = h('div', { class: 'progress' }, h('i'));
  const count = h('div', { class: 'muted small center' });
  const stage = h('div', { class: 'review-stage' });
  host.append(h('div', { class: 'stack' }, bar, count, stage));

  function setProgress() {
    bar.firstChild.style.width = Math.round((done / (done + q.length)) * 100) + '%';
    count.textContent = (done + 1) + ' / ' + (done + q.length) + (q.length ? '' : '');
  }

  function finish() {
    markActive({ reviewed: done });
    clear(stage);
    bar.firstChild.style.width = '100%';
    count.textContent = '';
    if (right >= done * 0.8) confetti(24);
    stage.append(h('div', { class: 'empty' }, h('div', { class: 'big' }, ''), h('h3', null, 'Ripasso finito!'), h('p', null, right + ' ricordate su ' + done + ' risposte.'),
      h('button', { class: 'btn primary', onclick: () => onDone && onDone({ n: done, right }) }, onDone ? 'Avanti' : 'Ok')));
  }

  function next() {
    if (!q.length) return finish();
    setProgress();
    show(q[0]);
  }

  function grade(card, known) {
    const retry = failedOnce.has(card.id);
    if (known || !retry) answerCard(card, known, retry);
    q.shift();
    if (known) { if (!retry) right++; done++; if (retry) { /* secondo tentativo riuscito */ } }
    else {
      if (!failedOnce.has(card.id)) { failedOnce.add(card.id); q.push(card); } else { /* già ritentata: non ripetere all'infinito */ }
      done++;
    }
    if (!known) toast('Ci riproviamo tra poco.');
    next();
  }

  async function show(card) {
    clear(stage);
    const kindLabel = { word: 'Parola', phrase: 'Espressione', error: 'Errore da correggere', grammar: 'Grammatica' }[card.kind];
    const tag = h('div', { class: 'chip kind-' + card.kind }, kindLabel + (failedOnce.has(card.id) ? ' · ritenta' : ''));
    const box = h('div', { class: 'card review-card' });
    stage.append(tag, box);

    if (card.kind === 'word' || card.kind === 'phrase') {
      if (card.visual && !card.img) generateCardImage(card);
      const imgBox = h('div', { class: 'card-img' });
      if (card.img) imgUrl(card.img).then((u) => { if (u) imgBox.append(h('img', { src: u, alt: '' })); });
      const gap = blankOut(card.ctx, card.en);
      box.append(imgBox, h('div', { class: 'q-label' }, 'Come si dice in inglese?'), h('div', { class: 'q-it' }, card.it || card.en), gap ? h('div', { class: 'q-ctx' }, gap) : null);
      answerArea(card, card.en, 'Scrivi in inglese…', () => h('div', { class: 'reveal' },
        h('div', { class: 'ans' }, card.en, ' ', speakBtn(card.en, { small: true })),
        card.ipa && getSettings().phonetics !== 'off' ? h('div', { class: 'ipa' }, '/' + card.ipa + '/') : null,
        card.ctx ? h('div', { class: 'q-ctx' }, '“' + card.ctx + '”') : null));
    } else if (card.kind === 'error') {
      box.append(h('div', { class: 'q-label' }, 'Correggi la frase'), h('div', { class: 'q-wrong' }, card.wrong));
      answerArea(card, card.right, 'Scrivi la frase corretta…', () => h('div', { class: 'reveal' },
        h('div', { class: 'ans' }, card.right, ' ', speakBtn(card.right, { small: true })),
        card.expl ? h('div', { class: 'expl' }, card.expl) : null,
        card.rule ? h('button', { class: 'btn small ghost', onclick: () => showRule(card.rule, card.wrong, card.right) }, 'Spiega la regola') : null));
    } else {
      // carta di grammatica: autovalutazione
      const topic = grammarName(card.rule) || card.en;
      box.append(h('div', { class: 'q-label' }, 'Ricordi la regola?'), h('div', { class: 'q-it' }, topic), card.wrong ? h('div', { class: 'q-wrong' }, card.wrong) : null);
      const rev = h('div');
      box.append(rev);
      const show = h('button', { class: 'btn primary wide', onclick: async () => {
        show.disabled = true; show.textContent = '…';
        const r = await explainRule(card.rule, card.wrong, card.right);
        show.remove();
        if (r.ok) rev.append(h('div', { class: 'expl' }, r.rule.when_it), h('div', { class: 'expl' }, r.rule.form_it));
        else rev.append(h('div', { class: 'expl' }, card.expl || 'Ripassa la regola dal quaderno.'));
        rev.append(h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => grade(card, false) }, 'Non la ricordavo'), h('button', { class: 'btn primary', onclick: () => grade(card, true) }, 'La ricordavo')));
      } }, 'Mostra la regola');
      box.append(show);
    }
  }

  function answerArea(card, answer, placeholder, buildReveal) {
    const box = $last();
    const input = h('input', { class: 'input big', type: 'text', placeholder, autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done' });
    const fb = h('div', { class: 'feedback' });
    const actions = h('div', { class: 'row' });
    box.append(input, fb, actions);
    const check = h('button', { class: 'btn primary', onclick: () => doCheck() }, 'Controlla');
    const dunno = h('button', { class: 'btn ghost', onclick: () => reveal(false) }, 'Non la ricordo');
    actions.append(dunno, check);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doCheck(); });
    setTimeout(() => input.focus({ preventScroll: true }), 50);
    let revealed = false;

    function doCheck() {
      const v = input.value.trim();
      if (!v) { input.focus(); return; }
      const res = answerMatches(v, answer, card.kind === 'error' ? [] : []);
      if (res.ok) reveal(true, res);
      else reveal(false, res);
    }
    function reveal(ok, res) {
      if (revealed) return; revealed = true;
      input.disabled = true;
      clear(actions);
      fb.className = 'feedback ' + (ok ? 'good' : 'bad');
      if (!ok && input.value.trim()) vibrate('bad'); else if (ok) vibrate('good');
      fb.textContent = ok ? (res && res.typo ? 'Giusto! (c\'era un piccolo errore di battitura)' : 'Esatto!') : (input.value.trim() ? 'Non proprio.' : 'Nessun problema, guarda la risposta.');
      box.append(buildReveal());
      if (ok) say(card.kind === 'error' ? card.right : card.en);
      if (ok) actions.append(h('button', { class: 'btn primary wide', onclick: () => grade(card, true) }, 'Avanti'));
      else actions.append(
        h('button', { class: 'btn ghost', onclick: () => grade(card, true) }, 'La sapevo'),
        h('button', { class: 'btn primary', onclick: () => grade(card, false) }, 'Ripeto')
      );
    }
  }
  const $last = () => stage.querySelector('.review-card');

  next();
}
