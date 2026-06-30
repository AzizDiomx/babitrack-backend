import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { UserRole } from '@prisma/client';
import prisma from '../prisma';

export const authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Accès non autorisé. Token manquant.' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    // Attacher l'utilisateur décodé à la requête Express
    req.user = decoded;

    // Si l'utilisateur appartient à une compagnie et n'est pas SUPER_ADMIN, valider le statut de son abonnement
    if (decoded.companyId && decoded.role !== UserRole.SUPER_ADMIN) {
      const company = await prisma.company.findUnique({
        where: { id: decoded.companyId },
        select: { status: true, subscriptionExpiresAt: true }
      });

      if (!company) {
        res.status(403).json({ error: 'Compagnie invalide.' });
        return;
      }

      if (company.status !== 'ACTIVE') {
        if (company.status === 'SUSPENDED') {
          res.status(403).json({ error: 'Votre compagnie a été suspendue. Veuillez contacter le support.' });
        } else if (company.status === 'PENDING_APPROVAL') {
          res.status(403).json({ error: 'Votre demande d\'inscription est en cours de validation par nos équipes.' });
        } else {
          res.status(403).json({ error: 'Votre compte n\'est pas encore actif.' });
        }
        return;
      }

      if (company.subscriptionExpiresAt && new Date(company.subscriptionExpiresAt) < new Date()) {
        res.status(403).json({ error: "L'abonnement de votre compagnie de transport a expiré. Veuillez contacter votre service client." });
        return;
      }
    }

    next();
  } catch (error) {
    console.error('Erreur de validation du token:', error);
    res.status(401).json({ error: 'Token invalide ou expiré.' });
  }
};

export const requireRoles = (allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Non autorisé.' });
      return;
    }

    if (req.user.role === UserRole.SUPER_ADMIN) {
      // Le SUPER_ADMIN peut tout faire
      next();
      return;
    }

    if (!allowedRoles.includes(req.user.role as UserRole)) {
      res.status(403).json({ error: 'Permission refusée. Rôle insuffisant.' });
      return;
    }

    next();
  };
};
