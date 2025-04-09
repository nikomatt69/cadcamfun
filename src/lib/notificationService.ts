// src/lib/services/notificationService.ts
import { PrismaClient, NotificationType } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';

export type NotificationData = {
  type: NotificationType;
  title: string;
  content: string;
  userId: string;
  organizationId?: string;
  projectId?: string;
  componentId?: string;
  messageId?: string;
  linkUrl?: string;
};

/**
 * Servizio per gestire le notifiche dell'applicazione
 */
export class NotificationService {
  /**
   * Crea una nuova notifica nel database
   */
  static async createNotification(data: NotificationData) {
    try {
      const notification = await prisma.notification.create({
        data: {
          type: data.type,
          title: data.title,
          content: data.content,
          userId: data.userId,
          organizationId: data.organizationId,
          projectId: data.projectId,
          componentId: data.componentId,
          messageId: data.messageId,
          linkUrl: data.linkUrl
        }
      });
      
      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }
  
  /**
   * Crea notifiche per un nuovo messaggio in una conversazione
   */
  static async createNewMessageNotifications(
    messageId: string,
    senderId: string,
    conversationId: string,
    content: string,
    senderName: string,
    organizationId: string
  ) {
    try {
      // Trova tutti i partecipanti alla conversazione (eccetto il mittente)
      const participants = await prisma.conversationParticipant.findMany({
        where: {
          conversationId,
          userId: {
            not: senderId
          }
        }
      });
      
      // Crea una notifica per ogni partecipante
      const notificationPromises = participants.map(participant => 
        this.createNotification({
          type: NotificationType.NEW_MESSAGE,
          title: 'Nuovo messaggio',
          content: `${senderName}: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`,
          userId: participant.userId,
          organizationId,
          messageId,
          linkUrl: `/organizations/${organizationId}/chat/${conversationId}`
        })
      );
      
      await Promise.all(notificationPromises);
    } catch (error) {
      console.error('Error creating message notifications:', error);
      throw error;
    }
  }
  
  /**
   * Crea notifiche per un nuovo progetto nell'organizzazione
   */
  static async createNewProjectNotifications(
    projectId: string,
    creatorId: string,
    projectName: string,
    organizationId: string,
    creatorName: string
  ) {
    try {
      // Trova tutti i membri dell'organizzazione (eccetto il creatore)
      const members = await prisma.userOrganization.findMany({
        where: {
          organizationId,
          userId: {
            not: creatorId
          }
        }
      });
      
      // Crea una notifica per ogni membro
      const notificationPromises = members.map(member => 
        this.createNotification({
          type: NotificationType.PROJECT_CREATED,
          title: 'Nuovo progetto',
          content: `${creatorName} ha creato un nuovo progetto: ${projectName}`,
          userId: member.userId,
          organizationId,
          projectId,
          linkUrl: `/projects/${projectId}`
        })
      );
      
      await Promise.all(notificationPromises);
    } catch (error) {
      console.error('Error creating project notifications:', error);
      throw error;
    }
  }
  
  /**
   * Crea notifiche per un nuovo componente nell'organizzazione
   */
  static async createNewComponentNotifications(
    componentId: string,
    creatorId: string,
    componentName: string,
    organizationId: string,
    projectId: string,
    creatorName: string
  ) {
    try {
      // Trova tutti i membri dell'organizzazione (eccetto il creatore)
      const members = await prisma.userOrganization.findMany({
        where: {
          organizationId,
          userId: {
            not: creatorId
          }
        }
      });
      
      // Crea una notifica per ogni membro
      const notificationPromises = members.map(member => 
        this.createNotification({
          type: NotificationType.COMPONENT_CREATED,
          title: 'Nuovo componente',
          content: `${creatorName} ha creato un nuovo componente: ${componentName}`,
          userId: member.userId,
          organizationId,
          componentId,
          projectId,
          linkUrl: `/projects/${projectId}/components/${componentId}`
        })
      );
      
      await Promise.all(notificationPromises);
    } catch (error) {
      console.error('Error creating component notifications:', error);
      throw error;
    }
  }
}