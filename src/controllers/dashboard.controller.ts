import { Request, Response } from 'express';
import prisma from '../prisma';

export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;

    if (!companyId) {
      res.status(401).json({ error: 'Non autorisé.' });
      return;
    }

    // 1. Nombre d'abonnés actifs (statut = ACTIF)
    const activeSubscriptions = await prisma.user.count({
      where: {
        companyId,
        role: 'USAGER',
        statut: 'ACTIF',
      },
    });

    // 2. Nombre de véhicules en service
    const activeVehicles = await prisma.vehicle.count({
      where: {
        companyId,
        statut: 'EN_SERVICE',
      },
    });

    // 3. Nombre de véhicules en panne
    const brokenVehicles = await prisma.vehicle.count({
      where: {
        companyId,
        statut: 'PANNE',
      },
    });

    // 4. Flux de notifications envoyées dans les dernières 24 heures
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const notificationsCount = await prisma.notification.count({
      where: {
        companyId,
        sentAt: {
          gte: oneDayAgo,
        },
      },
    });

    // 5. Tableau des embarquements du jour par véhicule
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // Récupérer les événements d'embarquement d'aujourd'hui
    const embarkationsToday = await prisma.tripEvent.findMany({
      where: {
        eventType: 'embarkation',
        timestamp: {
          gte: startOfToday,
        },
        vehicle: {
          companyId,
        },
      },
      include: {
        vehicle: {
          select: {
            id: true,
            immatriculation: true,
          },
        },
      },
    });

    // Grouper par véhicule pour le résumé
    const vehicleGroupMap: { [key: string]: { vehicleId: string; immatriculation: string; count: number } } = {};

    // Initialiser avec tous les véhicules de la compagnie pour retourner 0 si aucun embarquement
    const companyVehicles = await prisma.vehicle.findMany({
      where: { companyId },
      select: { id: true, immatriculation: true },
    });

    for (const vehicle of companyVehicles) {
      vehicleGroupMap[vehicle.id] = {
        vehicleId: vehicle.id,
        immatriculation: vehicle.immatriculation,
        count: 0,
      };
    }

    // Compter les embarquements réels
    for (const event of embarkationsToday) {
      if (vehicleGroupMap[event.vehicleId]) {
        vehicleGroupMap[event.vehicleId].count++;
      } else {
        // Au cas où le véhicule n'aurait pas été listé (n'arrive normalement pas car filtré par companyId)
        vehicleGroupMap[event.vehicleId] = {
          vehicleId: event.vehicleId,
          immatriculation: event.vehicle?.immatriculation || 'Inconnu',
          count: 1,
        };
      }
    }

    const embarkationsSummary = Object.values(vehicleGroupMap);

    res.json({
      stats: {
        activeSubscriptions,
        activeVehicles,
        brokenVehicles,
        notificationsCount,
      },
      embarkationsToday: embarkationsSummary,
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques du tableau de bord:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};
