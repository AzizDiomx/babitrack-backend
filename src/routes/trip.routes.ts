import { Router } from 'express';
import { scanQrCode } from '../controllers/trip.controller';
import { authMiddleware, requireRoles } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

router.post('/scan', authMiddleware, requireRoles([UserRole.ADMIN, UserRole.CHAUFFEUR]), scanQrCode);

export default router;
