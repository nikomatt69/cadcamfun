// This is the service worker for the CAD/CAM PWA

const CACHE_NAME = 'cadcam-v2';
const urlsToCache = [
  '/offline',
  '/manifest.json',
];

// Versione del service worker
const SW_VERSION = '2.0.0';

// Install service worker and cache the static assets
self.addEventListener('install', (event) => {
  console.log(`Service Worker installato v${SW_VERSION}`);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
  
  self.skipWaiting();
});

// Activate the service worker
self.addEventListener('activate', (event) => {
  console.log(`Service Worker attivato v${SW_VERSION}`);
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercept fetch requests
self.addEventListener('fetch', (event) => {
  // Strategia di cache qui, se necessario
});

// Push event - Gestisce le notifiche push in arrivo
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    console.log('Push notification ricevuta:', data);
    
    // Mostra la notifica
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.content,
        icon: 'https://cadcamfun.xyz/favicon.ico',
          
        data: {
          url: data.linkUrl || '/'
        }
      })
    );
  } catch (err) {
    console.error('Errore nell\'elaborazione della notifica push:', err);
  }
});

// Notification click event - Apre l'URL associato alla notifica quando viene cliccata
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const url = event.notification.data.url;
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientsArr) => {
      // Controlla se c'è già una finestra aperta e naviga ad essa
      const hadWindowToFocus = clientsArr.some((windowClient) => {
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