import { Router } from 'express';
import { getSaasPlans, createSaasPlan, updateSaasPlan, deleteSaasPlan } from '../controllers/saasPlan.controller';
import { authMiddleware, requireRoles } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

// Lecture publique / authentifiée des offres
router.get('/', getSaasPlans);

// Administration réservée au Super Admin
router.post('/', authMiddleware, requireRoles([UserRole.SUPER_ADMIN]), createSaasPlan);
router.put('/:id', authMiddleware, requireRoles([UserRole.SUPER_ADMIN]), updateSaasPlan);
router.delete('/:id', authMiddleware, requireRoles([UserRole.SUPER_ADMIN]), deleteSaasPlan);

export default router;
