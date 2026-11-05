/* Il tutor: personaggio animato (SVG) che respira, sbatte le palpebre, parla muovendo la bocca,
   si rallegra o si rattrista, e che reagisce agli errori (scuote la testa + vibrazione).
   */
import { h, vibrate, toast } from './dom.js';
import { onSpeaking, isSpeaking } from '../tts.js';
import { state, bus, getSettings, setSettings, emit } from '../store.js';
import { avatarSVG, AVATARS, AVATAR_GROUPS } from './avatars.js';

function svgTutor() {
  const wrap = document.createElement('div');
  wrap.innerHTML = avatarSVG(getSettings().avatar, getSettings().tutorName);
  return wrap.firstElementChild;
}

/** crea il tutor. mood: neutral | happy | think | oops */
export function createTutor({ size = 120, onTap } = {}) {
  const box = h('div', { class: 'tutor', style: { width: size + 'px', height: size + 'px' } });
  let mood = 'neutral', open = false, timer = null, talkTimer = null, svg = null;

  async function build() {
    box.textContent = '';
    svg = svgTutor(); box.append(svg);
    render();
  }

  function render() {
    if (svg) {
      const want = open ? (open === 2 ? 'm-happy' : 'm-open') : mood === 'happy' ? 'm-happy' : mood === 'think' ? 'm-think' : mood === 'oops' ? 'm-oops' : 'm-closed';
      svg.querySelectorAll('.m').forEach((m) => { m.style.display = m.classList.contains(want) ? '' : 'none'; });
      const br = svg.querySelector('.brow');
      if (br) br.setAttribute('transform', mood === 'think' ? 'translate(0,-4)' : mood === 'happy' ? 'translate(0,-2)' : mood === 'oops' ? 'translate(0,3)' : '');
    }
    if (svg) { svg.classList.toggle('nodding', mood === 'happy' && !open); svg.classList.toggle('displeased', mood === 'oops'); }
    box.classList.toggle('talking', !!open);
  }

  function setSpeaking(on) {
    clearInterval(timer);
    if (on) {
      timer = setInterval(() => { const r = Math.random(); open = r < 0.18 ? false : r < 0.42 ? 2 : 1; render(); }, 130);
      open = 1; render();
    } else { open = false; render(); }
  }

  const off = onSpeaking(setSpeaking);
  const onImgs = () => build();
  bus.addEventListener('tutorImgs', onImgs);
  bus.addEventListener('avatar', onImgs);
  const mo = new MutationObserver(() => {
    if (!document.body.contains(box)) { off(); clearInterval(timer); clearTimeout(talkTimer); bus.removeEventListener('tutorImgs', onImgs); bus.removeEventListener('avatar', onImgs); mo.disconnect(); }
  });
  mo.observe(document.body, { childList: true, subtree: true });
  if (onTap) { box.classList.add('tappable'); box.addEventListener('click', onTap); }

  build().then(() => { if (isSpeaking()) setSpeaking(true); });
  const api = {
    el: box,
    setMood(m) { mood = m || 'neutral'; render(); },
    /** festeggia: saltello + sorriso */
    cheer() { mood = 'happy'; render(); box.classList.remove('bounce', 'shake'); void box.offsetWidth; box.classList.add('bounce'); },
    /** errore: faccia dispiaciuta, scossa della testa, vibrazione forte */
    oops({ buzz = true } = {}) { mood = 'oops'; render(); box.classList.remove('bounce', 'shake'); void box.offsetWidth; box.classList.add('shake'); if (buzz) vibrate('bad'); setTimeout(() => { if (mood === 'oops') { mood = 'neutral'; render(); } }, 3500); },
    /** parla (muove la bocca) per il tempo che serve a leggere il testo, senza audio */
    talkText(text) {
      clearTimeout(talkTimer);
      const ms = Math.min(9000, 500 + String(text || '').length * 45);
      if (!isSpeaking()) setSpeaking(true);
      talkTimer = setTimeout(() => { if (!isSpeaking()) setSpeaking(false); }, ms);
    }
  };
  return api;
}

export function bubble(...kids) {
  return h('div', { class: 'bubble' }, kids);
}

/** griglia per scegliere il tutor, divisa per tipo */
export function avatarPicker(onPick) {
  const wrap = h('div', { class: 'stack' });
  const draw = () => {
    wrap.textContent = '';
    AVATAR_GROUPS.forEach((g) => {
      const list = AVATARS.filter((a) => a.group === g);
      if (!list.length) return;
      const grid = h('div', { class: 'avatar-grid' });
      list.forEach((a) => {
        const thumb = h('div', { class: 'av-thumb' });
        thumb.innerHTML = avatarSVG(a.id, getSettings().tutorName);
        grid.append(h('button', { class: 'av' + (getSettings().avatar === a.id ? ' on' : ''), type: 'button', 'aria-label': a.name, onclick: () => {
          setSettings({ avatar: a.id, tutorName: a.kind === 'mono' ? getSettings().tutorName : ({ gufo: 'Gufo', fox: 'Fox', bit: 'Bit', cosmo: 'Cosmo', orso: 'Bruno' })[a.id] || a.name });
          emit('avatar'); draw(); if (onPick) onPick(a);
        } }, thumb, h('small', null, a.name)));
      });
      wrap.append(h('div', { class: 'f-label' }, g), grid);
    });
  };
  draw();
  return wrap;
}
