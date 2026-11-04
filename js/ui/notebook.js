/* Quaderno: episodi già letti, tutte le carte, diario della storia. */
import { h, clear, sheet, speakBtn, confirmSheet, toast } from './dom.js';
import { state } from '../store.js';
import { listEpisodeIds, getEpisode } from '../store.js';
import { mountReader } from './reader.js';
import { cardState, INTERVALS } from '../srs.js';
import { removeCard } from '../cards.js';
import { grammarName } from '../levels.js';
import { dayStr, diffDays, normText } from '../util.js';
import { fmtDate } from './dom.js';
import { seasonInfo } from '../story.js';
import { showRule } from './test.js';
import { imgUrl } from '../images.js';
import { lexiconCoverage } from '../progress.js';

let tab = 'cards';
let filter = 'all';
let query = '';

export function renderNotebook(host, go) {
  clear(host);
  const tabs = h('div', { class: 'tabs' }, [['cards', 'Carte'], ['eps', 'Episodi'], ['diary', 'Diario']].map(([k, l]) => h('button', { class: 'tab' + (tab === k ? ' on' : ''), onclick: () => { tab = k; renderNotebook(host, go); } }, l)));
  const body = h('div', { class: 'stack' });
  host.append(tabs, body);
  if (tab === 'cards') cardsTab(body, go);
  else if (tab === 'eps') episodesTab(body, host);
  else diaryTab(body);
}

const FILTERS = [['all', 'Tutte'], ['word', 'Parole'], ['phrase', 'Frasi'], ['error', 'Errori'], ['grammar', 'Grammatica'], ['due', 'Da ripassare'], ['cons', 'Consolidate']];

function cardsTab(body, go) {
  const t = dayStr();
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Cerca…', value: query, oninput: (e) => { query = e.target.value; list(); } });
  const chips = h('div', { class: 'chips scroll' }, FILTERS.map(([k, l]) => h('button', { class: 'chipbtn' + (filter === k ? ' on' : ''), onclick: () => { filter = k; renderNotebook(body.parentElement, go); } }, l)));
  const box = h('div', { class: 'list' });
  const count = h('div', { class: 'muted small' });
  body.append(search, chips, count, box);
  function list() {
    clear(box);
    let cs = state.cards.slice();
    if (filter === 'due') cs = cs.filter((c) => c.due <= t);
    else if (filter === 'cons') cs = cs.filter((c) => c.cons);
    else if (filter !== 'all') cs = cs.filter((c) => c.kind === filter);
    const q = normText(query);
    if (q) cs = cs.filter((c) => normText([c.en, c.it, c.wrong, c.right].join(' ')).includes(q));
    cs.sort((a, b) => (a.created < b.created ? 1 : -1));
    count.textContent = cs.length + (cs.length === 1 ? ' carta' : ' carte');
    if (!cs.length) { box.append(h('div', { class: 'empty' }, h('div', { class: 'big' }, ''), h('p', null, 'Qui compariranno le parole che impari.'))); return; }
    cs.slice(0, 200).forEach((c) => box.append(h('button', { class: 'row-item', onclick: () => cardSheet(c, () => renderNotebook(body.parentElement, go)) },
      h('div', { class: 'ri-main' }, h('b', null, c.kind === 'error' ? c.right : c.kind === 'grammar' ? (grammarName(c.rule) || c.en) : c.en), h('small', null, c.kind === 'error' ? '✗ ' + c.wrong : c.it)),
      h('div', { class: 'ri-side' }, h('span', { class: 'pill ' + cardState(c) }, { new: 'nuova', learning: 'in corso', consolidated: '✔' }[cardState(c)]), h('small', null, c.due <= t ? 'oggi' : 'tra ' + diffDays(t, c.due) + ' g')))));
    if (cs.length > 200) box.append(h('div', { class: 'muted small center' }, 'Mostrate le prime 200. Usa la ricerca.'));
  }
  list();
}

