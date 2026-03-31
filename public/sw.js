const CACHE_NAME = 'delivery-cache-v1';
const urls = ['/','/index.html','/courier.html','/admin.html','/css/style.css'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(urls)));
});
self.addEventListener('fetch',e=>{
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});