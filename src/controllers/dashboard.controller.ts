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

    // 5. Tableau des embarquements du jour par véhicule et trajet
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const companyVehicles = await prisma.vehicle.findMany({
      where: { companyId },
      include: {
        routes: {
          select: {
            id: true,
            nom: true,
            type: true,
          },
        },
      },
    });

    const embarkationsTodayEvents = await prisma.tripEvent.findMany({
      where: {
        eventType: 'embarkation',
        timestamp: { gte: startOfToday },
        vehicle: { companyId },
      },
      include: {
        user: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            telephone: true,
          },
        },
      },
      orderBy: { timestamp: 'desc' },
    });

    const embarkationsSummary = companyVehicles.map((vehicle) => {
      const vehicleEvents = embarkationsTodayEvents.filter((e) => e.vehicleId === vehicle.id);

      const uniquePassengersMap = new Map<string, { id: string; nom: string; prenom: string; telephone: string; scanTime: string }>();
      vehicleEvents.forEach((e) => {
        if (e.user && !uniquePassengersMap.has(e.userId!)) {
          uniquePassengersMap.set(e.userId!, {
            id: e.user.id,
            nom: e.user.nom,
            prenom: e.user.prenom,
            telephone: e.user.telephone,
            scanTime: e.timestamp.toISOString(),
          });
        }
      });

      const uniquePassengers = Array.from(uniquePassengersMap.values());
      const mainRoute = vehicle.routes[0];

      return {
        vehicleId: vehicle.id,
        immatriculation: vehicle.immatriculation,
        capacite: vehicle.capacite,
        statut: vehicle.statut,
        routeName: mainRoute ? mainRoute.nom : 'Aucun trajet assigné',
        routeType: mainRoute ? mainRoute.type : null,
        totalScans: vehicleEvents.length,
        uniqueCount: uniquePassengers.length,
        passengers: uniquePassengers,
      };
    });

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
