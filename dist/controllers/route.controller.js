"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRoutes = exports.createRoute = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const createRoute = async (req, res) => {
    try {
        const companyId = req.user?.companyId;
        const { nom, type, vehicleId, stops } = req.body;
        if (!companyId) {
            res.status(401).json({ error: 'Non autorisé.' });
            return;
        }
        if (!nom || !type) {
            res.status(400).json({ error: 'Nom et type de trajet requis.' });
            return;
        }
        // Si un véhicule est fourni, vérifier qu'il appartient bien à la même compagnie
        if (vehicleId) {
            const vehicle = await prisma_1.default.vehicle.findUnique({
                where: { id: vehicleId },
            });
            if (!vehicle || vehicle.companyId !== companyId) {
                res.status(400).json({ error: 'Le véhicule assigné doit appartenir à la même compagnie.' });
                return;
            }
        }
        // Création du trajet et de ses arrêts associés en transaction
        const result = await prisma_1.default.$transaction(async (tx) => {
            const route = await tx.route.create({
                data: {
                    companyId,
                    nom,
                    type: type,
                    vehicleId: vehicleId || null,
                },
            });
            if (stops && Array.isArray(stops) && stops.length > 0) {
                const stopsData = stops.map((stop) => ({
                    nom: stop.nom,
                    latitude: parseFloat(stop.latitude),
                    longitude: parseFloat(stop.longitude),
                    ordre: parseInt(stop.ordre, 10),
                    routeId: route.id,
                }));
                await tx.stop.createMany({
                    data: stopsData,
                });
            }
            return tx.route.findUnique({
                where: { id: route.id },
                include: { stops: { orderBy: { ordre: 'asc' } } },
            });
        });
        res.status(201).json(result);
    }
    catch (error) {
        console.error('Erreur lors de la création du trajet:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.createRoute = createRoute;
const getRoutes = async (req, res) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId) {
            res.status(401).json({ error: 'Non autorisé.' });
            return;
        }
        const routes = await prisma_1.default.route.findMany({
            where: { companyId },
            include: {
                stops: { orderBy: { ordre: 'asc' } },
                vehicle: {
                    select: {
                        id: true,
                        immatriculation: true,
                        statut: true,
                    },
                },
            },
        });
        res.json(routes);
    }
    catch (error) {
        console.error('Erreur lors de la récupération des trajets:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getRoutes = getRoutes;
