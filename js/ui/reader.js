/* Lettore: testo toccabile, frasi con fonetica e traduzione, ascolto scena. */
import { h, sheet, toast, say, speakBtn, clear } from './dom.js';

export const HL_COLORS = ['', '#F5D76E', '#8FD19E', '#8CC4F0', '#F2A6C0'];
import { state, getSettings, setSettings } from '../store.js';
import { tokenize, findSpans, normText, esc, fmtPron } from '../util.js';
import { speak, stopSpeech, isSpeaking, prefetchSpeech } from '../tts.js';
import { lookupWord, translateSentences } from '../engine.js';
import { addWordCard, markKnown, findCard } from '../cards.js';
import { cardKey, cardState } from '../srs.js';
import { generateCardImage } from '../images.js';

function cardFor(text) {
  const t = String(text);
  return findCard(cardKey(t.trim().split(/\s+/).length > 1 ? 'phrase' : 'word', { en: t })) || null;
}

/** segnalibro, evidenziatore e nota sulla frase toccata */
function annRow(ann, idx, onChange) {
  const cur = () => ann.get(idx);
  const bm = h('button', { class: 'btn small ghost' + (cur().bm ? ' on' : ''), onclick: () => { ann.toggleBm(idx); bm.classList.toggle('on', cur().bm); bm.textContent = cur().bm ? 'Segnalibro ✓' : 'Segnalibro'; if (onChange) onChange(); } }, cur().bm ? 'Segnalibro ✓' : 'Segnalibro');
  const dots = HL_COLORS.slice(1).map((c, k) => h('button', { class: 'hl-dot' + (cur().col === k + 1 ? ' on' : ''), style: { background: c }, 'aria-label': 'Evidenzia', onclick: () => { ann.setHl(idx, cur().col === k + 1 ? 0 : k + 1); dots.forEach((d, j) => d.classList.toggle('on', cur().col === j + 1)); if (onChange) onChange(); } }));
  const note = h('button', { class: 'btn small ghost', onclick: () => ann.editNote(idx, () => { note.textContent = cur().note ? 'Nota ✓' : 'Nota'; if (onChange) onChange(); }) }, cur().note ? 'Nota ✓' : 'Nota');
  return h('div', { class: 'row wrap ann-row' }, bm, ...dots, note);
}

/** finestra con significato, fonetica e i pulsanti "Lo so" / "Imparare" */
export async function openWordPopup(word, sentence, ep, onChange, idx = null, onPlayFrom = null, ann = null) {
  const s = getSettings();
  const body = h('div', { class: 'stack word-pop' });
  const sh = sheet(body, { title: '' });
  const wpWord = h('div', { class: 'wp-word' }, word);
  let spoken = word;
  const head = h('div', { class: 'wp-head' }, wpWord, speakBtn(() => spoken));
  const meaning = h('div', { class: 'wp-it' }, 'Cerco…');
  const ipa = h('div', { class: 'wp-ipa' });
  const actions = h('div', { class: 'row wrap' });
  body.append(head, ipa, meaning);
  if (sentence) {
    const trLine = h('div', { class: 'wp-tr' });
    const known = idx != null && ep && ep.sentences && ep.sentences[idx] && ep.sentences[idx].it;
    if (known) trLine.textContent = ep.sentences[idx].it;
    body.append(h('div', { class: 'wp-ctx' }, '“' + sentence + '”'),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn small ghost', onclick: () => say(sentence) }, 'Frase'),
        onPlayFrom && idx != null ? h('button', { class: 'btn small ghost', onclick: () => { sh.close(); onPlayFrom(idx); } }, 'Leggi da qui') : null,
        idx != null && ep && ep.sentences ? h('button', { class: 'btn small ghost', onclick: async (e) => {
          if (trLine.textContent) { trLine.textContent = ''; return; }
          e.target.disabled = true; trLine.textContent = '…';
          const r = await translateSentences(ep, [idx]); e.target.disabled = false;
          trLine.textContent = r.ok ? (ep.sentences[idx].it || '') : (r.error || 'Traduzione non riuscita');
        } }, '🇮🇹 Traduci la frase') : null),
      trLine);
    if (ann && idx != null) body.append(annRow(ann, idx, onChange));
  }
  body.append(actions);
  say(word);
  const r = await lookupWord(word, sentence, ep);
  if (!r.ok) {
    meaning.textContent = r.error || 'Non riesco a tradurre ora.';
    meaning.classList.add('err');
    return;
  }
  if (r.surface && normText(r.surface) !== normText(word)) { wpWord.textContent = r.surface; spoken = r.surface; say(r.surface); }
  meaning.textContent = r.it + (r.pos ? '  ·  ' + r.pos : '');
  if (s.phonetics !== 'off' && r.ipa) ipa.textContent = fmtPron(r.ipa);
  const target = (r.surface || (r.base && normText(r.base) !== normText(word) ? r.base : word)).trim();
  const existing = cardFor(target) || cardFor(word);
  if (existing) {
    actions.append(h('div', { class: 'chip ok' }, existing.cons ? '✔ Consolidata' : 'Già nelle tue carte'));
    return;
  }
  actions.append(
    h('button', { class: 'btn ghost', onclick: () => { markKnown(word); sh.close(); toast('Ok, la considero nota.'); if (onChange) onChange(); } }, '✓ Lo so'),
    h('button', { class: 'btn primary', onclick: () => {
      const c = addWordCard({ en: target, it: r.it, ipa: r.ipa, ctx: sentence, visual: r.visual, kind: r.pos && /espressione|phrasal|idiom/i.test(r.pos) ? 'expression' : 'word', source: 'tocco' });
      if (c) generateCardImage(c);
      sh.close(); toast('Aggiunta alle carte'); if (onChange) onChange();
    } }, 'Imparare')
  );
}

