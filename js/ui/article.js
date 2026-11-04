/* Notizia del giorno (extra): articolo riscritto al tuo livello, con 3 domande. */
import { h, clear, toast, say } from './dom.js';
import { createTutor } from './tutor.js';
import { mountReader } from './reader.js';
import { state, saveState } from '../store.js';
import { generateArticle } from '../engine.js';
import { dayStr, shuffle, normText } from '../util.js';
import { markActive } from '../progress.js';
import { addGlossaryCards } from '../cards.js';

export async function showArticle(host) {
  clear(host);
  let a = state.article && state.article.date === dayStr() ? state.article : null;
  host.append(h('h2', { class: 'step-title' }, 'Notizia del giorno'));
  if (!a) {
    const wrap = h('div', { class: 'center-col' });
    const t = createTutor({ size: 110 }); t.setMood('think');
    wrap.append(t.el, h('p', null, 'Cerco una notizia e la adatto al tuo livello…'), h('div', { class: 'dotsload' }, h('i'), h('i'), h('i')), h('p', { class: 'muted small' }, 'Può servire fino a un minuto.'));
    host.append(wrap);
    const r = await generateArticle();
    wrap.remove();
    if (!r.ok) {
      host.append(h('div', { class: 'center-col' }, h('p', { class: 'err' }, r.error), h('button', { class: 'btn primary', onclick: () => showArticle(host) }, 'Riprova')));
      return;
    }
    a = r.article;
  }
  host.append(h('h3', { class: 'ep-title' }, a.headline_en), h('div', { class: 'muted small' }, 'Fonte: ' + a.source_name + (a.source_url ? ' · ' + a.source_url : '')), h('p', { class: 'muted' }, a.summary_it));
  const rdr = mountReader(host, a, { ep: a });
  host.append(h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => rdr.playScene(0) }, 'Ascolta'), h('button', { class: 'btn ghost', onclick: () => rdr.stop() }, '⏹')));
  // domande
  const qbox = h('div', { class: 'card stack' }, h('h4', null, 'Hai capito?'));
  (a.questions || []).forEach((q) => {
    const row = h('div', { class: 'stack' }, h('b', null, q.question));
    const opts = h('div', { class: 'options' });
    shuffle([q.answer].concat(q.distractors || [])).forEach((o) => {
      const b = h('button', { class: 'opt', onclick: () => {
        opts.querySelectorAll('button').forEach((x) => { x.disabled = true; if (normText(x.textContent) === normText(q.answer)) x.classList.add('right'); });
        if (normText(o) !== normText(q.answer)) b.classList.add('wrong');
      } }, o);
      opts.append(b);
    });
    row.append(opts); qbox.append(row);
  });
  host.append(qbox);
  if (a.discussion_en) host.append(h('div', { class: 'card' }, h('b', null, 'Da discutere con il tutor'), h('p', { class: 'en' }, a.discussion_en)));
  if (!a.saved) {
    host.append(h('button', { class: 'btn primary wide', onclick: (e) => {
      const made = addGlossaryCards({ glossary: a.glossary, sentences: a.sentences });
      a.saved = true; saveState(); markActive({ saved: made.length });
      toast(made.length ? '' + made.length + ' nuove carte' : 'Nessuna nuova carta oggi');
      e.target.remove();
    } }, 'Salva le parole utili nelle carte'));
  }
}
