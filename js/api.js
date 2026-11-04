/* ============================================================
   Chiamate alle API: Anthropic (testi, tutor) e OpenAI (immagini).
   Le risposte strutturate arrivano tramite "tool use": niente JSON scritto a mano
   dal modello, quindi niente errori di sintassi. Ogni chiamata viene ritentata
   automaticamente se il problema è temporaneo.
   ============================================================ */
import { getSettings, trackUsage } from './store.js';
import { sleep } from './util.js';

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const OPENAI_BASE = 'https://api.openai.com/v1';

export const hasAnthropicKey = () => !!getSettings().apiKey.trim();
export const hasOpenAIKey = () => !!getSettings().openaiKey.trim();
export const hasGeminiKey = () => !!(getSettings().geminiKey || '').trim();

async function fetchTimeout(url, opts, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, Object.assign({}, opts, { signal: ctl.signal })); }
  finally { clearTimeout(t); }
}

/** a volte il modello passa array/oggetti come stringa JSON dentro il tool: li ripristina */
export function coerceStructured(v) {
  if (typeof v === 'string') {
    const t = v.trim();
    if ((t[0] === '[' && t[t.length - 1] === ']') || (t[0] === '{' && t[t.length - 1] === '}')) {
      try { return coerceStructured(JSON.parse(t)); } catch (e) { return v; }
    }
    return v;
  }
  if (Array.isArray(v)) return v.map(coerceStructured);
  if (v && typeof v === 'object') {
    const o = {};
    Object.keys(v).forEach((k) => { o[k] = coerceStructured(v[k]); });
    return o;
  }
  return v;
}

/** una sola richiesta HTTP all'API Anthropic */
export async function claudeRaw(body, timeoutMs = 120000) {
  const key = getSettings().apiKey.trim();
  if (!key) return { ok: false, status: 0, error: 'Manca la chiave API Anthropic: inseriscila nelle impostazioni.' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, status: 0, retryable: false, error: 'Sei offline: questa funzione richiede la connessione a internet.' };
  let res, data;
  try {
    res = await fetchTimeout(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(body)
    }, timeoutMs);
  } catch (e) {
    return { ok: false, status: 0, retryable: true, error: e && e.name === 'AbortError' ? 'La richiesta ha impiegato troppo tempo.' : 'Errore di connessione.' };
  }
  try { data = await res.json(); } catch (e) {
    return { ok: false, status: res.status, retryable: res.status >= 500, error: 'Risposta del server non leggibile (HTTP ' + res.status + ').' };
  }
  if (!res.ok || (data && data.error)) {
    const msg = data && data.error && data.error.message ? data.error.message : 'HTTP ' + res.status;
    if (res.status === 401) return { ok: false, status: 401, error: 'Chiave API non valida: controllala nelle impostazioni.' };
    if (res.status === 404) return { ok: false, status: 404, error: 'Modello non trovato (' + body.model + '). Controlla il nome nelle impostazioni. ' + msg };
    const retryable = res.status === 429 || res.status === 529 || res.status >= 500;
    return { ok: false, status: res.status, retryable, error: res.status === 429 ? 'Troppe richieste in poco tempo: riprovo.' : msg };
  }
  if (data.usage) trackUsage({ in: data.usage.input_tokens || 0, out: data.usage.output_tokens || 0, calls: 1 });
  return { ok: true, data };
}

/**
 * Chiede al modello di compilare uno strumento (risposta strutturata).
 * @param {object} o  {model, system, messages, tool, maxTokens, timeoutMs, retries, validate}
 * @returns {{ok:true,input:object}|{ok:false,error:string}}
 */
