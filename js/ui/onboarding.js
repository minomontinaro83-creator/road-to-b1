import { h, clear, toast, say } from './dom.js';
import { createTutor, bubble, avatarPicker } from './tutor.js';
import { getSettings, setSettings } from '../store.js';
import { testAnthropic } from '../api.js';

export function showOnboarding(host, done) {
  clear(host);
  const s = getSettings();
  let step = 0;
  const box = h('div', { class: 'onboard' });
  host.append(box);
  const tutor = createTutor({ size: 120 });
  const name = h('input', { class: 'input big', value: s.userName, placeholder: 'Il tuo nome' });
  const key = h('input', { class: 'input', type: 'password', value: s.apiKey, placeholder: 'sk-ant-…', autocomplete: 'off' });
  const status = h('div', { class: 'small' });
  const dest = h('input', { class: 'input', value: s.destinations, placeholder: 'es. Londra, New York' });
  const acc = h('select', { class: 'input' }, h('option', { value: 'us', selected: s.accent === 'us' }, 'Americano'), h('option', { value: 'uk', selected: s.accent === 'uk' }, 'Britannico'));

  const pages = [
    () => [bubble(h('b', null, 'Ciao! Sono ' + s.tutorName + '.'), ' Ti accompagno dal tuo A2 al B1, con scene di viaggio e di vita vera. Come ti chiami?'), name, h('div', { class: 'f-label' }, 'Scegli il tuo tutor'), avatarPicker(),
      h('button', { class: 'btn primary wide', onclick: () => { setSettings({ userName: name.value.trim() || 'Mino' }); step++; render(); } }, 'Avanti')],
    () => [bubble('Per creare le scene serve la tua chiave API di Anthropic. Resta solo su questo telefono.'),
      h('ol', { class: 'small' }, h('li', null, 'Apri console.anthropic.com e accedi'), h('li', null, 'Vai in "API Keys" → "Create Key"'), h('li', null, 'Copia la chiave e incollala qui sotto')), key,
      h('button', { class: 'btn ghost', onclick: async (e) => {
        setSettings({ apiKey: key.value.trim() }); e.target.disabled = true; status.textContent = 'Provo…';
        const r = await testAnthropic(getSettings().textModel); e.target.disabled = false;
        status.textContent = r.ok ? 'Funziona!' : '' + r.error; status.className = 'small ' + (r.ok ? 'ok' : 'err');
      } }, 'Prova la chiave'), status,
      h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => { step++; render(); } }, 'Più tardi'), h('button', { class: 'btn primary', onclick: () => { setSettings({ apiKey: key.value.trim() }); step++; render(); } }, 'Avanti'))],
    () => [bubble('Che accento preferisci ascoltare? E dove viaggi di solito?'), h('label', { class: 'field' }, h('span', { class: 'f-label' }, 'Accento'), acc), h('label', { class: 'field' }, h('span', { class: 'f-label' }, 'Destinazioni'), dest),
      h('button', { class: 'btn ghost', onclick: () => { setSettings({ accent: acc.value }); say('Hello! Ready to start?'); } }, '▶ Prova la voce'),
      h('button', { class: 'btn primary wide', onclick: () => { setSettings({ accent: acc.value, destinations: dest.value.trim(), onboarded: true }); done(); } }, 'Iniziamo!')]
  ];
  function render() {
    clear(box);
    box.append(h('div', { class: 'center-col' }, tutor.el), h('div', { class: 'stack' }, pages[step]()));
  }
  render();
}
