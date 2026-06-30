import { Request, Response } from 'express';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import prisma from '../prisma';
import { NotificationType, NotificationAudience } from '@prisma/client';

const expo = new Expo();

export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;

    if (!companyId) {
      res.status(401).json({ error: 'Non autorisé.' });
      return;
    }

    const notifications = await prisma.notification.findMany({
      where: { companyId },
      orderBy: { sentAt: 'desc' },
      include: {
        admin: {
          select: {
            nom: true,
            prenom: true,
          },
        },
      },
    });

    res.json(notifications);
  } catch (error) {
    console.error('Erreur lors de la récupération des notifications:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const sendNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    const adminId = req.user?.userId;

    const { title, message, type, severity, audience } = req.body;

    if (!companyId || !adminId) {
      res.status(401).json({ error: 'Non autorisé.' });
      return;
    }

    if (!title || !message || !type || !severity || !audience) {
      res.status(400).json({ error: 'Tous les champs obligatoires (title, message, type, severity, audience) doivent être fournis.' });
      return;
    }

    // 1. Sauvegarder la notification en base de données
    const notification = await prisma.notification.create({
      data: {
        companyId,
        title,
        message,
        type: type as NotificationType,
        severity,
        audience: audience as NotificationAudience,
        createdBy: adminId,
      },
    });

    // 2. Diffuser en temps réel via Socket.IO à tous les usagers de la compagnie
    const io = req.app.get('io');
    io.to(companyId).emit('notification:push', {
      id: notification.id,
      title,
      message,
      type,
      severity,
      sentAt: notification.sentAt,
    });

    // 3. Récupérer les tokens push Expo des usagers cibles
    // Pour l'MVP, nous récupérons tous les usagers actifs de la compagnie qui ont un token Expo
    const users = await prisma.user.findMany({
      where: {
        companyId,
        role: 'USAGER',
        statut: 'ACTIF',
        expoToken: { not: null },
      },
      select: { expoToken: true },
    });

    const pushTokens = users
      .map((u) => u.expoToken)
      .filter((token): token is string => token !== null && Expo.isExpoPushToken(token));

    // 4. Envoyer les notifications via Expo Push Service
    if (pushTokens.length > 0) {
      const messages: ExpoPushMessage[] = pushTokens.map((token) => ({
        to: token,
        sound: 'default',
        title: `[BabiTrack] ${title}`,
        body: message,
        data: { type, severity, notificationId: notification.id },
      }));

      // Découper en paquets et envoyer
      const chunks = expo.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        try {
          await expo.sendPushNotificationsAsync(chunk);
        } catch (pushError) {
          console.error('Erreur d\'envoi de paquet de notifications push:', pushError);
        }
      }
    }

    res.status(201).json({
      success: true,
      notification,
      sentCount: pushTokens.length,
    });
  } catch (error) {
    console.error('Erreur lors de la création/envoi de la notification:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};