async function cardSheet(c, refresh) {
  const body = h('div', { class: 'stack' });
  if (c.img) { const u = await imgUrl(c.img); if (u) body.append(h('img', { class: 'card-photo', src: u, alt: '' })); }
  if (c.kind === 'error') body.append(h('div', { class: 'q-wrong' }, c.wrong), h('div', { class: 'ans' }, c.right, ' ', speakBtn(c.right)), c.expl ? h('p', null, c.expl) : null, c.rule ? h('button', { class: 'btn ghost', onclick: () => showRule(c.rule, c.wrong, c.right) }, 'Spiega la regola') : null);
  else body.append(h('div', { class: 'ans' }, c.en, ' ', speakBtn(c.en)), c.ipa ? h('div', { class: 'ipa' }, '/' + c.ipa + '/') : null, h('div', null, c.it), c.ctx ? h('div', { class: 'q-ctx' }, '“' + c.ctx + '”') : null);
  const t = dayStr();
  body.append(h('div', { class: 'muted small' }, 'Livello ' + (c.stage + 1) + ' di ' + INTERVALS.length + ' · riviste ' + c.reviews + ' volte · sbagliate ' + c.lapses + ' · prossimo ripasso: ' + (c.due <= t ? 'oggi' : fmtDate(c.due)) + (c.cons ? ' · consolidata ✔' : '')));
  body.append(h('button', { class: 'btn danger small', onclick: async () => { if (await confirmSheet('Eliminare questa carta?', 'Elimina', true)) { removeCard(c.id); sh.close(); refresh(); toast('Carta eliminata'); } } }, 'Elimina'));
  const sh = sheet(body, { title: { word: 'Parola', phrase: 'Espressione', error: 'Errore', grammar: 'Grammatica' }[c.kind] });
}

async function episodesTab(body) {
  body.append(h('p', { class: 'muted' }, 'Rileggi le scene già fatte.'));
  const ids = await listEpisodeIds();
  const eps = (await Promise.all(ids.map((i) => getEpisode(i)))).filter((e) => e && e.completed).sort((a, b) => b.number - a.number);
  if (!eps.length) { body.append(h('div', { class: 'empty' }, h('div', { class: 'big' }, ''), h('p', null, 'Gli episodi finiti compariranno qui.'))); return; }
  eps.forEach((ep) => body.append(h('button', { class: 'row-item', onclick: () => openEp(ep) },
    h('div', { class: 'ri-main' }, h('b', null, ep.number + '. ' + ep.title), h('small', null, '' + ep.location)), h('div', { class: 'ri-side' }, h('small', null, ep.completedOn ? fmtDate(ep.completedOn) : '')))));
}
function openEp(ep) {
  const c = h('div', { class: 'stack' });
  const sh = sheet(c, { title: ep.title, wide: true });
  const r = mountReader(c, ep, { ep });
  c.prepend(h('div', { class: 'row' }, h('button', { class: 'btn ghost small', onclick: () => r.playScene(0) }, 'Ascolta'), h('button', { class: 'btn ghost small', onclick: () => r.stop() }, '⏹')));
}

function diaryTab(body) {
  const info = seasonInfo(state.done);
  const cov = lexiconCoverage();
  body.append(
    h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Stagione ' + info.season), h('h3', null, info.title_it), h('div', { class: 'meter' }, h('i', { style: { width: Math.round((info.index / info.total) * 100) + '%' } })), h('small', { class: 'muted' }, 'Episodio ' + (info.index + 1) + ' di ' + info.total)),
    state.diary.summary ? h('div', { class: 'card' }, h('h4', null, 'Finora…'), h('p', { class: 'en' }, state.diary.summary)) : h('div', { class: 'empty' }, h('p', null, 'Il diario si riempie episodio dopo episodio.')),
    (state.diary.threads || []).length ? h('div', { class: 'card' }, h('h4', null, 'Misteri aperti'), h('ul', null, state.diary.threads.map((t) => h('li', { class: 'en' }, t)))) : null,
    (state.diary.characters || []).length ? h('div', { class: 'card' }, h('h4', null, 'Personaggi'), state.diary.characters.map((c) => h('div', { class: 'char' }, h('b', null, c.name), ' — ', c.role_en))) : null,
    h('div', { class: 'card' }, h('h4', null, 'Lista B1'), h('div', { class: 'meter' }, h('i', { style: { width: cov.pct + '%' } })), h('small', { class: 'muted' }, cov.n + ' elementi incontrati su ' + cov.total + ' (' + cov.pct + '%)')));
}
