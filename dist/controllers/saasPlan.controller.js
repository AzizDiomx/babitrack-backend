"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSaasPlan = exports.updateSaasPlan = exports.createSaasPlan = exports.getSaasPlans = void 0;
const prisma_1 = __importDefault(require("../prisma"));
// Default initial SaaS plans seed if database table is empty
const DEFAULT_PLANS = [
    {
        code: 'DECOUVERTE',
        name: 'Découverte / Essai',
        badge: 'Gratuit 3 mois',
        priceMensuel: 0,
        priceAnnuel: 0,
        maxVehicles: 3,
        maxUsers: 20,
        features: [
            'Suivi GPS temps réel des bus',
            'Carte interactive avec arrêts',
            'Alertes de franchissement d\'arrêts',
            'Support standard par e-mail',
        ],
        popular: false,
        status: 'ACTIVE',
    },
    {
        code: 'ESSENTIEL',
        name: 'Essentiel Pro',
        badge: 'Populaire',
        priceMensuel: 150000,
        priceAnnuel: 1500000,
        maxVehicles: 10,
        maxUsers: 150,
        features: [
            'Toutes les fonctions Découverte',
            'Jusqu\'à 10 cars scolaires',
            'Jusqu\'à 150 élèves & abonnés',
            'Notifications Push instantanées',
            'Rapports d\'activité & statistiques',
            'Clôture automatique aux terminus',
            'Support prioritaire 7j/7',
        ],
        popular: true,
        status: 'ACTIVE',
    },
    {
        code: 'PREMIUM',
        name: 'Premium Flotte Max',
        badge: 'Pour grands réseaux',
        priceMensuel: 450000,
        priceAnnuel: 4500000,
        maxVehicles: 50,
        maxUsers: 1000,
        features: [
            'Toutes les fonctions Essentiel Pro',
            'Jusqu\'à 50 cars scolaires',
            'Jusqu\'à 1 000 élèves & abonnés',
            'Google Maps Satellite HD en continu',
            'Export des données CSV & Excel',
            'Gestionnaire de compte dédié BabiTrack',
            'Support VIP 24h/24 & formation',
        ],
        popular: false,
        status: 'ACTIVE',
    },
];
const getSaasPlans = async (_req, res) => {
    try {
        let plans = await prisma_1.default.saasPlan.findMany({
            where: { status: 'ACTIVE' },
            orderBy: { priceMensuel: 'asc' },
        });
        if (!plans || plans.length === 0) {
            // Seed default plans if table empty
            for (const p of DEFAULT_PLANS) {
                try {
                    await prisma_1.default.saasPlan.create({ data: p });
                }
                catch (e) {
                    // ignore duplicate seed errors
                }
            }
            plans = await prisma_1.default.saasPlan.findMany({
                where: { status: 'ACTIVE' },
                orderBy: { priceMensuel: 'asc' },
            });
        }
        res.json(plans);
    }
    catch (error) {
        console.error('Erreur getSaasPlans:', error);
        res.json(DEFAULT_PLANS);
    }
};
exports.getSaasPlans = getSaasPlans;
const createSaasPlan = async (req, res) => {
    try {
        const { code, name, badge, priceMensuel, priceAnnuel, maxVehicles, maxUsers, features, popular } = req.body;
        if (!code || !name) {
            res.status(400).json({ error: 'Code et nom de l\'offre obligatoires.' });
            return;
        }
        const cleanCode = code.toUpperCase().trim();
        const existing = await prisma_1.default.saasPlan.findFirst({
            where: {
                OR: [{ code: cleanCode }, { id: cleanCode }],
            },
        });
        if (existing) {
            res.status(400).json({ error: 'Une offre existe déjà avec ce code.' });
            return;
        }
        const newPlan = await prisma_1.default.saasPlan.create({
            data: {
                code: cleanCode,
                name,
                badge: badge || null,
                priceMensuel: parseFloat(priceMensuel) || 0,
                priceAnnuel: parseFloat(priceAnnuel) || 0,
                maxVehicles: parseInt(maxVehicles, 10) || 3,
                maxUsers: parseInt(maxUsers, 10) || 20,
                features: Array.isArray(features) ? features : [],
                popular: Boolean(popular),
                status: 'ACTIVE',
            },
        });
        res.status(201).json(newPlan);
    }
    catch (error) {
        console.error('Erreur createSaasPlan:', error);
        res.status(500).json({ error: 'Erreur lors de la création de l\'offre' });
    }
};
exports.createSaasPlan = createSaasPlan;
const updateSaasPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const { code, name, badge, priceMensuel, priceAnnuel, maxVehicles, maxUsers, features, popular, status } = req.body;
        const updateData = {};
        if (name !== undefined)
            updateData.name = name;
        if (badge !== undefined)
            updateData.badge = badge;
        if (priceMensuel !== undefined)
            updateData.priceMensuel = parseFloat(priceMensuel);
        if (priceAnnuel !== undefined)
            updateData.priceAnnuel = parseFloat(priceAnnuel);
        if (maxVehicles !== undefined)
            updateData.maxVehicles = parseInt(maxVehicles, 10);
        if (maxUsers !== undefined)
            updateData.maxUsers = parseInt(maxUsers, 10);
        if (features !== undefined)
            updateData.features = Array.isArray(features) ? features : [];
        if (popular !== undefined)
            updateData.popular = Boolean(popular);
        if (status !== undefined)
            updateData.status = status;
        // Search by ID or Code (e.g. plan_decouverte, DECOUVERTE, or UUID)
        const searchCode = (code || id).toUpperCase().trim();
        let existingPlan = await prisma_1.default.saasPlan.findFirst({
            where: {
                OR: [
                    { id: id },
                    { code: searchCode },
                    { code: id.toUpperCase().trim() },
                ],
            },
        });
        let updated;
        if (existingPlan) {
            updated = await prisma_1.default.saasPlan.update({
                where: { id: existingPlan.id },
                data: updateData,
            });
        }
        else {
            // Upsert/Create if not existing in DB yet
            updated = await prisma_1.default.saasPlan.create({
                data: {
                    code: searchCode,
                    name: name || searchCode,
                    badge: badge || null,
                    priceMensuel: parseFloat(priceMensuel) || 0,
                    priceAnnuel: parseFloat(priceAnnuel) || 0,
                    maxVehicles: parseInt(maxVehicles, 10) || 3,
                    maxUsers: parseInt(maxUsers, 10) || 20,
                    features: Array.isArray(features) ? features : [],
                    popular: Boolean(popular),
                    status: status || 'ACTIVE',
                },
            });
        }
        res.json(updated);
    }
    catch (error) {
        console.error('Erreur updateSaasPlan:', error);
        res.status(500).json({ error: error?.message || 'Erreur lors de la mise à jour de l\'offre' });
    }
};
exports.updateSaasPlan = updateSaasPlan;
const deleteSaasPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const searchCode = id.toUpperCase().trim();
        const existingPlan = await prisma_1.default.saasPlan.findFirst({
            where: {
                OR: [{ id }, { code: searchCode }],
            },
        });
        if (existingPlan) {
            await prisma_1.default.saasPlan.update({
                where: { id: existingPlan.id },
                data: { status: 'ARCHIVED' },
            });
        }
        res.json({ success: true, message: 'Offre archivée avec succès.' });
    }
    catch (error) {
        console.error('Erreur deleteSaasPlan:', error);
        res.status(500).json({ error: 'Erreur lors de l\'archivage de l\'offre' });
    }
};
exports.deleteSaasPlan = deleteSaasPlan;
