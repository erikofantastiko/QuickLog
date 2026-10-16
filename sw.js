// QuickLog service worker — offline app-shell for the core (Sizer + Log + PNG).
// The chart (TradingView) and any price feeds stay ONLINE-ONLY: cross-origin
// requests are passed straight through to the network and never cached.
//
// Versioning: app.js registers './sw.js?v=<APP_VERSION>'. A new APP_VERSION is a
// new script URL → the browser installs this worker again with a fresh cache
// name, and activate drops the old quicklog-* caches. Bump APP_VERSION in app.js
// only; there is no second version string to keep in sync here.
//
// Strategy:
//   install  -> precache the app shell, then skipWaiting (take over immediately)
//   activate -> drop stale quicklog-* caches, then clients.claim()
//   fetch    -> same-origin code (navigation, .html/.js/.css/.webmanifest):
//                 NETWORK-FIRST, so a deploy is live on the next load; cache
//                 fallback when offline or when the network takes > 3 s.
//               same-origin static (icons, vendor libs): stale-while-revalidate.
//               everything else: network passthrough.

'use strict';

var VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
var CACHE = 'quicklog-' + VERSION;
var NETWORK_TIMEOUT_MS = 3000;

// App shell — relative paths (GitHub Pages serves this under a subpath).
var SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './vendor/html2canvas.min.js',
  './vendor/lightweight-charts.standalone.production.js',
  './manifest.webmanifest',
  './icons/icon.svg',
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

// App code that must never lag behind a deploy.
function isAppCode(req, url) {
  if (req.mode === 'navigate') return true;
  return /\.(html|js|css|webmanifest)$/.test(url.pathname) && url.pathname.indexOf('/vendor/') < 0;
}

function cacheOk(res) { return res && res.status === 200 && res.type === 'basic'; }

self.addEventListener('fetch', function (event) {
  var req = event.request;

  // Only GET is cacheable; let POST/PUT/etc. go straight to the network.
  if (req.method !== 'GET') return;

  // Same-origin only. Cross-origin (TradingView s3/s.tradingview.com, Kraken
  // api.kraken.com OHLC, Twelve Data api.twelvedata.com FX/metal OHLC, OANDA,
  // CDNs) is passed through untouched and never cached.
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // default browser fetch

  // Navigations may carry a query string; match the cached shell regardless.
  var matchOpts = { ignoreSearch: req.mode === 'navigate' };

  if (isAppCode(req, url)) {
    // Network-first with cache fallback (offline / slow network).
    event.respondWith(
      caches.open(CACHE).then(function (cache) {
        return cache.match(req, matchOpts).then(function (cached) {
          // cache:'no-cache' = revalidate with the server (cheap 304 via ETag).
          // Without it the browser HTTP cache (GitHub Pages: max-age=600) answers
          // with the old file and "network-first" would still serve the old app.
          var network = fetch(req, { cache: 'no-cache' }).then(function (res) {
            if (cacheOk(res)) { cache.put(req, res.clone()); return res; }
            return cached || res; // 404/5xx mid-deploy: keep the last good copy
          });
          if (!cached) return network;
          var timeout = new Promise(function (resolve) {
            setTimeout(function () { resolve(cached); }, NETWORK_TIMEOUT_MS);
          });
          return Promise.race([network.catch(function () { return cached; }), timeout]);
        });
      })
    );
    return;
  }

  // Stale-while-revalidate for static assets (icons, vendored libs).
  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req, matchOpts).then(function (cached) {
        var network = fetch(req).then(function (res) {
          if (cacheOk(res)) cache.put(req, res.clone());
          return res;
        }).catch(function () { return cached; });
        return cached || network;
      });
    })
  );
});
