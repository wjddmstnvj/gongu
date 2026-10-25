// 오프라인에서도 앱 화면이 열리도록 정적 파일 캐시
const CACHE = 'gonggu-v5';
const ASSETS = ['./', './index.html', './css/style.css', './js/icons.js', './js/categories.js', './js/regions.js', './js/store.js', './js/app.js', './icon.svg', './manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

// 키워드 알림을 누르면 해당 상품 화면을 연다
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const win = list.find(c => 'focus' in c);
    if (win) return win.navigate(url).then(c => (c || win).focus());
    return clients.openWindow(url);
  }));
});

// 네트워크 우선, 실패 시 캐시
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request))
  );
});
