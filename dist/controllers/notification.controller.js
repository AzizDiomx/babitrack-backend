"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendNotification = exports.getNotifications = void 0;
const expo_server_sdk_1 = require("expo-server-sdk");
const prisma_1 = __importDefault(require("../prisma"));
const expo = new expo_server_sdk_1.Expo();
const getNotifications = async (req, res) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId) {
            res.status(401).json({ error: 'Non autorisé.' });
            return;
        }
        const notifications = await prisma_1.default.notification.findMany({
            where: { companyId },
            orderBy: { sentAt: 'desc' },
            include: {
                admin: {
                    select: {
                        nom: true,
                        prenom: true,
                    },
                },
            },
        });
        res.json(notifications);
    }
    catch (error) {
        console.error('Erreur lors de la récupération des notifications:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getNotifications = getNotifications;
const sendNotification = async (req, res) => {
    try {
        const companyId = req.user?.companyId;
        const adminId = req.user?.userId;
        const { title, message, type, severity, audience } = req.body;
        if (!companyId || !adminId) {
            res.status(401).json({ error: 'Non autorisé.' });
            return;
        }
        if (!title || !message || !type || !severity || !audience) {
            res.status(400).json({ error: 'Tous les champs obligatoires (title, message, type, severity, audience) doivent être fournis.' });
            return;
        }
        // 1. Sauvegarder la notification en base de données
        const notification = await prisma_1.default.notification.create({
            data: {
                companyId,
                title,
                message,
                type: type,
                severity,
                audience: audience,
                createdBy: adminId,
            },
        });
        // 2. Diffuser en temps réel via Socket.IO à tous les usagers de la compagnie
        const io = req.app.get('io');
        io.to(companyId).emit('notification:push', {
            id: notification.id,
            title,
            message,
            type,
            severity,
            sentAt: notification.sentAt,
        });
        // 3. Récupérer les tokens push Expo des usagers cibles
        // Pour l'MVP, nous récupérons tous les usagers actifs de la compagnie qui ont un token Expo
        const users = await prisma_1.default.user.findMany({
            where: {
                companyId,
                role: 'USAGER',
                statut: 'ACTIF',
                expoToken: { not: null },
            },
            select: { expoToken: true },
        });
        const pushTokens = users
            .map((u) => u.expoToken)
            .filter((token) => token !== null && expo_server_sdk_1.Expo.isExpoPushToken(token));
        // 4. Envoyer les notifications via Expo Push Service
        if (pushTokens.length > 0) {
            const messages = pushTokens.map((token) => ({
                to: token,
                sound: 'default',
                title: `[BabiTrack] ${title}`,
                body: message,
                data: { type, severity, notificationId: notification.id },
            }));
            // Découper en paquets et envoyer
            const chunks = expo.chunkPushNotifications(messages);
            for (const chunk of chunks) {
                try {
                    await expo.sendPushNotificationsAsync(chunk);
                }
                catch (pushError) {
                    console.error('Erreur d\'envoi de paquet de notifications push:', pushError);
                }
            }
        }
        res.status(201).json({
            success: true,
            notification,
            sentCount: pushTokens.length,
        });
    }
    catch (error) {
        console.error('Erreur lors de la création/envoi de la notification:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.sendNotification = sendNotification;
