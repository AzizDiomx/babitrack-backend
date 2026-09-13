"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPassword = exports.verifyOtp = exports.forgotPassword = exports.refresh = exports.login = exports.register = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma_1 = __importDefault(require("../prisma"));
const jwt_1 = require("../utils/jwt");
const client_1 = require("@prisma/client");
const otp_service_1 = require("../services/otp.service");
const sms_service_1 = require("../services/sms.service");
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
                res.status(403).json({ error: "L'abonnement de votre compagnie de transport a expiré. Veuillez contacter votre service client. Contactez le service clientèle au +2250777099450 ou visitez notre site web : www.babitrack.net" });
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
/**
 * Recherche flexible d'un utilisateur par son numéro de téléphone
 * Gère les formats locaux (07...), internationaux (+225...) et sans préfixe
 */
const findUserByFlexiblePhone = async (phoneInput) => {
    const clean = phoneInput.replace(/[\s\-\(\)]/g, '').trim();
    const formattedIntl = (0, sms_service_1.formatInternationalPhone)(clean);
    const localWithout225 = formattedIntl.replace(/^\+225/, '');
    const localWith0 = localWithout225.startsWith('0') ? localWithout225 : `0${localWithout225}`;
    return await prisma_1.default.user.findFirst({
        where: {
            OR: [
                { telephone: clean },
                { telephone: formattedIntl },
                { telephone: localWithout225 },
                { telephone: localWith0 },
            ],
        },
    });
};
/**
 * 1. Demande d'envoi de code OTP pour mot de passe oublié (SMS ou WhatsApp)
 */
const forgotPassword = async (req, res) => {
    try {
        const { telephone, channel = 'sms' } = req.body;
        if (!telephone) {
            res.status(400).json({ error: 'Numéro de téléphone requis.' });
            return;
        }
        const selectedChannel = channel === 'whatsapp' ? 'whatsapp' : 'sms';
        // Vérifier l'existence de l'utilisateur
        const user = await findUserByFlexiblePhone(telephone);
        if (!user) {
            res.status(404).json({ error: 'Aucun compte n\'est associé à ce numéro de téléphone.' });
            return;
        }
        // Générer et stocker l'OTP dans Redis/Cache
        const otpResult = await (0, otp_service_1.generateAndStoreOtp)(user.telephone);
        if (!otpResult.success || !otpResult.otp) {
            res.status(429).json({
                error: otpResult.error || 'Impossible d\'émettre un code pour le moment.',
                cooldown: otpResult.cooldown,
            });
            return;
        }
        // Envoyer le message via Twilio (ou simulation)
        const sendResult = await (0, sms_service_1.sendOtpMessage)(otpResult.formattedPhone, otpResult.otp, selectedChannel);
        res.json({
            message: `Un code de vérification à 6 chiffres a été envoyé par ${selectedChannel === 'whatsapp' ? 'WhatsApp' : 'SMS'}.`,
            channel: selectedChannel,
            formattedPhone: otpResult.formattedPhone,
            expiresIn: otpResult.expiresIn,
            cooldown: otpResult.cooldown,
            simulated: sendResult.simulated,
        });
    }
    catch (error) {
        console.error('Erreur lors de la demande d\'OTP mot de passe oublié:', error);
        res.status(500).json({ error: 'Erreur lors de l\'envoi du code OTP.' });
    }
};
exports.forgotPassword = forgotPassword;
/**
 * 2. Vérification du code OTP saisi par l'usager
 * En cas de succès, renvoie un resetToken temporaire (15 min)
 */
const verifyOtp = async (req, res) => {
    try {
        const { telephone, code } = req.body;
        if (!telephone || !code) {
            res.status(400).json({ error: 'Numéro de téléphone et code OTP requis.' });
            return;
        }
        const result = await (0, otp_service_1.verifyOtpCode)(telephone, code);
        if (!result.valid) {
            res.status(400).json({ error: result.error || 'Code invalide ou expiré.' });
            return;
        }
        res.json({
            message: 'Code validé avec succès.',
            resetToken: result.resetToken,
        });
    }
    catch (error) {
        console.error('Erreur lors de la validation du code OTP:', error);
        res.status(500).json({ error: 'Erreur lors de la validation du code.' });
    }
};
exports.verifyOtp = verifyOtp;
/**
 * 3. Réinitialisation du mot de passe avec le resetToken validé
 */
const resetPassword = async (req, res) => {
    try {
        const { resetToken, newPassword } = req.body;
        if (!resetToken || !newPassword) {
            res.status(400).json({ error: 'Jeton de réinitialisation et nouveau mot de passe requis.' });
            return;
        }
        if (newPassword.length < 6) {
            res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères.' });
            return;
        }
        // Vérifier la signature et validité du jeton JWT
        const tokenResult = (0, otp_service_1.verifyResetToken)(resetToken);
        if (!tokenResult.valid || !tokenResult.telephone) {
            res.status(400).json({ error: tokenResult.error || 'Jeton de réinitialisation invalide ou expiré.' });
            return;
        }
        // Trouver l'utilisateur correspondant
        const user = await findUserByFlexiblePhone(tokenResult.telephone);
        if (!user) {
            res.status(404).json({ error: 'Utilisateur introuvable.' });
            return;
        }
        // Hasher le nouveau mot de passe (coût 12)
        const passwordHash = await bcrypt_1.default.hash(newPassword, 12);
        // Mettre à jour en base de données
        await prisma_1.default.user.update({
            where: { id: user.id },
            data: { password: passwordHash },
        });
        console.log(`[Sécurité] Mot de passe réinitialisé avec succès pour l'utilisateur: ${user.id} (${user.telephone})`);
        res.json({
            message: 'Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter.',
        });
    }
    catch (error) {
        console.error('Erreur lors de la réinitialisation du mot de passe:', error);
        res.status(500).json({ error: 'Erreur lors de la réinitialisation du mot de passe.' });
    }
};
exports.resetPassword = resetPassword;
