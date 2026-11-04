import { initStore, getSettings, setSettings, state, bus, saveState } from './store.js';
import { h, clear, sheet, confetti, toast, $, icon, handlePopForSheets, popIgnore } from './ui/dom.js';
import { applyAppearance } from './ui/appearance.js';
import { renderHome } from './ui/home.js';
import { startSession, warmUp } from './ui/session.js';
import { runReview } from './ui/review.js';
import { mountChat } from './ui/chat.js';
import { renderNotebook } from './ui/notebook.js';
import { renderProgress, renderCheckpoint } from './ui/progressview.js';
import { renderSettings } from './ui/settings.js';
import { showOnboarding } from './ui/onboarding.js';
import { showArticle } from './ui/article.js';
import { renderBook, renderLibrary } from './ui/books.js';
import { addTime, getStreak } from './progress.js';
import { stopSpeech } from './tts.js';
import { countDue } from './srs.js';
import { dayStr } from './util.js';
import { hasAnthropicKey } from './api.js';
import { prefetchNext } from './engine.js';
import { autoTutor } from './images.js';

const TABS = [['home', 'home', 'Oggi'], ['review', 'cards', 'Ripasso'], ['tutor', 'chat', 'Tutor'], ['library', 'library', 'Biblioteca'], ['notebook', 'book', 'Quaderno'], ['progress', 'chart', 'Progressi']];
let screen, nav, cur = 'home';
let installEvt = null;

function setActive(name) {
  document.body.dataset.view = name;
  nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === name));
}

let viewPushed = false;
export function go(name, opts = {}, fromPop = false) {
  stopSpeech();
  // gesto "indietro" di Android: ogni schermata diversa dalla home aggiunge una voce di cronologia
  if (name !== 'home' && !viewPushed) { try { history.pushState({ v: 1 }, ''); viewPushed = true; } catch (e) { /* ignora */ } }
  else if (name === 'home' && viewPushed) { viewPushed = false; if (!fromPop) { popIgnore(1); try { history.back(); } catch (e) { popIgnore(-1); } } }
  cur = name;
  clear(screen);
  window.scrollTo(0, 0);
  setActive(name);
  const wrap = h('div', { class: 'view view-' + name });
  screen.append(wrap);
  if (name === 'home') renderHome(wrap, go);
  else if (name === 'review') {
    wrap.append(h('h2', { class: 'step-title' }, 'Ripasso'));
    const box = h('div'); wrap.append(box);
    runReview(box, { onDone: () => go('home') });
  } else if (name === 'tutor') {
    wrap.append(h('h2', { class: 'step-title' }, 'Parla con ' + getSettings().tutorName));
    const box = h('div'); wrap.append(box);
    mountChat(box, {});
  } else if (name === 'notebook') renderNotebook(wrap, go);
  else if (name === 'progress') renderProgress(wrap, go);
  else if (name === 'library') renderLibrary(wrap, go);
  else if (name === 'book') renderBook(wrap, opts.id, go);
  else if (name === 'settings') renderSettings(wrap, go);
  else if (name === 'session') {
    startSession(wrap, { forceStep: opts.bonus ? 'listen' : undefined, onExit: (where) => go(where || 'home') });
  } else if (name === 'article') {
    const box = h('div', { class: 'view-pad' });
    wrap.append(h('div', { class: 'session-head' }, h('button', { class: 'icon-btn', onclick: () => go('home') }, '✕')), box);
    showArticle(box);
  } else if (name === 'checkpoint') renderCheckpoint(wrap, () => go('progress'));
}

window.addEventListener('popstate', () => {
  if (handlePopForSheets()) return;
  if (cur !== 'home') go('home', {}, true);
});

function buildShell() {
  const root = $('#app');
  clear(root);
  const header = h('header', { class: 'topbar' },
    h('div', { class: 'brand' }, h('img', { src: 'icon-192.png', alt: '', width: 28, height: 28 }), h('b', null, 'Road to B1')),
    h('div', { class: 'row' },
      h('button', { id: 'install', class: 'btn small ghost', style: { display: 'none' }, onclick: async () => { if (installEvt) { installEvt.prompt(); installEvt = null; $('#install').style.display = 'none'; } } }, 'Installa'),
      h('button', { class: 'icon-btn', 'aria-label': 'Impostazioni', onclick: () => go('settings') }, icon('gear', 20))));
  screen = h('main', { id: 'screen' });
  nav = h('nav', { class: 'bottomnav' }, TABS.map(([t, ico, l]) => h('button', { 'data-t': t, onclick: () => go(t) }, h('span', { class: 'ico' }, icon(ico, 22)), h('small', null, l))));
  const offline = h('div', { id: 'offline', class: 'offline' }, 'Sei offline: ripasso e lettura funzionano, il resto no.');
  root.append(header, offline, screen, nav);
  const upd = () => { offline.style.display = navigator.onLine ? 'none' : 'block'; };
  window.addEventListener('online', upd); window.addEventListener('offline', upd); upd();
}

function badgeDue() {
  const n = countDue(state.cards, dayStr());
  const b = nav.querySelector('[data-t="review"]');
  let dot = b.querySelector('.dot-badge');
  if (n) { if (!dot) { dot = h('i', { class: 'dot-badge' }); b.append(dot); } dot.textContent = n > 99 ? '99+' : n; } else if (dot) dot.remove();
}

function trackTime() {
  let last = Date.now();
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => { last = Date.now(); }, { passive: true }));
  setInterval(() => { if (!document.hidden && Date.now() - last < 60000) addTime(5000); }, 5000);
}

function celebrate(list) {
  confetti(60);
  sheet(h('div', { class: 'center-col' }, list.map((a) => h('div', { class: 'achv' }, h('div', { class: 'b-ico big' }, a.icon), h('h3', null, a.title), h('p', { class: 'muted' }, a.desc)))), { title: 'Nuovo traguardo!' });
}

async function boot() {
  await initStore();
  applyAppearance();
  buildShell();
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; const b = $('#install'); if (b) b.style.display = ''; });
  bus.addEventListener('achievement', (e) => celebrate(e.detail));
  bus.addEventListener('cards', badgeDue);
  bus.addEventListener('state', badgeDue);
  trackTime();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (!getSettings().onboarded) {
    document.body.dataset.view = 'onboarding';
    showOnboarding(screen, () => { go('home'); });
  } else go('home');
  if (getSettings().onboarded) setTimeout(() => autoTutor(toast), 1500);
  setInterval(badgeDue, 60000);
  badgeDue();
  if (hasAnthropicKey() && getSettings().onboarded) prefetchNext();
  if (state.cards.length > 20 && (!state.lastBackup || (Date.now() - new Date(state.lastBackup).getTime()) > 14 * 86400000)) setTimeout(() => toast('Fai un backup dalle impostazioni, ogni tanto.'), 4000);
  window.__app = { go };
}
boot();
