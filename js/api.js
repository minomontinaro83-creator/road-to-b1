/* ============================================================
   Chiamate alle API: Anthropic (testi, tutor) e immagini senza chiave (Pollinations).
   Le risposte strutturate arrivano tramite "tool use": niente JSON scritto a mano
   dal modello, quindi niente errori di sintassi. Ogni chiamata viene ritentata
   automaticamente se il problema è temporaneo.
   ============================================================ */
import { getSettings, trackUsage } from './store.js';
import { sleep } from './util.js';

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export const hasAnthropicKey = () => !!getSettings().apiKey.trim();

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
