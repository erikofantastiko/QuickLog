// QuickLog service worker — offline app-shell for the core (Sizer + Log + PNG).
// The chart (TradingView) and any price feeds stay ONLINE-ONLY: cross-origin
// requests are passed straight through to the network and never cached.
//
// Strategy:
//   install  -> precache the app shell, then skipWaiting (take over immediately)
//   activate -> drop stale quicklog-* caches, then clients.claim()
//   fetch    -> same-origin GET: stale-while-revalidate (serve cache fast,
//               refresh in the background); everything else: network passthrough.

'use strict';

var CACHE = 'quicklog-v1';

// App shell — relative paths (GitHub Pages serves this under a subpath).
var SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './vendor/html2canvas.min.js',
  './vendor/lightweight-charts.standalone.production.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // addAll is atomic; if a single asset 404s the whole precache rejects.
      // Add individually and ignore per-item failures so a missing optional
      // icon never blocks the install of an otherwise-cacheable shell.
      return Promise.all(SHELL.map(function (url) {
        return cache.add(url).catch(function () { /* skip unavailable asset */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE && key.indexOf('quicklog-') === 0) {
          return caches.delete(key);
        }
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;

  // Only GET is cacheable; let POST/PUT/etc. go straight to the network.
  if (req.method !== 'GET') return;

  // Same-origin only. Cross-origin (TradingView s3/s.tradingview.com, Kraken
  // api.kraken.com OHLC, OANDA, CDNs) is passed through untouched and never
  // cached.
  var sameOrigin = new URL(req.url).origin === self.location.origin;
  if (!sameOrigin) return; // default browser fetch

  // Stale-while-revalidate: respond from cache immediately if present, and
  // refresh the cached copy in the background. Fall back to network on miss.
  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req).then(function (cached) {
        var network = fetch(req).then(function (res) {
          if (res && res.status === 200 && res.type === 'basic') {
            cache.put(req, res.clone());
          }
          return res;
        }).catch(function () { return cached; });
        return cached || network;
      });
    })
  );
});
