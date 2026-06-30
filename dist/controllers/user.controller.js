"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUser = exports.updateUser = exports.createUser = exports.resetQrCode = exports.updateSubscription = exports.getUsers = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
const bcrypt_1 = __importDefault(require("bcrypt"));
const getUsers = async (req, res) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId) {
            res.status(400).json({ error: 'Compagnie non spécifiée dans le token.' });
            return;
        }
        const users = await prisma_1.default.user.findMany({
            where: { companyId },
            select: {
                id: true,
                nom: true,
                prenom: true,
                telephone: true,
                email: true,
                role: true,
                statut: true,
                qrToken: true,
                expoToken: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        res.json(users);
    }
    catch (error) {
        console.error('Erreur lors de la récupération des usagers:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getUsers = getUsers;
const updateSubscription = async (req, res) => {
    try {
        const companyId = req.user?.companyId;
        const adminId = req.user?.userId;
        const { id } = req.params;
        const { statut, type, montant, dateDebut, dateFin } = req.body;
        if (!companyId || !adminId) {
            res.status(401).json({ error: 'Non autorisé.' });
            return;
        }
        // Trouver l'utilisateur cible
        const targetUser = await prisma_1.default.user.findUnique({
            where: { id },
        });
        if (!targetUser) {
            res.status(404).json({ error: 'Utilisateur non trouvé.' });
            return;
        }
        // Vérifier l'isolation Multi-Tenant
        if (targetUser.companyId !== companyId) {
            res.status(403).json({ error: 'Accès interdit. Cet utilisateur appartient à une autre compagnie.' });
            return;
        }
        // Mettre à jour le statut de l'utilisateur
        const updatedUser = await prisma_1.default.user.update({
            where: { id },
            data: {
                statut: statut,
            },
        });
        // Créer ou mettre à jour un enregistrement d'abonnement (Subscription) si fourni
        if (statut === client_1.SubscriptionStatus.ACTIF) {
            await prisma_1.default.subscription.create({
                data: {
                    companyId,
                    userId: id,
                    type: type || client_1.SubscriptionType.ALLER_RETOUR,
                    montant: parseFloat(montant) || 0,
                    dateDebut: dateDebut ? new Date(dateDebut) : new Date(),
                    dateFin: dateFin ? new Date(dateFin) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 jours par défaut
                    statut: client_1.SubscriptionStatus.ACTIF,
                    activatedBy: adminId,
                },
            });
        }
        else {
            // Mettre à jour tous les abonnements actifs à ce nouveau statut
            await prisma_1.default.subscription.updateMany({
                where: {
                    userId: id,
                    statut: client_1.SubscriptionStatus.ACTIF,
                },
                data: {
                    statut: statut,
                },
            });
        }
        const { password: _, ...userWithoutPassword } = updatedUser;
        res.json(userWithoutPassword);
    }
    catch (error) {
        console.error('Erreur lors de la mise à jour de l\'abonnement:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.updateSubscription = updateSubscription;
const resetQrCode = async (req, res) => {
    try {
        const companyId = req.user?.companyId;
        const { id } = req.params;
        if (!companyId) {
            res.status(401).json({ error: 'Non autorisé.' });
            return;
        }
        const targetUser = await prisma_1.default.user.findUnique({
            where: { id },
        });
        if (!targetUser) {
            res.status(404).json({ error: 'Utilisateur non trouvé.' });
            return;
        }
        if (targetUser.companyId !== companyId) {
            res.status(403).json({ error: 'Accès interdit.' });
            return;
        }
        // Réinitialiser le QR Token
        const updatedUser = await prisma_1.default.user.update({
            where: { id },
            data: {
                qrToken: (0, crypto_1.randomUUID)(),
            },
        });
        const { password: _, ...userWithoutPassword } = updatedUser;
        res.json(userWithoutPassword);
    }
    catch (error) {
        console.error('Erreur lors de la réinitialisation du QR code:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.resetQrCode = resetQrCode;
const createUser = async (req, res) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId) {
            res.status(401).json({ error: 'Non autorisé.' });
            return;
        }
        const { nom, prenom, telephone, email, password, role, statut } = req.body;
        if (!nom || !prenom || !telephone || !role) {
            res.status(400).json({ error: 'Nom, prénom, téléphone et rôle requis.' });
            return;
        }
        if (![client_1.UserRole.ADMIN, client_1.UserRole.CHAUFFEUR, client_1.UserRole.USAGER].includes(role)) {
            res.status(400).json({ error: 'Rôle invalide.' });
            return;
        }
        // Valider le quota d'utilisateurs pour la compagnie
        const company = await prisma_1.default.company.findUnique({
            where: { id: companyId },
            select: { maxUsers: true },
        });
        if (company) {
            const currentUserCount = await prisma_1.default.user.count({
                where: { companyId },
            });
            if (currentUserCount >= company.maxUsers) {
                res.status(403).json({ error: `Nombre maximal d'utilisateurs (${company.maxUsers}) atteint pour votre forfait.` });
                return;
            }
        }
        // Vérifier si le téléphone est déjà utilisé
        const existingUser = await prisma_1.default.user.findUnique({
            where: { telephone },
        });
        if (existingUser) {
            res.status(400).json({ error: 'Ce numéro de téléphone est déjà associé à un compte.' });
            return;
        }
        // Vérifier l'email si fourni
        if (email) {
            const existingEmail = await prisma_1.default.user.findUnique({
                where: { email },
            });
            if (existingEmail) {
                res.status(400).json({ error: 'Cet email est déjà associé à un compte.' });
                return;
            }
        }
        // Hasher le mot de passe
        const rawPassword = password || 'BabiTrack@2026';
        const passwordHash = await bcrypt_1.default.hash(rawPassword, 12);
        const newUser = await prisma_1.default.user.create({
            data: {
                companyId,
                nom,
                prenom,
                telephone,
                email: email || null,
                password: passwordHash,
                role: role,
                statut: statut || (role === client_1.UserRole.USAGER ? client_1.SubscriptionStatus.EN_ATTENTE : client_1.SubscriptionStatus.ACTIF),
            },
        });
        const { password: _, ...userWithoutPassword } = newUser;
        res.status(201).json(userWithoutPassword);
    }
    catch (error) {
        console.error('Erreur lors de la création de l\'utilisateur:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.createUser = createUser;
const updateUser = async (req, res) => {
    try {
        const companyId = req.user?.companyId;
        const { id } = req.params;
        const { nom, prenom, telephone, email, role, statut, password } = req.body;
        if (!companyId) {
            res.status(401).json({ error: 'Non autorisé.' });
            return;
        }
        const user = await prisma_1.default.user.findUnique({
            where: { id },
        });
        if (!user || user.companyId !== companyId) {
            res.status(404).json({ error: 'Utilisateur non trouvé.' });
            return;
        }
        // Validation téléphone unique si modifié
        if (telephone && telephone !== user.telephone) {
            const existing = await prisma_1.default.user.findUnique({
                where: { telephone },
            });
            if (existing) {
                res.status(400).json({ error: 'Ce numéro de téléphone est déjà associé à un autre compte.' });
                return;
            }
        }
        // Validation email unique si modifié
        if (email && email !== user.email) {
            const existingEmail = await prisma_1.default.user.findUnique({
                where: { email },
            });
            if (existingEmail) {
                res.status(400).json({ error: 'Cet email est déjà associé à un autre compte.' });
                return;
            }
        }
        // Préparer les données à mettre à jour
        const updateData = {};
        if (nom !== undefined)
            updateData.nom = nom;
        if (prenom !== undefined)
            updateData.prenom = prenom;
        if (telephone !== undefined)
            updateData.telephone = telephone;
        if (email !== undefined)
            updateData.email = email || null;
        if (role !== undefined) {
            if (![client_1.UserRole.ADMIN, client_1.UserRole.CHAUFFEUR, client_1.UserRole.USAGER].includes(role)) {
                res.status(400).json({ error: 'Rôle invalide.' });
                return;
            }
            updateData.role = role;
        }
        if (statut !== undefined)
            updateData.statut = statut;
        if (password) {
            updateData.password = await bcrypt_1.default.hash(password, 12);
        }
        const updated = await prisma_1.default.user.update({
            where: { id },
            data: updateData,
        });
        const { password: _, ...userWithoutPassword } = updated;
        res.json(userWithoutPassword);
    }
    catch (error) {
        console.error('Erreur lors de la mise à jour de l\'utilisateur:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.updateUser = updateUser;
const deleteUser = async (req, res) => {
    try {
        const companyId = req.user?.companyId;
        const { id } = req.params;
        if (!companyId) {
            res.status(401).json({ error: 'Non autorisé.' });
            return;
        }
        const user = await prisma_1.default.user.findUnique({
            where: { id },
        });
        if (!user || user.companyId !== companyId) {
            res.status(404).json({ error: 'Utilisateur non trouvé.' });
            return;
        }
        // Libérer le véhicule du chauffeur si nécessaire
        await prisma_1.default.vehicle.updateMany({
            where: { chauffeurId: id },
            data: { chauffeurId: null },
        });
        // Supprimer l'utilisateur
        await prisma_1.default.user.delete({
            where: { id },
        });
        res.json({ message: 'Utilisateur supprimé avec succès.' });
    }
    catch (error) {
        console.error('Erreur lors de la suppression de l\'utilisateur:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.deleteUser = deleteUser;
