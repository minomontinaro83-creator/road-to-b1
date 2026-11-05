import { h, clear, toast, confirmSheet, say, sheet } from './dom.js';
import { createTutor, avatarPicker } from './tutor.js';
import { getSettings, setSettings, state, replaceState, exportBackup, parseBackup, restoreBooksMeta, newState, flushState, storageMode, saveState } from '../store.js';
import { VERSION, NEWS } from '../version.js';
import { testAnthropic } from '../api.js';
import { englishVoices, resetTtsFailure, resetNaturalFailure, speak, rankVoices, voiceScore, NATURAL_VOICES } from '../tts.js';
import { applyAppearance, FONTS, COLORS } from './appearance.js';
import { makeCard } from '../srs.js';
import { dayStr, addDays, normText } from '../util.js';

const field = (label, ctl, hint) => h('label', { class: 'field' }, h('span', { class: 'f-label' }, label), ctl, hint ? h('small', { class: 'muted' }, hint) : null);
function toggle(key, label, hint, after) {
  const s = getSettings();
  const cb = h('input', { type: 'checkbox', checked: !!s[key], onchange: (e) => { setSettings({ [key]: e.target.checked }); if (after) after(); } });
  return h('label', { class: 'toggle' }, h('span', null, label, hint ? h('small', { class: 'muted' }, hint) : null), cb, h('i'));
}
function select(key, options, after) {
  const s = getSettings();
  return h('select', { class: 'input', onchange: (e) => { const v = e.target.value; setSettings({ [key]: typeof s[key] === 'number' ? Number(v) : v }); if (after) after(); } },
    options.map(([v, l]) => h('option', { value: v, selected: String(s[key]) === String(v) }, l)));
}
function text(key, props = {}) {
  const s = getSettings();
  return h('input', Object.assign({ class: 'input', type: 'text', value: s[key], autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', onchange: (e) => setSettings({ [key]: e.target.value.trim() }) }, props));
}
function range(key, min, max, step, fmt, after) {
  const s = getSettings();
  const out = h('b', null, fmt(s[key]));
  const inp = h('input', { type: 'range', min, max, step, value: s[key], oninput: (e) => { const v = Number(e.target.value); setSettings({ [key]: v }); out.textContent = fmt(v); if (after) after(); } });
  return h('div', { class: 'range' }, inp, out);
}
const card = (title, ...kids) => h('details', { class: 'card acc' }, h('summary', null, h('h3', null, title)), h('div', { class: 'stack acc-body' }, kids));

export function renderSettings(host, nav) {
  clear(host);
  const s = getSettings();
  const keyStatus = h('div', { class: 'muted small' });
  const aIn = h('input', { class: 'input', type: 'password', value: s.apiKey, placeholder: 'sk-ant-…', autocomplete: 'off', onchange: (e) => setSettings({ apiKey: e.target.value.trim() }) });
  const preview = h('p', { class: 'read-preview' }, 'I would like a window seat, please. “Could you tell me where the gate is?”');

  host.append(h('h2', { class: 'step-title' }, 'Impostazioni'));

  host.append(card('Chiavi API',
    h('p', { class: 'muted small' }, 'Le chiavi restano solo su questo telefono: non vengono mai inviate a nessun altro server, né incluse nei backup.'),
    field('Anthropic (testi e tutor)', aIn),
    h('button', { class: 'btn ghost', onclick: async (e) => {
      setSettings({ apiKey: aIn.value.trim() }); e.target.disabled = true; keyStatus.textContent = 'Provo…';
      const r = await testAnthropic(getSettings().textModel); e.target.disabled = false;
      keyStatus.textContent = r.ok ? 'Connessione riuscita (' + r.ms + ' ms)' : '' + r.error; keyStatus.className = 'small ' + (r.ok ? 'ok' : 'err');
    } }, 'Prova la chiave Anthropic'),
    keyStatus));

  host.append(card('Testo e aspetto',
    field('Carattere', select('font', Object.keys(FONTS).map((k) => [k, FONTS[k].label]), applyAppearance)),
    field('Dimensione del testo', range('fontSize', 15, 28, 1, (v) => v + ' px', applyAppearance)),
    field('Margine dello schermo', range('margin', 0, 32, 1, (v) => v + ' px', applyAppearance)),
    field('Margine interno della pagina', range('pageInner', 0, 32, 1, (v) => v + ' px', applyAppearance)),
    toggle('fullWidth', 'Usa tutta la larghezza dello schermo', 'Su telefono è già a tutto schermo; utile su tablet.', applyAppearance),
    field('Interlinea', range('lineHeight', 1.3, 2.3, 0.1, (v) => v.toFixed(1), applyAppearance)),
    preview,
    field('Tema', select('theme', [['light', 'Chiaro'], ['dark', 'Scuro'], ['sepia', 'Carta'], ['auto', 'Automatico']], applyAppearance)),
    toggle('effects', 'Coriandoli e festeggiamenti', 'Spenti per impostazione.'),
    toggle('vibrate', 'Vibrazione forte quando sbagli', 'Solo su Android.'),
    field('Colore principale', h('div', { class: 'swatches' }, Object.keys(COLORS).map((k) => h('button', { class: 'swatch' + (s.color === k ? ' on' : ''), style: { background: COLORS[k] }, 'aria-label': k, onclick: (e) => { setSettings({ color: k }); applyAppearance(); e.target.parentElement.querySelectorAll('.swatch').forEach((x) => x.classList.remove('on')); e.target.classList.add('on'); } }))))));

  const voiceSel = h('select', { class: 'input', onchange: (e) => setSettings({ voiceURI: e.target.value }) }, h('option', { value: '' }, 'Automatica (la migliore trovata)'));
  englishVoices().then((vs) => rankVoices(vs).forEach((v) => voiceSel.append(h('option', { value: v.voiceURI, selected: getSettings().voiceURI === v.voiceURI }, (voiceScore(v) >= 4 ? '★ ' : '') + v.name + ' (' + v.lang + (v.localService === false ? ', online' : '') + ')'))));
  const testVoice = async () => { const r = await speak('Good morning. I would like a window seat, please. Could you tell me where the gate is?'); if (!r.ok) toast('Non riesco a riprodurre la voce. Prova un altro motore.', 'err'); };
  host.append(card('Voce',
    field('Motore voce', select('ttsEngine', [['natural', 'Naturale (consigliata, serve internet)'], ['device', 'Voce del telefono'], ['online', 'Google online'], ['auto', 'Telefono, poi online']], () => { resetTtsFailure(); resetNaturalFailure(); }), 'La voce naturale è scaricata da internet frase per frase e poi tenuta in memoria. Se non risponde, l\'app passa da sola alla voce del telefono.'),
    field('Voce naturale', select('naturalVoice', NATURAL_VOICES, resetNaturalFailure)),
    field('Accento (voce del telefono)', select('accent', [['us', 'Americano'], ['uk', 'Britannico']], () => setSettings({ voiceURI: '' }))),
    field('Voce del telefono', voiceSel, 'Le voci con ★ sono quelle online/di rete: suonano meglio.'),
    field('Velocità', range('ttsRate', 0.5, 1.3, 0.05, (v) => v.toFixed(2) + '×')),
    field('Tono (voce del telefono)', range('ttsPitch', 0.7, 1.3, 0.05, (v) => v.toFixed(2))),
    h('button', { class: 'btn ghost', onclick: testVoice }, 'Prova la voce'),
    h('details', { class: 'muted small' }, h('summary', null, 'Come avere una voce migliore su Android'),
      h('p', null, 'La qualità della voce del telefono dipende dal motore di sintesi installato. Apri Impostazioni di Android → Gestione generale (o Sistema) → Lingua → Sintesi vocale → motore "Sintesi vocale Google" → Installa dati vocali → Inglese (Stati Uniti) → scarica una voce di qualità alta. Poi scegli qui la voce con ★.')),
    toggle('autoSpeakTutor', 'Il tutor parla ad alta voce')));

  host.append(card('Fonetica',
    field('Dove mostrarla', select('phonetics', [['sentence', 'Sotto ogni frase'], ['word', 'Solo toccando la parola'], ['off', 'Mai']])),
    toggle('dictIpa', 'Usa un dizionario online per la fonetica delle parole', 'Più precisa; se non risponde usa quella dell\'IA.')));

  host.append(card('Percorso',
    field('Il tuo nome', text('userName')),
    field('Dove viaggi di solito?', text('destinations', { placeholder: 'es. Londra, New York, Dublino' }), 'Le scene useranno anche questi luoghi.'),
    field('Lunghezza delle scene', select('sceneLength', [['short', 'Breve (~500 parole)'], ['medium', 'Media (~800)'], ['long', 'Lunga (~1200)'], ['xl', 'Molto lunga (~1700)'], ['custom', 'Personalizzata']], () => renderSettings(host, nav))),
    s.sceneLength === 'custom' ? field('Parole per scena', range('customWords', 300, 2500, 50, (v) => v + ' parole')) : null,
    field('Tema delle scene', select('focus', [['mix', 'Misto'], ['travel', 'Viaggi e aeroporti'], ['daily', 'Vita quotidiana'], ['social', 'Conversazioni e amicizie'], ['work', 'Lavoro e studio']])),
    field('Difficoltà', select('levelBias', [['-1', 'Più facile'], ['0', 'Adattiva (consigliata)'], ['1', 'Più difficile']])),
    field('Domande per test', range('testQuestions', 6, 20, 1, (v) => String(v))),
    field('Correzioni del tutor', select('strictness', [['light', 'Solo errori gravi'], ['normal', 'Equilibrate'], ['strict', 'Precise (anche sfumature)']])),
    toggle('listenFirst', 'Prima ascolta, poi leggi'),
    toggle('autoLesson', 'Libri: il tutor spiega ogni pagina da solo', 'Traduzione, regole, pronuncia e parole da ricordare. Costa poco, ma richiede qualche secondo a pagina.'),
    toggle('showTranslation', 'Mostra la traduzione quando c\'è'),
    field('Spiegazioni del tutor', select('explainLang', [['it', 'In italiano'], ['en', 'In inglese semplice']])),
    field('Carte da ripassare al giorno (max)', range('reviewPerDay', 5, 50, 1, (v) => String(v))),
    field('Parole nuove al giorno (max)', range('newPerDay', 3, 12, 1, (v) => String(v))),
    field('Obiettivo giornaliero', range('targetMinutes', 10, 60, 5, (v) => v + ' min'))));

  const tutorBox = h('div', { class: 'center-col' });
  const drawTutor = () => { clear(tutorBox); tutorBox.append(createTutor({ size: 120 }).el); };
  drawTutor();
  host.append(card('Tutor e immagini',
    tutorBox,
    h('div', { class: 'f-label' }, 'Scegli il tuo tutor'),
    avatarPicker(() => { drawTutor(); }),
    field('Nome del tutor', text('tutorName')),
    field('Chiave Pollinations (facoltativa)', text('pollinationsKey', { type: 'password' }), 'Senza chiave: una immagine ogni ~16 secondi, va bene lo stesso.'),
    toggle('imagesOn', 'Immagini attive', 'Spegni per non spendere nulla in immagini.'),
    toggle('sceneImages', 'Illustrazione della scena'),
    toggle('cardImages', 'Immagini sulle carte (parole concrete)'),
    field('Massimo immagini al giorno', range('maxImagesPerDay', 0, 20, 1, (v) => String(v)))));

  host.append(card('Modelli (avanzate)',
    field('Testi e test', text('textModel')), field('Tutor (chat)', text('chatModel')), field('Notizia', text('articleModel')),
    ));

  const file = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const p = parseBackup(await f.text());
      if (p.type === 'new') {
        if (!await confirmSheet('Sostituire i dati attuali con il backup?', 'Ripristina', true)) return;
        const keys = { apiKey: getSettings().apiKey };
        replaceState(p.data.state); setSettings(Object.assign({}, p.data.settings || {}, keys)); applyAppearance();
        const nb = await restoreBooksMeta(p.data.books);
        toast('Backup ripristinato' + (nb ? ' (' + nb + ' libri ritrovati)' : ''));
      } else {
        const n = importOld(p.data);
        toast(n + ' carte importate dalla vecchia app');
      }
    } catch (err) { toast('File non riconosciuto', 'err'); }
    e.target.value = '';
  } });
  const persisted = h('small', { class: 'muted' });
  if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then((v) => { persisted.textContent = 'Archiviazione: ' + (storageMode() === 'indexeddb' ? 'sicura' : 'temporanea') + (v ? ' · protetta' : ''); });
  const storage = h('small', { class: 'muted' });
  if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then((e) => { const mb = (x) => (x / 1048576).toFixed(0); storage.textContent = 'Spazio occupato: ' + mb(e.usage) + ' MB su circa ' + mb(e.quota) + ' disponibili.'; }).catch(() => {});
  const verStatus = h('small', { class: 'muted' }, 'Versione ' + VERSION);
  const hardUpdate = async () => {
    try { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map((r) => r.unregister())); const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); } catch (e) { /* ignora */ }
    location.reload();
  };
  host.append(card('Versione e aggiornamenti',
    verStatus, h('small', { class: 'muted' }, NEWS),
    h('button', { class: 'btn ghost', onclick: async (e) => {
      e.target.disabled = true; verStatus.textContent = 'Controllo…';
      try { const r = await (await fetch('version.json', { cache: 'no-store' })).json(); verStatus.textContent = r.version === VERSION ? 'Hai già l\'ultima versione (' + VERSION + ').' : 'Disponibile la versione ' + r.version + '. Tocca Aggiorna ora.'; }
      catch (err) { verStatus.textContent = 'Non riesco a controllare: serve la connessione.'; }
      e.target.disabled = false;
    } }, 'Controlla aggiornamenti'),
    h('button', { class: 'btn ghost', onclick: hardUpdate }, 'Aggiorna ora'),
    h('small', { class: 'muted' }, 'L\'aggiornamento non tocca carte, libri, note e progressi.')));

  host.append(card('Dati',
    h('button', { class: 'btn ghost', onclick: async () => {
      flushState();
      const blob = new Blob([await exportBackup()], { type: 'application/json' });
      const a = h('a', { href: URL.createObjectURL(blob), download: 'road-to-b1-backup-' + dayStr() + '.json' });
      document.body.append(a); a.click(); a.remove();
      state.lastBackup = dayStr(); saveState();
    } }, 'Salva un backup'),
    h('button', { class: 'btn ghost', onclick: () => file.click() }, 'Ripristina un backup o importa la vecchia app'), file,
    h('small', { class: 'muted' }, state.lastBackup ? 'Ultimo backup: ' + state.lastBackup : 'Fai un backup ogni tanto: i dati stanno solo sul telefono. Il backup contiene carte, segnalibri, note, progressi e impostazioni (non le chiavi e non i file dei libri).'), persisted, storage,
    h('button', { class: 'btn danger', onclick: async () => {
      if (!await confirmSheet('Cancellare TUTTI i progressi? Non si può annullare.', 'Cancella tutto', true)) return;
      replaceState(newState()); toast('Dati cancellati');
    } }, 'Cancella tutti i progressi')));
}

/** importa le carte della vecchia app "Road to B1" come carte nuove */
function importOld(old) {
  let n = 0; const t = dayStr();
  const have = new Set(state.cards.map((c) => c.id));
  (old.srs || []).forEach((o, i) => {
    let kind = 'word', fields;
    if (o.kind === 'error' && (o.wrong || o.right)) { kind = 'error'; fields = { wrong: o.wrong || '', right: o.right || o.en || '', en: o.right || '', expl: o.expl || o.note || '' }; }
    else if (o.en || o.text) { const en = String(o.en || o.text); kind = en.trim().split(/\s+/).length > 1 ? 'phrase' : 'word'; fields = { en, it: o.it || '', ipa: o.ipa || '', ctx: o.ctx || o.example || '' }; }
    else return;
    const c = makeCard(kind, Object.assign(fields, { source: 'import' }), t);
    if (have.has(c.id)) return;
    have.add(c.id);
    c.due = addDays(t, 1 + (i % 7)); // distribuite sui prossimi giorni
    state.cards.push(c); n++;
  });
  saveState();
  return n;
}
