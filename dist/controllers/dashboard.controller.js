"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardStats = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const getDashboardStats = async (req, res) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId) {
            res.status(401).json({ error: 'Non autorisé.' });
            return;
        }
        // 1. Nombre d'abonnés actifs (statut = ACTIF)
        const activeSubscriptions = await prisma_1.default.user.count({
            where: {
                companyId,
                role: 'USAGER',
                statut: 'ACTIF',
            },
        });
        // 2. Nombre de véhicules en service
        const activeVehicles = await prisma_1.default.vehicle.count({
            where: {
                companyId,
                statut: 'EN_SERVICE',
            },
        });
        // 3. Nombre de véhicules en panne
        const brokenVehicles = await prisma_1.default.vehicle.count({
            where: {
                companyId,
                statut: 'PANNE',
            },
        });
        // 4. Flux de notifications envoyées dans les dernières 24 heures
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const notificationsCount = await prisma_1.default.notification.count({
            where: {
                companyId,
                sentAt: {
                    gte: oneDayAgo,
                },
            },
        });
        // 5. Tableau des embarquements du jour par véhicule et trajet
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const companyVehicles = await prisma_1.default.vehicle.findMany({
            where: { companyId },
            include: {
                routes: {
                    select: {
                        id: true,
                        nom: true,
                        type: true,
                    },
                },
            },
        });
        const embarkationsTodayEvents = await prisma_1.default.tripEvent.findMany({
            where: {
                eventType: 'embarkation',
                timestamp: { gte: startOfToday },
                vehicle: { companyId },
            },
            include: {
                user: {
                    select: {
                        id: true,
                        nom: true,
                        prenom: true,
                        telephone: true,
                    },
                },
            },
            orderBy: { timestamp: 'desc' },
        });
        const embarkationsSummary = companyVehicles.map((vehicle) => {
            const vehicleEvents = embarkationsTodayEvents.filter((e) => e.vehicleId === vehicle.id);
            const uniquePassengersMap = new Map();
            vehicleEvents.forEach((e) => {
                if (e.user && !uniquePassengersMap.has(e.userId)) {
                    uniquePassengersMap.set(e.userId, {
                        id: e.user.id,
                        nom: e.user.nom,
                        prenom: e.user.prenom,
                        telephone: e.user.telephone,
                        scanTime: e.timestamp.toISOString(),
                    });
                }
            });
            const uniquePassengers = Array.from(uniquePassengersMap.values());
            const mainRoute = vehicle.routes[0];
            return {
                vehicleId: vehicle.id,
                immatriculation: vehicle.immatriculation,
                capacite: vehicle.capacite,
                statut: vehicle.statut,
                routeName: mainRoute ? mainRoute.nom : 'Aucun trajet assigné',
                routeType: mainRoute ? mainRoute.type : null,
                totalScans: vehicleEvents.length,
                uniqueCount: uniquePassengers.length,
                passengers: uniquePassengers,
            };
        });
        // 6. Statistiques d'activité hebdomadaire (7 derniers jours)
        const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
        const weeklyActivity = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const start = new Date(d.setHours(0, 0, 0, 0));
            const end = new Date(d.setHours(23, 59, 59, 999));
            const realCount = await prisma_1.default.tripEvent.count({
                where: {
                    eventType: 'embarkation',
                    timestamp: {
                        gte: start,
                        lte: end,
                    },
                    vehicle: { companyId },
                },
            });
            const dayName = dayNames[start.getDay()];
            const formattedDate = start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
            weeklyActivity.push({
                name: dayName,
                date: formattedDate,
                boardings: realCount,
                fullDate: start.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
            });
        }
        res.json({
            stats: {
                activeSubscriptions,
                activeVehicles,
                brokenVehicles,
                notificationsCount,
            },
            embarkationsToday: embarkationsSummary,
            weeklyActivity,
        });
    }
    catch (error) {
        console.error('Erreur lors de la récupération des statistiques du tableau de bord:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getDashboardStats = getDashboardStats;
