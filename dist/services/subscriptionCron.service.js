"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSubscriptionCron = exports.checkAndSuspendExpiredSubscriptions = void 0;
const prisma_1 = __importDefault(require("../prisma"));
/**
 * Routine d'arrière-plan pour vérifier et suspendre automatiquement
 * les abonnements d'élèves/usagers (table Subscription - dateFin)
 * et les licences de compagnies (table Company - subscriptionExpiresAt).
 */
const checkAndSuspendExpiredSubscriptions = async () => {
    const now = new Date();
    console.log(`[Cron Abonnement] Lancement de la vérification des expirations (${now.toISOString()})...`);
    try {
        // 1. Passer à statut 'EXPIRE' les abonnements usagers dont dateFin < now
        const expiredSubsResult = await prisma_1.default.subscription.updateMany({
            where: {
                statut: 'ACTIF',
                dateFin: {
                    lt: now,
                },
            },
            data: {
                statut: 'EXPIRE',
            },
        });
        // 2. Mettre à jour le statut du profil Usager (User.statut = 'EXPIRE')
        // pour tous les usagers qui ont un abonnement expiré et AUCUN abonnement actif
        const usersWithExpiredSubs = await prisma_1.default.user.findMany({
            where: {
                role: 'USAGER',
                statut: 'ACTIF',
                subscriptions: {
                    some: {
                        statut: 'EXPIRE',
                    },
                    none: {
                        statut: 'ACTIF',
                    },
                },
            },
            select: { id: true },
        });
        let expiredUserCount = 0;
        if (usersWithExpiredSubs.length > 0) {
            const userIds = usersWithExpiredSubs.map((u) => u.id);
            const updateUsersResult = await prisma_1.default.user.updateMany({
                where: {
                    id: { in: userIds },
                },
                data: {
                    statut: 'EXPIRE',
                },
            });
            expiredUserCount = updateUsersResult.count;
        }
        if (expiredSubsResult.count > 0 || expiredUserCount > 0) {
            console.log(`[Cron Abonnement] 🛑 ${expiredSubsResult.count} abonnement(s) et ${expiredUserCount} compte(s) usager(s) expiré(s) et suspendu(s) automatiquement.`);
        }
        else {
            console.log(`[Cron Abonnement] ✅ Aucun abonné usager expiré à suspendre.`);
        }
        // 3. Expirer les licences de Compagnies dont la date d'échéance SaaS est dépassée
        const expiredCompanies = await prisma_1.default.company.updateMany({
            where: {
                status: 'ACTIVE',
                subscriptionExpiresAt: {
                    lt: now,
                },
            },
            data: {
                status: 'EXPIRED',
            },
        });
        if (expiredCompanies.count > 0) {
            console.log(`[Cron Abonnement] 🏢 ${expiredCompanies.count} compagnie(s) SaaS expirée(s) et passée(s) en statut EXPIRED.`);
        }
        else {
            console.log(`[Cron Abonnement] ✅ Aucune licence de compagnie expirée à traiter.`);
        }
        return {
            success: true,
            expiredSubsCount: expiredSubsResult.count,
            expiredUsersCount: expiredUserCount,
            expiredCompaniesCount: expiredCompanies.count,
            executedAt: now,
        };
    }
    catch (error) {
        console.error('[Cron Abonnement] Erreur lors de la vérification des expirations:', error);
        return {
            success: false,
            error,
        };
    }
};
exports.checkAndSuspendExpiredSubscriptions = checkAndSuspendExpiredSubscriptions;
/**
 * Initialise le planificateur d'arrière-plan.
 * S'exécute immédiatement au démarrage du serveur, puis toutes les 24 heures.
 */
const initSubscriptionCron = () => {
    // Exécution initiale au démarrage
    (0, exports.checkAndSuspendExpiredSubscriptions)();
    // Exécution périodique toutes les 1 heure (3600000 millisecondes)
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    setInterval(() => {
        (0, exports.checkAndSuspendExpiredSubscriptions)();
    }, TWENTY_FOUR_HOURS);
    console.log('[Cron Abonnement] Service d\'expiration automatique initialisé (Intervalle: 1 heure).');
};
exports.initSubscriptionCron = initSubscriptionCron;
