import { Router } from 'express';
import { createRoute, getRoutes, updateRoute, deleteRoute, getRoutePathGeometry } from '../controllers/route.controller';
import { authMiddleware, requireRoles } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

router.post('/', authMiddleware, requireRoles([UserRole.ADMIN]), createRoute);
router.get('/', authMiddleware, requireRoles([UserRole.ADMIN, UserRole.CHAUFFEUR, UserRole.USAGER]), getRoutes);
router.get('/:id/path', authMiddleware, getRoutePathGeometry);
router.put('/:id', authMiddleware, requireRoles([UserRole.ADMIN]), updateRoute);
router.delete('/:id', authMiddleware, requireRoles([UserRole.ADMIN]), deleteRoute);

export default router;
