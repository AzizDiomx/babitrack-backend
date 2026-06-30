"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRoles = exports.authMiddleware = void 0;
const jwt_1 = require("../utils/jwt");
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../prisma"));
const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Accès non autorisé. Token manquant.' });
            return;
        }
        const token = authHeader.split(' ')[1];
        const decoded = (0, jwt_1.verifyAccessToken)(token);
        // Attacher l'utilisateur décodé à la requête Express
        req.user = decoded;
        // Si l'utilisateur appartient à une compagnie et n'est pas SUPER_ADMIN, valider le statut de son abonnement
        if (decoded.companyId && decoded.role !== client_1.UserRole.SUPER_ADMIN) {
            const company = await prisma_1.default.company.findUnique({
                where: { id: decoded.companyId },
                select: { status: true, subscriptionExpiresAt: true }
            });
            if (!company) {
                res.status(403).json({ error: 'Compagnie invalide.' });
                return;
            }
            if (company.status !== 'ACTIVE') {
                if (company.status === 'SUSPENDED') {
                    res.status(403).json({ error: 'Votre compagnie a été suspendue. Veuillez contacter le support.' });
                }
                else if (company.status === 'PENDING_APPROVAL') {
                    res.status(403).json({ error: 'Votre demande d\'inscription est en cours de validation par nos équipes.' });
                }
                else {
                    res.status(403).json({ error: 'Votre compte n\'est pas encore actif.' });
                }
                return;
            }
            if (company.subscriptionExpiresAt && new Date(company.subscriptionExpiresAt) < new Date()) {
                res.status(403).json({ error: "L'abonnement de votre compagnie de transport a expiré. Veuillez contacter votre service client." });
                return;
            }
        }
        next();
    }
    catch (error) {
        console.error('Erreur de validation du token:', error);
        res.status(401).json({ error: 'Token invalide ou expiré.' });
    }
};
exports.authMiddleware = authMiddleware;
const requireRoles = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: 'Non autorisé.' });
            return;
        }
        if (req.user.role === client_1.UserRole.SUPER_ADMIN) {
            // Le SUPER_ADMIN peut tout faire
            next();
            return;
        }
        if (!allowedRoles.includes(req.user.role)) {
            res.status(403).json({ error: 'Permission refusée. Rôle insuffisant.' });
            return;
        }
        next();
    };
};
exports.requireRoles = requireRoles;
