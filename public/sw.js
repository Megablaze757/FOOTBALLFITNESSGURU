// PocketAthlete service worker.
//
// Three jobs: keep the app usable without signal, receive push notifications,
// and open the right page when one is tapped.
//
// Deliberately hand-written rather than generated. This is a static export with
// content-hashed chunks, so a precache manifest would need regenerating on every
// build and would go stale the moment it didn't. Runtime caching needs no build
// step and degrades to "just the network" if anything here is wrong.

const VERSION = "v1";
const SHELL = `shell-${VERSION}`;   // navigations
const ASSETS = `assets-${VERSION}`; // hashed JS/CSS/fonts/images

self.addEventListener("install", (event) => {
  // Take over as soon as we're ready rather than waiting for every tab to
  // close — otherwise a fix ships and nobody sees it for days.
  self.skipWaiting();
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/offline.html"])));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from older versions, or storage grows forever.
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !n.endsWith(VERSION)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

// --- Fetch -------------------------------------------------------------------

function isAsset(url) {
  return url.pathname.startsWith("/_next/static/") ||
         /\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Only our own origin. Supabase and the API Worker must never be served from
  // cache — stale training data or a cached auth response would be worse than
  // an error.
  if (url.origin !== self.location.origin) return;

  // Hashed assets never change under the same URL, so cache-first is safe and
  // makes a repeat open essentially instant.
  if (isAsset(url)) {
    event.respondWith(
      caches.match(req).then((hit) =>
        hit || fetch(req).then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(ASSETS).then((c) => c.put(req, copy)); }
          return res;
        }),
      ),
    );
    return;
  }

  // Pages: network first, so a signed-in athlete always gets fresh data when
  // they have signal, and a cached copy (or the offline page) when they don't.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); }
          return res;
        } catch {
          return (await caches.match(req)) ||
                 (await caches.match("/offline.html")) ||
                 new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        }
      })(),
    );
  }
});

// --- Push --------------------------------------------------------------------
//
// Pushes are sent without a payload. Encrypting one (RFC 8291) is a lot of
// crypto to get exactly right, and for a "check in this morning" nudge the
// message is the same every time — the value is that the phone buzzes at all.
// `data` is still read defensively so an encrypted payload can be added later
// without shipping a new worker to every installed device first.

self.addEventListener("push", (event) => {
  let body = "Two minutes: log your sleep, soreness and how you feel.";
  let title = "Morning check-in";
  let url = "/journal/";

  if (event.data) {
    try {
      const d = event.data.json();
      title = d.title || title;
      body = d.body || body;
      url = d.url || url;
    } catch { /* not JSON — keep the defaults */ }
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/logo.png",
      badge: "/logo.png",
      // Same tag = a second reminder replaces the first rather than stacking
      // three identical notifications on a phone that was off all morning.
      tag: "pocketathlete-reminder",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/journal/";

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Focus an open tab rather than opening a fourth copy of the app.
      for (const client of all) {
        if (client.url.includes(self.location.origin)) {
          await client.focus();
          if ("navigate" in client) { try { await client.navigate(target); } catch { /* focus is enough */ } }
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
