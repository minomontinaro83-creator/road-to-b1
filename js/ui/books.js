/* Libri EPUB: importa un file dal telefono e leggilo con ascolto, fonetica, parole toccabili e carte. */
import { h, clear, sheet, toast, confirmSheet, speakBtn, toggleEl } from './dom.js';
import { createTutor, bubble } from './tutor.js';
import { kv, state, getSettings, setSettings, putImage, saveState } from '../store.js';
import { imgUrl, dropImgUrl } from '../images.js';
import { typoCover, aiCover, aiCoverAvailable } from '../covers.js';
import { parseDocument } from '../docs.js';
import { paginate, pageSentences } from '../epub.js';
import { mountReader, HL_COLORS } from './reader.js';
import { ipaSentences, pageLesson } from '../engine.js';
import { addWordCard, findCard } from '../cards.js';
import { cardKey } from '../srs.js';
import { stopSpeech } from '../tts.js';
import { dayStr, addDays } from '../util.js';

/* ---------------- archivio ---------------- */
export const listBooks = async () => (await kv.get('books')) || [];
const saveIndex = (arr) => kv.set('books', arr);
const loadBook = (id) => kv.get('book:' + id);

/** id stabile: lo stesso libro riaggiunto ritrova segnalibri, note e progressi */
function stableId(title, author, words) {
  const str = [title, author, words].join('|').toLowerCase(); let x = 5381;
  for (let i = 0; i < str.length; i++) x = ((x * 33) ^ str.charCodeAt(i)) >>> 0;
  return 'b' + x.toString(36);
}
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);

/** tappa di oggi per un libro con obiettivo: pagine globali [from, to) */
export function todayTappa(meta) {
  if (!meta || !meta.goal || !meta.totalPages) return null;
  const total = meta.totalPages, N = Math.max(1, meta.goal.days);
  const idx = Math.max(0, Math.min(N - 1, daysBetween(meta.goal.start, dayStr())));
  const ppd = Math.max(1, Math.ceil(total / N));
  const mx = meta.maxGp || 0;
  let from = idx * ppd, to = Math.min(total, from + ppd), late = false;
  if (mx < from) { late = true; from = mx; to = Math.min(total, from + Math.max(1, Math.ceil((total - from) / (N - idx)))); }
  return { from, to, total, idx, days: N, done: mx >= to - 1 || mx >= total - 1, late, over: daysBetween(meta.goal.start, dayStr()) >= N };
}

async function importFile(file, statusEl) {
  statusEl.textContent = 'Leggo il file…';
  const book = await parseDocument(file, (m) => { statusEl.textContent = m; });
  if (!book.english && !await confirmSheet('Il testo non sembra inglese. Lo importo lo stesso?', 'Importa')) return null;
  const id = stableId(book.title, book.author, book.words);
  const had = (await listBooks()).find((b) => b.id === id);
  if (had) { toast('Questo libro è già nella biblioteca'); return id; }
  await kv.set('book:' + id, { id, chapters: book.chapters });
  const coverKey = 'cover_' + id;
  let coverSrc = 'file', blob = book.cover;
  if (!blob) { coverSrc = 'typo'; blob = await typoCover(book.title, book.author); }
  await putImage(coverKey, blob);
  const idx = await listBooks();
  idx.unshift({ id, title: book.title, author: book.author, kind: book.kind, words: book.words, nch: book.chapters.length, added: dayStr(), pos: { ch: 0, pg: 0, si: 0 }, cover: coverKey, coverSrc });
  await saveIndex(idx);
  if (coverSrc === 'typo') makeAiCover(id, book.title, book.author, book.chapters[0].paras.slice(0, 6).join(' '));
  return id;
}

/** crea (in secondo piano) una copertina pertinente con l'IA e sostituisce quella tipografica */
export async function makeAiCover(id, title, author, sample) {
  if (!aiCoverAvailable()) return { ok: false, error: 'Nessun motore immagini disponibile.' };
  const r = await aiCover(title, author, sample);
  if (!r.ok) return r;
  const key = 'cover_' + id;
  await putImage(key, r.blob); dropImgUrl(key);
  const arr = await listBooks(); const m = arr.find((b) => b.id === id);
  if (m) { m.coverSrc = 'ai'; await saveIndex(arr); }
  return { ok: true };
}
function coverEl(b, cls = 'book-cover') {
  const el = h('div', { class: cls }, (b.title || '?').trim().charAt(0).toUpperCase());
  if (b.cover) imgUrl(b.cover).then((u) => { if (u) { el.textContent = ''; el.style.backgroundImage = 'url(' + u + ')'; el.classList.add('has-img'); } });
  return el;
}

