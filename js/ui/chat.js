/* Conversazione con il tutor: role-play dell'episodio o chiacchierata libera.
   Correzioni solo sostanziali; ogni correzione diventa una carta. */
import { h, clear, toast, say, speakBtn, sheet, confirmSheet, icon } from './dom.js';
import { createTutor } from './tutor.js';
import { state, saveState, getSettings } from '../store.js';
import { tutorTurn } from '../engine.js';
import { addCorrectionCard } from '../cards.js';
import { markActive } from '../progress.js';
import { speak, onSpeaking, isSpeaking } from '../tts.js';
import { showRule } from './test.js';
import { openWordPopup } from './reader.js';
import { tokenize, fmtPron } from '../util.js';

const GREETING = (name, tutor) => ({
  role: 'assistant', t: Date.now(),
  text: `Hi ${name}! I'm ${tutor}. What would you like to talk about today?`,
  it: `Ciao ${name}! Sono ${tutor}. Di che cosa ti va di parlare oggi?`,
  hints: [
    { en: "Let's talk about my trip.", it: 'Parliamo del mio viaggio.' },
    { en: "I'd like to practise ordering food.", it: 'Vorrei esercitarmi a ordinare da mangiare.' },
    { en: 'Can you help me with directions?', it: 'Puoi aiutarmi con le indicazioni stradali?' }
  ],
  corrections: []
});

/**
 * @param opts {scenario:{situation,role,opening,hints}|null, minTurns, onEnd(), endLabel}
 */
