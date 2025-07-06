// This is the service worker for the CAD/CAM PWA

const CACHE_NAME = "cadcam-v2";
const urlsToCache = [
  // Pagine essenziali
  "/",
  "/offline", 
  "/manifest.json",
  
  // Dashboard e navigazione principale  
  "/projects",
  "/analytics",
  "/settings", 
  "/profile",
  
  // Editor principali CAD/CAM

  
  // Librerie e risorse
  "/library", 
  "/components",
  "/materials",
  "/tools",
  
  // Pagine AI e assistenza
  "/ai",
  "/chat",
  
 
  
  // Risorse statiche critiche

  // Cursori personalizzati

  
  // Suoni dell'interfaccia
  "/sounds/notification.mp3"
];

// Versione del service worker
const SW_VERSION = "2.0.0";

// Install service worker and cache the static assets
self.addEventListener("install", event => {
  console.log(`Service Worker installato v${SW_VERSION}`);

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );

  self.skipWaiting();
});

// Activate the service worker
self.addEventListener("activate", event => {
  console.log(`Service Worker attivato v${SW_VERSION}`);

  event.waitUntil(
    caches
      .keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Intercept fetch requests
self.addEventListener("fetch", event => {
  // Cache strategy per diversi tipi di richieste
  if (event.request.method !== "GET") return;
  
  // Cache First per risorse statiche
  if (event.request.url.includes("/static/") || 
      event.request.url.includes("/fonts/") ||
      event.request.url.includes("/icons/") ||
      event.request.url.includes("/cursors/") ||
      event.request.url.includes("/sounds/")) {
    
    event.respondWith(
      caches.match(event.request).then(response => {
        return response || fetch(event.request);
      })
    );
    return;
  }
  
  // Network First per API e pagine dinamiche
  if (event.request.url.includes("/api/") || 
      event.request.url.includes("/auth/")) {
    
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache successful API responses (solo GET)
          if (response.status === 200 && event.request.method === "GET") {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache se offline
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // Stale While Revalidate per pagine principali
  event.respondWith(
    caches.match(event.request).then(response => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        // Aggiorna cache in background
        if (networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      });
      
      // Restituisci cache se disponibile, altrimenti network
      return response || fetchPromise;
    }).catch(() => {
      // Fallback alla pagina offline per navigazione
      if (event.request.mode === "navigate") {
        return caches.match("/offline");
      }
    })
  );
});

// Push event - Gestisce le notifiche push in arrivo
self.addEventListener("push", event => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    console.log("Push notification ricevuta:", data);

    // Mostra la notifica
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.content,
        icon: "https://cadcamfun.xyz/favicon.ico",

        data: {
          url: data.linkUrl || "/"
        }
      })
    );
  } catch (err) {
    console.error("Errore nell'elaborazione della notifica push:", err);
  }
});

// Notification click event - Apre l'URL associato alla notifica quando viene cliccata
self.addEventListener("notificationclick", event => {
  event.notification.close();

  const url = event.notification.data.url;

  event.waitUntil(
    clients.matchAll({ type: "window" }).then(clientsArr => {
      // Controlla se c'è già una finestra aperta e naviga ad essa
      const hadWindowToFocus = clientsArr.some(windowClient => {
        if (windowClient.url === url) {
          windowClient.focus();
          return true;
        }
        return false;
      });

      // Altrimenti apri una nuova finestra
      if (!hadWindowToFocus) {
        clients.openWindow(url);
      }
    })
  );
});
