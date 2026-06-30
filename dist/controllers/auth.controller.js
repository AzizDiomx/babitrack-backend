"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.refresh = exports.login = exports.register = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma_1 = __importDefault(require("../prisma"));
const jwt_1 = require("../utils/jwt");
const client_1 = require("@prisma/client");
const register = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { nom, prenom, telephone, email, password } = req.body;
        if (!nom || !prenom || !telephone || !password) {
            res.status(400).json({ error: 'Tous les champs obligatoires (nom, prenom, telephone, password) doivent être fournis.' });
            return;
        }
        // Vérifier si la compagnie existe
        const company = await prisma_1.default.company.findUnique({
            where: { id: companyId },
        });
        if (!company) {
            res.status(404).json({ error: 'Compagnie non trouvée.' });
            return;
        }
        // Valider le quota d'usagers/utilisateurs pour la compagnie
        const currentUserCount = await prisma_1.default.user.count({
            where: { companyId },
        });
        if (currentUserCount >= company.maxUsers) {
            res.status(403).json({ error: `Nombre maximal d'utilisateurs (${company.maxUsers}) atteint pour la compagnie.` });
            return;
        }
        // Vérifier si le téléphone est déjà utilisé
        const existingUser = await prisma_1.default.user.findUnique({
            where: { telephone },
        });
        if (existingUser) {
            res.status(400).json({ error: 'Ce numéro de téléphone est déjà associé à un compte.' });
            return;
        }
        // Hasher le mot de passe (coût de 12 comme spécifié dans le document)
        const passwordHash = await bcrypt_1.default.hash(password, 12);
        // Création de l'usager
        const user = await prisma_1.default.user.create({
            data: {
                companyId,
                nom,
                prenom,
                telephone,
                email,
                password: passwordHash,
                role: client_1.UserRole.USAGER,
                statut: client_1.SubscriptionStatus.EN_ATTENTE,
            },
        });
        // Retourner l'utilisateur sans le mot de passe
        const { password: _, ...userWithoutPassword } = user;
        res.status(201).json(userWithoutPassword);
    }
    catch (error) {
        console.error('Erreur lors de l\'inscription:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.register = register;
const login = async (req, res) => {
    try {
        const { telephone, password } = req.body;
        if (!telephone || !password) {
            res.status(400).json({ error: 'Téléphone et mot de passe requis.' });
            return;
        }
        const user = await prisma_1.default.user.findUnique({
            where: { telephone },
        });
        if (!user) {
            res.status(401).json({ error: 'Identifiants invalides.' });
            return;
        }
        const isMatch = await bcrypt_1.default.compare(password, user.password);
        if (!isMatch) {
            res.status(401).json({ error: 'Identifiants invalides.' });
            return;
        }
        // Vérifier l'abonnement de la compagnie (sauf si Super Admin)
        if (user.role !== client_1.UserRole.SUPER_ADMIN) {
            const company = await prisma_1.default.company.findUnique({
                where: { id: user.companyId },
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
        // Générer les tokens
        const payload = {
            userId: user.id,
            role: user.role,
            companyId: user.companyId,
        };
        const accessToken = (0, jwt_1.generateAccessToken)(payload);
        const refreshToken = (0, jwt_1.generateRefreshToken)(payload);
        // Stocker le refresh token en cookie HttpOnly (30 jours)
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 jours
        });
        const { password: _, ...userWithoutPassword } = user;
        res.json({
            accessToken,
            refreshToken, // retourné également dans le body pour compatibilité mobile
            user: userWithoutPassword,
        });
    }
    catch (error) {
        console.error('Erreur lors de la connexion:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.login = login;
const refresh = async (req, res) => {
    try {
        const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
        if (!refreshToken) {
            res.status(401).json({ error: 'Refresh token manquant.' });
            return;
        }
        const decoded = (0, jwt_1.verifyRefreshToken)(refreshToken);
        const user = await prisma_1.default.user.findUnique({
            where: { id: decoded.userId },
        });
        if (!user) {
            res.status(401).json({ error: 'Utilisateur non trouvé.' });
            return;
        }
        const payload = {
            userId: user.id,
            role: user.role,
            companyId: user.companyId,
        };
        const accessToken = (0, jwt_1.generateAccessToken)(payload);
        res.json({ accessToken });
    }
    catch (error) {
        console.error('Erreur lors du rafraîchissement du token:', error);
        res.status(401).json({ error: 'Refresh token invalide ou expiré.' });
    }
};
exports.refresh = refresh;
