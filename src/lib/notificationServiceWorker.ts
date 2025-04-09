export const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Service Workers o Push API non supportati dal browser');
    return false;
  }
  
  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js');
    console.log('Service Worker registrato con successo:', registration);
    return registration;
  } catch (error) {
    console.error('Errore nella registrazione del Service Worker:', error);
    return false;
  }
};

export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) {
    console.log('Questo browser non supporta le notifiche desktop');
    return false;
  }
  
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      console.log('Permesso per le notifiche ottenuto');
      return true;
    } else {
      console.log('Permesso per le notifiche negato');
      return false;
    }
  } catch (error) {
    console.error('Errore nella richiesta del permesso per le notifiche:', error);
    return false;
  }
};

export const subscribeToPushNotifications = async (registration: ServiceWorkerRegistration) => {
  try {
    // Verifica se esiste già una sottoscrizione
    let subscription = await registration.pushManager.getSubscription();
    
    // Se non esiste, creane una nuova
    if (!subscription) {
      // Ottieni la chiave VAPID pubblica dal server o dalle variabili d'ambiente
      const vapidPublicKey = process.env.VAPID_PUBLIC_KEY!;
      
      if (!vapidPublicKey) {
        throw new Error("Chiave VAPID pubblica non disponibile");
      }
      
      // Converti la chiave da base64 a Uint8Array
      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
      
      // Crea una nuova sottoscrizione
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });
    }
    
    // Invia la sottoscrizione al server
    await sendSubscriptionToServer(subscription);
    
    return subscription;
  } catch (error) {
    console.error('Errore durante la sottoscrizione alle notifiche push:', error);
    return null;
  }
};

// Funzione per inviare la sottoscrizione al server
const sendSubscriptionToServer = async (subscription: PushSubscription) => {
  try {
    const response = await fetch('/api/push-subscription', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(subscription),
    });
    
    if (!response.ok) {
      throw new Error('Errore nell\'invio della sottoscrizione al server');
    }
    
    console.log('Sottoscrizione inviata con successo al server');
    return true;
  } catch (error) {
    console.error('Errore nell\'invio della sottoscrizione al server:', error);
    return false;
  }
};

// Funzione per convertire una stringa base64 in Uint8Array (necessaria per le chiavi VAPID)
const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  
  return outputArray;
};