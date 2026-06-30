import { Request, Response } from 'express';
import prisma from '../prisma';
import { getVehicleLocation as getCachedLocation, deleteVehicleLocation } from '../services/redis.service';
import { VehicleStatus } from '@prisma/client';

export const createVehicle = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    const { immatriculation, capacite, chauffeurId, imageUrl } = req.body;

    if (!companyId) {
      res.status(401).json({ error: 'Non autorisé.' });
      return;
    }

    if (!immatriculation || !capacite) {
      res.status(400).json({ error: 'Immatriculation et capacité requises.' });
      return;
    }

    // Valider le quota de véhicules pour la compagnie
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { maxVehicles: true },
    });

    if (company) {
      const currentVehicles = await prisma.vehicle.count({
        where: { companyId },
      });

      if (currentVehicles >= company.maxVehicles) {
        res.status(403).json({ error: `Nombre maximal de véhicules (${company.maxVehicles}) atteint pour votre forfait.` });
        return;
      }
    }

    // Si un chauffeur est fourni, vérifier qu'il appartient bien à la même compagnie
    if (chauffeurId) {
      const chauffeur = await prisma.user.findUnique({
        where: { id: chauffeurId },
      });

      if (!chauffeur || chauffeur.companyId !== companyId) {
        res.status(400).json({ error: 'Le chauffeur assigné doit appartenir à la même compagnie.' });
        return;
      }
    }

    const vehicle = await prisma.vehicle.create({
      data: {
        companyId,
        immatriculation,
        capacite: parseInt(capacite, 10),
        statut: VehicleStatus.HORS_SERVICE,
        chauffeurId: chauffeurId || null,
        imageUrl: imageUrl || null,
      },
    });

    res.status(201).json(vehicle);
  } catch (error) {
    console.error('Erreur lors de la création du véhicule:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getVehicles = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;

    if (!companyId) {
      res.status(401).json({ error: 'Non autorisé.' });
      return;
    }

    const vehicles = await prisma.vehicle.findMany({
      where: { companyId },
      include: {
        chauffeur: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            telephone: true,
          },
        },
      },
    });

    res.json(vehicles);
  } catch (error) {
    console.error('Erreur lors de la récupération des véhicules:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getVehicleLocation = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    const { id } = req.params;

    if (!companyId) {
      res.status(401).json({ error: 'Non autorisé.' });
      return;
    }

    // Vérifier l'existence et la compagnie du véhicule
    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
    });

    if (!vehicle || vehicle.companyId !== companyId) {
      res.status(404).json({ error: 'Véhicule non trouvé.' });
      return;
    }

    // 1. Tenter de récupérer depuis le cache Redis
    const cachedLoc = await getCachedLocation(companyId, id);
    if (cachedLoc) {
      res.json(cachedLoc);
      return;
    }

    // 2. Fallback: récupérer la dernière position depuis PostgreSQL
    const lastLoc = await prisma.vehicleLocation.findFirst({
      where: { vehicleId: id },
      orderBy: { timestamp: 'desc' },
    });

    if (!lastLoc) {
      res.status(404).json({ error: 'Aucune position enregistrée pour ce véhicule.' });
      return;
    }

    res.json({
      lat: lastLoc.latitude,
      lng: lastLoc.longitude,
      speed: lastLoc.speed,
      bearing: lastLoc.bearing,
      timestamp: lastLoc.timestamp,
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de la position du véhicule:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const updateVehicleStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    const { id } = req.params;
    const { statut } = req.body;

    if (!companyId) {
      res.status(401).json({ error: 'Non autorisé.' });
      return;
    }

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
    });

    if (!vehicle || vehicle.companyId !== companyId) {
      res.status(404).json({ error: 'Véhicule non trouvé.' });
      return;
    }

    const updated = await prisma.vehicle.update({
      where: { id },
      data: {
        statut: statut as VehicleStatus,
      },
    });

    // Supprimer la position en cache si le véhicule est mis hors service
    if (statut === 'HORS_SERVICE') {
      try {
        await deleteVehicleLocation(companyId, id);
      } catch (redisErr) {
        console.error('[Redis] Erreur suppression position véhicule:', redisErr);
      }
    }

    // Émettre le changement de statut en temps réel au salon du véhicule
    const roomName = `${companyId}:trip:${id}`;
    const io = req.app.get('io');
    io.to(roomName).emit('trip:status', {
      status: statut,
      message: `Le statut du véhicule a été mis à jour : ${statut}`,
      vehicleId: id,
    });

    res.json(updated);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du statut du véhicule:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const updateVehicle = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    const { id } = req.params;
    const { immatriculation, capacite, chauffeurId, imageUrl } = req.body;

    if (!companyId) {
      res.status(401).json({ error: 'Non autorisé.' });
      return;
    }

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
    });

    if (!vehicle || vehicle.companyId !== companyId) {
      res.status(404).json({ error: 'Véhicule non trouvé.' });
      return;
    }

    // Si immatriculation change, valider qu'elle n'est pas déjà utilisée
    if (immatriculation && immatriculation !== vehicle.immatriculation) {
      const existing = await prisma.vehicle.findUnique({
        where: { immatriculation },
      });
      if (existing) {
        res.status(400).json({ error: 'Cette immatriculation est déjà enregistrée pour un autre véhicule.' });
        return;
      }
    }

    // Si un chauffeur est fourni, s'assurer qu'il appartient bien à la compagnie et libérer d'autres affectations
    if (chauffeurId) {
      const chauffeur = await prisma.user.findUnique({
        where: { id: chauffeurId },
      });

      if (!chauffeur || chauffeur.companyId !== companyId) {
        res.status(400).json({ error: 'Le chauffeur assigné doit appartenir à la même compagnie.' });
        return;
      }

      // Libérer le chauffeur s'il était associé à un autre véhicule
      const otherVehicle = await prisma.vehicle.findFirst({
        where: {
          chauffeurId,
          NOT: { id },
        },
      });

      if (otherVehicle) {
        await prisma.vehicle.update({
          where: { id: otherVehicle.id },
          data: { chauffeurId: null },
        });
      }
    }

    const updated = await prisma.vehicle.update({
      where: { id },
      data: {
        immatriculation: immatriculation || vehicle.immatriculation,
        capacite: capacite !== undefined ? parseInt(capacite, 10) : vehicle.capacite,
        chauffeurId: chauffeurId === '' ? null : (chauffeurId || vehicle.chauffeurId),
        imageUrl: imageUrl !== undefined ? imageUrl : vehicle.imageUrl,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Erreur lors de la modification du véhicule:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const deleteVehicle = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    const { id } = req.params;

    if (!companyId) {
      res.status(401).json({ error: 'Non autorisé.' });
      return;
    }

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
    });

    if (!vehicle || vehicle.companyId !== companyId) {
      res.status(404).json({ error: 'Véhicule non trouvé.' });
      return;
    }

    // Supprimer la position Redis si nécessaire
    try {
      await deleteVehicleLocation(companyId, id);
    } catch (redisErr) {
      console.warn('[Redis] Erreur suppression position lors de suppression véhicule:', redisErr);
    }

    // Supprimer le véhicule
    await prisma.vehicle.delete({
      where: { id },
    });

    res.json({ message: 'Véhicule supprimé avec succès.' });
  } catch (error) {
    console.error('Erreur lors de la suppression du véhicule:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};
