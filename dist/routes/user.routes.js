"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const user_controller_1 = require("../controllers/user.controller");
const import_controller_1 = require("../controllers/import.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const client_1 = require("@prisma/client");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const router = (0, express_1.Router)();
// Configuration sécurisée de l'upload des fichiers d'abonnés (Protection contre l'épuisement mémoire)
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 Mo maximum
    fileFilter: (_req, file, cb) => {
        const allowedExtensions = ['.xlsx', '.xls', '.csv'];
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        if (allowedExtensions.includes(ext)) {
            cb(null, true);
        }
        else {
            cb(new Error('Format de fichier non autorisé. Seuls les fichiers Excel (.xlsx, .xls) et CSV sont acceptés.'));
        }
    },
});
router.get('/', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRoles)([client_1.UserRole.ADMIN]), user_controller_1.getUsers);
router.get('/me', auth_middleware_1.authMiddleware, user_controller_1.getMe);
router.post('/import', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRoles)([client_1.UserRole.ADMIN]), upload.single('file'), import_controller_1.importAbonnes);
router.post('/check-expirations', auth_middleware_1.authMiddleware, user_controller_1.triggerExpirationCheck);
router.post('/', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRoles)([client_1.UserRole.ADMIN]), user_controller_1.createUser);
router.patch('/:id/subscription', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRoles)([client_1.UserRole.ADMIN]), user_controller_1.updateSubscription);
router.patch('/:id/qr/reset', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRoles)([client_1.UserRole.ADMIN]), user_controller_1.resetQrCode);
router.patch('/me/profile', auth_middleware_1.authMiddleware, user_controller_1.updateMe);
router.patch('/me/password', auth_middleware_1.authMiddleware, user_controller_1.changeMyPassword);
router.patch('/:id', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRoles)([client_1.UserRole.ADMIN]), user_controller_1.updateUser);
router.delete('/me/delete', auth_middleware_1.authMiddleware, user_controller_1.deleteMe);
router.delete('/:id', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRoles)([client_1.UserRole.ADMIN]), user_controller_1.deleteUser);
exports.default = router;