export function mountChat(host, opts = {}) {
  const s = getSettings();
  const scenario = opts.scenario || null;
  // il role-play riparte da zero; la chat libera riprende dove era rimasta
  if (scenario) state.chat = { messages: [], scenario, started: Date.now() };
  else if (state.chat.scenario || !state.chat.messages.length) state.chat = { messages: [GREETING(s.userName, s.tutorName)], scenario: null };
  if (scenario && !state.chat.messages.length) {
    state.chat.messages.push({ role: 'assistant', text: scenario.opening || 'Hello!', it: '', hints: scenario.hints || [], corrections: [], t: Date.now() });
  }
  saveState();

  const tutor = createTutor({ size: 44 });
  const sub = h('div', { class: 'wa-sub' }, 'online');
  const head = h('div', { class: 'wa-head' }, h('div', { class: 'wa-av' }, tutor.el), h('div', { class: 'wa-hn' }, h('b', null, s.tutorName), sub));
  const log = h('div', { class: 'wa-log' });
  const hintsBox = h('div', { class: 'wa-chips' });
  const input = h('textarea', { class: 'wa-input', rows: 1, placeholder: 'Scrivi un messaggio in inglese', autocapitalize: 'sentences', spellcheck: 'false', enterkeyhint: 'send' });
  const sendBtn = h('button', { class: 'wa-send', 'aria-label': 'Invia' }, icon('send', 22));
  const bar = h('div', { class: 'wa-bar' }, h('div', { class: 'wa-field' }, input), sendBtn);
  const endRow = h('div', { class: 'row end' });
  host.append(h('div', { class: 'wa' }, head, log, hintsBox, bar), endRow);

  let busy = false;
  const msgs = () => state.chat.messages;
  const userTurns = () => msgs().filter((m) => m.role === 'user').length;
  const hhmm = (t) => { if (!t) return ''; const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const setSub = () => { sub.textContent = busy ? 'sta scrivendo…' : isSpeaking() ? 'sta parlando…' : 'online'; };
  const offSp = onSpeaking(() => { if (!host.isConnected) { offSp(); return; } setSub(); });

  function botBubble(m, isLast) {
    const words = tokenize(m.text).map((t) => (t.w ? h('span', { class: 'w', onclick: () => openWordPopup(t.t, m.text, null) }, t.t) : t.t));
    const tr = h('div', { class: 'wa-tr' }, m.it || '');
    const trBtn = m.it ? h('button', { class: 'wa-mini', onclick: () => tr.classList.toggle('show') }, 'IT') : null;
    return h('div', { class: 'wa-row bot' }, h('div', { class: 'wa-msg bot' },
      h('div', { class: 'wa-text' }, words),
      s.phonetics === 'sentence' && m.ipa ? h('div', { class: 'sipa' }, fmtPron(m.ipa)) : null,
      m.it ? tr : null,
      h('div', { class: 'wa-meta' }, h('button', { class: 'wa-mini', onclick: () => say(m.text), 'aria-label': 'Ascolta' }, icon('speak', 16)), trBtn, h('span', { class: 'wa-time' }, hhmm(m.t)))));
  }

  function renderHints(hints) {
    clear(hintsBox);
    (hints || []).forEach((x) => hintsBox.append(h('button', { class: 'wa-chip', onclick: () => { input.value = x.en; input.focus(); autoGrow(); }, title: x.it }, x.en)));
  }

  function renderLog() {
    clear(log);
    log.append(h('div', { class: 'wa-day' }, 'Oggi'));
    if (scenario) log.append(h('div', { class: 'wa-note' }, h('b', null, 'Situazione: '), scenario.situation));
    const list = msgs();
    let lastAssistant = -1;
    list.forEach((m, k) => { if (m.role === 'assistant') lastAssistant = k; });
    list.forEach((m, k) => {
      if (m.role === 'assistant') { log.append(botBubble(m, k === lastAssistant)); return; }
      const answered = list.slice(k + 1).some((x) => x.role === 'assistant');
      log.append(h('div', { class: 'wa-row me' }, h('div', { class: 'wa-msg me' }, h('div', { class: 'wa-text' }, m.text),
        h('div', { class: 'wa-meta' }, h('span', { class: 'wa-time' }, hhmm(m.t)), h('span', { class: 'wa-tick' + (answered ? ' read' : '') }, '✓✓')))));
      if (m.corrections && m.corrections.length) {
        const box = h('div', { class: 'wa-note corr' });
        m.corrections.forEach((c) => box.append(h('div', { class: 'corr' },
          h('div', null, h('s', null, c.wrong), ' → ', h('b', null, c.correct), ' ', speakBtn(c.correct, { small: true })),
          h('div', { class: 'muted small' }, c.explanation_it || ''),
          h('div', { class: 'row' }, h('span', { class: 'chip ok small' }, 'nelle carte'), c.rule ? h('button', { class: 'btn small ghost', onclick: () => showRule(c.rule, c.wrong, c.correct) }, 'Regola') : null))));
        log.append(box);
      } else if (m.checked) log.append(h('div', { class: 'wa-note ok' }, '✔ Nessun errore importante'));
    });
    if (busy) log.append(h('div', { class: 'wa-row bot' }, h('div', { class: 'wa-msg bot' }, h('span', { class: 'typing' }, h('i'), h('i'), h('i')))));
    log.scrollTop = log.scrollHeight;
    setSub();
  }
  function renderBubble() { const last = [...msgs()].reverse().find((m) => m.role === 'assistant'); renderHints(last ? last.hints : []); }

  function autoGrow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; }
  input.addEventListener('input', autoGrow);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  sendBtn.addEventListener('click', send);

  async function send() {
    const text = input.value.trim();
    if (!text || busy) return;
    busy = true; sendBtn.disabled = true;
    input.value = ''; autoGrow();
    const me = { role: 'user', text, corrections: [], checked: false, t: Date.now() };
    msgs().push(me);
    clear(hintsBox);
    tutor.setMood('think');
    renderLog();
    const history = msgs().slice(-14).map((m) => ({ role: m.role, text: m.text }));
    if (history[0].role === 'assistant') history.unshift({ role: 'user', text: scenario ? '[The role-play starts now.]' : 'Hello!' });
    const r = await tutorTurn(history, scenario);
    busy = false; sendBtn.disabled = false; setSub();
    if (!r.ok) {
      msgs().pop();
      input.value = text; autoGrow();
      tutor.setMood('neutral');
      renderBubble();
      renderLog();
      toast(r.error || 'Errore del tutor', 'err');
      return;
    }
    const rep = r.reply;
    me.corrections = rep.corrections.slice(0, 3);
    me.checked = !me.corrections.length;
    me.corrections.forEach((c) => addCorrectionCard({ wrong: c.wrong, right: c.correct, rule: c.rule, expl: c.explanation_it, source: 'tutor' }));
    msgs().push({ role: 'assistant', text: rep.text, it: rep.it, ipa: rep.ipa, hints: rep.hints, corrections: [], t: Date.now() });
    if (msgs().length > 60) msgs().splice(0, msgs().length - 60);
    saveState();
    markActive({ chat: 1 });
    if (me.corrections.length) tutor.oops(); else { tutor.setMood(rep.mood === 'happy' || me.checked ? 'happy' : rep.mood); if (me.checked) tutor.cheer(); }
    renderBubble();
    renderLog();
    renderEnd();
    if (getSettings().autoSpeakTutor !== false) speak(rep.text); else tutor.talkText(rep.text);
  }

  function renderEnd() {
    clear(endRow);
    const min = opts.minTurns || 0;
    if (scenario && opts.onEnd) {
      const ready = userTurns() >= min;
      endRow.append(
        h('button', { class: 'btn ghost', onclick: () => opts.onEnd({ skipped: true }) }, 'Salta'),
        h('button', { class: 'btn primary', disabled: !ready, onclick: () => opts.onEnd({ turns: userTurns() }) }, ready ? 'Ho finito la conversazione ✓' : 'Ancora ' + (min - userTurns()) + ' messaggi…'));
    } else if (!scenario) {
      endRow.append(h('button', { class: 'btn small ghost', onclick: async () => {
        if (await confirmSheet('Vuoi iniziare una nuova conversazione?', 'Nuova')) {
          state.chat = { messages: [GREETING(s.userName, s.tutorName)], scenario: null };
          saveState(); renderBubble(); renderLog(); renderEnd();
        }
      } }, 'Nuova conversazione'));
    }
  }

  renderBubble(); renderLog(); renderEnd();
  autoGrow();
  return { speakLast() { const last = [...msgs()].reverse().find((m) => m.role === 'assistant'); if (last) say(last.text); } };
}
