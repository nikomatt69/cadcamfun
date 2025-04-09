// Service Worker for Push Notifications
self.addEventListener('push', function(event) {
  if (event.data) {
    const data = event.data.json();
    
    const options = {
      body: data.body || '',
      icon: '/icon.png', // Make sure to add this icon
      badge: '/icon.png', // Make sure to add this badge
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: 1,
        ...data.data
      },
      actions: data.actions || []
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Notification', options)
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  // This looks to see if the current is already open and focuses if it is
  event.waitUntil(
    clients.matchAll({
      type: "window"
    })
    .then(function(clientList) {
      if (event.notification.data && event.notification.data.url) {
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data.url);
        }
      }
      
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
    })
  );
});

// Immediately activate the service worker
self.addEventListener('install', function(event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
}); 