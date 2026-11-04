/* Tutor disegnati: sette personaggi tra cui scegliere. Ogni disegno ha bocca chiusa/aperta/sorriso/pensiero. */
export const AVATARS = [
  { id: 'sofia', name: 'Sofia', group: 'Umani', kind: 'photo', photo: 'assets/sofia.png', bg: ['#E9E6E1'] },
  { id: 'marco', name: 'Marco', group: 'Umani', kind: 'human', bg: ['#DDE3EA'], skin: '#E7BE9C', skinD: '#D2A07C', hair: '#8A8F98', hairStyle: 'short', glasses: 'square', outfit: '#2B3A55', collar: '#F2F3F5' },
  { id: 'anna', name: 'Anna', group: 'Umani', kind: 'human', bg: ['#E6DFD8'], skin: '#EBC4A4', skinD: '#D6A682', hair: '#3A2A22', hairStyle: 'long', glasses: 'none', outfit: '#7A3B4A', collar: '#F2F3F5', lashes: true },
  { id: 'john', name: 'John', group: 'Umani', kind: 'human', bg: ['#DAE2DC'], skin: '#F0CBAA', skinD: '#DBAC87', hair: '#5B4636', hairStyle: 'short', glasses: 'none', outfit: '#4A5560', collar: '#F2F3F5', beard: '#5B4636' },
  { id: 'clara', name: 'Clara', group: 'Umani', kind: 'human', bg: ['#E2E0EA'], skin: '#F2D0B6', skinD: '#DDB191', hair: '#8B4A2B', hairStyle: 'bun', glasses: 'round', outfit: '#2F6B68', collar: '#F2F3F5', lashes: true },
  { id: 'samuel', name: 'Samuel', group: 'Umani', kind: 'human', bg: ['#E8E2D2'], skin: '#8A5A40', skinD: '#714831', hair: '#1D1613', hairStyle: 'afro', glasses: 'none', outfit: '#33373D', collar: '#E8E2D2' },
  { id: 'rose', name: 'Rose', group: 'Umani', kind: 'human', bg: ['#E4DDE0'], skin: '#EFCFB6', skinD: '#DAB293', hair: '#C3C7CF', hairStyle: 'bun', glasses: 'round', outfit: '#5E4A6B', collar: '#F2F3F5', lashes: true },
  { id: 'fox', name: 'Volpe Fox', group: 'Cartoni', kind: 'fox', bg: ['#CFE3E0'] },
  { id: 'gufo', name: 'Prof. Gufo', group: 'Cartoni', kind: 'owl', bg: ['#EADFC8'] },
  { id: 'bit', name: 'Bit il robot', group: 'Cartoni', kind: 'robot', bg: ['#D5DEEA'] },
  { id: 'elena', name: 'Elena', group: 'Umani', kind: 'human', bg: ['#F0DCCB'], skin: '#D9A27E', skinD: '#C18862', hair: '#2B1B17', hairStyle: 'curly', glasses: 'none', outfit: '#D96F3B', collar: '#F2F3F5', lashes: true },
  { id: 'luca', name: 'Luca', group: 'Umani', kind: 'human', bg: ['#D9E4EE'], skin: '#F0C8A5', skinD: '#DBA983', hair: '#2A2420', hairStyle: 'short', glasses: 'none', outfit: '#3B6EA5', collar: '#2E5686' },
  { id: 'cosmo', name: 'Cosmo astronauta', group: 'Umani', kind: 'astro', bg: ['#1E2A44'] },
  { id: 'micio', name: 'Micio', group: 'Cartoni', kind: 'cat', bg: ['#E6DCEB'] },
  { id: 'orso', name: 'Orso Bruno', group: 'Cartoni', kind: 'bear', bg: ['#DDE8D4'] },
  { id: 'draco', name: 'Draco', group: 'Cartoni', kind: 'dragon', bg: ['#F1E3C9'] },
  { id: 'pip', name: 'Pip', group: 'Alieni', kind: 'pip', bg: ['#C9D6EE'] },
  { id: 'zog', name: 'Zog', group: 'Alieni', kind: 'alien', bg: ['#D2D9EE'] },
  { id: 'nebula', name: 'Nebula', group: 'Alieni', kind: 'cyclops', bg: ['#E0D7F0'] },
  { id: 'mono', name: 'Solo iniziale', group: 'Minimale', kind: 'mono', bg: ['#2B3442'] }
];
export const AVATAR_GROUPS = ['Umani', 'Cartoni', 'Alieni', 'Minimale'];
export const avatarById = (id) => AVATARS.find((a) => a.id === id) || AVATARS[0];

