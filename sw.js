// Innermost service worker -- only job is to receive push notifications
// while the app is closed, and open the app when one is tapped.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'Innermost', body: "Anything good happen today? Make sure you log it in Innermost." };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    // fall back to default text above if the payload isn't valid JSON
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Innermost', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'innermost-daily'
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
