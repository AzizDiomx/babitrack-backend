import { Router } from 'express';
import { getDashboardStats } from '../controllers/dashboard.controller';
import { authMiddleware, requireRoles } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

router.get('/stats', authMiddleware, requireRoles([UserRole.ADMIN]), getDashboardStats);

export default router;