const hairBack = (a) => {
  if (a.hairStyle === 'long') return `<path d="M48 104C34 44 74 18 102 18c32 0 62 26 50 90l8 70H40z" fill="${a.hair}"/>`;
  if (a.hairStyle === 'afro') return `<ellipse cx="100" cy="72" rx="66" ry="58" fill="${a.hair}"/>`;
  if (a.hairStyle === 'bun') return `<circle cx="100" cy="20" r="21" fill="${a.hair}"/>`;
  return '';
};
const hairFront = (a) => {
  const h = a.hair;
  if (a.hairStyle === 'long') return `<path d="M54 92C50 48 80 34 102 34c26 0 50 16 46 58-8-18-22-30-48-30-26 0-38 12-46 30z" fill="${h}"/>`;
  if (a.hairStyle === 'afro') return `<path d="M56 86C52 50 76 40 100 40s48 10 44 46c-8-16-22-26-44-26S64 70 56 86z" fill="${h}"/>`;
  if (a.hairStyle === 'curly') return `<path d="M54 92C44 46 76 24 102 24c32 0 56 24 46 68-6-22-22-32-48-32-26 0-38 10-46 32z" fill="${h}"/>` + [[64, 48, 13], [84, 36, 14], [108, 33, 14], [130, 42, 13], [142, 58, 11], [56, 64, 10]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${h}"/>`).join('');
  if (a.hairStyle === 'bun') return `<path d="M54 90C48 50 76 32 102 32c28 0 52 18 46 58-8-18-22-28-48-28S62 72 54 90z" fill="${h}"/>`;
  return `<path d="M54 92C46 46 78 26 102 26c32 0 52 24 46 66-6-22-22-32-48-32-24 0-38 12-46 32z" fill="${h}"/>`;
};
const glasses = (a) => {
  if (a.glasses === 'round') return `<g fill="rgba(255,255,255,.25)" stroke="#1B2A4A" stroke-width="3.5"><circle cx="80" cy="102" r="15"/><circle cx="120" cy="102" r="15"/><path d="M95 101h10M65 99l-10-4M135 99l10-4" fill="none"/></g>`;
  if (a.glasses === 'square') return `<g fill="rgba(255,255,255,.25)" stroke="#1B2A4A" stroke-width="3.5"><rect x="63" y="90" width="30" height="24" rx="7"/><rect x="107" y="90" width="30" height="24" rx="7"/><path d="M93 99h14M63 98l-9-4M137 98l9-4" fill="none"/></g>`;
  return '';
};

function human(a) {
  const mouthY = 134;
  return `
  <defs><clipPath id="clip-${a.id}"><circle cx="100" cy="100" r="98"/></clipPath></defs>
  <g clip-path="url(#clip-${a.id})">
  <rect width="200" height="200" fill="${a.bg[0]}"/>
  ${hairBack(a)}
  <path d="M30 210c2-44 30-60 70-60s68 16 70 60z" fill="${a.outfit}"/>
  <path d="M82 150l18 26 18-26z" fill="${a.collar}"/>
  <path d="M84 138h32v18a16 16 0 0 1-32 0z" fill="${a.skinD}"/>
  <ellipse cx="53" cy="108" rx="8" ry="12" fill="${a.skinD}"/><ellipse cx="147" cy="108" rx="8" ry="12" fill="${a.skinD}"/>
  <ellipse cx="100" cy="102" rx="48" ry="54" fill="${a.skin}"/>
  ${a.beard ? `<path d="M54 112c2 34 22 52 46 52s44-18 46-52c-6 14-18 22-46 22s-40-8-46-22z" fill="${a.beard}"/>` : ''}
  ${hairFront(a)}
  <g class="eyes"><ellipse cx="80" cy="104" rx="4.6" ry="5.2" fill="#26303F"/><ellipse cx="120" cy="104" rx="4.6" ry="5.2" fill="#26303F"/></g>
  ${a.lashes ? '<path d="M71 98l-5-3M74 94l-3-5M129 98l5-3M126 94l3-5" stroke="#1B2A4A" stroke-width="2.4" stroke-linecap="round"/>' : ''}
  <g class="brow" fill="none" stroke="${a.hair === '#C9CED8' ? '#9aa1b0' : a.hair}" stroke-width="3" stroke-linecap="round"><path d="M68 87q12-5 24 0M108 87q12-5 24 0"/></g>
  <path d="M100 108q-5 12 1 14" fill="none" stroke="${a.skinD}" stroke-width="3" stroke-linecap="round"/>
  ${a.freckles ? '<g fill="#D98A5F" opacity=".7"><circle cx="70" cy="120" r="1.8"/><circle cx="76" cy="124" r="1.8"/><circle cx="82" cy="119" r="1.8"/><circle cx="130" cy="120" r="1.8"/><circle cx="124" cy="124" r="1.8"/><circle cx="118" cy="119" r="1.8"/></g>' : ''}
  
  ${glasses(a)}
  ${mouths(mouthY, '#6E3A3F', '#B5707A')}
  </g>`;
}

/** cinque bocche: chiusa, aperta (parla), sorriso, pensiero, "oops" (errore) */
function mouths(y, dark, tongue, cx = 100) {
  const x = (n) => cx + n;
  return `
  <path class="m m-closed" d="M${x(-14)} ${y}q14 6 28 0" fill="none" stroke="${dark}" stroke-width="3.2" stroke-linecap="round"/>
  <g class="m m-open" style="display:none"><path d="M${x(-15)} ${y - 3}q15 5 30 0q-2 21-15 21t-15-21z" fill="${dark}"/><path d="M${x(-8)} ${y + 12}q8-7 16 0q-3 6-8 6t-8-6z" fill="${tongue}"/></g>
  <g class="m m-happy" style="display:none"><path d="M${x(-18)} ${y - 4}q18 4 36 0q-2 22-18 22t-18-22z" fill="${dark}"/><path d="M${x(-10)} ${y + 10}q10-8 20 0q-4 8-10 8t-10-8z" fill="${tongue}"/><path d="M${x(-8)} ${y - 2}h16v5H${x(-8)}z" fill="#fff"/></g>
  <path class="m m-think" style="display:none" d="M${x(-12)} ${y + 3}q11-5 24 1" fill="none" stroke="${dark}" stroke-width="3.2" stroke-linecap="round"/>
  <path class="m m-oops" style="display:none" d="M${x(-12)} ${y + 8}q12-10 24 0" fill="none" stroke="${dark}" stroke-width="3.4" stroke-linecap="round"/>`;
}
const frame = (a, inner, extra = '') => `
  <defs><clipPath id="clip-${a.id}"><circle cx="100" cy="100" r="98"/></clipPath>
  <radialGradient id="glow-${a.id}" cx=".3" cy=".2" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
  <g clip-path="url(#clip-${a.id})"><rect width="200" height="200" fill="${a.bg[0]}"/><rect width="200" height="200" fill="url(#glow-${a.id})"/>${extra}${inner}</g>`;
const eyeDot = (x, y, rx, ry, c = '#1D2433') => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${c}"/><circle cx="${x + rx * .3}" cy="${y - ry * .35}" r="${rx * .34}" fill="#fff"/>`;

function fox(a) {
  return frame(a, `
  <path d="M30 210c4-42 30-58 70-58s66 16 70 58z" fill="#2F4A5E"/>
  <path d="M62 152c10 22 28 30 38 30s28-8 38-30c-8-4-20-6-38-6s-30 2-38 6z" fill="#D9503B"/><path d="M118 160l10 40-18 6-6-32z" fill="#C0432F"/>
  <path d="M40 72L50 18l42 36z" fill="#E4701F"/><path d="M160 72L150 18l-42 36z" fill="#E4701F"/>
  <path d="M54 62l-1-24 22 15z" fill="#3B2A22"/><path d="M146 62l1-24-22 15z" fill="#3B2A22"/>
  <path d="M34 100C34 64 64 46 100 46s66 18 66 54c0 36-30 62-66 62S34 136 34 100z" fill="#EE8230"/>
  <path d="M34 104c8 10 26 16 44 14l22 8 22-8c18 2 36-4 44-14-4 34-30 58-66 58S38 138 34 104z" fill="#FFF3E4"/>
  <path d="M100 110c-8 0-14 4-14 9 0 7 14 12 14 12s14-5 14-12c0-5-6-9-14-9z" fill="#FFF3E4"/>
  <g class="eyes">${eyeDot(72, 92, 7, 9)}${eyeDot(128, 92, 7, 9)}</g>
  <g class="brow" fill="none" stroke="#8B3F0E" stroke-width="3.2" stroke-linecap="round"><path d="M60 76q12-6 24 0M116 76q12-6 24 0"/></g>
  <ellipse cx="100" cy="112" rx="9" ry="6.5" fill="#2A1D17"/><circle cx="97" cy="110" r="2" fill="#fff" opacity=".8"/>
  <path d="M42 112l-12 4M42 120l-12 0M158 112l12 4M158 120l12 0" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".0"/>
  ${mouths(132, '#6E2A2A', '#E88A8A')}`);
}

function owl(a) {
  return frame(a, `
  <path d="M26 210c6-40 32-52 74-52s68 12 74 52z" fill="#5B3F2A"/>
  <path d="M84 158l16 12 16-12-6 28h-20z" fill="#B8463A"/>
  <path d="M56 62l-8-34 34 22z" fill="#7B5336"/><path d="M144 62l8-34-34 22z" fill="#7B5336"/>
  <ellipse cx="100" cy="106" rx="68" ry="64" fill="#8B5E3C"/>
  <ellipse cx="100" cy="134" rx="44" ry="34" fill="#E9D3AA"/>
  <path d="M82 128q4 6 8 0M96 134q4 6 8 0M110 128q4 6 8 0M89 142q4 6 8 0M103 142q4 6 8 0" fill="none" stroke="#C9AB78" stroke-width="2.4" stroke-linecap="round"/>
  <circle cx="72" cy="92" r="31" fill="#F6EEDC"/><circle cx="128" cy="92" r="31" fill="#F6EEDC"/>
  <g class="eyes">${eyeDot(74, 94, 13, 14, '#2A1D17')}${eyeDot(126, 94, 13, 14, '#2A1D17')}</g>
  <g fill="none" stroke="#C9A24A" stroke-width="3.4"><circle cx="72" cy="92" r="30"/><circle cx="128" cy="92" r="30"/><path d="M102 90h-4M42 86l-10-4M158 86l10-4"/></g>
  <g class="brow" fill="none" stroke="#4A2E1B" stroke-width="4" stroke-linecap="round"><path d="M56 62q16-8 32 0M112 62q16-8 32 0"/></g>
  <path d="M58 46L100 30l42 16-42 14z" fill="#262B36"/><path d="M80 56v10q20 8 40 0V56l-20 8z" fill="#262B36"/><path d="M142 46v22" stroke="#D9B04A" stroke-width="3"/><circle cx="142" cy="70" r="4" fill="#D9B04A"/>
  <path d="M91 108h18l-9 12z" fill="#EE9B2D"/>
  <g transform="translate(0 6)">${mouths(124, '#4B2A1C', '#E88A8A')}</g>`);
}

function robot(a) {
  return frame(a, `
  <rect x="44" y="156" width="112" height="60" rx="26" fill="#4A5A78"/><rect x="86" y="144" width="28" height="18" rx="6" fill="#9AA6BF"/>
  <circle cx="100" cy="22" r="8" fill="#E0674B" class="wob"/><path d="M100 30v16" stroke="#7C89A6" stroke-width="4" stroke-linecap="round"/>
  <rect x="26" y="84" width="16" height="36" rx="8" fill="#9AA6BF"/><rect x="158" y="84" width="16" height="36" rx="8" fill="#9AA6BF"/>
  <rect x="36" y="44" width="128" height="106" rx="36" fill="#E9EEF6" stroke="#BCC7DC" stroke-width="3"/>
  <rect x="50" y="58" width="100" height="78" rx="26" fill="#18212F"/>
  <g class="eyes"><rect x="66" y="74" width="22" height="26" rx="10" fill="#5CE1E6"/><rect x="112" y="74" width="22" height="26" rx="10" fill="#5CE1E6"/><circle cx="73" cy="82" r="4" fill="#fff" opacity=".85"/><circle cx="119" cy="82" r="4" fill="#fff" opacity=".85"/></g>
  <g class="brow" fill="none" stroke="#5CE1E6" stroke-width="3.5" stroke-linecap="round"><path d="M66 68h22M112 68h22"/></g>
  <rect x="58" y="108" width="10" height="6" rx="3" fill="#E0674B" opacity=".7"/><rect x="132" y="108" width="10" height="6" rx="3" fill="#E0674B" opacity=".7"/>
  ${mouths(118, '#5CE1E6', '#2A8F95')}`);
}

function alien(a) {
  return frame(a, `
  <circle cx="30" cy="40" r="2" fill="#fff"/><circle cx="170" cy="150" r="2.4" fill="#fff"/><circle cx="160" cy="30" r="1.6" fill="#fff"/><circle cx="26" cy="140" r="1.6" fill="#fff"/>
  <path d="M30 210c6-34 30-46 70-46s64 12 70 46z" fill="#8E9BB8"/><path d="M80 164h40l-8 14H88z" fill="#C7D0E4"/>
  <path d="M82 40L62 12M118 40l20-28" stroke="#4F9B4C" stroke-width="4" stroke-linecap="round"/><circle cx="62" cy="11" r="8" fill="#F5D547" class="wob"/><circle cx="138" cy="11" r="8" fill="#F5D547" class="wob b"/>
  <path d="M100 30c50 0 72 48 66 90-6 38-34 52-66 52S40 158 34 120C28 78 50 30 100 30z" fill="#7CCB6A"/>
  <path d="M40 130c8 24 30 36 60 36s52-12 60-36c-8 34-30 46-60 46S48 164 40 130z" fill="#5FB052" opacity=".6"/>
  <g class="eyes"><g transform="rotate(-12 72 100)">${eyeDot(72, 100, 17, 23)}</g><g transform="rotate(12 128 100)">${eyeDot(128, 100, 17, 23)}</g></g>
  <g class="brow" fill="none" stroke="#3E8A3B" stroke-width="3.4" stroke-linecap="round"><path d="M54 70q14-8 28 0M118 70q14-8 28 0"/></g>
  <circle cx="94" cy="124" r="1.8" fill="#3E8A3B"/><circle cx="106" cy="124" r="1.8" fill="#3E8A3B"/>
  ${mouths(144, '#2F5B2D', '#E88A8A')}`);
}

function cyclops(a) {
  return frame(a, `
  <path d="M26 210c4-40 32-54 74-54s70 14 74 54z" fill="#3E4D78"/><path d="M40 190h120M34 176h132" stroke="#E6B84C" stroke-width="5" opacity=".9"/>
  <path d="M58 62l-6-28 26 18z" fill="#6E52B5"/><path d="M142 62l6-28-26 18z" fill="#6E52B5"/>
  <circle cx="100" cy="102" r="66" fill="#9C7FDB"/>
  <ellipse cx="100" cy="138" rx="46" ry="24" fill="#B8A0EA" opacity=".55"/>
  <g class="eyes"><ellipse cx="100" cy="90" rx="34" ry="32" fill="#fff"/><circle cx="100" cy="92" r="18" fill="#2FB6A8"/><circle cx="100" cy="92" r="9" fill="#14262B"/><circle cx="106" cy="85" r="4.4" fill="#fff"/></g>
  <g class="brow" fill="none" stroke="#5B3FA8" stroke-width="4.5" stroke-linecap="round"><path d="M68 54q32-14 64 0"/></g>
  <circle cx="58" cy="124" r="7" fill="#F2A0C2" opacity=".55"/><circle cx="142" cy="124" r="7" fill="#F2A0C2" opacity=".55"/>
  ${mouths(138, '#43276E', '#F08BA8')}
  <path d="M90 134l4 9 4-9zM102 134l4 9 4-9z" fill="#fff" opacity="0"/>`);
}


function cat(a) {
  return frame(a, `
  <path d="M28 210c6-40 32-54 72-54s66 14 72 54z" fill="#7A4E8C"/>
  <path d="M84 158l16 10 16-10 4 16-20 8-20-8z" fill="#E7C85A"/><path d="M92 170l8 6 8-6-8-5z" fill="#C9A92F"/>
  <path d="M38 78L40 22l44 30z" fill="#9AA3AE"/><path d="M162 78l-2-56-44 30z" fill="#9AA3AE"/><path d="M50 62l1-22 20 14z" fill="#E9A6B8"/><path d="M150 62l-1-22-20 14z" fill="#E9A6B8"/>
  <path d="M30 104C30 66 62 48 100 48s70 18 70 56c0 36-32 56-70 56s-70-20-70-56z" fill="#9AA3AE"/>
  <path d="M100 52v24M88 54l4 18M112 54l-4 18" stroke="#7D8793" stroke-width="4" stroke-linecap="round"/>
  <path d="M58 118c8-12 24-14 42-14s34 2 42 14c-4 22-20 38-42 38s-38-16-42-38z" fill="#F4F1EC"/>
  <g class="eyes">${eyeDot(70, 94, 10, 12, '#1F2A24')}${eyeDot(130, 94, 10, 12, '#1F2A24')}</g>
  <g fill="none" stroke="#2B2F3A" stroke-width="3"><circle cx="70" cy="94" r="19"/><circle cx="130" cy="94" r="19"/><path d="M89 92h22"/></g>
  <g class="brow" fill="none" stroke="#6C7682" stroke-width="3.4" stroke-linecap="round"><path d="M54 68q14-6 28 0M118 68q14-6 28 0"/></g>
  <path d="M93 112h14l-7 8z" fill="#E58AA0"/>
  <path d="M60 126l-26-4M60 132l-26 6M140 126l26-4M140 132l26 6" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".9"/>
  ${mouths(134, '#6A2E3C', '#E88A8A')}`);
}
function bear(a) {
  return frame(a, `
  <path d="M26 210c6-40 32-54 74-54s68 14 74 54z" fill="#D8A93B"/><path d="M100 160v50M80 166v44M120 166v44" stroke="#B88B26" stroke-width="3"/>
  <circle cx="52" cy="56" r="24" fill="#7A5232"/><circle cx="148" cy="56" r="24" fill="#7A5232"/><circle cx="52" cy="58" r="12" fill="#D9A98A"/><circle cx="148" cy="58" r="12" fill="#D9A98A"/>
  <path d="M32 106c0-38 32-56 68-56s68 18 68 56c0 36-30 56-68 56S32 142 32 106z" fill="#8F6340"/>
  <ellipse cx="100" cy="126" rx="38" ry="30" fill="#E9CDA6"/>
  <g class="eyes">${eyeDot(70, 94, 7.5, 9, '#20150F')}${eyeDot(130, 94, 7.5, 9, '#20150F')}</g>
  <g class="brow" fill="none" stroke="#4E3320" stroke-width="3.6" stroke-linecap="round"><path d="M56 76q14-7 28 0M116 76q14-7 28 0"/></g>
  <ellipse cx="100" cy="112" rx="12" ry="8.5" fill="#20150F"/><circle cx="96" cy="109" r="2.6" fill="#fff" opacity=".7"/>
  ${mouths(134, '#5A2A22', '#E88A8A')}`);
}
function dragon(a) {
  return frame(a, `
  <path d="M28 210c6-38 30-52 72-52s66 14 72 52z" fill="#3B7C8C"/><path d="M76 160q24 22 48 0l-4 24h-40z" fill="#EBD9A8"/>
  <path d="M78 42l-10-30 26 20zM122 42l10-30-26 20z" fill="#EBD9A8"/>
  <path d="M100 30l-8 12h16zM86 36l-6 10 14-2zM114 36l6 10-14-2z" fill="#E08A3B"/>
  <path d="M34 108C34 66 64 44 100 44s66 22 66 64c0 38-30 56-66 56s-66-18-66-56z" fill="#6CBF6B"/>
  <path d="M40 124c10 26 32 36 60 36s50-10 60-36c-6 34-30 48-60 48S46 158 40 124z" fill="#4FA24F" opacity=".55"/>
  <ellipse cx="100" cy="128" rx="42" ry="28" fill="#CDEAA8"/>
  <g class="eyes"><circle cx="72" cy="92" r="13" fill="#fff"/><circle cx="128" cy="92" r="13" fill="#fff"/>${eyeDot(74, 94, 8, 10, '#2A3A1F')}${eyeDot(126, 94, 8, 10, '#2A3A1F')}</g>
  <g class="brow" fill="none" stroke="#2F6B2E" stroke-width="4" stroke-linecap="round"><path d="M56 70q16-8 32 0M112 70q16-8 32 0"/></g>
  <circle cx="90" cy="118" r="3" fill="#3C7F3A"/><circle cx="110" cy="118" r="3" fill="#3C7F3A"/>
  ${mouths(138, '#4A2A1C', '#E88A8A')}`);
}
function pip(a) {
  return frame(a, `
  <circle cx="32" cy="46" r="2.2" fill="#fff"/><circle cx="168" cy="150" r="2" fill="#fff"/><circle cx="156" cy="34" r="1.6" fill="#fff"/><circle cx="30" cy="146" r="1.6" fill="#fff"/>
  <path d="M30 210c6-34 30-46 70-46s64 12 70 46z" fill="#E48E4A"/><path d="M70 170q30 18 60 0" stroke="#fff" stroke-width="4" fill="none" opacity=".7"/>
  <path d="M100 38V12" stroke="#2F78C0" stroke-width="4" stroke-linecap="round"/><path d="M100 0l4 9 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z" fill="#F5D547" class="wob"/>
  <path d="M100 34c46 0 70 34 66 76-4 40-32 62-66 62S38 150 34 110C30 68 54 34 100 34z" fill="#5DA8E6"/>
  <path d="M42 128c8 24 28 38 58 38s50-14 58-38c-8 34-28 48-58 48s-50-14-58-48z" fill="#3E8AD0" opacity=".55"/>
  <g class="eyes">${eyeDot(66, 98, 14, 17)}${eyeDot(134, 98, 14, 17)}${eyeDot(100, 76, 10, 12)}</g>
  <g class="brow" fill="none" stroke="#2F78C0" stroke-width="3.4" stroke-linecap="round"><path d="M50 74q14-8 28 0M122 74q14-8 28 0"/></g>
  <circle cx="52" cy="124" r="7" fill="#F2A0A8" opacity=".55"/><circle cx="148" cy="124" r="7" fill="#F2A0A8" opacity=".55"/>
  ${mouths(140, '#2A4B78', '#E88A8A')}`);
}
function astro(a) {
  return frame(a, `
  <circle cx="30" cy="40" r="2" fill="#fff"/><circle cx="168" cy="52" r="2.4" fill="#fff"/><circle cx="150" cy="150" r="1.6" fill="#fff"/><circle cx="34" cy="150" r="1.8" fill="#fff"/><circle cx="120" cy="20" r="1.4" fill="#fff"/>
  <path d="M26 210c4-40 32-52 74-52s70 12 74 52z" fill="#E9EDF4"/><rect x="62" y="176" width="22" height="14" rx="3" fill="#E0674B"/><rect x="92" y="176" width="46" height="6" rx="3" fill="#7C89A6"/>
  <circle cx="100" cy="98" r="72" fill="#F1F4F9" stroke="#BFC8DA" stroke-width="4"/>
  <ellipse cx="100" cy="102" rx="56" ry="50" fill="#1C2740"/>
  <ellipse cx="100" cy="106" rx="46" ry="42" fill="#EBC4A4"/>
  <path d="M62 82c10-14 26-20 40-20-10 6-24 14-40 20z" fill="#4A3426"/>
  <g class="eyes">${eyeDot(80, 100, 5.5, 6.5)}${eyeDot(120, 100, 5.5, 6.5)}</g>
  <g class="brow" fill="none" stroke="#4A3426" stroke-width="3.2" stroke-linecap="round"><path d="M68 86q12-6 24 0M108 86q12-6 24 0"/></g>
  <circle cx="68" cy="116" r="6" fill="#F2A0A8" opacity=".5"/><circle cx="132" cy="116" r="6" fill="#F2A0A8" opacity=".5"/>
  ${mouths(128, '#7A3B3B', '#E88A8A')}
  <path d="M60 70q8-14 26-18" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".55"/>`);
}
function mono(a, name) {
  const ch = (String(name || 'T').trim().charAt(0) || 'T').toUpperCase();
  return `<rect width="200" height="200" fill="${a.bg[0]}"/>
  <text x="100" y="118" text-anchor="middle" font-family="Georgia,serif" font-size="92" font-weight="600" fill="#F1EFE8">${ch.replace(/[<&]/g, '')}</text>
  <g stroke="#C9A45C" stroke-width="5" stroke-linecap="round" fill="none">
  <path class="m m-closed" d="M80 150h40"/>
  <path class="m m-open" style="display:none" d="M72 150h8M86 142v16M100 134v32M114 142v16M120 150h8"/>
  <path class="m m-happy" style="display:none" d="M80 144q20 14 40 0"/>
  <path class="m m-oops" style="display:none" d="M80 156q20-14 40 0"/>
  <path class="m m-think" style="display:none" d="M86 150h4M98 150h4M110 150h4"/></g>`;
}

/** foto con animazioni disegnate sopra: bocca che parla, battito di ciglia, sopracciglia, broncio */
function photo(a) {
  const skin = '#EDB79B', lip = '#C96F73', dark = '#5A2A30';
  return `
  <defs><filter id="soft-${a.id}" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="1.1"/></filter></defs>
  <rect width="200" height="200" fill="${a.bg[0]}"/>
  <g class="head">
    <image href="${a.photo}" width="200" height="200" preserveAspectRatio="xMidYMid slice"/>
    <g class="ph-lids" filter="url(#soft-${a.id})"><ellipse cx="84" cy="62" rx="9.5" ry="5.2" fill="${skin}"/><ellipse cx="112" cy="58.5" rx="9.5" ry="5.2" fill="${skin}"/>
      <path d="M75 63q9 4 18 0M103 59.5q9 4 18 0" fill="none" stroke="#4B3328" stroke-width="1.2" stroke-linecap="round"/></g>
    <path class="m m-closed" d="M0 0" fill="none"/>
    <g class="m m-open" style="display:none"><ellipse cx="102" cy="91" rx="14.5" ry="6.5" fill="${skin}" filter="url(#soft-${a.id})"/>
      <path d="M90 89q12 -3 24 -2q-1 11 -12 11.5t-12 -9.5z" fill="${dark}"/><path d="M95 94.5q7 -4 14 0q-3 3.5 -7 3.5t-7 -3.5z" fill="#B8505A"/>
      <path d="M90 89q12 -3 24 -2" fill="none" stroke="${lip}" stroke-width="2.2" stroke-linecap="round"/><path d="M92 97q10 5 20 0" fill="none" stroke="${lip}" stroke-width="2.2" stroke-linecap="round"/></g>
    <g class="m m-happy" style="display:none"><ellipse cx="102" cy="91" rx="16" ry="7.5" fill="${skin}" filter="url(#soft-${a.id})"/>
      <path d="M88 88.5q14 -4 28 -1q-2 13 -14 13t-14 -12z" fill="${dark}"/><path d="M90 88.5q12 -3 24 -1v3.5q-12 2 -24 0z" fill="#fff"/><path d="M95 95q7 -4 14 0q-3 4 -7 4t-7 -4z" fill="#B8505A"/>
      <path d="M88 88.5q14 -4 28 -1" fill="none" stroke="${lip}" stroke-width="2.2" stroke-linecap="round"/></g>
    <path class="m m-think" style="display:none" d="M92 92q10 -3 20 0" fill="none" stroke="${lip}" stroke-width="2.6" stroke-linecap="round"/>
    <g class="m m-oops" style="display:none"><ellipse cx="102" cy="91" rx="15" ry="6" fill="${skin}" filter="url(#soft-${a.id})"/>
      <path d="M91 95q11 -9 22 -1" fill="none" stroke="${lip}" stroke-width="3" stroke-linecap="round"/>
      <path d="M75 54.5L95 59.5M103 59L122 50.5" fill="none" stroke="#5F4030" stroke-width="3.2" stroke-linecap="round" filter="url(#soft-${a.id})"/></g>
  </g>`;
}

export function avatarSVG(id, name) {
  const a = avatarById(id);
  const inner = a.kind === 'photo' ? photo(a) : a.kind === 'mono' ? mono(a, name) : a.kind === 'fox' ? fox(a) : a.kind === 'owl' ? owl(a) : a.kind === 'robot' ? robot(a) : a.kind === 'alien' ? alien(a) : a.kind === 'cyclops' ? cyclops(a) : a.kind === 'cat' ? cat(a) : a.kind === 'bear' ? bear(a) : a.kind === 'dragon' ? dragon(a) : a.kind === 'pip' ? pip(a) : a.kind === 'astro' ? astro(a) : human(a);
  return `<svg viewBox="0 0 200 200" class="tutor-svg" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}