/* ---------------- Biblioteca (scheda fissa nella barra in basso) ---------------- */
export async function renderLibrary(host, go) {
  clear(host);
  host.append(h('h2', { class: 'step-title' }, 'Biblioteca'));
  const status = h('div', { class: 'muted small' });
  const file = h('input', { type: 'file', accept: '.epub,.pdf,.docx,.txt,application/epub+zip,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain', style: { display: 'none' }, onchange: async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const id = await importFile(f, status);
      status.textContent = '';
      if (id) { toast('Aggiunto alla biblioteca'); go('book', { id }); }
    } catch (err) { status.textContent = ''; toast(err.message || 'Non riesco ad aprire questo file.', 'err'); }
  } });
  host.append(
    h('p', { class: 'muted' }, 'Carica un libro o un documento (EPUB, PDF, DOCX, TXT). Il tutor lo spiega pagina per pagina: traduzione, regole, pronuncia e parole da ricordare. I file restano sul telefono.'),
    h('button', { class: 'btn primary wide', onclick: () => file.click() }, 'Carica un file'), file, status);
  const books = await listBooks();
  if (!books.length) { host.append(h('div', { class: 'empty' }, h('p', null, 'Nessun documento ancora. Non funzionano i file protetti da DRM né i PDF scansionati (solo immagini).'))); return; }
  const list = h('div', { class: 'list' });
  books.forEach((b) => list.append(h('div', { class: 'row-item' },
    h('button', { class: 'row', style: { background: 'none', border: 0, textAlign: 'left', flex: 1, minWidth: 0 }, onclick: () => go('book', { id: b.id }) },
      coverEl(b),
      h('div', { class: 'book', style: { minWidth: 0 } }, h('span', { class: 'bt' }, b.title), h('small', { class: 'muted' }, (b.author ? b.author + ' · ' : '') + b.words.toLocaleString('it-IT') + ' parole · parte ' + Math.min(b.nch, (b.pos ? b.pos.ch : 0) + 1) + '/' + b.nch),
        (() => { const t = todayTappa(b); return t ? h('small', { class: t.done ? 'ok' : 'accent' }, t.done ? 'Tappa di oggi completata' : 'Oggi pag. ' + (t.from + 1) + '-' + t.to + ' di ' + t.total) : (b.totalPages && b.maxGp ? h('small', { class: 'muted' }, Math.min(100, Math.round(((b.maxGp + 1) / b.totalPages) * 100)) + '% letto') : null); })())),
    h('button', { class: 'icon-btn small', 'aria-label': 'Elimina', onclick: async () => {
      if (!await confirmSheet('Eliminare "' + b.title + '" dal telefono? Le carte create restano.', 'Elimina', true)) return;
      await kv.del('book:' + b.id); await saveIndex((await listBooks()).filter((x) => x.id !== b.id)); go('library');
    } }, '✕'))));
  host.append(list);
}

