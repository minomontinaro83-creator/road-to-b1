/* Copertine: quella del file se esiste (EPUB, prima pagina del PDF), altrimenti una copertina
   tipografica subito e, in seconda battuta, una creata dall'IA in modo pertinente al contenuto. */
import { getSettings } from './store.js';
import { claudeText, hasAnthropicKey, hasOpenAIKey, hasGeminiKey } from './api.js';
import { generateCoverBlob } from './images.js';

const PALETTE = [['#24324A', '#C9A45C'], ['#3A2E3F', '#D9B38C'], ['#1F3B3A', '#E0C98F'], ['#4A2F2B', '#E5C9A0'], ['#2B3A55', '#F0D9A8'], ['#3C3A2A', '#D6C08A']];
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/); const lines = []; let cur = '';
  words.forEach((w) => { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
  if (cur) lines.push(cur);
  return lines;
}
/** copertina tipografica: sempre disponibile, nessuna rete */
export function typoCover(title, author) {
  const [bg, fg] = PALETTE[hash(title || '') % PALETTE.length];
  const cv = document.createElement('canvas'); cv.width = 600; cv.height = 900;
  const c = cv.getContext('2d');
  c.fillStyle = bg; c.fillRect(0, 0, 600, 900);
  c.strokeStyle = fg; c.globalAlpha = 0.6; c.lineWidth = 3; c.strokeRect(34, 34, 532, 832); c.globalAlpha = 1;
  c.fillStyle = '#F4F1E8'; c.textAlign = 'center'; c.textBaseline = 'middle';
  let size = 64; let lines;
  do { c.font = '700 ' + size + 'px Georgia, "Times New Roman", serif'; lines = wrap(c, title || 'Senza titolo', 440); size -= 4; } while (lines.length > 5 && size > 28);
  const lh = size * 1.28 + 6; const y0 = 330 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => c.fillText(l, 300, y0 + i * lh));
  c.fillStyle = fg; c.fillRect(240, 560, 120, 3);
  c.fillStyle = '#E8E3D4'; c.font = '400 32px Georgia, serif';
  wrap(c, author || '', 440).slice(0, 2).forEach((l, i) => c.fillText(l, 300, 620 + i * 42));
  return new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.88));
}
export function aiCoverAvailable() {
  const e = getSettings().imageEngine;
  return e === 'openai' ? hasOpenAIKey() : e === 'gemini' ? hasGeminiKey() : true;
}
/** copertina pertinente: prima si fa descrivere la scena a Claude, poi si disegna */
export async function aiCover(title, author, sample) {
  if (!aiCoverAvailable()) return { ok: false, error: 'Nessun motore immagini disponibile.' };
  let idea = '';
  if (hasAnthropicKey()) {
    try {
      const rr = await claudeText(getSettings().textModel,
        'You design book covers. Given a title and an excerpt, describe in ONE English sentence (max 45 words) a single evocative, relevant cover illustration: subject, setting, mood, colours. No text or lettering in the image.',
        'Title: ' + title + (author ? '\nAuthor: ' + author : '') + '\nExcerpt: ' + String(sample || '').slice(0, 900), 160);
      idea = rr && rr.ok ? rr.text.trim() : '';
    } catch (e) { idea = ''; }
  }
  const prompt = 'Book cover illustration, portrait, refined editorial style, muted elegant palette, no text, no letters. ' + (idea || 'Subject inspired by the title "' + title + '".');
  return generateCoverBlob(prompt);
}
