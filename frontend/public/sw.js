// Slawk Push Notification Service Worker
// Push-only — no fetch handler to avoid interfering with Vite dev server

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const { title, body, url } = payload;

  event.waitUntil(
    self.registration.showNotification(title || 'Slawk', {
      body: body || '',
      icon: '/favicon-192.png',
      badge: '/favicon-192.png',
      data: { url: url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Try to focus an existing window
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          return client.focus().then((c) => c.navigate(url));
        }
      }
      // Open a new window
      return clients.openWindow(url);
    })
  );
});