export async function claudeTool(o) {
  const retries = o.retries == null ? 2 : o.retries;
  let maxTokens = o.maxTokens || 2000;
  let lastError = 'Errore sconosciuto.';
  for (let attempt = 0; attempt <= retries; attempt++) {
    const r = await claudeRaw({
      model: o.model || getSettings().textModel,
      max_tokens: maxTokens,
      system: o.system,
      messages: o.messages,
      tools: o.search ? [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }, o.tool] : [o.tool],
      tool_choice: o.search ? { type: 'auto' } : { type: 'tool', name: o.tool.name }
    }, o.timeoutMs || 120000);
    if (!r.ok) {
      lastError = r.error;
      if (!r.retryable || attempt === retries) return { ok: false, error: lastError, status: r.status };
      await sleep(1500 * (attempt + 1) * (attempt + 1));
      continue;
    }
    const block = (r.data.content || []).find((b) => b.type === 'tool_use' && b.name === o.tool.name);
    if (r.data.stop_reason === 'max_tokens') {
      lastError = 'La risposta è stata troncata.';
      maxTokens = Math.min(Math.round(maxTokens * 1.6), 16000);
      continue;
    }
    if (!block || !block.input) { lastError = 'Risposta senza contenuto strutturato.'; continue; }
    const input = coerceStructured(block.input);
    if (o.validate) {
      const problem = o.validate(input);
      if (problem) { lastError = problem; continue; }
    }
    return { ok: true, input };
  }
  return { ok: false, error: lastError };
}

/** richiesta semplice di testo (per il test della connessione) */
export async function claudeText(model, system, user, maxTokens = 200) {
  const r = await claudeRaw({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }, 45000);
  if (!r.ok) return r;
  return { ok: true, text: (r.data.content || []).map((b) => b.text || '').join('') };
}

export async function testAnthropic(model) {
  const t0 = Date.now();
  const r = await claudeText(model, 'Reply with the single word OK.', 'ping', 20);
  return r.ok ? { ok: true, ms: Date.now() - t0 } : r;
}

/* ============================ OpenAI: immagini ============================ */
function b64ToBlob(b64, type) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

async function openaiJson(res) {
  let data = null;
  try { data = await res.json(); } catch (e) { /* ignora */ }
  return data;
}

/**
 * Genera (o modifica partendo da una immagine di riferimento) un'immagine con OpenAI.
 * Prova prima con i parametri ottimali (webp compresso, sfondo trasparente se richiesto)
 * e, se il modello li rifiuta, ritenta con i parametri minimi.
 * @returns {{ok:true,blob:Blob}|{ok:false,error:string}}
 */
export async function openaiImage(o) {
  const key = getSettings().openaiKey.trim();
  if (!key) return { ok: false, error: 'Manca la chiave OpenAI nelle impostazioni.' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, error: 'Sei offline.' };
  const attempts = [
    { output_format: 'webp', output_compression: 85, ...(o.transparent ? { background: 'transparent' } : {}) },
    {}
  ];
  let lastError = 'Errore sconosciuto.';
  for (const extra of attempts) {
    let res;
    try {
      if (o.ref) {
        const fd = new FormData();
        fd.append('model', o.model);
        fd.append('prompt', o.prompt);
        fd.append('size', o.size || '1024x1024');
        fd.append('quality', o.quality || 'medium');
        fd.append('n', '1');
        Object.keys(extra).forEach((k) => fd.append(k, String(extra[k])));
        fd.append('image', o.ref, 'reference.png');
        res = await fetchTimeout(OPENAI_BASE + '/images/edits', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: fd }, 180000);
      } else {
        res = await fetchTimeout(OPENAI_BASE + '/images/generations', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({ model: o.model, prompt: o.prompt, size: o.size || '1024x1024', quality: o.quality || 'medium', n: 1 }, extra))
        }, 180000);
      }
    } catch (e) {
      return { ok: false, error: e && e.name === 'AbortError' ? 'Generazione troppo lenta.' : 'Errore di connessione.' };
    }
    const data = await openaiJson(res);
    if (res.ok && data && data.data && data.data[0] && data.data[0].b64_json) {
      const fmt = data.output_format || (extra.output_format || 'png');
      return { ok: true, blob: b64ToBlob(data.data[0].b64_json, 'image/' + fmt) };
    }
    lastError = (data && data.error && data.error.message) || ('HTTP ' + res.status);
    if (res.status === 401) return { ok: false, error: 'Chiave OpenAI non valida.' };
    if (res.status === 429) return { ok: false, error: 'OpenAI: troppe richieste o credito esaurito. ' + lastError };
    if (res.status === 404) return { ok: false, error: 'Modello immagini non trovato (' + o.model + '). ' + lastError };
    if (res.status !== 400) break; // solo gli errori 400 (parametri non accettati) si ritentano in versione minima
  }
  return { ok: false, error: lastError };
}

