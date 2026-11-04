/* Importazione di documenti: EPUB, PDF (con testo), DOCX, TXT. Tutto sul telefono, nessun upload.
   Restituisce sempre {title, author, chapters:[{title,paras[]}], words, english, kind}. */
import { parseEpub, listZip, readEntry, looksEnglish } from './epub.js';

const words = (t) => (t.match(/\S+/g) || []).length;

/** da blocchi {t, h?, p?} a capitoli: per titoli se ci sono, altrimenti a blocchi di ~2600 parole */
export function chunkBlocks(blocks, target = 2600) {
  const heads = blocks.filter((b) => b.h).length;
  const chapters = [];
  const push = (title, paras) => { if (paras.join(' ').length >= 100) chapters.push({ title, paras }); };
  if (heads >= 2) {
    let title = 'Introduzione', paras = [];
    blocks.forEach((b) => {
      if (b.h) { push(title, paras); title = b.t.slice(0, 90); paras = []; } else paras.push(b.t);
    });
    push(title, paras);
  } else {
    let paras = [], n = 0, p0 = null, p1 = null;
    const flush = () => {
      if (!paras.length) return;
      const title = p0 != null ? 'Pagine ' + p0 + '–' + p1 : 'Parte ' + (chapters.length + 1);
      push(title, paras); paras = []; n = 0; p0 = null;
    };
    blocks.forEach((b) => {
      if (n > target) flush();
      paras.push(b.t); n += words(b.t);
      if (b.p != null) { if (p0 == null) p0 = b.p; p1 = b.p; }
    });
    flush();
  }
  return chapters;
}
const finish = (kind, title, author, chapters, cover = null) => {
  if (!chapters.length) throw new Error('Non trovo testo leggibile in questo file.');
  const all = chapters.map((c) => c.paras.join(' ')).join(' ');
  return { kind, title: title || 'Senza titolo', author: author || '', chapters, words: words(all), english: looksEnglish(all.slice(0, 6000)), cover };
};
const baseName = (f) => f.name.replace(/\.[^.]+$/, '');

/* ---------------- DOCX ---------------- */
async function parseDocx(buf, file) {
  const files = listZip(buf);
  const dec = new TextDecoder();
  const get = async (n) => (files.has(n) ? dec.decode(await readEntry(buf, files.get(n))) : null);
  const xml = await get('word/document.xml');
  if (!xml) throw new Error('File DOCX non valido.');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const blocks = [];
  Array.from(doc.getElementsByTagNameNS('*', 'p')).forEach((p) => {
    let t = '';
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType !== 1) continue;
        const ln = c.localName;
        if (ln === 't') t += c.textContent;
        else if (ln === 'tab' || ln === 'br') t += ' ';
        else if (ln !== 'pPr' && ln !== 'rPr') walk(c);
      }
    };
    walk(p);
    t = t.replace(/\s+/g, ' ').trim();
    if (!t) return;
    const st = p.getElementsByTagNameNS('*', 'pStyle')[0];
    const sv = st ? (st.getAttribute('w:val') || st.getAttributeNS('*', 'val') || '') : '';
    blocks.push({ t, h: /^(heading ?1|titolo ?1|title|titolo)$/i.test(sv) && t.length < 120 });
  });
  const core = await get('docProps/core.xml');
  let title = '', author = '';
  if (core) {
    const c = new DOMParser().parseFromString(core, 'application/xml');
    const g = (n) => (c.getElementsByTagNameNS('*', n)[0] || {}).textContent || '';
    title = g('title').trim(); author = g('creator').trim();
  }
  return finish('docx', title || baseName(file), author, chunkBlocks(blocks));
}

/* ---------------- TXT ---------------- */
async function parseTxt(file) {
  const text = await file.text();
  const blocks = text.split(/\r?\n\s*\r?\n/).map((t) => ({ t: t.replace(/\s+/g, ' ').trim() })).filter((b) => b.t);
  return finish('txt', baseName(file), '', chunkBlocks(blocks));
}

