import { Request, Response } from 'express';
import prisma from '../prisma';
import { SubscriptionStatus, SubscriptionType, UserRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';

export const getUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;

    if (!companyId) {
      res.status(400).json({ error: 'Compagnie non spécifiée dans le token.' });
      return;
    }

    const users = await prisma.user.findMany({
      where: { companyId },
      select: {
        id: true,
        nom: true,
        prenom: true,
        telephone: true,
        email: true,
        role: true,
        statut: true,
        qrToken: true,
        expoToken: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json(users);
  } catch (error) {
    console.error('Erreur lors de la récupération des usagers:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const updateSubscription = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    const adminId = req.user?.userId;
    const { id } = req.params;
    const { statut, type, montant, dateDebut, dateFin } = req.body;

    if (!companyId || !adminId) {
      res.status(401).json({ error: 'Non autorisé.' });
      return;
    }

    // Trouver l'utilisateur cible
    const targetUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!targetUser) {
      res.status(404).json({ error: 'Utilisateur non trouvé.' });
      return;
    }

    // Vérifier l'isolation Multi-Tenant
    if (targetUser.companyId !== companyId) {
      res.status(403).json({ error: 'Accès interdit. Cet utilisateur appartient à une autre compagnie.' });
      return;
    }

    // Mettre à jour le statut de l'utilisateur
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        statut: statut as SubscriptionStatus,
      },
    });

    // Créer ou mettre à jour un enregistrement d'abonnement (Subscription) si fourni
    if (statut === SubscriptionStatus.ACTIF) {
      await prisma.subscription.create({
        data: {
          companyId,
          userId: id,
          type: (type as SubscriptionType) || SubscriptionType.ALLER_RETOUR,
          montant: parseFloat(montant) || 0,
          dateDebut: dateDebut ? new Date(dateDebut) : new Date(),
          dateFin: dateFin ? new Date(dateFin) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 jours par défaut
          statut: SubscriptionStatus.ACTIF,
          activatedBy: adminId,
        },
      });
    } else {
      // Mettre à jour tous les abonnements actifs à ce nouveau statut
      await prisma.subscription.updateMany({
        where: {
          userId: id,
          statut: SubscriptionStatus.ACTIF,
        },
        data: {
          statut: statut as SubscriptionStatus,
        },
      });
    }

    const { password: _, ...userWithoutPassword } = updatedUser;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'abonnement:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const resetQrCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    const { id } = req.params;

    if (!companyId) {
      res.status(401).json({ error: 'Non autorisé.' });
      return;
    }

    const targetUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!targetUser) {
      res.status(404).json({ error: 'Utilisateur non trouvé.' });
      return;
    }

    if (targetUser.companyId !== companyId) {
      res.status(403).json({ error: 'Accès interdit.' });
      return;
    }

    // Réinitialiser le QR Token
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        qrToken: randomUUID(),
      },
    });

    const { password: _, ...userWithoutPassword } = updatedUser;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Erreur lors de la réinitialisation du QR code:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const createUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;

    if (!companyId) {
      res.status(401).json({ error: 'Non autorisé.' });
      return;
    }

    const { nom, prenom, telephone, email, password, role, statut } = req.body;

    if (!nom || !prenom || !telephone || !role) {
      res.status(400).json({ error: 'Nom, prénom, téléphone et rôle requis.' });
      return;
    }

    if (![UserRole.ADMIN, UserRole.CHAUFFEUR, UserRole.USAGER].includes(role as any)) {
      res.status(400).json({ error: 'Rôle invalide.' });
      return;
    }

    // Valider le quota d'utilisateurs pour la compagnie
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { maxUsers: true },
    });

    if (company) {
      const currentUserCount = await prisma.user.count({
        where: { companyId },
      });

      if (currentUserCount >= company.maxUsers) {
        res.status(403).json({ error: `Nombre maximal d'utilisateurs (${company.maxUsers}) atteint pour votre forfait.` });
        return;
      }
    }

    // Vérifier si le téléphone est déjà utilisé
    const existingUser = await prisma.user.findUnique({
      where: { telephone },
    });

    if (existingUser) {
      res.status(400).json({ error: 'Ce numéro de téléphone est déjà associé à un compte.' });
      return;
    }

    // Vérifier l'email si fourni
    if (email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email },
      });
      if (existingEmail) {
        res.status(400).json({ error: 'Cet email est déjà associé à un compte.' });
        return;
      }
    }

    // Hasher le mot de passe
    const rawPassword = password || 'BabiTrack@2026';
    const passwordHash = await bcrypt.hash(rawPassword, 12);

    const newUser = await prisma.user.create({
      data: {
        companyId,
        nom,
        prenom,
        telephone,
        email: email || null,
        password: passwordHash,
        role: role as UserRole,
        statut: (statut as SubscriptionStatus) || (role === UserRole.USAGER ? SubscriptionStatus.EN_ATTENTE : SubscriptionStatus.ACTIF),
      },
    });

    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json(userWithoutPassword);
  } catch (error) {
    console.error('Erreur lors de la création de l\'utilisateur:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const updateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    const { id } = req.params;
    const { nom, prenom, telephone, email, role, statut, password } = req.body;

    if (!companyId) {
      res.status(401).json({ error: 'Non autorisé.' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user || user.companyId !== companyId) {
      res.status(404).json({ error: 'Utilisateur non trouvé.' });
      return;
    }

    // Validation téléphone unique si modifié
    if (telephone && telephone !== user.telephone) {
      const existing = await prisma.user.findUnique({
        where: { telephone },
      });
      if (existing) {
        res.status(400).json({ error: 'Ce numéro de téléphone est déjà associé à un autre compte.' });
        return;
      }
    }

    // Validation email unique si modifié
    if (email && email !== user.email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email },
      });
      if (existingEmail) {
        res.status(400).json({ error: 'Cet email est déjà associé à un autre compte.' });
        return;
      }
    }

    // Préparer les données à mettre à jour
    const updateData: any = {};
    if (nom !== undefined) updateData.nom = nom;
    if (prenom !== undefined) updateData.prenom = prenom;
    if (telephone !== undefined) updateData.telephone = telephone;
    if (email !== undefined) updateData.email = email || null;
    if (role !== undefined) {
      if (![UserRole.ADMIN, UserRole.CHAUFFEUR, UserRole.USAGER].includes(role as any)) {
        res.status(400).json({ error: 'Rôle invalide.' });
        return;
      }
      updateData.role = role as UserRole;
    }
    if (statut !== undefined) updateData.statut = statut as SubscriptionStatus;
    if (password) {
      updateData.password = await bcrypt.hash(password, 12);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    const { password: _, ...userWithoutPassword } = updated;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'utilisateur:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    const { id } = req.params;

    if (!companyId) {
      res.status(401).json({ error: 'Non autorisé.' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user || user.companyId !== companyId) {
      res.status(404).json({ error: 'Utilisateur non trouvé.' });
      return;
    }

    // Libérer le véhicule du chauffeur si nécessaire
    await prisma.vehicle.updateMany({
      where: { chauffeurId: id },
      data: { chauffeurId: null },
    });

    // Supprimer l'utilisateur
    await prisma.user.delete({
      where: { id },
    });

    res.json({ message: 'Utilisateur supprimé avec succès.' });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'utilisateur:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const deleteMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Non autorisé.' });
      return;
    }

    // Libérer le véhicule du chauffeur si nécessaire
    await prisma.vehicle.updateMany({
      where: { chauffeurId: userId },
      data: { chauffeurId: null },
    });

    // Supprimer l'utilisateur de la base de données
    await prisma.user.delete({
      where: { id: userId },
    });

    res.json({ message: 'Votre compte a été supprimé avec succès.' });
  } catch (error) {
    console.error('Erreur lors de l\'auto-suppression du compte:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const updateMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { nom, prenom, telephone } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Non autorisé.' });
      return;
    }

    if (telephone) {
      const existingUser = await prisma.user.findFirst({
        where: {
          telephone,
          NOT: { id: userId }
        }
      });
      if (existingUser) {
        res.status(400).json({ error: 'Ce numéro de téléphone est déjà utilisé.' });
        return;
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        nom,
        prenom,
        telephone
      }
    });

    const { password: _, ...userWithoutPassword } = updatedUser;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de son profil:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};


