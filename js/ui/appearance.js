import { getSettings } from '../store.js';

export const FONTS = {
  serif: { label: 'Con grazie (Georgia)', css: 'Georgia, "Noto Serif", "Times New Roman", serif' },
  sans: { label: 'Senza grazie', css: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  
  clear: { label: 'Molto leggibile', css: 'Verdana, Tahoma, "DejaVu Sans", sans-serif' }
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
