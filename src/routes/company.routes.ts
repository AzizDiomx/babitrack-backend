import { Router } from 'express';
import { 
  createCompany, 
  getCompanies, 
  createCompanyAdmin, 
  updateCompanySubscription,
  createCompanyRequest,
  updateCompanyRequest,
  approveCompanyRequest,
  getMyCompanySubscription
} from '../controllers/company.controller';
import { authMiddleware, requireRoles } from '../middlewares/auth.middleware';
import { authLimiter } from '../middlewares/rateLimiter.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

// Route pour l'administrateur de compagnie (Consultation de son propre abonnement)
router.get('/my-subscription', authMiddleware, getMyCompanySubscription);

// Routes publiques d'inscription progressive (Landing Page) protégées contre le spam
router.post('/register-request', authLimiter, createCompanyRequest);
router.patch('/register-request/:id', authLimiter, updateCompanyRequest);

// Routes pour le Super Admin
router.post('/', authMiddleware, requireRoles([UserRole.SUPER_ADMIN]), createCompany);
router.get('/', authMiddleware, requireRoles([UserRole.SUPER_ADMIN]), getCompanies);
router.post('/:companyId/admin', authMiddleware, requireRoles([UserRole.SUPER_ADMIN]), createCompanyAdmin);
router.patch('/:companyId/subscription', authMiddleware, requireRoles([UserRole.SUPER_ADMIN]), updateCompanySubscription);
router.patch('/:companyId/approve', authMiddleware, requireRoles([UserRole.SUPER_ADMIN]), approveCompanyRequest);

export default router;
