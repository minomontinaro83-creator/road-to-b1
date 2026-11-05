/* ============================================================
   Voce: legge parole, frasi e scene intere in inglese (americano o britannico).
   Tre motori:
   - "naturale": voce neurale scaricata da Pollinations (più umana; richiede internet; NON verificata sul campo)
   - "dispositivo": la sintesi vocale del telefono (gratuita, funziona anche offline)
   - "online": voce scaricata da Google Translate (ripiego se la prima non parte)
   In modalità automatica usa la voce del dispositivo e passa da sola a quella online
   se la prima resta muta. Notifica anche quando sta parlando, per animare il tutor.
   ============================================================ */
import { getSettings } from './store.js';

let reqId = 0;
let speaking = false;
let cancelFn = null;
let audioEl = null;
let currentUtterance = null; // riferimento persistente: Chrome altrimenti "perde" l'utterance
const listeners = new Set();
const DEVICE_FAILED_KEY = 'rtb1_tts_device_failed';

function setSpeaking(v) {
  if (speaking === v) return;
  speaking = v;
  listeners.forEach((cb) => { try { cb(v); } catch (e) { /* ignora */ } });
}
export const isSpeaking = () => speaking;
export function onSpeaking(cb) { listeners.add(cb); return () => listeners.delete(cb); }

const lang = () => (getSettings().accent === 'uk' ? 'en-GB' : 'en-US');
const deviceAvailable = () => typeof window !== 'undefined' && !!window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined';
const deviceMarkedFailed = () => { try { return localStorage.getItem(DEVICE_FAILED_KEY) === '1'; } catch (e) { return false; } };
export function resetTtsFailure() { try { localStorage.removeItem(DEVICE_FAILED_KEY); } catch (e) { /* ignora */ } }
const isFirefoxAndroid = () => /Android/i.test(navigator.userAgent || '') && /Firefox\//i.test(navigator.userAgent || '');

const NAT_FAIL_KEY = 'rtb1_tts_natural_failed';
const naturalFailed = () => { try { return Number(sessionStorage.getItem(NAT_FAIL_KEY) || 0) >= 2; } catch (e) { return false; } };
const noteNatural = (ok) => { try { sessionStorage.setItem(NAT_FAIL_KEY, ok ? '0' : String(Number(sessionStorage.getItem(NAT_FAIL_KEY) || 0) + 1)); } catch (e) { /* ignora */ } };
export function resetNaturalFailure() { try { sessionStorage.removeItem(NAT_FAIL_KEY); } catch (e) { /* ignora */ } }
const wantsNatural = () => getSettings().ttsEngine === 'natural' && !naturalFailed() && (typeof navigator === 'undefined' || navigator.onLine !== false);

function preferOnline() {
  const eng = getSettings().ttsEngine;
  if (eng === 'online') return true;
  if (eng === 'device') return false;
  return isFirefoxAndroid() || !deviceAvailable() || deviceMarkedFailed();
}

/** divide il testo in pezzi brevi (le sintesi lunghe si interrompono su alcuni telefoni) */
export function splitTtsText(text, maxLen = 180) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [clean];
  const chunks = [];
  let buf = '';
  for (let s of sentences) {
    s = s.trim();
    if (!s) continue;
    if ((buf + ' ' + s).trim().length <= maxLen) { buf = (buf + ' ' + s).trim(); continue; }
    if (buf) chunks.push(buf);
    if (s.length > maxLen) {
      let part = '';
      for (const w of s.split(/\s+/)) {
        if ((part + ' ' + w).trim().length <= maxLen) part = (part + ' ' + w).trim();
        else { if (part) chunks.push(part); part = w; }
      }
      buf = part;
    } else buf = s;
  }
  if (buf) chunks.push(buf);
  return chunks;
}

