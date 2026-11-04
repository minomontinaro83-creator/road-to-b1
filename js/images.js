/* ============================================================
   Immagini OpenAI: carte (economiche, una volta sola), scene, tutor.
   Tutto è salvato sul telefono: ogni immagine si paga una volta sola.
   Con tetto giornaliero e nessun errore bloccante: se manca la chiave
   l'app funziona lo stesso (disegni integrati).
   ============================================================ */
import { state, saveState, getSettings, putImage, getImage, imagesToday, countImage, emit } from './store.js';
import { openaiImage, hasOpenAIKey, pollinationsImage, geminiImage, hasGeminiKey, veoVideo } from './api.js';

/** genera con il motore scelto (Pollinations non richiede chiave) */
function makeImage(o) {
  const eng = getSettings().imageEngine;
  if (eng === 'openai') return openaiImage(o);
  if (eng === 'gemini') return geminiImage({ prompt: o.prompt });
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
export const imagesEnabled = () => { const s = getSettings(); return s.imagesOn && (s.imageEngine === 'openai' ? hasOpenAIKey() : s.imageEngine === 'gemini' ? hasGeminiKey() : true); };
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
      model: s.imageModelCard,
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
      model: s.imageModelScene,
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
  const eng = getSettings().imageEngine;
  const size = eng === 'openai' ? '1024x1536' : '768x1152';
  const r = await makeImage({ model: getSettings().imageModelScene, prompt, size, quality: 'medium' });
  return r;
}

/* ---------------------------- tutor ---------------------------- */
export const TUTOR_EXPRESSIONS = [
  { id: 'closed', label: 'Bocca chiusa', extra: '', base: true },
  { id: 'open', label: 'Bocca aperta', extra: 'Same character, same pose, same outfit, same background, but the mouth is open as if speaking. Change nothing else.' },
  { id: 'happy', label: 'Contento', extra: 'Same character, same outfit, same background, but a big happy smile and cheerful eyes, mouth closed. Change nothing else.' },
  { id: 'think', label: 'Pensieroso', extra: 'Same character, same outfit, same background, but a thoughtful expression, one eyebrow raised, looking slightly up. Change nothing else.' }
];

export function tutorBasePrompt() {
  const s = getSettings();
  const look = s.tutorLook && s.tutorLook.trim() ? s.tutorLook.trim() : 'a friendly English teacher in his fifties with short grey hair, rectangular glasses, a navy jacket over a white shirt, warm and attentive expression';
  const style = s.tutorStyle === 'cartoon' ? 'Charming 3D animated-film character, expressive big eyes, soft studio lighting, appealing and funny, high detail, no text.' : s.tutorStyle === 'photo' ? 'Natural photographic portrait, 85mm lens, soft window light, shallow depth of field, realistic skin texture, no text.' : STYLE;
  return 'Portrait of ' + look + '. Bust shot facing the viewer, centered, mouth closed with a gentle smile, plain neutral light-grey background. ' + style;
}

/** crea il set di immagini del tutor (4 espressioni, qualità alta): azione esplicita dell'utente */
export async function generateTutorSet(onProgress) {
  const s = getSettings();
  if (!hasOpenAIKey()) return { ok: false, error: 'Inserisci la chiave OpenAI nelle impostazioni.' };
  const set = {};
  let ref = null;
  for (let i = 0; i < TUTOR_EXPRESSIONS.length; i++) {
    const ex = TUTOR_EXPRESSIONS[i];
    if (onProgress) onProgress(i, TUTOR_EXPRESSIONS.length, ex.label);
    const r = await openaiImage({
      model: s.imageModelTutor,
      prompt: ex.base ? tutorBasePrompt() : ex.extra + ' ' + (s.tutorStyle === 'photo' ? 'Natural photographic portrait, same lighting.' : STYLE),
      size: '1024x1024', quality: 'high', ref: ex.base ? null : ref
    });
    if (!r.ok) return { ok: false, error: r.error, partial: set };
    const key = 'tutor_' + ex.id + '_' + Date.now().toString(36);
    await putImage(key, r.blob);
    set[ex.id] = key;
    if (ex.base) ref = r.blob;
    countImage();
  }
  state.tutorImgs = set;
  saveState();
  emit('tutorImgs');
  return { ok: true, set };
}

export function clearTutorSet() {
  state.tutorImgs = null;
  saveState();
  emit('tutorImgs');
}

