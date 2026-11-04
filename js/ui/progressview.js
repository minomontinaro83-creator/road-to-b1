import { h, clear, ring, confetti, toast, fmtDate } from './dom.js';
import { createTutor } from './tutor.js';
import { state } from '../store.js';
import { getStreak, b1Progress, monthGrid, ACHIEVEMENTS, lastDays, etaMonths, lexiconCoverage, addCheckpoint, checkAchievements, getDay } from '../progress.js';
import { monthKey } from '../util.js';
import { generateTest } from '../engine.js';
import { getEpisode } from '../store.js';
import { runTest, testSummary } from './test.js';
import { hasAnthropicKey } from '../api.js';

const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
let view = null;

export function renderProgress(host, nav) {
  clear(host);
  const now = new Date();
  if (!view) view = { y: now.getFullYear(), m: now.getMonth() };
  const b1 = b1Progress();
  const st = getStreak();
  const eta = etaMonths();

  host.append(
    h('div', { class: 'card center-col b1-card' },
      ring(b1.pct, { size: 150, stroke: 14, label: b1.pct + '%', sub: 'verso il B1' }),
      eta === 0 ? h('p', null, 'Obiettivo raggiunto!') : eta ? h('p', { class: 'muted' }, 'Di questo passo: circa ' + eta + (eta === 1 ? ' mese' : ' mesi') + ' al B1.') : h('p', { class: 'muted small' }, 'La stima comparirà dopo qualche settimana di studio.'),
      h('div', { class: 'parts' }, b1.parts.map((p) => h('div', { class: 'part' }, h('div', { class: 'part-top' }, h('span', null, p.label), h('b', null, p.detail)), h('div', { class: 'meter' }, h('i', { style: { width: Math.round(p.value * 100) + '%' } })))))),
    h('div', { class: 'grid2' },
      h('div', { class: 'card stat' }, h('div', { class: 'eyebrow' }, 'Serie'), h('b', { class: 'big-num' }, st.current), h('small', null, 'serie attuale')),
      h('div', { class: 'card stat' }, h('div', { class: 'eyebrow' }, 'Record'), h('b', { class: 'big-num' }, Math.max(st.best, state.streak.best || 0)), h('small', null, 'serie record'))),
    h('p', { class: 'muted small center' }, 'Un giorno di pausa a settimana non interrompe la serie.')
  );

  // calendario
  const grid = monthGrid(view.y, view.m);
  const cal = h('div', { class: 'card' },
    h('div', { class: 'row between' }, h('button', { class: 'icon-btn', onclick: () => { view.m--; if (view.m < 0) { view.m = 11; view.y--; } renderProgress(host, nav); } }, '‹'), h('b', null, MONTHS[view.m] + ' ' + view.y), h('button', { class: 'icon-btn', onclick: () => { view.m++; if (view.m > 11) { view.m = 0; view.y++; } renderProgress(host, nav); } }, '›')),
    h('div', { class: 'cal' }, ['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((d) => h('small', { class: 'cal-h' }, d)),
      grid.flat().map((c) => h('div', { class: 'cal-d' + (c.inMonth ? '' : ' out') + (c.active ? ' on' : '') + (c.today ? ' today' : '') }, c.active ? '' : c.n))));
  host.append(cal);

  // numeri
  const c = b1.counts;
  const cov = lexiconCoverage();
  host.append(h('div', { class: 'card' }, h('h4', null, 'Le tue carte'),
    h('div', { class: 'grid3' },
      h('div', { class: 'num' }, h('b', null, c.consolidated), h('small', null, 'consolidate')),
      h('div', { class: 'num' }, h('b', null, c.learning), h('small', null, 'in corso')),
      h('div', { class: 'num' }, h('b', null, c.new), h('small', null, 'nuove'))),
    h('small', { class: 'muted' }, 'Una carta è consolidata quando la ricordi dopo almeno 30 giorni. Parole: ' + c.byKind.word + ' · Frasi: ' + c.byKind.phrase + ' · Errori: ' + c.byKind.error + ' · Lista B1 incontrata: ' + cov.pct + '%')));

  // minuti
  const w = lastDays(14); const max = Math.max(30, ...w.map((x) => x.min));
  host.append(h('div', { class: 'card' }, h('h4', null, 'Minuti al giorno'), h('div', { class: 'bars' }, w.map((x) => h('div', { class: 'bar' + (x.active ? ' on' : '') }, h('i', { style: { height: Math.max(4, Math.round((x.min / max) * 100)) + '%' } }), h('small', null, x.date.slice(8)))))));

  // traguardi
  host.append(h('div', { class: 'card' }, h('h4', null, 'Traguardi'), h('div', { class: 'badges' }, ACHIEVEMENTS.map((a) => {
    const got = state.achievements[a.id];
    return h('div', { class: 'badge' + (got ? ' got' : ''), title: a.desc }, h('div', { class: 'b-ico' }, got ? a.icon : ''), h('b', null, a.title), h('small', null, a.desc));
  }))));

  // verifica mensile
  const cps = state.checkpoints;
  host.append(h('div', { class: 'card' }, h('h4', null, 'Verifica mensile'),
    cps.length ? h('div', { class: 'cp-list' }, cps.slice(-6).map((x) => h('div', { class: 'row between' }, h('span', null, fmtDate(x.date)), h('b', null, x.pct + '%')))) : h('p', { class: 'muted small' }, 'Ogni mese un test più lungo misura davvero i progressi.'),
    h('button', { class: 'btn ghost', onclick: () => nav('checkpoint') }, 'Fai la verifica ora')));

  // consumi
  const u = state.usage[monthKey()] || { in: 0, out: 0, calls: 0, images: 0 };
  host.append(h('div', { class: 'card muted small' }, h('b', null, 'Consumi di questo mese: '), u.calls + ' richieste · ' + Math.round((u.in + u.out) / 1000) + 'k token · ' + u.images + ' immagini. ', 'Per i costi esatti controlla la tua console Anthropic e OpenAI.'));
}

export async function renderCheckpoint(host, back) {
  clear(host);
  host.append(h('div', { class: 'session-head' }, h('button', { class: 'icon-btn', onclick: () => back() }, '✕'), h('div', { class: 'step-name' }, 'Verifica mensile')));
  const body = h('div', { class: 'session-body' }); host.append(body);
  if (!hasAnthropicKey()) { body.append(h('p', { class: 'err' }, 'Serve la chiave API.')); return; }
  const wrap = h('div', { class: 'center-col' });
  const t = createTutor({ size: 110 }); t.setMood('think');
  wrap.append(t.el, h('p', null, 'Preparo 20 domande…'), h('div', { class: 'dotsload' }, h('i'), h('i'), h('i')));
  body.append(wrap);
  const last = state.done ? await getEpisode('e' + state.done) : null;
  const pseudo = last || { id: 'cp', sentences: [{ en: 'I would like a table for two, please.' }, { en: 'Could you tell me how to get to the station?' }, { en: 'I have never been to London before.' }, { en: 'If it rains, we will stay at the hotel.' }, { en: 'She asked me where I was going.' }], glossary: [] };
  const r = await generateTest(pseudo, { checkpoint: true, count: 20 });
  clear(body);
  if (!r.ok) { body.append(h('p', { class: 'err' }, r.error), h('button', { class: 'btn primary', onclick: () => renderCheckpoint(host, back) }, 'Riprova')); return; }
  const host2 = h('div'); body.append(host2);
  runTest(host2, r.questions, { onFinish: (res) => {
    addCheckpoint(res.pct, { ok: res.ok, total: res.total });
    checkAchievements();
    clear(body);
    if (res.pct >= 70) confetti(40);
    body.append(h('h2', { class: 'step-title' }, 'Risultato della verifica'), testSummary(res), h('button', { class: 'btn primary wide', onclick: () => back() }, 'Chiudi'));
  } });
}
