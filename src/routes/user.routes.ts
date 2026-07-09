import { Router } from 'express';
import { getUsers, updateSubscription, resetQrCode, createUser, updateUser, deleteUser, deleteMe, updateMe } from '../controllers/user.controller';
import { importAbonnes } from '../controllers/import.controller';
import { authMiddleware, requireRoles } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';
import multer from 'multer';

const router = Router();
const upload = multer();

router.get('/', authMiddleware, requireRoles([UserRole.ADMIN]), getUsers);
router.post('/import', authMiddleware, requireRoles([UserRole.ADMIN]), upload.single('file'), importAbonnes);
router.post('/', authMiddleware, requireRoles([UserRole.ADMIN]), createUser);
router.patch('/:id/subscription', authMiddleware, requireRoles([UserRole.ADMIN]), updateSubscription);
router.patch('/:id/qr/reset', authMiddleware, requireRoles([UserRole.ADMIN]), resetQrCode);
router.patch('/me/profile', authMiddleware, updateMe);
router.patch('/:id', authMiddleware, requireRoles([UserRole.ADMIN]), updateUser);
router.delete('/me/delete', authMiddleware, deleteMe);
router.delete('/:id', authMiddleware, requireRoles([UserRole.ADMIN]), deleteUser);

export default router;