/* ---------------------------- video del tutor (Gemini Veo) ---------------------------- */
export const TUTOR_CLIPS = [
  { id: 'idle', label: 'Attesa', p: 'The character is waiting calmly: gentle breathing, natural blinking, tiny head movements, a slight friendly smile. Static camera, no cuts.' },
  { id: 'talk', label: 'Parla', p: 'The character is talking animatedly to the viewer, mouth moving as if explaining something, expressive eyebrows, small nods of the head. Static camera, no cuts.' },
  { id: 'yes', label: 'Approva', p: 'The character is delighted: nods enthusiastically, smiles broadly and gives a thumbs-up gesture, then returns to a happy neutral pose. Static camera, no cuts.' },
  { id: 'no', label: 'Disapprova', p: 'The character gently disapproves: shakes the head slowly side to side, frowns with a sympathetic wince, raises one hand as if saying "not quite", then looks encouraging. Static camera, no cuts.' }
];
/** crea l'immagine di riferimento e i 4 brevi video; azione esplicita (costa) */
export const avatarVideos = (id) => (state.tutorVids && state.tutorVids[id]) || null;
export async function generateTutorVideos(onProgress, id = getSettings().avatar) {
  if (!hasGeminiKey()) return { ok: false, error: 'Inserisci la chiave Gemini.' };
  const gs = avatarSet(id);
  if (!gs || !gs.closed) return { ok: false, error: 'Crea prima il tutor con Gemini.' };
  const refBlob = await getImage(gs.closed);
  const still = { ok: !!refBlob, blob: refBlob, error: 'Immagine del tutor non trovata.' };
  if (!still.ok) return { ok: false, error: still.error };
  const set = {};
  const stamp = Date.now().toString(36);
  for (let i = 0; i < TUTOR_CLIPS.length; i++) {
    const c = TUTOR_CLIPS[i];
    onProgress && onProgress('Video ' + (i + 1) + '/' + TUTOR_CLIPS.length + ' (' + c.label + '): può richiedere qualche minuto…');
    const r = await veoVideo({ prompt: c.p + ' Same character as the reference image, consistent look.', image: still.blob, onStatus: (sec) => onProgress && onProgress('Video ' + (i + 1) + '/' + TUTOR_CLIPS.length + ' (' + c.label + '): attendo… ' + sec + ' s') });
    if (!r.ok) return { ok: false, error: r.error, partial: set };
    const key = 'tv_' + c.id + '_' + stamp;
    await putImage(key, r.blob);
    set[c.id] = key;
  }
  state.tutorVids = Object.assign({}, state.tutorVids, { [id]: set });
  saveState();
  emit('tutorImgs');
  return { ok: true, set };
}
export function clearTutorVideos() { state.tutorVids = null; saveState(); emit('tutorImgs'); }


/* ---------------------------- tutor a mezzo busto creati da Gemini (automatici) ---------------------------- */
const LOOKS = {
  marco: 'a friendly Italian-looking English teacher in his fifties, short grey hair, rectangular glasses, navy blazer over a white shirt',
  anna: 'a warm woman teacher in her thirties, long dark brown hair, burgundy cardigan over a white blouse, kind eyes',
  john: 'a cheerful British man in his forties with a short brown beard, grey sweater over a shirt',
  clara: 'a smart woman in her thirties with auburn hair in a bun, round glasses, teal blouse',
  samuel: 'a charismatic Black man in his thirties with a short afro, charcoal jacket, broad smile',
  rose: 'an elegant grandmother-teacher with silver hair in a bun, round glasses, plum cardigan',
  elena: 'a lively woman with dark curly hair, warm brown skin, orange jacket, big smile',
  luca: 'a young friendly man with short dark hair, blue shirt with open collar',
  cosmo: 'a funny astronaut in a white space suit with the helmet visor open, smiling face inside',
  fox: 'a charming cartoon fox professor with round glasses and a green waistcoat, 3D animated-film style',
  gufo: 'a wise cartoon owl professor with big round glasses and a bow tie, 3D animated-film style',
  bit: 'a cute friendly cartoon robot teacher with a screen face showing eyes, little antenna, 3D animated-film style',
  micio: 'a funny cartoon cat teacher wearing a small scarf and spectacles, 3D animated-film style',
  orso: 'a big cuddly cartoon bear teacher wearing a knitted vest and tiny glasses, 3D animated-film style',
  draco: 'a friendly small cartoon dragon teacher with tiny wings and a satchel, 3D animated-film style',
  pip: 'a cute round little alien with big eyes and two antennae, pastel skin, friendly, 3D animated-film style',
  zog: 'a funny green alien teacher with large black eyes, wearing a tiny jacket, 3D animated-film style',
  nebula: 'a one-eyed purple alien teacher, gentle and funny, holding a small book, 3D animated-film style',
  mono: 'a friendly teacher'
};
const SET_EXPR = [
  { id: 'closed', extra: '' },
  { id: 'open', extra: 'Same character, same outfit, same background, same framing. Now the mouth is wide open mid-sentence, as if explaining something, one hand raised in a gesture. Change nothing else.' },
  { id: 'happy', extra: 'Same character, same outfit, same background, same framing. Big happy smile, eyes bright, giving an enthusiastic thumbs-up. Change nothing else.' },
  { id: 'oops', extra: 'Same character, same outfit, same background, same framing. Sympathetic wince, eyebrows raised and slightly worried, head tilted, one hand raised palm out as if saying "not quite". Change nothing else.' }
];
const AUTOSTYLE = 'Polished high-quality 3D animated-film character render (Pixar-like), expressive appealing face, soft studio lighting, no text, no logos.';
let genBusy = false;
export const genStatus = { busy: false, msg: '', error: '' };
const setGen = (o) => { Object.assign(genStatus, o); emit('tutorGen'); };
export const avatarSet = (id) => (state.tutorSets && state.tutorSets[id]) || null;

