/* Conversazione con il tutor: role-play dell'episodio o chiacchierata libera.
   Correzioni solo sostanziali; ogni correzione diventa una carta. */
import { h, clear, toast, say, speakBtn, sheet, confirmSheet, icon } from './dom.js';
import { createTutor, bubble } from './tutor.js';
import { state, saveState, getSettings } from '../store.js';
import { tutorTurn } from '../engine.js';
import { addCorrectionCard } from '../cards.js';
import { markActive } from '../progress.js';
import { speak } from '../tts.js';
import { showRule } from './test.js';
import { openWordPopup } from './reader.js';
import { tokenize } from '../util.js';

const GREETING = (name, tutor) => ({
  role: 'assistant',
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
    state.chat.messages.push({ role: 'assistant', text: scenario.opening || 'Hello!', it: '', hints: scenario.hints || [], corrections: [] });
  }
  saveState();

  const tutor = createTutor({ size: 110 });
  const bub = h('div', { class: 'bubble-wrap' });
  const stage = h('div', { class: 'chat-stage' }, tutor.el, bub);
  const log = h('div', { class: 'chat-log' });
  const hintsBox = h('div', { class: 'hints' });
  const input = h('textarea', { class: 'input', rows: 1, placeholder: 'Scrivi in inglese…', autocapitalize: 'sentences', spellcheck: 'false', enterkeyhint: 'send' });
  const sendBtn = h('button', { class: 'btn primary send', 'aria-label': 'Invia' }, '➤');
  const bar = h('div', { class: 'chat-input' }, input, sendBtn);
  const situation = scenario ? h('div', { class: 'situation' }, h('b', null, 'Situazione: '), scenario.situation) : null;
  const endRow = h('div', { class: 'row end' });
  host.append(h('div', { class: 'chat' }, situation, stage, log, hintsBox, bar, endRow));

  let busy = false;
  const msgs = () => state.chat.messages;
  const userTurns = () => msgs().filter((m) => m.role === 'user').length;

  function renderBubble() {
    clear(bub);
    const last = [...msgs()].reverse().find((m) => m.role === 'assistant');
    if (!last) return;
    const words = tokenize(last.text).map((t) => (t.w ? h('span', { class: 'w', onclick: () => openWordPopup(t.t, last.text, null) }, t.t) : t.t));
    const tr = h('div', { class: 'strans show' }, last.it || '');
    const trBtn = h('button', { class: 'sbtn tr', onclick: () => { tr.classList.toggle('show'); } }, 'IT');
    bub.append(bubble(
      h('div', { class: 'btext' }, words),
      s.phonetics === 'sentence' && last.ipa ? h('div', { class: 'sipa' }, '/' + last.ipa + '/') : null,
      last.it ? tr : null,
      h('div', { class: 'row' }, h('button', { class: 'icon-btn', onclick: () => say(last.text), 'aria-label': 'Ascolta' }, icon('speak', 20)), last.it ? trBtn : null)
    ));
    if (last.it) tr.classList.remove('show');
    renderHints(last.hints || []);
  }

  function renderHints(hints) {
    clear(hintsBox);
    if (!hints.length) return;
    hintsBox.append(h('div', { class: 'muted small' }, 'Puoi rispondere così:'));
    hints.forEach((x) => hintsBox.append(h('button', { class: 'hint', onclick: () => { input.value = x.en; input.focus(); autoGrow(); }, title: x.it },
      h('span', null, x.en), h('small', null, x.it || ''))));
  }

  function renderLog() {
    clear(log);
    const list = msgs();
    // il messaggio del tutor più recente è già nel fumetto
    let lastAssistant = -1;
    list.forEach((m, k) => { if (m.role === 'assistant') lastAssistant = k; });
    list.forEach((m, k) => {
      if (m.role === 'assistant' && k === lastAssistant) return;
      if (m.role === 'assistant') { log.append(h('div', { class: 'msg bot' }, m.text)); return; }
      const el = h('div', { class: 'msg me' }, m.text);
      log.append(el);
      if (m.corrections && m.corrections.length) {
        const box = h('div', { class: 'corrections' });
        m.corrections.forEach((c) => box.append(h('div', { class: 'corr' },
          h('div', null, h('s', null, c.wrong), ' → ', h('b', null, c.correct), ' ', speakBtn(c.correct, { small: true })),
          h('div', { class: 'muted small' }, c.explanation_it || ''),
          h('div', { class: 'row' }, h('span', { class: 'chip ok small' }, 'nelle carte'), c.rule ? h('button', { class: 'btn small ghost', onclick: () => showRule(c.rule, c.wrong, c.correct) }, 'Regola') : null))));
        log.append(box);
      } else if (m.checked) log.append(h('div', { class: 'okline' }, '✔ Nessun errore importante'));
    });
    log.scrollTop = log.scrollHeight;
  }

  function autoGrow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; }
  input.addEventListener('input', autoGrow);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  sendBtn.addEventListener('click', send);

  async function send() {
    const text = input.value.trim();
    if (!text || busy) return;
    busy = true; sendBtn.disabled = true;
    input.value = ''; autoGrow();
    const me = { role: 'user', text, corrections: [], checked: false };
    msgs().push(me);
    clear(hintsBox);
    tutor.setMood('think');
    bub.textContent = '';
    bub.append(bubble(h('span', { class: 'typing' }, h('i'), h('i'), h('i'))));
    renderLog();
    const history = msgs().slice(-14).map((m) => ({ role: m.role, text: m.text }));
    if (history[0].role === 'assistant') history.unshift({ role: 'user', text: scenario ? '[The role-play starts now.]' : 'Hello!' });
    const r = await tutorTurn(history, scenario);
    busy = false; sendBtn.disabled = false;
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
    msgs().push({ role: 'assistant', text: rep.text, it: rep.it, ipa: rep.ipa, hints: rep.hints, corrections: [] });
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
