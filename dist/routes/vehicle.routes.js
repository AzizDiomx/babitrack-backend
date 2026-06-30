"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const vehicle_controller_1 = require("../controllers/vehicle.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const client_1 = require("@prisma/client");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const router = (0, express_1.Router)();
// Configuration de Multer pour le stockage sur disque des images de véhicules
const uploadsDir = path_1.default.join(__dirname, '../../uploads');
if (!fs_1.default.existsSync(uploadsDir)) {
    fs_1.default.mkdirSync(uploadsDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, 'vehicle-' + uniqueSuffix + path_1.default.extname(file.originalname));
    }
});
const uploadImage = (0, multer_1.default)({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 Mo maximum
    fileFilter: (_req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp|gif/;
        const extname = allowedTypes.test(path_1.default.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            cb(null, true);
        }
        else {
            cb(new Error('Format d\'image invalide. Uniquement jpeg, jpg, png, webp et gif.'));
        }
    }
});
// Route d'upload d'image pour les véhicules
router.post('/upload', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRoles)([client_1.UserRole.ADMIN]), uploadImage.single('image'), (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'Aucun fichier reçu.' });
            return;
        }
        const imageUrl = `/uploads/${req.file.filename}`;
        res.json({ imageUrl });
    }
    catch (err) {
        res.status(500).json({ error: err.message || 'Erreur lors du téléversement.' });
    }
});
router.post('/', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRoles)([client_1.UserRole.ADMIN]), vehicle_controller_1.createVehicle);
router.get('/', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRoles)([client_1.UserRole.ADMIN, client_1.UserRole.CHAUFFEUR, client_1.UserRole.USAGER]), vehicle_controller_1.getVehicles);
router.get('/:id/location', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRoles)([client_1.UserRole.ADMIN, client_1.UserRole.CHAUFFEUR, client_1.UserRole.USAGER]), vehicle_controller_1.getVehicleLocation);
router.patch('/:id/status', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRoles)([client_1.UserRole.ADMIN, client_1.UserRole.CHAUFFEUR]), vehicle_controller_1.updateVehicleStatus);
router.patch('/:id', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRoles)([client_1.UserRole.ADMIN]), vehicle_controller_1.updateVehicle);
router.delete('/:id', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRoles)([client_1.UserRole.ADMIN]), vehicle_controller_1.deleteVehicle);
exports.default = router;