/** crea (una volta sola) il tutor scelto, a mezzo busto, con 4 espressioni */
export async function generateAvatarSet(id, onProgress) {
  if (!hasGeminiKey()) return { ok: false, error: 'Inserisci la chiave Gemini.' };
  if (genBusy) return { ok: false, error: 'Sto già creando un tutor.' };
  genBusy = true; setGen({ busy: true, msg: 'Disegno il tutor…', error: '' });
  try {
    const look = (getSettings().tutorLook || '').trim() || LOOKS[id] || LOOKS.marco;
    const base = 'Half-length portrait (waist up, torso and both arms and hands visible) of ' + look + '. Standing, facing the viewer, centered, mouth closed with a gentle smile, plain soft light-grey background with generous space. ' + AUTOSTYLE;
    const set = {}; let ref = null; let via = 'gemini';
    for (let i = 0; i < SET_EXPR.length; i++) {
      const ex = SET_EXPR[i];
      onProgress && onProgress(i + 1, SET_EXPR.length); setGen({ msg: 'Disegno il tutor… ' + (i + 1) + '/' + SET_EXPR.length });
      let r = await geminiImage({ prompt: i ? ex.extra + ' ' + AUTOSTYLE : base, ref: i ? ref : null });
      if (!r.ok && !i) {
        // limite Gemini raggiunto: la prima immagine la chiedo a Pollinations (senza chiave)
        setGen({ msg: 'Gemini non risponde, provo con un altro motore…' });
        const p = await pollinationsImage({ prompt: base, width: 768, height: 768 });
        if (p && p.ok) { r = p; via = 'pollinations'; }
      }
      if (!r.ok) {
        if (!i) { setGen({ error: r.error }); return { ok: false, error: r.error }; }
        setGen({ error: r.error }); break; // set parziale: le espressioni mancanti usano la prima immagine
      }
      if (!i) ref = r.blob;
      if (via === 'pollinations' && i) break;
      const key = 'tutorset_' + id + '_' + ex.id + '_' + Date.now().toString(36);
      await putImage(key, r.blob);
      set[ex.id] = key;
      if (!i) { state.tutorSets = Object.assign({}, state.tutorSets, { [id]: Object.assign({}, set) }); saveState(); emit('tutorImgs'); }
    }
    state.tutorSets = Object.assign({}, state.tutorSets, { [id]: set });
    saveState(); emit('tutorImgs');
    return { ok: true, set };
  } finally { genBusy = false; setGen({ busy: false, msg: '' }); }
}
export function clearAvatarSet(id) { if (state.tutorSets) { delete state.tutorSets[id]; saveState(); emit('tutorImgs'); } }
/** all'avvio: se c'è la chiave Gemini e il tutor scelto non è ancora stato creato, lo crea in silenzio */
export async function autoTutor(toast, force) {
  const s = getSettings();
  if (!(s.tutorAuto || force) || !hasGeminiKey()) return;
  const id = s.avatar;
  if (avatarSet(id) || genBusy || (!force && state.tutorAutoFail && state.tutorAutoFail[id] > Date.now() - 6 * 3600e3)) return;
  toast && toast('Creo il tuo tutor con Gemini…');
  const r = await generateAvatarSet(id);
  if (r.ok) toast && toast('Il tuo tutor è pronto!');
  else { state.tutorAutoFail = Object.assign({}, state.tutorAutoFail, { [id]: Date.now() }); saveState(); toast && toast('Tutor Gemini: ' + r.error, 'err'); }
}
