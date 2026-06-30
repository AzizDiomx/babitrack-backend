"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanQrCode = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const client_1 = require("@prisma/client");
const scanQrCode = async (req, res) => {
    try {
        const companyId = req.user?.companyId;
        const { qrToken, vehicleId, stopId } = req.body;
        if (!companyId) {
            res.status(401).json({ error: 'Non autorisé.' });
            return;
        }
        if (!qrToken || !vehicleId) {
            res.status(400).json({ error: 'qrToken et vehicleId requis.' });
            return;
        }
        // 1. Trouver l'utilisateur lié au qrToken
        const user = await prisma_1.default.user.findUnique({
            where: { qrToken },
        });
        if (!user) {
            res.status(200).json({
                success: false,
                status: 'RED',
                message: 'Code QR inconnu ou invalide.',
                user: null,
            });
            return;
        }
        // 2. Vérifier l'isolation Multi-Tenant
        if (user.companyId !== companyId) {
            res.status(200).json({
                success: false,
                status: 'RED',
                message: 'Code QR invalide (Compagnie différente).',
                user: { nom: user.nom, prenom: user.prenom },
            });
            return;
        }
        // 3. Vérifier le statut de l'utilisateur
        if (user.statut !== client_1.SubscriptionStatus.ACTIF) {
            let message = 'Abonnement inactif.';
            if (user.statut === client_1.SubscriptionStatus.EN_ATTENTE)
                message = 'Inscription en attente de validation.';
            if (user.statut === client_1.SubscriptionStatus.SUSPENDU)
                message = 'Abonnement suspendu.';
            if (user.statut === client_1.SubscriptionStatus.EXPIRE)
                message = 'Abonnement expiré.';
            if (user.statut === client_1.SubscriptionStatus.ANNULE)
                message = 'Abonnement annulé.';
            res.status(200).json({
                success: false,
                status: 'RED',
                message,
                user: { nom: user.nom, prenom: user.prenom, statut: user.statut },
            });
            return;
        }
        // 4. Vérifier la validité temporelle des abonnements (facultatif mais pro)
        const activeSub = await prisma_1.default.subscription.findFirst({
            where: {
                userId: user.id,
                statut: client_1.SubscriptionStatus.ACTIF,
            },
            orderBy: { dateFin: 'desc' },
        });
        if (activeSub && activeSub.dateFin < new Date()) {
            // Mettre à jour le statut en expiré
            await prisma_1.default.user.update({
                where: { id: user.id },
                data: { statut: client_1.SubscriptionStatus.EXPIRE },
            });
            await prisma_1.default.subscription.update({
                where: { id: activeSub.id },
                data: { statut: client_1.SubscriptionStatus.EXPIRE },
            });
            res.status(200).json({
                success: false,
                status: 'RED',
                message: 'Abonnement expiré (date de fin dépassée).',
                user: { nom: user.nom, prenom: user.prenom, statut: client_1.SubscriptionStatus.EXPIRE },
            });
            return;
        }
        // 5. Enregistrer l'événement d'embarquement (TripEvent) dans PostgreSQL
        const event = await prisma_1.default.tripEvent.create({
            data: {
                vehicleId,
                userId: user.id,
                eventType: 'embarkation',
                stopId: stopId || null,
            },
        });
        // 6. Succès de validation
        res.json({
            success: true,
            status: 'GREEN',
            message: 'Accès autorisé.',
            user: {
                id: user.id,
                nom: user.nom,
                prenom: user.prenom,
                telephone: user.telephone,
                statut: user.statut,
            },
            event,
        });
    }
    catch (error) {
        console.error('Erreur lors du scan du code QR:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.scanQrCode = scanQrCode;
