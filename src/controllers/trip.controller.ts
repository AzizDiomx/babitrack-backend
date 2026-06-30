import { Request, Response } from 'express';
import prisma from '../prisma';
import { SubscriptionStatus } from '@prisma/client';

export const scanQrCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    const { qrToken, vehicleId, stopId } = req.body;

    if (!companyId) {
      res.status(401).json({ error: 'Non autorisé.' });
      return;
    }

    if (!qrToken || !vehicleId) {
      res.status(400).json({ error: 'qrToken et vehicleId requis.' });
      return;
    }

    // 1. Trouver l'utilisateur lié au qrToken
    const user = await prisma.user.findUnique({
      where: { qrToken },
    });

    if (!user) {
      res.status(200).json({
        success: false,
        status: 'RED',
        message: 'Code QR inconnu ou invalide.',
        user: null,
      });
      return;
    }

    // 2. Vérifier l'isolation Multi-Tenant
    if (user.companyId !== companyId) {
      res.status(200).json({
        success: false,
        status: 'RED',
        message: 'Code QR invalide (Compagnie différente).',
        user: { nom: user.nom, prenom: user.prenom },
      });
      return;
    }

    // 3. Vérifier le statut de l'utilisateur
    if (user.statut !== SubscriptionStatus.ACTIF) {
      let message = 'Abonnement inactif.';
      if (user.statut === SubscriptionStatus.EN_ATTENTE) message = 'Inscription en attente de validation.';
      if (user.statut === SubscriptionStatus.SUSPENDU) message = 'Abonnement suspendu.';
      if (user.statut === SubscriptionStatus.EXPIRE) message = 'Abonnement expiré.';
      if (user.statut === SubscriptionStatus.ANNULE) message = 'Abonnement annulé.';

      res.status(200).json({
        success: false,
        status: 'RED',
        message,
        user: { nom: user.nom, prenom: user.prenom, statut: user.statut },
      });
      return;
    }

    // 4. Vérifier la validité temporelle des abonnements (facultatif mais pro)
    const activeSub = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        statut: SubscriptionStatus.ACTIF,
      },
      orderBy: { dateFin: 'desc' },
    });

    if (activeSub && activeSub.dateFin < new Date()) {
      // Mettre à jour le statut en expiré
      await prisma.user.update({
        where: { id: user.id },
        data: { statut: SubscriptionStatus.EXPIRE },
      });

      await prisma.subscription.update({
        where: { id: activeSub.id },
        data: { statut: SubscriptionStatus.EXPIRE },
      });

      res.status(200).json({
        success: false,
        status: 'RED',
        message: 'Abonnement expiré (date de fin dépassée).',
        user: { nom: user.nom, prenom: user.prenom, statut: SubscriptionStatus.EXPIRE },
      });
      return;
    }

    // 5. Enregistrer l'événement d'embarquement (TripEvent) dans PostgreSQL
    const event = await prisma.tripEvent.create({
      data: {
        vehicleId,
        userId: user.id,
        eventType: 'embarkation',
        stopId: stopId || null,
      },
    });

    // 6. Succès de validation
    res.json({
      success: true,
      status: 'GREEN',
      message: 'Accès autorisé.',
      user: {
        id: user.id,
        nom: user.nom,
        prenom: user.prenom,
        telephone: user.telephone,
        statut: user.statut,
      },
      event,
    });
  } catch (error) {
    console.error('Erreur lors du scan du code QR:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};
