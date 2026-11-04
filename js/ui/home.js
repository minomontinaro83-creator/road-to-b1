import { h, ring, clear } from './dom.js';
import { createTutor, bubble, avatarPicker } from './tutor.js';
import { sheet } from './dom.js';
import { state, getSettings, bus } from '../store.js';
import { genStatus, avatarSet, avatarVideos, autoTutor, generateTutorVideos } from '../images.js';
import { toast, confirmSheet } from './dom.js';
import { getStreak, b1Progress, checkpointDue, getDay, lastDays } from '../progress.js';
import { countDue } from '../srs.js';
import { dayStr } from '../util.js';
import { seasonInfo } from '../story.js';
import { todayPlan, sessionLabel, warmUp } from './session.js';
import { hasAnthropicKey } from '../api.js';
import { loadCurrentEpisode } from '../engine.js';
import { listBooks, todayTappa } from './books.js';

const GREET = ['Pronto per una nuova scena?', 'Un passo alla volta, come una corsa lunga.', 'Venti minuti oggi valgono più di due ore a fine mese.', 'Oggi si parla inglese!'];

export function renderHome(host, nav) {
  clear(host);
  const s = getSettings();
  const st = getStreak();
  const b1 = b1Progress();
  const due = countDue(state.cards, dayStr());
  const plan = todayPlan();
  const label = sessionLabel();
  const info = seasonInfo(state.done);
  const day = getDay();
  const goalMs = s.targetMinutes * 60000;

  const tutor = createTutor({ size: 96, onTap: () => { tutor.cheer(); const sh = sheet(h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Scegli il tuo tutor: umano, cartone o alieno.'), avatarPicker(() => { sh.close(); nav('home'); })), { title: 'Il tuo tutor', wide: true }); } });
  const hello = bubble(h('b', null, 'Ciao ' + s.userName + '! '), GREET[new Date().getDate() % GREET.length]);
  host.append(h('div', { class: 'home-hero' }, tutor.el, hello));

  if (getSettings().geminiKey && !avatarSet(getSettings().avatar) && !genStatus.busy) setTimeout(() => autoTutor(toast), 300);

// Sofia in video (Gemini Veo, facoltativo e a pagamento)
if (getSettings().avatar === 'sofia' && !avatarVideos('sofia')) {
  const vbox = h('div'); host.append(vbox);
  vbox.append(h('div', { class: 'card' }, h('b', null, 'Vuoi Sofia in video?'),
    h('p', { class: 'muted small' }, getSettings().geminiKey ? 'Si muove, parla, approva e disapprova. Gemini Veo è a pagamento.' : 'Serve la chiave Gemini (Impostazioni). Poi Sofia può muoversi davvero.'),
    h('button', { class: 'btn ghost', onclick: async (e) => {
      if (!getSettings().geminiKey) { nav('settings'); return; }
      if (!await confirmSheet('Creo 4 brevi video di Sofia con Gemini Veo. È a pagamento (richiede fatturazione attiva su Google). Procedo?', 'Crea i video')) return;
      e.target.disabled = true; e.target.textContent = 'Creo i video… (qualche minuto)';
      const r = await generateTutorVideos((m) => { e.target.textContent = m.slice(0, 60); });
      toast(r.ok ? 'Sofia in video pronta' : 'Gemini: ' + r.error, r.ok ? undefined : 'err');
      if (r.ok) nav('home'); else { e.target.disabled = false; e.target.textContent = 'Riprova'; }
    } }, getSettings().geminiKey ? 'Crea i video di Sofia' : 'Inserisci la chiave')));
}

  if (!hasAnthropicKey()) {
    host.append(h('div', { class: 'card warn' }, h('b', null, 'Manca la chiave API'), h('p', null, 'Per generare le scene serve la chiave Anthropic. Si inserisce una volta sola.'), h('button', { class: 'btn primary', onclick: () => nav('settings') }, 'Apri impostazioni')));
  }

  // serie + percentuale
  host.append(h('div', { class: 'grid2' },
    h('button', { class: 'card stat streak-card' + (st.current ? ' on' : ''), onclick: () => nav('progress') },
      h('div', { class: 'eyebrow' }, 'Serie'),
      h('b', { class: 'big-num' }, st.current), h('small', null, st.current === 1 ? 'giorno di fila' : 'giorni di fila'),
      h('small', { class: 'muted' }, 'record ' + Math.max(st.best, state.streak.best || 0)),
      st.atRisk ? h('small', { class: 'risk' }, 'Oggi salva la serie!') : null),
    h('button', { class: 'card stat', onclick: () => nav('progress') },
      ring(b1.pct, { size: 104, stroke: 11, label: b1.pct + '%', sub: 'verso il B1' }))
  ));

  // sessione di oggi
  const today = h('div', { class: 'card today' });
  const titleBase = 'Stagione ' + info.season + ' · Episodio ' + (info.index + 1) + ' di ' + info.total;
  if (label === 'done') {
    today.append(h('div', { class: 'eyebrow' }, 'Oggi'), h('h3', null, 'Hai finito per oggi!'), plan.teaser ? h('p', { class: 'muted' }, 'Prossimamente: ' + plan.teaser) : null,
      h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => nav('article') }, 'Notizia'), h('button', { class: 'btn primary', onclick: () => nav('session', { bonus: true }) }, 'Altro episodio')));
  } else {
    const epTitle = h('p', { class: 'muted' }, info.title_it);
    today.append(h('div', { class: 'eyebrow' }, titleBase), h('h3', null, label === 'start' ? 'La scena di oggi' : 'Riprendi la sessione'), epTitle,
      h('div', { class: 'meter' }, h('i', { style: { width: Math.min(100, Math.round(((day.ms || 0) / goalMs) * 100)) + '%' } })),
      h('small', { class: 'muted' }, Math.round((day.ms || 0) / 60000) + ' / ' + s.targetMinutes + ' min oggi' + (due ? ' · ' + due + ' carte da ripassare' : '')),
      h('button', { class: 'btn primary wide big', onclick: () => nav('session') }, label === 'start' ? 'Inizia ▶' : 'Continua ▶'));
    loadCurrentEpisode().then((ep) => { if (ep && !ep.completed) epTitle.textContent = ep.title + ' · ' + ep.location; });
    if (hasAnthropicKey()) warmUp();
  }
  host.append(today);

  // libro in lettura con obiettivo: la tappa di oggi
  const bookBox = h('div'); host.append(bookBox);
  listBooks().then((bs) => {
    const b = bs.find((x) => { const t = todayTappa(x); return t && !t.over; });
    if (!b || !bookBox.isConnected) return;
    const t = todayTappa(b);
    bookBox.append(h('button', { class: 'card banner', onclick: () => nav('book', { id: b.id }) },
      h('div', { style: { flex: 1 } }, h('b', null, t.done ? 'Libro: tappa di oggi completata' : 'Libro di oggi'), h('small', null, b.title + (t.done ? '' : ' · pagine ' + (t.from + 1) + '-' + t.to + ' di ' + t.total)),
        h('div', { class: 'meter' }, h('i', { style: { width: Math.min(100, Math.round((((b.maxGp || 0) + 1 - t.from) / Math.max(1, t.to - t.from)) * 100)) + '%' } }))),
      h('span', null, '›')));
  });

  host.append(h('div', { class: 'grid2' },
    h('button', { class: 'card tile', onclick: () => nav('review') }, h('div', { class: 'eyebrow' }, 'Ripasso'), h('b', null, due), h('small', null, due === 1 ? 'carta da ripassare' : 'carte da ripassare')),
    h('button', { class: 'card tile', onclick: () => nav('tutor') }, h('div', { class: 'eyebrow' }, 'Tutor'), h('b', null, s.tutorName), h('small', null, 'Parla con il tutor'))));

  if (checkpointDue()) host.append(h('button', { class: 'card banner', onclick: () => nav('checkpoint') }, h('div', null, h('b', null, 'Verifica mensile pronta'), h('small', null, '20 domande per misurare i progressi')), h('span', null, '›')));
  if (label !== 'done') host.append(h('button', { class: 'card banner alt', onclick: () => nav('article') }, h('div', null, h('b', null, 'Notizia del giorno'), h('small', null, 'Facoltativa · riscritta al tuo livello')), h('span', null, '›')));

  const w = lastDays(7);
  const max = Math.max(30, ...w.map((x) => x.min));
  host.append(h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Ultimi 7 giorni'),
    h('div', { class: 'bars' }, w.map((x) => h('div', { class: 'bar' + (x.active ? ' on' : '') }, h('i', { style: { height: Math.max(4, Math.round((x.min / max) * 100)) + '%' } }), h('small', null, ['D', 'L', 'M', 'M', 'G', 'V', 'S'][new Date(x.date + 'T12:00:00').getDay()]))))));
}