/* ---------- voci del dispositivo ---------- */
export function getVoices() {
  return new Promise((resolve) => {
    if (!deviceAvailable()) return resolve([]);
    const v = speechSynthesis.getVoices();
    if (v && v.length) return resolve(v);
    let done = false;
    const fin = () => { if (done) return; done = true; resolve(speechSynthesis.getVoices() || []); };
    try { speechSynthesis.addEventListener('voiceschanged', fin, { once: true }); } catch (e) { /* ignora */ }
    setTimeout(fin, 900);
  });
}
export async function englishVoices() {
  return (await getVoices()).filter((v) => /^en[-_]/i.test(v.lang));
}
/** punteggio di qualità presunta: voci di rete / neurali prima, voci "compatte" locali per ultime */
export function voiceScore(v) {
  let sc = 0;
  if (/natural|neural|premium|enhanced|wavenet|studio/i.test(v.name)) sc += 6;
  if (/google/i.test(v.name)) sc += 3;
  if (v.localService === false) sc += 4;
  if (/network|-network|#.*network/i.test(v.name + v.voiceURI)) sc += 3;
  if (/compact|espeak|default/i.test(v.name + v.voiceURI)) sc -= 4;
  return sc;
}
export const rankVoices = (vs) => vs.slice().sort((a, b) => voiceScore(b) - voiceScore(a));
function pickVoice(voices) {
  const s = getSettings();
  if (s.voiceURI) {
    const chosen = voices.find((v) => v.voiceURI === s.voiceURI);
    if (chosen) return chosen;
  }
  const want = lang().toLowerCase().replace('_', '-');
  const ranked = rankVoices(voices.filter((v) => v.lang.toLowerCase().replace('_', '-') === want));
  if (ranked.length) return ranked[0];
  return voices.find((v) => v.lang.toLowerCase().replace('_', '-') === want && /google|natural|enhanced|premium/i.test(v.name))
    || voices.find((v) => v.lang.toLowerCase().replace('_', '-') === want)
    || voices.find((v) => /^en/i.test(v.lang)) || null;
}

/* ---------- posizione della parola letta ---------- */
/** segue l'audio (che non dà eventi di parola) stimando la posizione dal tempo trascorso */
function trackAudio(a, len, onPos) {
  if (!onPos) return () => {};
  const t = setInterval(() => {
    const d = a.duration;
    if (!d || !isFinite(d) || a.paused) return;
    onPos(Math.min(len - 1, Math.floor((a.currentTime / d) * len)));
  }, 70);
  return () => clearInterval(t);
}

/* ---------- motori ---------- */
function deviceChunk(text, rate, id, voices, onPos) {
  return new Promise((resolve, reject) => {
    const u = new SpeechSynthesisUtterance(text);
    currentUtterance = u;
    u.lang = lang();
    u.rate = rate;
    u.pitch = getSettings().ttsPitch || 1;
    const v = pickVoice(voices);
    if (v) u.voice = v;
    let started = false, finished = false, timer = null, est = null, gotB = false;
    const end = (fn) => { if (finished) return; finished = true; clearTimeout(timer); clearInterval(est); cancelFn = null; fn(); };
    if (onPos) u.onboundary = (ev) => { if (ev && ev.name && ev.name !== 'word') return; gotB = true; onPos(ev.charIndex || 0); };
    cancelFn = () => { end(() => resolve()); try { speechSynthesis.cancel(); } catch (e) { /* ignora */ } };
    u.onstart = () => {
      started = true; if (id === reqId) setSpeaking(true);
      if (onPos) { const t0 = Date.now(); est = setInterval(() => { if (gotB) return; onPos(Math.min(text.length - 1, Math.floor(((Date.now() - t0) / 1000) * 13 * rate))); }, 120); }
    };
    u.onend = () => end(resolve);
    u.onerror = (ev) => {
      if (ev && (ev.error === 'interrupted' || ev.error === 'canceled')) end(resolve);
      else end(() => reject(new Error('device-error')));
    };
    try { speechSynthesis.speak(u); } catch (e) { end(() => reject(new Error('device-exception'))); return; }
    timer = setTimeout(() => { if (!started && !speechSynthesis.speaking) end(() => reject(new Error('device-silent'))); }, 3500);
  });
}

function onlineUrl(text) {
  const tl = getSettings().accent === 'uk' ? 'en-GB' : 'en';
  return 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=' + tl + '&q=' + encodeURIComponent(text);
}
function getAudio() {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = 'auto';
    try { audioEl.referrerPolicy = 'no-referrer'; } catch (e) { /* ignora */ }
  }
  return audioEl;
}
function onlineChunk(text, rate, id, onPos) {
  return new Promise((resolve, reject) => {
    const a = getAudio();
    let finished = false, stopT = () => {};
    const end = (fn) => { if (finished) return; finished = true; stopT(); cancelFn = null; a.onended = a.onerror = a.onplay = null; fn(); };
    cancelFn = () => { end(() => resolve()); try { a.pause(); } catch (e) { /* ignora */ } };
    a.onplay = () => { if (id === reqId) setSpeaking(true); stopT(); stopT = trackAudio(a, text.length, onPos); };
    a.onended = () => end(resolve);
    a.onerror = () => end(() => reject(new Error('online-error')));
    a.src = onlineUrl(text);
    try { a.defaultPlaybackRate = rate; a.playbackRate = rate; } catch (e) { /* ignora */ }
    const p = a.play();
    if (p && p.catch) p.catch(() => end(() => reject(new Error('online-blocked'))));
  });
}

