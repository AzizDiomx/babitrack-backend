import { Router } from 'express';
import { createRoute, getRoutes } from '../controllers/route.controller';
import { authMiddleware, requireRoles } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

router.post('/', authMiddleware, requireRoles([UserRole.ADMIN]), createRoute);
router.get('/', authMiddleware, requireRoles([UserRole.ADMIN, UserRole.CHAUFFEUR, UserRole.USAGER]), getRoutes);

export default router;
