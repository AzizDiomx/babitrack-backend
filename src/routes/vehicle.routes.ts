import { Router } from 'express';
import { createVehicle, getVehicles, getVehicleLocation, updateVehicleStatus, updateVehicle, deleteVehicle } from '../controllers/vehicle.controller';
import { authMiddleware, requireRoles } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Configuration de Multer pour le stockage sur disque des images de véhicules
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'vehicle-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const uploadImage = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 Mo maximum
  fileFilter: (_req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Format d\'image invalide. Uniquement jpeg, jpg, png, webp et gif.'));
    }
  }
});

// Route d'upload d'image pour les véhicules
router.post('/upload', authMiddleware, requireRoles([UserRole.ADMIN]), uploadImage.single('image'), (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Aucun fichier reçu.' });
      return;
    }
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ imageUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erreur lors du téléversement.' });
  }
});

router.post('/', authMiddleware, requireRoles([UserRole.ADMIN]), createVehicle);
router.get('/', authMiddleware, requireRoles([UserRole.ADMIN, UserRole.CHAUFFEUR, UserRole.USAGER]), getVehicles);
router.get('/:id/location', authMiddleware, requireRoles([UserRole.ADMIN, UserRole.CHAUFFEUR, UserRole.USAGER]), getVehicleLocation);
router.patch('/:id/status', authMiddleware, requireRoles([UserRole.ADMIN, UserRole.CHAUFFEUR]), updateVehicleStatus);
router.patch('/:id', authMiddleware, requireRoles([UserRole.ADMIN]), updateVehicle);
router.delete('/:id', authMiddleware, requireRoles([UserRole.ADMIN]), deleteVehicle);

export default router;
