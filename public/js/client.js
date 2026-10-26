async function registerServiceWorkerAndPush() {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    try {
      // 1. Register Service Worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      
      // 2. Request Permission
      const permissionResult = await Notification.requestPermission();
      if (permissionResult !== 'granted') return;

      // 3. Get Public VAPID Key from backend or environment
      const response = await fetch('/api/push/vapid-public-key');
      const { publicKey } = await response.json();

      // 4. Subscribe the device
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      // 5. Send subscription to backend to save in Database
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription)
      });

    } catch (error) {
      console.error('Error setting up push notifications:', error);
    }
  }
}

// Helper utility to convert VAPID key
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}