export async function testOpenAI(model) {
  const key = getSettings().openaiKey.trim();
  if (!key) return { ok: false, error: 'Manca la chiave OpenAI.' };
  try {
    const res = await fetchTimeout(OPENAI_BASE + '/models/' + encodeURIComponent(model), { headers: { Authorization: 'Bearer ' + key } }, 20000);
    if (res.ok) return { ok: true };
    const d = await openaiJson(res);
    return { ok: false, error: res.status === 401 ? 'Chiave OpenAI non valida.' : ((d && d.error && d.error.message) || 'HTTP ' + res.status) };
  } catch (e) {
    return { ok: false, error: 'Errore di connessione.' };
  }
}

/* ====================== Pollinations: immagini senza account ======================
   Richiesta GET semplice, nessuna chiave. Senza chiave: una richiesta ogni ~16 secondi,
   quindi le richieste vengono messe in coda. Se si inserisce una chiave si usa quella. */
let polChain = Promise.resolve();
let polLast = 0;
export function pollinationsImage(o) {
  const run = async () => {
    const key = (getSettings().pollinationsKey || '').trim();
    const gap = key ? 1500 : 16500;
    const wait = polLast + gap - Date.now();
    if (wait > 0) await sleep(wait);
    polLast = Date.now();
    const w = o.width || 1024, h = o.height || 1024;
    const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(o.prompt) + '?width=' + w + '&height=' + h + '&nologo=true&model=flux&seed=' + Math.floor(Math.random() * 1e6) + (key ? '&token=' + encodeURIComponent(key) : '');
    try {
      const res = await fetchTimeout(url, key ? { headers: { Authorization: 'Bearer ' + key } } : {}, 90000);
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.startsWith('image/')) return { ok: false, error: 'Pollinations non ha risposto con un\'immagine (HTTP ' + res.status + ').' };
      return { ok: true, blob: await res.blob() };
    } catch (e) {
      return { ok: false, error: e && e.name === 'AbortError' ? 'Pollinations troppo lento.' : 'Pollinations non raggiungibile (rete o blocco del browser).' };
    }
  };
  const p = polChain.then(run, run);
  polChain = p.catch(() => {});
  return p;
}

/* ====================== Gemini: immagini (Google AI Studio, chiave gratuita) ====================== */
export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
function b64Blob(b64, type) {
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: type || 'image/png' });
}
export async function geminiImage(o) {
  const s = getSettings();
  const key = (s.geminiKey || '').trim();
  if (!key) return { ok: false, error: 'Manca la chiave Gemini.' };
  const model = (s.geminiModel || 'gemini-2.5-flash-image').trim();
  try {
    const res = await fetchTimeout(GEMINI_BASE + '/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts: (o.ref ? [{ inlineData: { mimeType: o.ref.type || 'image/png', data: await blobToB64(o.ref) } }] : []).concat([{ text: o.prompt }]) }] })
    }, 90000);
    const d = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: res.status === 400 || res.status === 403 ? 'Chiave Gemini non valida o non abilitata.' : res.status === 429 ? 'Gemini: limite giornaliero raggiunto.' : ((d && d.error && d.error.message) || 'Gemini HTTP ' + res.status) };
    const parts = (((d.candidates || [])[0] || {}).content || {}).parts || [];
    const img = parts.map((p) => p.inlineData || p.inline_data).find(Boolean);
    if (!img || !img.data) return { ok: false, error: 'Gemini non ha restituito un\'immagine.' };
    return { ok: true, blob: b64Blob(img.data, img.mimeType || img.mime_type) };
  } catch (e) {
    return { ok: false, error: e && e.name === 'AbortError' ? 'Gemini troppo lento.' : 'Gemini non raggiungibile.' };
  }
}
export async function testGemini() {
  const s = getSettings();
  const key = (s.geminiKey || '').trim();
  if (!key) return { ok: false, error: 'Manca la chiave Gemini.' };
  try {
    const res = await fetchTimeout(GEMINI_BASE + '/models?pageSize=1', { headers: { 'x-goog-api-key': key } }, 20000);
    if (res.ok) return { ok: true };
    return { ok: false, error: res.status === 400 || res.status === 403 ? 'Chiave Gemini non valida.' : 'HTTP ' + res.status };
  } catch (e) { return { ok: false, error: 'Errore di connessione.' }; }
}

