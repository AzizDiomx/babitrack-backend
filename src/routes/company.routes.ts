import { Router } from 'express';
import { 
  createCompany, 
  getCompanies, 
  createCompanyAdmin, 
  updateCompanySubscription,
  createCompanyRequest,
  updateCompanyRequest,
  approveCompanyRequest
} from '../controllers/company.controller';
import { authMiddleware, requireRoles } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

// Routes publiques d'inscription progressive (Landing Page)
router.post('/register-request', createCompanyRequest);
router.patch('/register-request/:id', updateCompanyRequest);

// Routes pour le Super Admin
router.post('/', authMiddleware, requireRoles([UserRole.SUPER_ADMIN]), createCompany);
router.get('/', authMiddleware, requireRoles([UserRole.SUPER_ADMIN]), getCompanies);
router.post('/:companyId/admin', authMiddleware, requireRoles([UserRole.SUPER_ADMIN]), createCompanyAdmin);
router.patch('/:companyId/subscription', authMiddleware, requireRoles([UserRole.SUPER_ADMIN]), updateCompanySubscription);
router.patch('/:companyId/approve', authMiddleware, requireRoles([UserRole.SUPER_ADMIN]), approveCompanyRequest);

export default router;
