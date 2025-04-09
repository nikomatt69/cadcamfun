// src/lib/services/pushNotificationService.ts
import webpush from 'web-push';
import { prisma } from '@/src/lib/prisma';

// Configura web-push con le chiavi VAPID
// Queste chiavi dovrebbero essere generate e conservate in modo sicuro
// Puoi usare webpush.generateVAPIDKeys() per generarle
webpush.setVapidDetails(
  'mailto: no-reply@invite.cadcamfun.xyz',
  process.env.VAPID_PUBLIC_KEY || 'BCg3A2Rfrl_Jke0LCcQSUazaZPxqfOmLNA1jdLpdHPV4QYD1Qv8rt8FABRvVIqh_Y53RsQGOKl4vZyHMhL2VA70',
  process.env.VAPID_PRIVATE_KEY! 
);

/**
 * Invia una notifica push a un utente specifico
 */
export const sendPushNotificationToUser = async (
  userId: string,
  notification: {
    title: string;
    content: string;
    linkUrl?: string;
  }
) => {
  try {
    // Trova tutte le sottoscrizioni push dell'utente
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId }
    });
    
    if (subscriptions.length === 0) {
      return { success: false, message: 'Nessuna sottoscrizione trovata per l\'utente' };
    }
    
    // Prepara il payload della notifica
    const payload = JSON.stringify({
      title: notification.title,
      content: notification.content,
      linkUrl: notification.linkUrl || '/'
    });
    
    // Invia la notifica a tutte le sottoscrizioni
    const results = await Promise.allSettled(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth
              }
            },
            payload
          );
          return { success: true, endpoint: subscription.endpoint };
        } catch (error) {
          console.error(`Errore nell'invio della notifica push all'endpoint ${subscription.endpoint}:`, error);
          
          // Se la sottoscrizione non è più valida, eliminala
          if (error instanceof Error && error.name === 'Error' && [404, 410].includes((error as any).statusCode)) {
            await prisma.pushSubscription.delete({
              where: { endpoint: subscription.endpoint }
            });
            return { success: false, endpoint: subscription.endpoint, expired: true };
          }
          
          return { success: false, endpoint: subscription.endpoint, error };
        }
      })
    );
    
    // Conta i successi e gli errori
    const successful = results.filter(result => result.status === 'fulfilled' && (result.value as any).success).length;
    const failed = results.length - successful;
    
    return {
      success: successful > 0,
      message: `Inviate ${successful} notifiche push con successo, ${failed} fallite`
    };
  } catch (error) {
    console.error('Errore nell\'invio delle notifiche push:', error);
    return { success: false, message: 'Errore nell\'invio delle notifiche push', error };
  }
};

/**
 * Invia una notifica push a tutti i membri di un'organizzazione
 */
export const sendPushNotificationToOrganization = async (
  organizationId: string,
  notification: {
    title: string;
    content: string;
    linkUrl?: string;
  },
  excludeUserId?: string
) => {
  try {
    // Trova tutti i membri dell'organizzazione
    const members = await prisma.userOrganization.findMany({
      where: {
        organizationId,
        ...(excludeUserId ? { userId: { not: excludeUserId } } : {})
      },
      select: {
        userId: true
      }
    });
    
    if (members.length === 0) {
      return { success: false, message: 'Nessun membro trovato nell\'organizzazione' };
    }
    
    // Invia notifiche a tutti i membri
    const results = await Promise.allSettled(
      members.map(member => sendPushNotificationToUser(member.userId, notification))
    );
    
    // Conta i successi e gli errori
    const successful = results.filter(result => 
      result.status === 'fulfilled' && (result.value as any).success
    ).length;
    
    return {
      success: successful > 0,
      message: `Inviate notifiche push a ${successful} membri su ${members.length}`
    };
  } catch (error) {
    console.error('Errore nell\'invio delle notifiche push all\'organizzazione:', error);
    return { 
      success: false, 
      message: 'Errore nell\'invio delle notifiche push all\'organizzazione', 
      error 
    };
  }
};