/* ====================== Gemini Veo: brevi video del tutor (a pagamento, NON verificato) ======================
   Operazione lunga: si avvia, si interroga finché è pronta, poi si scarica il file. */
function blobToB64(blob) {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.onerror = reject; r.readAsDataURL(blob); });
}
export async function veoVideo({ prompt, image, onStatus }) {
  const s = getSettings();
  const key = (s.geminiKey || '').trim();
  if (!key) return { ok: false, error: 'Manca la chiave Gemini.' };
  const model = (s.veoModel || 'veo-3.0-fast-generate-001').trim();
  const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': key };
  const inst = { prompt };
  if (image) inst.image = { bytesBase64Encoded: await blobToB64(image), mimeType: image.type || 'image/png' };
  try {
    let res = await fetchTimeout(GEMINI_BASE + '/models/' + encodeURIComponent(model) + ':predictLongRunning', { method: 'POST', headers, body: JSON.stringify({ instances: [inst], parameters: { aspectRatio: '16:9' } }) }, 60000);
    let d = await res.json().catch(() => null);
    if (!res.ok && image) { // alcuni modelli non accettano l'immagine: ritenta solo col testo
      delete inst.image;
      res = await fetchTimeout(GEMINI_BASE + '/models/' + encodeURIComponent(model) + ':predictLongRunning', { method: 'POST', headers, body: JSON.stringify({ instances: [inst], parameters: { aspectRatio: '16:9' } }) }, 60000);
      d = await res.json().catch(() => null);
    }
    if (!res.ok) return { ok: false, error: (d && d.error && d.error.message) || 'Veo HTTP ' + res.status };
    const op = d.name;
    for (let i = 0; i < 60; i++) {
      await sleep(10000);
      if (onStatus) onStatus(i * 10);
      const pr = await fetchTimeout(GEMINI_BASE + '/' + op, { headers: { 'x-goog-api-key': key } }, 30000);
      const pd = await pr.json().catch(() => null);
      if (!pr.ok) return { ok: false, error: (pd && pd.error && pd.error.message) || 'Veo HTTP ' + pr.status };
      if (pd && pd.done) {
        if (pd.error) return { ok: false, error: pd.error.message || 'Veo ha rifiutato la richiesta.' };
        const vids = (pd.response && pd.response.generateVideoResponse && pd.response.generateVideoResponse.generatedSamples) || (pd.response && pd.response.videos) || [];
        const uri = vids[0] && ((vids[0].video && vids[0].video.uri) || vids[0].uri);
        if (!uri) return { ok: false, error: 'Veo non ha restituito un video (forse bloccato dai filtri).' };
        const vr = await fetchTimeout(uri, { headers: { 'x-goog-api-key': key } }, 120000);
        if (!vr.ok) return { ok: false, error: 'Download del video non riuscito (HTTP ' + vr.status + ').' };
        return { ok: true, blob: await vr.blob() };
      }
    }
    return { ok: false, error: 'Veo ci mette troppo: riprova più tardi.' };
  } catch (e) {
    return { ok: false, error: e && e.name === 'AbortError' ? 'Veo troppo lento.' : 'Veo non raggiungibile.' };
  }
}
