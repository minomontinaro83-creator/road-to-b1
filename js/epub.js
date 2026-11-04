/* Lettore EPUB: apre il file sul telefono (nessun upload), lo scompone in capitoli e pagine.
   Niente librerie: lettura dello zip con DecompressionStream, testo estratto con DOMParser.
   Gli EPUB protetti da DRM non si possono aprire. */

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** legge l'elenco dei file dello zip */
export function listZip(buf) {
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('File non valido: non è un EPUB.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nlen));
    files.set(name, { method, csize, off });
    p += 46 + nlen + elen + clen;
  }
  return files;
}

export async function readEntry(buf, entry) {
  const dv = new DataView(buf);
  const o = entry.off;
  const nlen = dv.getUint16(o + 26, true), elen = dv.getUint16(o + 28, true);
  const data = new Uint8Array(buf, o + 30 + nlen + elen, entry.csize);
  if (entry.method === 0) return data;
  if (entry.method === 8) return inflateRaw(data);
  throw new Error('Compressione non supportata.');
}

const dirOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '');
function resolve(base, href) {
  const parts = (base + decodeURIComponent(href.split('#')[0])).split('/');
  const out = [];
  parts.forEach((x) => { if (x === '..') out.pop(); else if (x && x !== '.') out.push(x); });
  return out.join('/');
}

const BLOCKS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'DIV', 'PRE']);
function extractParagraphs(doc) {
  const body = doc.body || doc.documentElement;
  const out = [];
  const walk = (el) => {
    for (const c of el.children) {
      const tag = c.tagName.toUpperCase();
      if (['SCRIPT', 'STYLE', 'NAV', 'SVG', 'IMG', 'HEAD'].includes(tag)) continue;
      const hasBlock = Array.from(c.children).some((k) => BLOCKS.has(k.tagName.toUpperCase()));
      if (BLOCKS.has(tag) && !hasBlock) {
        const t = c.textContent.replace(/\s+/g, ' ').trim();
        if (t) out.push({ t, h: /^H[1-6]$/.test(tag) });
      } else walk(c);
    }
  };
  walk(body);
  return out;
}

/** Controllo grossolano: il testo è inglese? */
export function looksEnglish(text) {
  const w = text.toLowerCase().match(/[a-z']+/g) || [];
  if (w.length < 50) return true;
  const common = new Set(['the', 'and', 'of', 'to', 'a', 'in', 'was', 'he', 'she', 'it', 'that', 'you', 'is', 'with', 'for', 'her', 'his', 'had', 'on', 'i']);
  return w.filter((x) => common.has(x)).length / w.length > 0.18;
}

/**
 * @returns {{title,author,chapters:[{title,paras:string[]}], words:number, english:boolean}}
 */
export async function parseEpub(buf) {
  const files = listZip(buf);
  const dec = new TextDecoder();
  const get = async (name) => {
    const e = files.get(name);
    if (!e) return null;
    return dec.decode(await readEntry(buf, e));
  };
  if (files.has('META-INF/encryption.xml')) {
    const enc = await get('META-INF/encryption.xml');
    if (enc && /EncryptionMethod/.test(enc) && !/ObfuscatedKey|font/i.test(enc)) throw new Error('Questo EPUB è protetto (DRM) e non si può aprire.');
  }
  const cont = await get('META-INF/container.xml');
  if (!cont) throw new Error('EPUB non valido (manca container.xml).');
  const opfPath = new DOMParser().parseFromString(cont, 'application/xml').querySelector('rootfile').getAttribute('full-path');
  const opf = new DOMParser().parseFromString(await get(opfPath), 'application/xml');
  const base = dirOf(opfPath);
  const txt = (sel) => { const e = opf.querySelector(sel); return e ? e.textContent.trim() : ''; };
  const manifest = {};
  opf.querySelectorAll('manifest > item').forEach((i) => { manifest[i.getAttribute('id')] = { href: i.getAttribute('href'), type: i.getAttribute('media-type') || '' }; });
  const spine = Array.from(opf.querySelectorAll('spine > itemref')).filter((r) => r.getAttribute('linear') !== 'no').map((r) => manifest[r.getAttribute('idref')]).filter(Boolean);
  let cover = null;
  try {
    const items = Array.from(opf.querySelectorAll('manifest > item'));
    let ci = items.find((i) => (i.getAttribute('properties') || '').split(/\s+/).includes('cover-image'));
    if (!ci) { const m = opf.querySelector('meta[name="cover"]'); if (m) ci = items.find((i) => i.getAttribute('id') === m.getAttribute('content')); }
    if (!ci) ci = items.find((i) => /^image\//.test(i.getAttribute('media-type') || '') && /cover/i.test((i.getAttribute('id') || '') + (i.getAttribute('href') || '')));
    if (ci) {
      const e = files.get(resolve(base, ci.getAttribute('href')));
      if (e) cover = new Blob([await readEntry(buf, e)], { type: ci.getAttribute('media-type') || 'image/jpeg' });
    }
  } catch (err) { cover = null; }
  const chapters = [];
  let words = 0, sample = '';
  for (const item of spine) {
    if (!/html|xml/.test(item.type)) continue;
    const raw = await get(resolve(base, item.href));
    if (!raw) continue;
    let doc = new DOMParser().parseFromString(raw, 'application/xhtml+xml');
    if (doc.querySelector('parsererror')) doc = new DOMParser().parseFromString(raw, 'text/html');
    const paras = extractParagraphs(doc);
    const total = paras.reduce((a, p) => a + p.t.length, 0);
    if (total < 300) continue; // copertina, indice, ecc.
    const head = paras.find((p) => p.h && p.t.length < 90);
    const body = paras.filter((p) => !(p === head)).map((p) => p.t);
    chapters.push({ title: head ? head.t : 'Capitolo ' + (chapters.length + 1), paras: body });
    words += body.join(' ').split(/\s+/).length;
    if (sample.length < 4000) sample += ' ' + body.slice(0, 6).join(' ');
  }
  if (!chapters.length) throw new Error('Non trovo testo leggibile in questo EPUB.');
  return { title: txt('metadata > title, title') || 'Senza titolo', author: txt('metadata > creator, creator'), chapters, words, english: looksEnglish(sample), cover };
}

/* ---------- da capitolo a pagine di lettura ---------- */
const ABBR = /\b(Mr|Mrs|Ms|Dr|St|Prof|Sr|Jr|vs|etc|No)\.$/;
export function splitSentences(par) {
  const raw = par.match(/[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)/g) || [par];
  const out = [];
  raw.forEach((x) => {
    const t = x.trim();
    if (!t) return;
    if (out.length && (ABBR.test(out[out.length - 1]) || t.length < 3)) out[out.length - 1] += ' ' + t; else out.push(t);
  });
  return out;
}

/** pagine da circa `target` parole, spezzate a fine paragrafo */
export function paginate(paras, target = 380) {
  const pages = [];
  let cur = [], n = 0;
  paras.forEach((p) => {
    const w = p.split(/\s+/).length;
    if (cur.length && n + w > target * 1.25) { pages.push(cur); cur = []; n = 0; }
    cur.push(p); n += w;
  });
  if (cur.length) pages.push(cur);
  return pages;
}

export function pageSentences(paras) {
  const out = [];
  paras.forEach((p) => splitSentences(p).forEach((s, i) => out.push({ en: s, ipa: '', newPara: i === 0 })));
  return out;
}
