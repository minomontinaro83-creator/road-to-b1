/* Service worker: l'app funziona anche offline (ripasso e lettura). Rete prima, poi copia salvata. */
const CACHE = 'rtb1-v17';
const CORE = ['./', 'index.html', 'manifest.json', 'css/style.css', 'icon-192.png', 'icon-512.png', 'assets/sofia.png',
  'js/main.js', 'js/version.js', 'version.json', 'js/util.js', 'js/srs.js', 'js/levels.js', 'js/lexicon.js', 'js/lexicon-data.js', 'js/story.js', 'js/store.js', 'js/api.js', 'js/tts.js',
  'js/prompts.js', 'js/engine.js', 'js/cards.js', 'js/images.js', 'js/progress.js',
  'js/ui/dom.js', 'js/ui/tutor.js', 'js/ui/reader.js', 'js/ui/review.js', 'js/ui/test.js', 'js/ui/chat.js', 'js/ui/session.js', 'js/ui/home.js',
  'js/ui/notebook.js', 'js/ui/progressview.js', 'js/ui/settings.js', 'js/ui/onboarding.js', 'js/ui/article.js', 'js/ui/appearance.js', 'js/ui/avatars.js', 'js/ui/books.js', 'js/epub.js', 'js/docs.js', 'js/covers.js'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== 'rtb1-fonts').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) { // caratteri: prima la copia salvata, così funzionano anche offline
    e.respondWith(caches.open('rtb1-fonts').then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; }))));
    return;
  }
  if (url.origin !== location.origin) return; // API e voce online: mai dalla cache
  e.respondWith(fetch(req).then((res) => {
    if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((r) => r || caches.match('index.html'))));
});
