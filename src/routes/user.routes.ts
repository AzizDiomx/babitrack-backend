import { Router } from 'express';
import { getUsers, updateSubscription, resetQrCode, createUser, updateUser, deleteUser, deleteMe, updateMe, triggerExpirationCheck, getMe, changeMyPassword } from '../controllers/user.controller';
import { importAbonnes } from '../controllers/import.controller';
import { authMiddleware, requireRoles } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';
import multer from 'multer';
import path from 'path';

const router = Router();

// Configuration sécurisée de l'upload des fichiers d'abonnés (Protection contre l'épuisement mémoire)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 Mo maximum
  fileFilter: (_req, file, cb) => {
    const allowedExtensions = ['.xlsx', '.xls', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Format de fichier non autorisé. Seuls les fichiers Excel (.xlsx, .xls) et CSV sont acceptés.'));
    }
  },
});

router.get('/', authMiddleware, requireRoles([UserRole.ADMIN]), getUsers);
router.get('/me', authMiddleware, getMe);
router.post('/import', authMiddleware, requireRoles([UserRole.ADMIN]), upload.single('file'), importAbonnes);
router.post('/check-expirations', authMiddleware, triggerExpirationCheck);
router.post('/', authMiddleware, requireRoles([UserRole.ADMIN]), createUser);
router.patch('/:id/subscription', authMiddleware, requireRoles([UserRole.ADMIN]), updateSubscription);
router.patch('/:id/qr/reset', authMiddleware, requireRoles([UserRole.ADMIN]), resetQrCode);
router.patch('/me/profile', authMiddleware, updateMe);
router.patch('/me/password', authMiddleware, changeMyPassword);
router.patch('/:id', authMiddleware, requireRoles([UserRole.ADMIN]), updateUser);
router.delete('/me/delete', authMiddleware, deleteMe);
router.delete('/:id', authMiddleware, requireRoles([UserRole.ADMIN]), deleteUser);

export default router;
