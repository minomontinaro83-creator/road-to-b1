import { getSettings } from '../store.js';

export const FONTS = {
  serif: { label: 'Georgia (con grazie)', css: 'Georgia, "Noto Serif", "Times New Roman", serif' },
  times: { label: 'Times New Roman', css: '"Times New Roman", Times, Tinos, "Liberation Serif", serif' },
  inter: { label: 'Inter (senza grazie, moderno)', css: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  lora: { label: 'Lora (con grazie, elegante)', css: 'Lora, Georgia, serif' },
  merri: { label: 'Merriweather (con grazie, robusto)', css: 'Merriweather, Georgia, serif' },
  source: { label: 'Source Serif (con grazie, nitido)', css: '"Source Serif 4", Georgia, serif' },
  literata: { label: 'Literata (da libro)', css: 'Literata, Georgia, serif' },
  atkinson: { label: 'Atkinson Hyperlegible (alta leggibilità)', css: '"Atkinson Hyperlegible", Verdana, sans-serif' },
  lexend: { label: 'Lexend (lettura facilitata)', css: 'Lexend, Verdana, sans-serif' },
  sans: { label: 'Senza grazie (di sistema)', css: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  clear: { label: 'Verdana (molto leggibile)', css: 'Verdana, Tahoma, "DejaVu Sans", sans-serif' }
};
export const COLORS = { blue: '#2F5D8C', teal: '#2E6F6A', wine: '#8A3B4B', graphite: '#3E4553', ochre: '#8F6A22' };

export function applyAppearance() {
  const s = getSettings();
  const root = document.documentElement;
  let theme = s.theme;
  if (theme === 'auto') theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.dataset.theme = theme;
  root.style.setProperty('--read-font', (FONTS[s.font] || FONTS.serif).css);
  root.style.setProperty('--read-size', s.fontSize + 'px');
  root.style.setProperty('--pad', s.margin + 'px');
  root.style.setProperty('--page-pad', s.pageInner + 'px');
  root.style.setProperty('--maxw', s.fullWidth ? 'none' : '640px');
  root.style.setProperty('--read-lh', String(s.lineHeight));
  root.style.setProperty('--accent', COLORS[s.color] || COLORS.blue);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#14171C' : theme === 'sepia' ? '#F1E8D6' : '#F6F5F1');
}