/* ---------- voce naturale (Pollinations) ---------- */
const natCache = new Map(); // testo → Promise<url blob>
export const NATURAL_VOICES = [['nova', 'Nova (femminile, calda)'], ['shimmer', 'Shimmer (femminile, morbida)'], ['alloy', 'Alloy (neutra)'], ['echo', 'Echo (maschile)'], ['onyx', 'Onyx (maschile, profonda)'], ['fable', 'Fable (britannica)']];
function naturalGet(text) {
  const key = getSettings().naturalVoice + '|' + text;
  if (natCache.has(key)) return natCache.get(key);
  const url = 'https://text.pollinations.ai/' + encodeURIComponent(text) + '?model=openai-audio&voice=' + encodeURIComponent(getSettings().naturalVoice || 'nova');
  const p = (async () => {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 25000);
    try {
      const res = await fetch(url, { signal: ctl.signal });
      if (!res.ok) throw new Error('natural-http-' + res.status);
      const b = await res.blob();
      if (!/audio/i.test(b.type) || b.size < 1500) throw new Error('natural-bad-audio');
      return URL.createObjectURL(b);
    } finally { clearTimeout(to); }
  })();
  natCache.set(key, p);
  p.catch(() => natCache.delete(key));
  if (natCache.size > 80) { const first = natCache.keys().next().value; const old = natCache.get(first); natCache.delete(first); old.then((u) => URL.revokeObjectURL(u)).catch(() => {}); }
  return p;
}
/** scarica in anticipo la frase successiva, così non c'è pausa */
export function prefetchSpeech(text) {
  if (!wantsNatural()) return;
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t) naturalGet(t).catch(() => {});
}
function naturalChunk(text, rate, id, onPos) {
  return new Promise((resolve, reject) => {
    naturalGet(text).then((u) => {
      if (id !== reqId) return resolve();
      const a = getAudio();
      let finished = false, stopT = () => {};
      const end = (fn) => { if (finished) return; finished = true; stopT(); cancelFn = null; a.onended = a.onerror = a.onplay = null; fn(); };
      cancelFn = () => { end(() => resolve()); try { a.pause(); } catch (e) { /* ignora */ } };
      a.onplay = () => { if (id === reqId) setSpeaking(true); stopT(); stopT = trackAudio(a, text.length, onPos); };
      a.onended = () => end(resolve);
      a.onerror = () => end(() => reject(new Error('natural-play-error')));
      a.src = u;
      try { a.defaultPlaybackRate = rate; a.playbackRate = rate; } catch (e) { /* ignora */ }
      const p = a.play();
      if (p && p.catch) p.catch(() => end(() => reject(new Error('natural-blocked'))));
    }).catch((e) => reject(e));
  });
}

export function stopSpeech() {
  reqId++;
  if (cancelFn) { try { cancelFn(); } catch (e) { /* ignora */ } }
  if (deviceAvailable()) { try { speechSynthesis.cancel(); } catch (e) { /* ignora */ } }
  if (audioEl) { try { audioEl.pause(); } catch (e) { /* ignora */ } }
  currentUtterance = null;
  setSpeaking(false);
}

/**
 * Legge un testo ad alta voce. Si risolve quando ha finito, quando viene interrotto
 * o quando non riesce a parlare.
 * @returns {Promise<{ok:boolean, cancelled?:boolean, error?:string}>}
 */
export async function speak(text, opts = {}) {
  stopSpeech();
  const id = ++reqId;
  const clean = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return { ok: true };
  const rate = opts.rate || getSettings().ttsRate || 0.9;
  const eng = getSettings().ttsEngine;
  let mode = wantsNatural() ? 'natural' : preferOnline() ? 'online' : 'device';
  const chunks = splitTtsText(clean, mode === 'natural' ? 260 : mode === 'online' ? 180 : 200);
  let voices = mode === 'device' ? await getVoices() : [];
  const offs = []; let cur = 0;
  chunks.forEach((c) => { const k = clean.indexOf(c, cur); offs.push(k < 0 ? cur : k); cur = (k < 0 ? cur : k) + c.length; });
  const posFor = (n) => (opts.onWord ? (p) => { if (id === reqId) opts.onWord(offs[n] + p); } : null);
  let i = 0;
  while (i < chunks.length) {
    if (id !== reqId) return { ok: true, cancelled: true };
    try {
      if (mode === 'natural') {
        if (chunks[i + 1]) naturalGet(chunks[i + 1]).catch(() => {});
        await naturalChunk(chunks[i], rate, id, posFor(i));
        noteNatural(true);
      } else if (mode === 'device') await deviceChunk(chunks[i], rate, id, voices, posFor(i));
      else {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('offline');
        await onlineChunk(chunks[i], rate, id, posFor(i));
      }
      i++;
    } catch (e) {
      if (id !== reqId) return { ok: true, cancelled: true };
      if (mode === 'natural') {
        noteNatural(false);
        mode = deviceAvailable() && !deviceMarkedFailed() ? 'device' : 'online';
        if (mode === 'device') voices = await getVoices();
        continue; // ritenta lo stesso pezzo con un altro motore
      }
      if (mode === 'device' && (eng === 'auto' || eng === 'natural') && navigator.onLine !== false) {
        try { localStorage.setItem(DEVICE_FAILED_KEY, '1'); } catch (er) { /* ignora */ }
        try { speechSynthesis.cancel(); } catch (er) { /* ignora */ }
        mode = 'online'; // ritenta lo stesso pezzo con la voce online
        continue;
      }
      setSpeaking(false);
      return { ok: false, error: e.message };
    }
  }
  if (id === reqId) setSpeaking(false);
  return { ok: true };
}

/** messaggio da mostrare quando la voce non parte */
export const TTS_HELP = 'Non riesco a riprodurre la voce. Controlla il volume multimediale e, se serve, cambia motore o voce nelle impostazioni (Voce).';
