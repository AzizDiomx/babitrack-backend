import { Request, Response } from 'express';
import prisma from '../prisma';
import bcrypt from 'bcrypt';

export const createCompany = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, subdomain, plan, subscriptionExpiresAt, maxVehicles, maxUsers, status } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Le nom de l\'entreprise est obligatoire.' });
      return;
    }

    // Vérifier si le sous-domaine existe déjà s'il est fourni
    if (subdomain) {
      const existing = await prisma.company.findUnique({
        where: { subdomain },
      });
      if (existing) {
        res.status(400).json({ error: 'Ce sous-domaine est déjà utilisé.' });
        return;
      }
    }

    // Configuration des forfaits standards
    let dbPlan = plan || 'DECOUVERTE';
    let dbMaxVehicles = maxVehicles !== undefined ? parseInt(maxVehicles, 10) : 3;
    let dbMaxUsers = maxUsers !== undefined ? parseInt(maxUsers, 10) : 20;
    
    // Par défaut, l'abonnement Découverte dure 3 mois (90 jours) pour tester gratuitement la solution
    let dbExpiresAt = subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    if (plan === 'DECOUVERTE') {
      dbPlan = 'DECOUVERTE';
      if (maxVehicles === undefined) dbMaxVehicles = 3;
      if (maxUsers === undefined) dbMaxUsers = 20;
    } else if (plan === 'ESSENTIEL') {
      if (maxVehicles === undefined) dbMaxVehicles = 10;
      if (maxUsers === undefined) dbMaxUsers = 150;
      if (!subscriptionExpiresAt) dbExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    } else if (plan === 'PREMIUM') {
      if (maxVehicles === undefined) dbMaxVehicles = 50;
      if (maxUsers === undefined) dbMaxUsers = 1000;
      if (!subscriptionExpiresAt) dbExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    }

    const company = await prisma.company.create({
      data: {
        name,
        subdomain: subdomain ? subdomain.toLowerCase().trim() : null,
        plan: dbPlan,
        subscriptionExpiresAt: dbExpiresAt,
        maxVehicles: dbMaxVehicles,
        maxUsers: dbMaxUsers,
        status: status || 'ACTIVE',
      },
    });

    res.status(201).json(company);
  } catch (error) {
    console.error('Erreur lors de la création de la compagnie:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getCompanies = async (_req: Request, res: Response): Promise<void> => {
  try {
    const companies = await prisma.company.findMany({
      include: {
        users: {
          where: { role: 'ADMIN' },
          select: {
            id: true,
            nom: true,
            prenom: true,
            telephone: true,
            email: true,
          }
        },
        _count: {
          select: {
            users: true,
            vehicles: true,
            routes: true,
            subscriptions: true,
          }
        }
      }
    });
    res.json(companies);
  } catch (error) {
    console.error('Erreur lors de la récupération des compagnies:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const createCompanyAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;
    const { nom, prenom, telephone, email, password } = req.body;

    if (!nom || !prenom || !telephone || !password) {
      res.status(400).json({ error: 'Tous les champs obligatoires (nom, prenom, telephone, password) sont requis.' });
      return;
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      res.status(404).json({ error: 'Compagnie non trouvée.' });
      return;
    }

    const existing = await prisma.user.findUnique({
      where: { telephone },
    });

    if (existing) {
      res.status(400).json({ error: 'Ce numéro de téléphone est déjà utilisé.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const adminUser = await prisma.user.create({
      data: {
        companyId,
        nom,
        prenom,
        telephone,
        email,
        password: passwordHash,
        role: 'ADMIN',
        statut: 'ACTIF',
      },
    });

    const { password: _, ...userWithoutPassword } = adminUser;
    res.status(201).json(userWithoutPassword);
  } catch (error) {
    console.error('Erreur création admin de la compagnie:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const updateCompanySubscription = async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;
    const { plan, subscriptionExpiresAt, maxVehicles, maxUsers, status } = req.body;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      res.status(404).json({ error: 'Compagnie non trouvée.' });
      return;
    }

    // Préparer les données à mettre à jour
    const updateData: any = {};
    if (plan !== undefined) updateData.plan = plan;
    if (status !== undefined) updateData.status = status;
    if (subscriptionExpiresAt !== undefined) {
      updateData.subscriptionExpiresAt = subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null;
    }
    if (maxVehicles !== undefined) updateData.maxVehicles = parseInt(maxVehicles, 10);
    if (maxUsers !== undefined) updateData.maxUsers = parseInt(maxUsers, 10);

    const updatedCompany = await prisma.company.update({
      where: { id: companyId },
      data: updateData,
    });

    res.json(updatedCompany);
  } catch (error) {
    console.error('Erreur de mise à jour de l\'abonnement de la compagnie:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const createCompanyRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nom, prenom, telephone, email, password } = req.body;

    if (!nom || !prenom || !telephone || !password) {
      res.status(400).json({ error: 'Nom, prénom, téléphone et mot de passe requis.' });
      return;
    }

    // Vérifier si le téléphone est utilisé
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
        res.status(400).json({ error: 'Cette adresse email est déjà associée à un compte.' });
        return;
      }
    }

    // Créer la compagnie DRAFT
    const companyName = `Prospect - ${prenom} ${nom}`;
    const company = await prisma.company.create({
      data: {
        name: companyName,
        status: 'DRAFT',
        plan: 'DECOUVERTE',
        maxVehicles: 3,
        maxUsers: 20,
        subscriptionExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 3 mois d'essai gratuit
      },
    });

    // Hasher le mot de passe
    const passwordHash = await bcrypt.hash(password, 12);

    // Créer l'utilisateur admin associé
    const adminUser = await prisma.user.create({
      data: {
        companyId: company.id,
        nom,
        prenom,
        telephone,
        email: email || null,
        password: passwordHash,
        role: 'ADMIN',
        statut: 'EN_ATTENTE',
      },
    });

    res.status(201).json({
      companyId: company.id,
      adminId: adminUser.id,
      message: 'Première étape d\'inscription enregistrée avec succès.'
    });
  } catch (error) {
    console.error('Erreur de création de la demande de compagnie:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const updateCompanyRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, subdomain, plan, isFinal } = req.body;

    const company = await prisma.company.findUnique({
      where: { id },
    });

    if (!company) {
      res.status(404).json({ error: 'Demande d\'inscription introuvable.' });
      return;
    }

    if (company.status !== 'DRAFT' && company.status !== 'PENDING_APPROVAL') {
      res.status(400).json({ error: 'Cette compagnie a déjà été traitée.' });
      return;
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (plan) updateData.plan = plan;

    if (subdomain && subdomain !== company.subdomain) {
      const cleanSubdomain = subdomain.toLowerCase().trim();
      const existingSub = await prisma.company.findFirst({
        where: { 
          subdomain: cleanSubdomain,
          NOT: { id }
        },
      });
      if (existingSub) {
        res.status(400).json({ error: 'Ce sous-domaine est déjà utilisé.' });
        return;
      }
      updateData.subdomain = cleanSubdomain;
    }

    if (isFinal) {
      updateData.status = 'PENDING_APPROVAL';
    }

    const updated = await prisma.company.update({
      where: { id },
      data: updateData,
    });

    res.json(updated);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la demande de compagnie:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const approveCompanyRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      res.status(404).json({ error: 'Compagnie non trouvée.' });
      return;
    }

    // Configurer la durée en fonction du plan
    const plan = company.plan || 'DECOUVERTE';
    let duration = 90 * 24 * 60 * 60 * 1000; // 90 jours par défaut (Découverte)
    let maxVehicles = 3;
    let maxUsers = 20;

    if (plan === 'ESSENTIEL') {
      duration = 365 * 24 * 60 * 60 * 1000; // 1 an
      maxVehicles = 10;
      maxUsers = 150;
    } else if (plan === 'PREMIUM') {
      duration = 365 * 24 * 60 * 60 * 1000; // 1 an
      maxVehicles = 50;
      maxUsers = 1000;
    }

    // Mettre à jour la compagnie
    await prisma.company.update({
      where: { id: companyId },
      data: {
        status: 'ACTIVE',
        subscriptionExpiresAt: new Date(Date.now() + duration),
        maxVehicles,
        maxUsers,
      },
    });

    // Activer l'administrateur associé
    await prisma.user.updateMany({
      where: {
        companyId,
        role: 'ADMIN',
      },
      data: {
        statut: 'ACTIF',
      },
    });

    res.json({ message: 'Compagnie approuvée et activée avec succès.' });
  } catch (error) {
    console.error('Erreur lors de l\'approbation de la compagnie:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};