/**
 * @param host elemento dove inserire il testo
 * @param content {sentences:[{en,ipa,newPara,it}], glossary:[]}
 * @param opts {ep, hidden, onChange, bar}
 */
export function mountReader(host, content, opts = {}) {
  const surfaces = (content.glossary || []).map((g) => g.surface);
  const wrap = h('div', { class: 'reader-wrap' });
  host.append(wrap);
  let root = null, sentEls = [], playId = 0, hidden = !!opts.hidden, showTr = !!getSettings().showTranslation;
  let barPlay = null, barProg = null;
  let resumeAt = Math.max(0, Math.min((opts.startAt | 0), content.sentences.length - 1));
  let ipaOn = opts.localIpa ? false : getSettings().phonetics === 'sentence';

  function build() {
    const s = getSettings();
    const showIpa = ipaOn && content.sentences.some((x) => x.ipa);
    root = h('div', { class: 'reader' + (hidden ? ' is-hidden' : '') + (showIpa || showTr ? ' blocks' : '') });
    sentEls = [];
    let para = null;
    const openFor = (text, sentence, i) => openWordPopup(text, sentence, opts.ep || content, () => { refreshMarks(); refreshAnn(); }, i, (k) => playScene(k), opts.ann || null);
    const mark = (text, cls, sentence, i) => {
      const c = cardFor(text);
      const el = h('span', { class: cls + (c ? ' saved' : '') + (state.known[normText(text)] ? ' known' : ''), onclick: () => { stopScene(); openFor(text, sentence, i); } }, text);
      el.dataset.k = normText(text);
      return el;
    };
    content.sentences.forEach((sent, i) => {
      if (!para || sent.newPara) { para = h('p', { class: 'para' }); root.append(para); }
      const text = sent.en;
      const body = h('span', { class: 'stext' });
      let pos = 0;
      const plain = (a, b) => { tokenize(text.slice(a, b)).forEach((t) => body.append(t.w ? mark(t.t, 'w', text, i) : document.createTextNode(t.t))); };
      findSpans(text, surfaces).forEach((sp) => { plain(pos, sp.start); body.append(mark(text.slice(sp.start, sp.end), 'g', text, i)); pos = sp.end; });
      plain(pos, text.length);
      const dlg = /^[\s"“'‘]/.test(text);
      const a = opts.ann ? opts.ann.get(i) : null;
      const el = h('span', { class: 'sent' + (dlg ? ' dlg' : '') + (a && a.bm ? ' bm' : '') + (a && a.col ? ' hl hl' + a.col : '') + (a && a.note ? ' hasnote' : ''), 'data-i': i }, body,
        showIpa && sent.ipa ? h('span', { class: 'sipa' }, fmtPron(sent.ipa)) : null,
        showTr && sent.it ? h('span', { class: 'strans' }, sent.it) : null);
      sentEls.push(el);
      para.append(el, ' ');
    });
    wrap.querySelector('.reader') && wrap.querySelector('.reader').remove();
    wrap.prepend(root);
  }

  function refreshMarks() {
    root.querySelectorAll('.w, .g').forEach((el) => {
      el.classList.toggle('saved', !!cardFor(el.textContent));
      el.classList.toggle('known', !!state.known[el.dataset.k]);
    });
    if (opts.onChange) opts.onChange();
  }

  function refreshAnn() {
    if (!opts.ann) return;
    sentEls.forEach((el, i) => {
      const a = opts.ann.get(i);
      el.classList.toggle('bm', !!a.bm);
      for (let c = 1; c <= 4; c++) el.classList.toggle('hl' + c, a.col === c);
      el.classList.toggle('hl', !!a.col);
      el.classList.toggle('hasnote', !!a.note);
    });
  }

  function clearWord() { if (root) root.querySelectorAll('.speak').forEach((e) => e.classList.remove('speak')); }
  /** segue la parola letta: la illumina man mano */
  function wordTracker(i) {
    const els = Array.from(sentEls[i].querySelectorAll('.w, .g'));
    const clean = String(content.sentences[i].en || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    let cur = 0; const starts = els.map((el) => { const k = clean.indexOf(el.textContent, cur); if (k >= 0) { cur = k + el.textContent.length; return k; } return cur; });
    let last = -1;
    return (ci) => {
      let j = -1; for (let k = 0; k < starts.length; k++) { if (starts[k] <= ci) j = k; else break; }
      if (j < 0 || j === last) return;
      last = j; clearWord(); els[j].classList.add('speak');
    };
  }

  function stopScene() {
    playId++; stopSpeech(); clearWord();
    sentEls.forEach((e) => e.classList.remove('playing'));
    if (barPlay) barPlay.textContent = '▶';
  }

  async function playScene(from, onProgress) {
    if (from == null) from = resumeAt;
    stopScene();
    const id = ++playId;
    if (barPlay) barPlay.textContent = '⏸';
    for (let i = from; i < content.sentences.length; i++) {
      if (id !== playId) return { ok: true, cancelled: true };
      resumeAt = i;
      if (opts.onPos) opts.onPos(i);
      sentEls.forEach((e) => e.classList.remove('playing'));
      sentEls[i].classList.add('playing');
      if (!hidden) sentEls[i].scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (onProgress) onProgress(i, content.sentences.length);
      if (barProg) barProg.style.width = Math.round(((i + 1) / content.sentences.length) * 100) + '%';
      if (content.sentences[i + 1]) prefetchSpeech(content.sentences[i + 1].en);
      clearWord();
      const r = await speak(content.sentences[i].en, { onWord: wordTracker(i) });
      if (id !== playId || (r && r.cancelled)) return { ok: true, cancelled: true };
      if (r && !r.ok) { stopScene(); toast('Non riesco a riprodurre la voce. Controlla il volume o il motore voce nelle impostazioni.', 'err'); return r; }
    }
    stopScene();
    resumeAt = 0;
    if (opts.onPos) opts.onPos(0);
    if (barProg) barProg.style.width = '0%';
    if (opts.onEnd) opts.onEnd();
    return { ok: true };
  }

  build();

  if (opts.bar) {
    barPlay = h('button', { class: 'bar-btn play', 'aria-label': 'Ascolta tutto', onclick: () => { if (playId && sentEls.some((e) => e.classList.contains('playing'))) stopScene(); else playScene(); } }, '▶');
    barProg = h('i');
    const ipaBtn = h('button', { class: 'bar-btn' + (ipaOn ? ' on' : ''), 'aria-label': 'Fonetica', onclick: async (e) => {
      const btn = e.currentTarget;
      ipaOn = !ipaOn;
      if (ipaOn && opts.needIpa && content.sentences.some((x) => !x.ipa)) {
        btn.disabled = true; btn.textContent = '…';
        await opts.needIpa(content);
        btn.disabled = false; btn.textContent = '/ə/';
      }
      if (!opts.localIpa) setSettings({ phonetics: ipaOn ? 'sentence' : 'word' });
      btn.classList.toggle('on', ipaOn); build();
    } }, '/ə/');
    const trBtn = h('button', { class: 'bar-btn' + (showTr ? ' on' : ''), 'aria-label': 'Traduzione', onclick: async (e) => {
      const btn = e.currentTarget;
      if (!showTr) {
        btn.disabled = true; btn.textContent = '…';
        const r = await translateSentences(opts.ep || content, content.sentences.map((_, i) => i));
        btn.disabled = false; btn.textContent = 'IT';
        if (!r.ok) { toast(r.error || 'Traduzione non riuscita', 'err'); return; }
      }
      showTr = !showTr; btn.classList.toggle('on', showTr); build();
    } }, 'IT');
    const size = (d) => () => { const v = Math.min(30, Math.max(14, getSettings().fontSize + d)); setSettings({ fontSize: v }); document.documentElement.style.setProperty('--read-size', v + 'px'); };
    wrap.append(h('div', { class: 'reader-bar' }, h('div', { class: 'bar-prog' }, barProg),
      h('div', { class: 'bar-row' }, barPlay, h('button', { class: 'bar-btn', onclick: size(-1), 'aria-label': 'Testo più piccolo' }, 'A−'), h('button', { class: 'bar-btn', onclick: size(1), 'aria-label': 'Testo più grande' }, 'A+'), ipaBtn, trBtn)));
  }

  return {
    get el() { return root; }, playScene, stop: stopScene,
    setHidden(v) { hidden = !!v; root.classList.toggle('is-hidden', hidden); },
    refresh: refreshMarks, refreshAnn, rebuild: build, getResume: () => resumeAt,
    scrollToResume() { if (sentEls[resumeAt]) sentEls[resumeAt].scrollIntoView({ block: 'center' }); }
  };
}
