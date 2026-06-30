import { Router } from 'express';
import { getNotifications, sendNotification } from '../controllers/notification.controller';
import { authMiddleware, requireRoles } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

router.get('/', authMiddleware, getNotifications);
router.post('/send', authMiddleware, requireRoles([UserRole.ADMIN, UserRole.CHAUFFEUR]), sendNotification);

export default router;