/* ---------------- lettura ---------------- */
export async function renderBook(host, id, go) {
  clear(host);
  const idx = await listBooks();
  const meta = idx.find((b) => b.id === id);
  const book = meta && await loadBook(id);
  if (!book) { host.append(h('p', null, 'Libro non trovato.'), h('button', { class: 'btn', onclick: () => go('library') }, 'Indietro')); return; }
  const pos = meta.pos || { ch: 0, pg: 0, si: 0 };
  let ch = Math.min(pos.ch || 0, book.chapters.length - 1), pg = pos.pg || 0;
  let startAt = pos.si || 0, token = 0, saveT = null, reader = null, auto = true;
  const pagesCache = new Map();
  const pagesOf = (c) => { if (!pagesCache.has(c)) pagesCache.set(c, paginate(book.chapters[c].paras, 380)); return pagesCache.get(c); };
  const contentCache = new Map();
  const contentFor = (c, p) => {
    const k = c + ':' + p;
    if (!contentCache.has(k)) {
      const ps = pagesOf(c)[p] || [];
      contentCache.set(k, { id: 'book:' + id + ':' + k, noPersist: true, glossary: [], sentences: pageSentences(ps), text: ps.join('\n\n') });
    }
    return contentCache.get(k);
  };
  // pagine globali del libro (per barra in alto e tappa)
  const gpStart = []; let totalPages = 0;
  book.chapters.forEach((_, c) => { gpStart.push(totalPages); totalPages += pagesOf(c).length; });
  const gp = () => gpStart[ch] + pg;
  const savePos = (si = 0) => {
    clearTimeout(saveT);
    saveT = setTimeout(async () => {
      const arr = await listBooks(); const m = arr.find((b) => b.id === id);
      if (m) { m.pos = { ch, pg, si }; m.totalPages = totalPages; m.maxGp = Math.max(m.maxGp || 0, gp()); meta.maxGp = m.maxGp; meta.totalPages = totalPages; meta.goal = m.goal; await saveIndex(arr); }
    }, 600);
  };
  meta.totalPages = totalPages;

  /* ---- segnalibri, evidenziazioni, note (per frase) ---- */
  const annList = () => (state.ann[id] = state.ann[id] || []);
  const findAnn = (k, i) => annList().find((a) => a.k === k && a.ch === ch && a.pg === pg && a.si === i);
  const snippet = (i) => { const c = contentFor(ch, pg); return ((c.sentences[i] || {}).en || '').slice(0, 160); };
  const dropAnn = (a) => { const l = annList(); const k = l.indexOf(a); if (k >= 0) l.splice(k, 1); };
  const annApi = {
    get: (i) => { const bm = findAnn('bm', i), hl = findAnn('hl', i), nt = findAnn('note', i); return { bm: !!bm, col: hl ? hl.col : 0, note: nt ? nt.txt : '' }; },
    toggleBm: (i) => { const a = findAnn('bm', i); if (a) dropAnn(a); else annList().push({ k: 'bm', ch, pg, si: i, t: snippet(i), d: dayStr() }); saveState(); },
    setHl: (i, col) => { const a = findAnn('hl', i); if (a) dropAnn(a); if (col) annList().push({ k: 'hl', ch, pg, si: i, t: snippet(i), col, d: dayStr() }); saveState(); },
    editNote: (i, done) => {
      const a = findAnn('note', i);
      const ta = h('textarea', { class: 'input', rows: 4, placeholder: 'La tua nota…' }); ta.value = a ? a.txt : '';
      const sh = sheet(h('div', { class: 'stack' }, h('p', { class: 'wp-ctx' }, '“' + snippet(i) + '”'), ta,
        h('div', { class: 'row end' }, a ? h('button', { class: 'btn ghost', onclick: () => { dropAnn(a); saveState(); sh.close(); done(); } }, 'Elimina') : null,
          h('button', { class: 'btn primary', onclick: () => { const v = ta.value.trim(); const cur = findAnn('note', i); if (cur) dropAnn(cur); if (v) annList().push({ k: 'note', ch, pg, si: i, t: snippet(i), txt: v, d: dayStr() }); saveState(); sh.close(); done(); } }, 'Salva'))), { title: 'Nota' });
      setTimeout(() => ta.focus(), 250);
    }
  };

  const topProg = h('div', { class: 'topprog' }, h('i'));
  const tappaBox = h('div', { class: 'tappa-box' });
  const head = h('div', { class: 'session-head' }, h('button', { class: 'icon-btn', 'aria-label': 'Indietro', onclick: () => { stopSpeech(); if (reader) reader.stop(); go('library'); } }, '✕'),
    h('div', { style: { flex: 1, minWidth: 0, textAlign: 'center' } }, h('b', { style: { fontFamily: 'var(--head-font)' } }, meta.title)),
    h('button', { class: 'btn ghost small', onclick: openChapters }, 'Indice'),
    h('button', { class: 'btn ghost small', onclick: openAnn }, 'Note'),
    h('button', { class: 'btn ghost small', onclick: openGoal }, 'Obiettivo'));
  const title = h('div', { class: 'stack' });
  const introBox = h('div', { class: 'tutor-intro' });
  const pageBox = h('div', { class: 'page' });
  const nav = h('div', { class: 'pagenav' });
  const tools = h('div', { class: 'row wrap' });
  const lessonBox = h('div', { class: 'stack lesson' });
  const endBox = h('div');
  host.append(topProg, head, tappaBox, title, introBox, pageBox, endBox, nav, tools, lessonBox);

  function openChapters() {
    const list = h('div', { class: 'stack' });
    book.chapters.forEach((c, i) => list.append(h('button', { class: 'chap' + (i === ch ? ' cur' : ''), onclick: () => { sh.close(); ch = i; pg = 0; startAt = 0; show(true); } }, h('span', null, c.title), h('small', { class: 'muted' }, pagesOf(i).length + ' pag.'))));
    const sh = sheet(list, { title: 'Indice', wide: true });
  }

  /* ---- obiettivo di lettura e tappa del giorno ---- */
  function drawTappa() {
    clear(tappaBox);
    const t = todayTappa(meta);
    topProg.firstChild.style.width = Math.min(100, Math.round(((gp() + 1) / totalPages) * 100)) + '%';
    if (!t) return;
    const inRange = gp() >= t.from && gp() < t.to;
    const doneTxt = t.over ? 'Obiettivo concluso: puoi fissarne uno nuovo.' : t.done ? 'Tappa di oggi completata. Bravo!' : 'Tappa di oggi: pagine ' + (t.from + 1) + '-' + t.to + ' di ' + t.total + (t.late ? ' (ricalcolata, sei in ritardo)' : '') + ' · giorno ' + (t.idx + 1) + ' di ' + t.days;
    const pct = Math.max(0, Math.min(100, Math.round(((Math.min(gp() + 1, t.to) - t.from) / Math.max(1, t.to - t.from)) * 100)));
    tappaBox.append(h('div', { class: 'card tappa' }, h('small', { class: t.done ? 'ok' : 'muted' }, doneTxt), h('div', { class: 'meter' }, h('i', { style: { width: (t.done ? 100 : pct) + '%' } })),
      !inRange && !t.done ? h('button', { class: 'btn small ghost', onclick: () => { const g = t.from; let c = 0; while (c + 1 < gpStart.length && gpStart[c + 1] <= g) c++; ch = c; pg = g - gpStart[c]; startAt = 0; show(true); } }, 'Vai alla tappa di oggi') : null));
  }
  function openGoal() {
    const g = meta.goal;
    let n = g ? g.days : 15, unit = 'days';
    const prev = h('p', { class: 'muted' });
    const num = h('input', { class: 'input', type: 'number', min: 1, max: 365, value: n, oninput: (e) => { n = Math.max(1, Math.min(365, Number(e.target.value) || 1)); upd(); } });
    const sel = h('select', { class: 'input', onchange: (e) => { unit = e.target.value; upd(); } }, h('option', { value: 'days' }, 'giorni'), h('option', { value: 'weeks' }, 'settimane'));
    const upd = () => { const d = unit === 'weeks' ? n * 7 : n; prev.textContent = 'Il libro ha ' + totalPages + ' pagine: circa ' + Math.ceil(totalPages / d) + ' pagine al giorno, ogni giorno una tappa.'; };
    upd();
    const sh = sheet(h('div', { class: 'stack' }, h('p', null, 'In quanti giorni vuoi finire "' + meta.title + '"? Ogni giorno vedrai la tappa da leggere.'),
      h('div', { class: 'row' }, num, sel), prev,
      h('div', { class: 'row end' }, g ? h('button', { class: 'btn ghost', onclick: async () => { const arr = await listBooks(); const m = arr.find((b) => b.id === id); if (m) { delete m.goal; await saveIndex(arr); } delete meta.goal; sh.close(); drawTappa(); toast('Obiettivo rimosso'); } }, 'Rimuovi') : null,
        h('button', { class: 'btn primary', onclick: async () => { const d = unit === 'weeks' ? n * 7 : n; const arr = await listBooks(); const m = arr.find((b) => b.id === id); if (m) { m.goal = { start: dayStr(), days: d }; m.totalPages = totalPages; await saveIndex(arr); meta.goal = m.goal; } sh.close(); drawTappa(); toast('Obiettivo impostato: ' + d + ' giorni'); } }, 'Imposta'))), { title: 'Obiettivo di lettura' });
  }
  function openAnn() {
    const all = annList().slice().sort((a, b) => a.ch - b.ch || a.pg - b.pg || a.si - b.si);
    const list = h('div', { class: 'stack' });
    if (!all.length) list.append(h('p', { class: 'muted' }, 'Ancora niente. Tocca una parola e usa Segnalibro, i colori o Nota.'));
    all.forEach((a) => list.append(h('div', { class: 'row-item ann-it' + (a.col ? ' c' + a.col : '') },
      h('button', { style: { background: 'none', border: 0, textAlign: 'left', flex: 1, minWidth: 0 }, onclick: () => { sh.close(); ch = a.ch; pg = a.pg; startAt = a.si; show(false); } },
        h('small', { class: 'accent' }, { bm: 'Segnalibro', hl: 'Evidenziato', note: 'Nota' }[a.k] + ' · ' + book.chapters[a.ch].title + ' · pag. ' + (a.pg + 1)),
        h('div', null, a.t || ''), a.txt ? h('div', { class: 'q-note' }, a.txt) : null),
      h('button', { class: 'icon-btn small', 'aria-label': 'Elimina', onclick: (e) => { dropAnn(a); saveState(); e.currentTarget.parentElement.remove(); if (reader) reader.refreshAnn(); } }, '✕'))));
    const sh = sheet(list, { title: 'Segnalibri, evidenziazioni e note', wide: true });
  }

  /* ---- lezione del tutor ---- */
  const lessonKey = () => 'lesson:' + id + ':' + ch + ':' + pg;
  async function loadLesson(content, force) {
    const my = token;
    clear(introBox); clear(lessonBox);
    const tut = createTutor({ size: 54 });
    const intro = h('div', { class: 'row', style: { alignItems: 'flex-start', marginBottom: '10px' } }, tut.el, h('div', { class: 'bubble-wrap' }, bubble(h('span', { class: 'muted' }, ''))));
    const bub = intro.querySelector('.bubble');
    introBox.append(intro);
    const run = async () => {
      bub.textContent = ''; bub.append(h('span', { class: 'typing' }, h('i'), h('i'), h('i')));
      clear(lessonBox);
      let L = !force ? await kv.get(lessonKey()) : null;
      if (!L) {
        const r = await pageLesson(content.text);
        if (my !== token) return;
        if (!r.ok) { bub.textContent = r.error || 'Non riesco a preparare la lezione ora.'; lessonBox.append(h('button', { class: 'btn ghost', onclick: run }, 'Riprova')); return; }
        L = r.lesson; await kv.set(lessonKey(), L);
      }
      if (my !== token) return;
      showLesson(L, content, bub, tut);
    };
    if (!getSettings().autoLesson && !(await kv.get(lessonKey()))) {
      bub.textContent = 'Vuoi che ti spieghi questa pagina?';
      lessonBox.append(h('button', { class: 'btn primary', onclick: run }, 'Spiega la pagina'));
      return;
    }
    run();
  }
  function showLesson(L, content, bub, tut) {
    bub.textContent = L.tutor_intro_it || '';
    tut.setMood('happy'); tut.talkText(L.tutor_intro_it);
    const det = (title, open, ...kids) => h('details', Object.assign({ class: 'card lesson-sec' }, open ? { open: true } : {}), h('summary', null, title), h('div', { class: 'stack' }, kids));
    const gram = (L.grammar || []).map((g) => h('div', { class: 'lg' }, h('div', null, h('b', null, g.rule_it)), h('div', { class: 'q-ctx' }, '“' + g.example_en + '” ', speakBtn(g.example_en, { small: true })), h('p', null, g.explain_it)));
    const pron = (L.pronunciation || []).map((x) => h('div', { class: 'sugg' }, h('div', null, h('b', null, x.word), h('span', { class: 'muted' }, '  /' + String(x.ipa).replace(/^\/|\/$/g, '') + '/'), h('div', null, x.tip_it)), speakBtn(x.word, { small: true })));
    const btns = [];
    const words = (L.words || []).map((it) => {
      const sentence = (content.sentences.find((s) => s.en.toLowerCase().includes(it.surface.toLowerCase())) || {}).en || '';
      const kind = it.kind === 'word' ? 'word' : 'phrase';
      const btn = h('button', { class: 'btn small primary' }, 'Ricordala');
      const done = () => { btn.textContent = 'Nelle carte'; btn.disabled = true; };
      if (findCard(cardKey(it.surface.trim().split(/\s+/).length > 1 || kind === 'phrase' ? 'phrase' : 'word', { en: it.surface }))) done();
      btn.onclick = () => { addWordCard({ en: it.surface, it: it.it, ipa: it.ipa, ctx: sentence, kind, source: 'libro' }); done(); if (reader) reader.refresh(); };
      btns.push(btn);
      return h('div', { class: 'sugg' }, h('div', null, h('b', null, it.surface), it.ipa ? h('span', { class: 'muted' }, '  /' + String(it.ipa).replace(/^\/|\/$/g, '') + '/') : null, h('div', null, it.it)), h('div', { class: 'row' }, speakBtn(it.surface, { small: true }), btn));
    });
    clear(lessonBox);
    lessonBox.append(
      det('Parole da ricordare', true, ...words, words.length ? h('button', { class: 'btn ghost', onclick: () => btns.forEach((b) => { if (!b.disabled) b.click(); }) }, 'Aggiungi tutte alle carte') : h('p', { class: 'muted' }, 'Nessuna in questa pagina.')),
      gram.length ? det('Regole di grammatica', true, ...gram) : null,
      pron.length ? det('Pronuncia', false, ...pron) : null,
      det('Traduzione della pagina', false, ...String(L.translation_it || '').split(/\n+/).map((t) => h('p', null, t))),
      h('button', { class: 'btn ghost small', onclick: () => loadLesson(content, true) }, 'Rigenera la lezione'));
  }

  function show(scroll) {
    token++;
    if (reader) reader.stop();
    stopSpeech();
    const pages = pagesOf(ch);
    pg = Math.max(0, Math.min(pg, pages.length - 1));
    clear(title); clear(pageBox); clear(nav); clear(tools); clear(endBox);
    title.append(h('div', { class: 'ep-meta' }, 'Parte ' + (ch + 1) + ' di ' + book.chapters.length + ' · pagina ' + (pg + 1) + ' di ' + pages.length), h('h2', { class: 'ep-title' }, book.chapters[ch].title));
    const content = contentFor(ch, pg);
    reader = mountReader(pageBox, content, {
      ep: content, bar: true, localIpa: true, startAt, ann: annApi,
      needIpa: async (c) => { const r = await ipaSentences(c); if (!r.ok) toast(r.error || 'Fonetica non riuscita', 'err'); return r.ok; },
      onPos: (i) => { savePos(i); },
      onEnd: () => { if (auto && hasNext()) { next(); setTimeout(() => reader && reader.playScene(0), 400); } }
    });
    const prevB = h('button', { class: 'btn ghost', disabled: ch === 0 && pg === 0, onclick: prev }, '‹ Indietro');
    const nextB = h('button', { class: 'btn primary', disabled: !hasNext(), onclick: next }, 'Avanti ›');
    nav.append(prevB, nextB);
    if (aiCoverAvailable()) tools.append(h('button', { class: 'btn ghost small', onclick: async (e) => { e.target.disabled = true; e.target.textContent = 'Creo la copertina…'; const r = await makeAiCover(id, meta.title, meta.author, book.chapters[0].paras.slice(0, 6).join(' ')); e.target.disabled = false; e.target.textContent = 'Nuova copertina con IA'; toast(r.ok ? 'Copertina aggiornata' : (r.error || 'Non riesco ora.'), r.ok ? '' : 'err'); } }, 'Nuova copertina con IA'));
    tools.append(toggleEl('Lettura continua', auto, (v) => { auto = v; }),
      toggleEl('Il tutor spiega ogni pagina', getSettings().autoLesson, (v) => setSettings({ autoLesson: v })));
    savePos(startAt);
    meta.maxGp = Math.max(meta.maxGp || 0, gp());
    drawTappa();
    { const t = todayTappa(meta); if (t && gp() === t.to - 1 && !t.over) endBox.append(h('div', { class: 'tappa-end' }, 'Fine della tappa di oggi (pagina ' + t.to + ' di ' + t.total + ')')); }
    if (startAt > 0 && content.sentences[startAt]) toast('Ripreso da «' + content.sentences[startAt].en.slice(0, 38) + (content.sentences[startAt].en.length > 38 ? '…' : '') + '»');
    loadLesson(content, false);
    if (scroll) window.scrollTo(0, 0);
    else if (startAt > 0) setTimeout(() => reader && reader.scrollToResume(), 50);
    startAt = 0;
  }
  const hasNext = () => pg < pagesOf(ch).length - 1 || ch < book.chapters.length - 1;
  function next() { startAt = 0; if (pg < pagesOf(ch).length - 1) pg++; else if (ch < book.chapters.length - 1) { ch++; pg = 0; } show(true); }
  function prev() { startAt = 0; if (pg > 0) pg--; else if (ch > 0) { ch--; pg = pagesOf(ch).length - 1; } show(true); }

  show(false);
}
