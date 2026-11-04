/* Piccoli strumenti per costruire l'interfaccia (senza librerie). */
import { speak, stopSpeech, isSpeaking, onSpeaking, TTS_HELP } from '../tts.js';

/** icone a linea sottile (niente emoji) */
const ICONS = {
  speak: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  home: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  cards: '<rect x="4" y="6" width="13" height="14" rx="2"/><path d="M8 3h11a1 1 0 0 1 1 1v12"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  library: '<path d="M5 4v16M10 4v16M15 6l4 14M3 20h18"/>',
  book: '<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>',
  chart: '<path d="M4 20h16M7 16v-5M12 16V7M17 16v-8"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  pause: '<path d="M7 5v14M17 5v14"/>'
};
export function icon(name, size = 22) {
  const s = document.createElement('span');
  s.className = 'svgi';
  s.innerHTML = '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  return s;
}

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const k of Object.keys(props)) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k === 'disabled') el.disabled = !!v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

/* ---------- avvisi ---------- */
export function toast(msg, kind = '') {
  let box = $('#toasts');
  if (!box) { box = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: 'toast ' + kind }, msg);
  box.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, kind === 'err' ? 5200 : 2600);
}

/* ---------- finestra dal basso (chiusa anche dal gesto "indietro" di Android) ---------- */
const sheetStack = [];
let ignorePop = 0;
export function popIgnore(n = 1) { ignorePop += n; }
/** da chiamare nel popstate: true se l'evento è stato consumato (finestra chiusa o evento da ignorare) */
export function handlePopForSheets() {
  if (ignorePop > 0) { ignorePop--; return true; }
  if (sheetStack.length) { const top = sheetStack[sheetStack.length - 1]; top.hide(); return true; }
  return false;
}
export function sheet(content, { title = '', onClose, wide = false } = {}) {
  const back = h('div', { class: 'sheet-back' });
  let closed = false, entry = null;
  const hide = () => {
    if (closed) return;
    closed = true;
    const i = sheetStack.indexOf(entry); if (i >= 0) sheetStack.splice(i, 1);
    stopSpeechIfSheet(); back.classList.add('out'); setTimeout(() => back.remove(), 200);
    if (onClose) onClose();
  };
  entry = { hide: () => { entry.popped = true; hide(); } };
  const close = () => {
    if (closed) return;
    const wasPopped = entry.popped;
    hide();
    if (!wasPopped) { try { ignorePop++; history.back(); } catch (e) { ignorePop = Math.max(0, ignorePop - 1); } }
  };
  const box = h('div', { class: 'sheet' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'sheet-head' }, h('div', { class: 'sheet-title' }, title), h('button', { class: 'icon-btn', 'aria-label': 'Chiudi', onclick: close }, '✕')),
    h('div', { class: 'sheet-body' }, content));
  back.append(box);
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  document.body.append(back);
  try { history.pushState({ s: 1 }, ''); sheetStack.push(entry); } catch (e) { sheetStack.push(entry); }
  return { close, el: box };
}
function stopSpeechIfSheet() { /* la voce continua a meno che non sia una lettura lunga */ }

export function confirmSheet(message, okLabel = 'Conferma', danger = false) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (done) return; done = true; s.close(); resolve(v); };
    const s = sheet(h('div', { class: 'stack' },
      h('p', null, message),
      h('div', { class: 'row end' }, h('button', { class: 'btn ghost', onclick: () => fin(false) }, 'Annulla'), h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => fin(true) }, okLabel))
    ), { onClose: () => { if (!done) { done = true; resolve(false); } } });
  });
}

/* ---------- vibrazione (Android) ---------- */
export function vibrate(kind = 'bad') {
  try {
    if (JSON.parse(localStorage.getItem('rtb1_settings_v1') || '{}').vibrate === false) return;
    if (!navigator.vibrate) return;
    navigator.vibrate(kind === 'good' ? [70] : [320, 90, 320, 90, 620]);
  } catch (e) { /* ignora */ }
}

/* ---------- coriandoli ---------- */
export function confetti(n = 36) {
  try { if (!JSON.parse(localStorage.getItem('rtb1_settings_v1') || '{}').effects) return; } catch (e) { return; }
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#FF6B5B', '#FFC542', '#00C896', '#3D7BFF', '#B46BFF', '#FF8FB1'];
  const box = h('div', { class: 'confetti' });
  for (let i = 0; i < n; i++) {
    const p = h('i', { style: { left: Math.random() * 100 + '%', background: colors[i % colors.length], animationDelay: Math.random() * 0.5 + 's', animationDuration: 1.6 + Math.random() * 1.4 + 's', transform: 'rotate(' + Math.random() * 360 + 'deg)' } });
    box.append(p);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 3600);
}

/* ---------- pulsante audio ---------- */
export async function say(text, opts) {
  const r = await speak(text, opts);
  if (!r.ok && r.error) toast(TTS_HELP, 'err');
  return r;
}
export function speakBtn(getText, { small = false, label = 'Ascolta' } = {}) {
  const b = h('button', { class: 'icon-btn speak' + (small ? ' small' : ''), 'aria-label': label, type: 'button' }, icon('speak', small ? 16 : 20));
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    const t = typeof getText === 'function' ? getText() : getText;
    if (isSpeaking()) stopSpeech();
    say(t);
  });
  return b;
}
export { onSpeaking, stopSpeech, isSpeaking };

/* ---------- grafica ---------- */
export function ring(pct, { size = 120, stroke = 12, label = '', sub = '' } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  const mk = (cls, off) => {
    const e = document.createElementNS(ns, 'circle');
    e.setAttribute('cx', size / 2); e.setAttribute('cy', size / 2); e.setAttribute('r', r);
    e.setAttribute('fill', 'none'); e.setAttribute('stroke-width', stroke); e.setAttribute('class', cls);
    e.setAttribute('stroke-linecap', 'round');
    if (off != null) { e.setAttribute('stroke-dasharray', c); e.setAttribute('stroke-dashoffset', off); e.setAttribute('transform', `rotate(-90 ${size / 2} ${size / 2})`); }
    return e;
  };
  svg.append(mk('ring-bg'), mk('ring-fg', c * (1 - Math.min(100, Math.max(0, pct)) / 100)));
  return h('div', { class: 'ring', style: { width: size + 'px', height: size + 'px' } }, svg, h('div', { class: 'ring-text' }, h('b', null, label), sub ? h('small', null, sub) : null));
}

export function fmtDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

/* ---------- interruttore stile Android ---------- */
export function toggleEl(label, checked, onchange, hint) {
  const cb = h('input', { type: 'checkbox', checked: !!checked, onchange: (e) => onchange(e.target.checked) });
  return h('label', { class: 'toggle' }, h('span', null, label, hint ? h('small', { class: 'muted' }, hint) : null), cb, h('i'));
}
