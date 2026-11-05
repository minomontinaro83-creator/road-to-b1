/* ============================================================
   Immagini (Pollinations, senza chiave): carte, scene, copertine.
   Tutto è salvato sul telefono: ogni immagine si paga una volta sola.
   Con tetto giornaliero e nessun errore bloccante: se manca la chiave
   l'app funziona lo stesso (disegni integrati).
   ============================================================ */
import { state, saveState, getSettings, putImage, getImage, imagesToday, countImage, emit } from './store.js';
import { pollinationsImage } from './api.js';

/** genera con il motore scelto (Pollinations non richiede chiave) */
function makeImage(o) {
  const [w, h] = String(o.size || '1024x1024').split('x').map(Number);
  return pollinationsImage({ prompt: o.prompt, width: w, height: h });
}

const urlCache = new Map();
const inflight = new Map();

/** URL temporaneo (blob:) di un'immagine salvata */
export async function imgUrl(key) {
  if (!key) return null;
  if (urlCache.has(key)) return urlCache.get(key);
  const blob = await getImage(key);
  if (!blob) return null;
  const u = URL.createObjectURL(blob);
  urlCache.set(key, u);
  return u;
}

export function dropImgUrl(key) { const u = urlCache.get(key); if (u) { URL.revokeObjectURL(u); urlCache.delete(key); } }
export const imagesEnabled = () => { const s = getSettings(); return !!s.imagesOn; };
export const capLeft = () => Math.max(0, getSettings().maxImagesPerDay - imagesToday());

const STYLE = 'Refined editorial illustration, muted natural colour palette, soft light, subtle texture, realistic proportions, calm and elegant, not cartoonish, not childish, no text, no letters, no logos, no watermark.';

function once(key, fn) {
  if (inflight.has(key)) return inflight.get(key);
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** immagine di una parola concreta (qualità bassa: costa pochissimo) */
export function generateCardImage(card) {
  const s = getSettings();
  if (!imagesEnabled() || !s.cardImages || !card || !card.visual || card.img || capLeft() <= 0) return Promise.resolve(null);
  return once('card:' + card.id, async () => {
    const r = await makeImage({
      prompt: 'A single simple, clear illustration of: "' + card.en + '". Centered on a plain soft pastel background, one object or one action only. ' + STYLE,
      size: '1024x1024', quality: s.cardImageQuality || 'low'
    });
    if (!r.ok) return null;
    const key = 'card_' + card.id;
    await putImage(key, r.blob);
    card.img = key;
    countImage();
    saveState();
    return key;
  });
}

/** illustrazione della scena dell'episodio */
export function generateSceneImage(ep, onDone) {
  const s = getSettings();
  if (!imagesEnabled() || !s.sceneImages || !ep || ep.imageKey || capLeft() <= 0 || !ep.image_prompt) return Promise.resolve(null);
  return once('scene:' + ep.id, async () => {
    const looks = (state.diary.characters || []).filter((c) => c.look_en).slice(0, 3).map((c) => c.name + ': ' + c.look_en).join('; ');
    const r = await makeImage({
      prompt: ep.image_prompt + (looks ? ' Characters: ' + looks + '.' : '') + ' ' + STYLE + ' Wide cinematic composition.',
      size: '1536x1024', quality: s.sceneImageQuality || 'medium'
    });
    if (!r.ok) return null;
    const key = 'scene_' + ep.id;
    await putImage(key, r.blob);
    ep.imageKey = key;
    countImage();
    if (onDone) await onDone(ep);
    emit('sceneImage', ep.id);
    return key;
  });
}

/** copertina di un libro (azione esplicita: non dipende dall'interruttore "immagini") */
export async function generateCoverBlob(prompt) {
  const r = await makeImage({ prompt, size: '768x1152' });
  return r;
}
