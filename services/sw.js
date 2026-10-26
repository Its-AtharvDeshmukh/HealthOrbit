self.addEventListener('push', function (event) {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Medication Reminder';
  
  const options = {
    body: data.body || 'It is time to take your scheduled dose.',
    icon: '/images/pill-icon.png', // Path to your app icon
    badge: '/images/badge-icon.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/medicines'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Handle notification click event to open the app when tapped
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});