/* ---------------- PDF (pdf.js incluso nell'app) ---------------- */
let pdfReady = null;
function loadPdfJs() {
  if (pdfReady) return pdfReady;
  pdfReady = new Promise((resolve, reject) => {
    if (window.pdfjsLib) return resolve(window.pdfjsLib);
    const s = document.createElement('script');
    s.src = new URL('./vendor/pdf.js', import.meta.url).href;
    s.onload = async () => {
      try {
        const w = await (await fetch(new URL('./vendor/pdf.worker.js', import.meta.url).href)).text();
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([w], { type: 'text/javascript' }));
        resolve(window.pdfjsLib);
      } catch (e) { reject(e); }
    };
    s.onerror = () => reject(new Error('Non riesco a caricare il lettore PDF.'));
    document.head.append(s);
  }).catch((e) => { pdfReady = null; throw e; });
  return pdfReady;
}
export function linesToParas(lines) {
  const paras = [];
  let prev = null;
  lines.forEach((l) => {
    const t = l.t.replace(/\s+/g, ' ').trim();
    if (!t || /^\d{1,4}$/.test(t)) return; // numeri di pagina
    const gap = prev ? prev.y - l.y : 0;
    const newPara = !prev || gap > 1.7 * Math.max(l.h, prev.h, 8) || gap < 0;
    if (newPara || !paras.length) paras.push(t);
    else {
      const last = paras[paras.length - 1];
      paras[paras.length - 1] = /[a-zà-ÿ]-$/.test(last) && /^[a-zà-ÿ]/.test(t) ? last.slice(0, -1) + t : last + ' ' + t;
    }
    prev = { y: l.y, h: l.h };
  });
  return paras;
}
async function parsePdf(buf, file, onProgress) {
  const lib = await loadPdfJs();
  const pdf = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
  const blocks = [];
  let chars = 0;
  for (let i = 1; i <= pdf.numPages; i++) {
    if (onProgress) onProgress('Leggo la pagina ' + i + ' di ' + pdf.numPages + '…');
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const lines = [];
    let cur = null;
    tc.items.forEach((it) => {
      if (!('str' in it)) return;
      const y = it.transform[5];
      if (!cur || Math.abs(y - cur.y) > 2.5) { cur = { y, t: '', h: it.height || 10 }; lines.push(cur); }
      cur.t += it.str;
    });
    const paras = linesToParas(lines);
    chars += paras.reduce((a, p) => a + p.length, 0);
    paras.forEach((t, k) => {
      const last = blocks[blocks.length - 1];
      // frase spezzata tra due pagine
      if (k === 0 && last && last.p === i - 1 && !/[.!?:"”’)]$/.test(last.t) && /^[a-zà-ÿ]/.test(t)) { last.t += ' ' + t; last.p = i; } else blocks.push({ t, p: i });
    });
  }
  if (chars < 200) throw new Error('Questo PDF contiene solo immagini (scansione): non posso leggerlo senza riconoscimento del testo (OCR).');
  let title = baseName(file), author = '';
  try { const m = await pdf.getMetadata(); if (m && m.info) { if (m.info.Title && m.info.Title.trim()) title = m.info.Title.trim(); if (m.info.Author) author = m.info.Author.trim(); } } catch (e) { /* ignora */ }
  let cover = null;
  try {
    const p1 = await pdf.getPage(1);
    const vp0 = p1.getViewport({ scale: 1 });
    const vp = p1.getViewport({ scale: 420 / vp0.width });
    const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
    await p1.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    cover = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.82));
  } catch (e) { cover = null; }
  return finish('pdf', title, author, chunkBlocks(blocks), cover);
}

/** apre un file scelto dall'utente (EPUB, PDF, DOCX, TXT) */
export async function parseDocument(file, onProgress) {
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.txt')) return parseTxt(file);
  const buf = await file.arrayBuffer();
  if (name.endsWith('.epub')) { const b = await parseEpub(buf); b.kind = 'epub'; return b; }
  if (name.endsWith('.docx')) return parseDocx(buf, file);
  if (name.endsWith('.pdf')) return parsePdf(buf, file, onProgress);
  if (name.endsWith('.doc')) throw new Error('Il vecchio formato .doc non è supportato: salvalo come .docx.');
  throw new Error('Formato non supportato. Usa EPUB, PDF, DOCX o TXT.');
}
