import { Request, Response } from 'express';
import prisma from '../prisma';
import { RouteType } from '@prisma/client';
import { getRouteRoadGeometry } from '../services/googleDirections.service';

export const createRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    const { nom, type, vehicleId, stops } = req.body;

    if (!companyId) {
      res.status(401).json({ error: 'Non autorisé.' });
      return;
    }

    if (!nom || !type) {
      res.status(400).json({ error: 'Nom et type de trajet requis.' });
      return;
    }

    // Si un véhicule est fourni, vérifier qu'il appartient bien à la même compagnie
    if (vehicleId) {
      const vehicle = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
      });

      if (!vehicle || vehicle.companyId !== companyId) {
        res.status(400).json({ error: 'Le véhicule assigné doit appartenir à la même compagnie.' });
        return;
      }
    }

    // Création du trajet et de ses arrêts associés en transaction
    const result = await prisma.$transaction(async (tx) => {
      const route = await tx.route.create({
        data: {
          companyId,
          nom,
          type: type as RouteType,
          vehicleId: vehicleId || null,
        },
      });

      if (stops && Array.isArray(stops) && stops.length > 0) {
        const stopsData = stops.map((stop: any) => ({
          nom: stop.nom,
          latitude: parseFloat(stop.latitude),
          longitude: parseFloat(stop.longitude),
          ordre: parseInt(stop.ordre, 10),
          routeId: route.id,
        }));

        await tx.stop.createMany({
          data: stopsData,
        });
      }

      return tx.route.findUnique({
        where: { id: route.id },
        include: { stops: { orderBy: { ordre: 'asc' } } },
      });
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Erreur lors de la création du trajet:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getRoutes = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;

    if (!companyId) {
      res.status(401).json({ error: 'Non autorisé.' });
      return;
    }

    const routes = await prisma.route.findMany({
      where: { companyId },
      include: {
        stops: { orderBy: { ordre: 'asc' } },
        vehicle: {
          select: {
            id: true,
            immatriculation: true,
            statut: true,
          },
        },
      },
    });

    res.json(routes);
  } catch (error) {
    console.error('Erreur lors de la récupération des trajets:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const updateRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    const { id } = req.params;
    const { nom, type, vehicleId, stops } = req.body;

    if (!companyId) {
      res.status(401).json({ error: 'Non autorisé.' });
      return;
    }

    const existingRoute = await prisma.route.findUnique({
      where: { id },
    });

    if (!existingRoute || existingRoute.companyId !== companyId) {
      res.status(404).json({ error: 'Trajet non trouvé.' });
      return;
    }

    if (vehicleId) {
      const vehicle = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
      });

      if (!vehicle || vehicle.companyId !== companyId) {
        res.status(400).json({ error: 'Le véhicule assigné doit appartenir à la même compagnie.' });
        return;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Mettre à jour les informations du trajet
      await tx.route.update({
        where: { id },
        data: {
          nom: nom || existingRoute.nom,
          type: type ? (type as RouteType) : existingRoute.type,
          vehicleId: vehicleId !== undefined ? (vehicleId || null) : existingRoute.vehicleId,
        },
      });

      // 2. Si la liste des arrêts est fournie, la remplacer proprement
      if (stops && Array.isArray(stops)) {
        await tx.stop.deleteMany({
          where: { routeId: id },
        });

        if (stops.length > 0) {
          const stopsData = stops.map((stop: any, idx: number) => ({
            nom: stop.nom,
            latitude: parseFloat(stop.latitude),
            longitude: parseFloat(stop.longitude),
            ordre: stop.ordre ? parseInt(stop.ordre, 10) : idx + 1,
            routeId: id,
          }));

          await tx.stop.createMany({
            data: stopsData,
          });
        }
      }

      return tx.route.findUnique({
        where: { id },
        include: {
          stops: { orderBy: { ordre: 'asc' } },
          vehicle: {
            select: { id: true, immatriculation: true, statut: true },
          },
        },
      });
    });

    res.json(updated);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du trajet:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const deleteRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    const { id } = req.params;

    if (!companyId) {
      res.status(401).json({ error: 'Non autorisé.' });
      return;
    }

    const existingRoute = await prisma.route.findUnique({
      where: { id },
    });

    if (!existingRoute || existingRoute.companyId !== companyId) {
      res.status(404).json({ error: 'Trajet non trouvé.' });
      return;
    }

    await prisma.route.delete({
      where: { id },
    });

    res.json({ success: true, message: 'Trajet supprimé avec succès.' });
  } catch (error) {
    console.error('Erreur lors de la suppression du trajet:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getRoutePathGeometry = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const route = await prisma.route.findUnique({
      where: { id },
      include: { stops: { orderBy: { ordre: 'asc' } } },
    });

    if (!route || route.stops.length < 2) {
      res.json({ path: [] });
      return;
    }

    const path = await getRouteRoadGeometry(route.stops);
    res.json({ routeId: id, path });
  } catch (error) {
    console.error('Erreur getRoutePathGeometry:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la géométrie' });
  }
};
