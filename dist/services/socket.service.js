"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeSocketService = void 0;
const jwt_1 = require("../utils/jwt");
const redis_service_1 = require("./redis.service");
const prisma_1 = __importDefault(require("../prisma"));
// Map en mémoire pour suivre l'heure d'arrivée immobile au terminus
// Key: vehicleId -> Value: timestamp d'arrivée au terminus (ms)
const terminusStationaryTracker = new Map();
// Fonction de calcul de distance (Haversine) en km
const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Rayon de la Terre en km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};
const initializeSocketService = (io) => {
    // Garde-Fou 3 : Vérification périodique toutes les 2 minutes pour la règle d'inactivité 15 min
    setInterval(async () => {
        try {
            const activeVehicles = await prisma_1.default.vehicle.findMany({
                where: { statut: 'EN_SERVICE' },
                select: { id: true, companyId: true, immatriculation: true },
            });
            const now = Date.now();
            for (const v of activeVehicles) {
                const lastLoc = await prisma_1.default.vehicleLocation.findFirst({
                    where: { vehicleId: v.id },
                    orderBy: { timestamp: 'desc' },
                });
                // Si aucune position ou la dernière position date de plus de 15 minutes (900 000 ms)
                if (!lastLoc || now - new Date(lastLoc.timestamp).getTime() > 15 * 60 * 1000) {
                    console.log(`[Auto-Clôture Inactivité 15m] Le véhicule ${v.immatriculation} (${v.id}) n'émet plus de GPS. Passage en HORS_SERVICE.`);
                    await prisma_1.default.vehicle.update({
                        where: { id: v.id },
                        data: { statut: 'HORS_SERVICE' },
                    });
                    await (0, redis_service_1.deleteVehicleLocation)(v.companyId, v.id);
                    terminusStationaryTracker.delete(v.id);
                    const roomName = `${v.companyId}:trip:${v.id}`;
                    io.to(roomName).emit('trip:status', {
                        status: 'HORS_SERVICE',
                        message: 'Le trajet a été clôturé automatiquement pour inactivité GPS (15 min).',
                        vehicleId: v.id,
                    });
                }
            }
        }
        catch (err) {
            console.error('[Garde-Fou Inactivité] Erreur lors du check périodique:', err);
        }
    }, 2 * 60 * 1000); // 2 minutes
    // Middleware d'authentification Socket.IO
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token ||
            socket.handshake.headers.authorization?.split(' ')[1];
        if (!token) {
            return next(new Error('Authentification échouée. Token manquant.'));
        }
        try {
            const decoded = (0, jwt_1.verifyAccessToken)(token);
            socket.data.user = decoded;
            next();
        }
        catch (err) {
            return next(new Error('Authentification échouée. Token invalide.'));
        }
    });
    io.on('connection', (socket) => {
        const user = socket.data.user;
        if (!user) {
            socket.disconnect();
            return;
        }
        console.log(`[Socket] Utilisateur connecté: ${user.userId} (${user.role}) - Compagnie: ${user.companyId}`);
        socket.join(user.companyId);
        // Événement 1 : Le chauffeur démarre le trajet / rejoint le salon
        socket.on('driver:join_trip', async (payload) => {
            try {
                const { vehicleId } = payload;
                const roomName = `${user.companyId}:trip:${vehicleId}`;
                await socket.join(roomName);
                console.log(`[Socket] Chauffeur ${user.userId} a rejoint le salon: ${roomName}`);
                // Mettre à jour le statut du véhicule en "EN_SERVICE" dans la base
                await prisma_1.default.vehicle.update({
                    where: { id: vehicleId },
                    data: { statut: 'EN_SERVICE' },
                });
                // Réinitialiser le tracker au terminus
                terminusStationaryTracker.delete(vehicleId);
                // Informer les usagers du changement de statut
                io.to(roomName).emit('trip:status', {
                    status: 'EN_SERVICE',
                    message: 'Le trajet a commencé.',
                    vehicleId,
                });
            }
            catch (error) {
                console.error('Erreur lors du driver:join_trip:', error);
            }
        });
        // Événement 2 : Réception et diffusion des coordonnées GPS par le chauffeur
        socket.on('driver:location', async (payload) => {
            try {
                const { lat, lng, speed, vehicleId, timestamp } = payload;
                const roomName = `${user.companyId}:trip:${vehicleId}`;
                // 1. Calcul du bearing (cap / rotation)
                let bearing = 0;
                const lastLoc = await (0, redis_service_1.getVehicleLocation)(user.companyId, vehicleId);
                if (lastLoc) {
                    const y = Math.sin((lng - lastLoc.lng) * Math.PI / 180) * Math.cos(lat * Math.PI / 180);
                    const x = Math.cos(lastLoc.lat * Math.PI / 180) * Math.sin(lat * Math.PI / 180) -
                        Math.sin(lastLoc.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.cos((lng - lastLoc.lng) * Math.PI / 180);
                    bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
                }
                // 2. Sauvegarder l'historique en base de données PostgreSQL
                await prisma_1.default.vehicleLocation.create({
                    data: {
                        vehicleId,
                        latitude: lat,
                        longitude: lng,
                        speed,
                        bearing,
                        timestamp: new Date(timestamp),
                    },
                });
                // 3. Déterminer le prochain arrêt et estimer l'ETA (Géofencing 100m + Calcul dynamique)
                const route = await prisma_1.default.route.findFirst({
                    where: { vehicleId, companyId: user.companyId },
                    include: { stops: { orderBy: { ordre: 'asc' } } },
                });
                let stopProchain = 'Non configuré';
                let eta = 10;
                if (route && route.stops.length > 0) {
                    const totalStops = route.stops.length;
                    const lastStop = route.stops[totalStops - 1];
                    const distToLast = getDistance(lat, lng, lastStop.latitude, lastStop.longitude);
                    // Si le véhicule est dans la zone du Terminus (moins de 100m)
                    if (distToLast <= 0.1) {
                        stopProchain = `Terminus (${lastStop.nom})`;
                        eta = 0;
                        // Notification visuelle au chauffeur (Alerte Terminus Atteint)
                        socket.emit('driver:at_terminus', {
                            vehicleId,
                            stopName: lastStop.nom,
                            message: `Vous êtes arrivé au terminus (${lastStop.nom}). Cliquez pour clôturer le trajet.`
                        });
                        // Si la vitesse est quasi-nulle (< 3 km/h ou < 0.9 m/s)
                        if (speed < 1.0) {
                            if (!terminusStationaryTracker.has(vehicleId)) {
                                terminusStationaryTracker.set(vehicleId, Date.now());
                            }
                            else {
                                const stationaryTime = Date.now() - terminusStationaryTracker.get(vehicleId);
                                // Si immobile au terminus depuis plus de 5 minutes (300 000 ms)
                                if (stationaryTime >= 5 * 60 * 1000) {
                                    console.log(`[Auto-Clôture Terminus] Le véhicule ${vehicleId} est immobile au terminus depuis > 5 min. Clôture automatique !`);
                                    await prisma_1.default.vehicle.update({
                                        where: { id: vehicleId },
                                        data: { statut: 'HORS_SERVICE' },
                                    });
                                    await (0, redis_service_1.deleteVehicleLocation)(user.companyId, vehicleId);
                                    terminusStationaryTracker.delete(vehicleId);
                                    // Alerte globale et au chauffeur
                                    io.to(roomName).emit('trip:status', {
                                        status: 'HORS_SERVICE',
                                        message: 'Le trajet a été clôturé automatiquement après 5 min d\'arrêt au terminus.',
                                        vehicleId,
                                    });
                                    socket.emit('trip:auto_ended', {
                                        vehicleId,
                                        reason: 'TERMINUS_STATIONARY_5MIN',
                                        message: 'Trajet clôturé automatiquement : Vous êtes arrivé au terminus depuis plus de 5 minutes.'
                                    });
                                    return; // Arrêter le traitement de ce paquet
                                }
                            }
                        }
                        else {
                            // Le véhicule bouge à nouveau, réinitialiser le compteur d'immobilité
                            terminusStationaryTracker.delete(vehicleId);
                        }
                    }
                    else {
                        // Pas au terminus, réinitialiser le tracker
                        terminusStationaryTracker.delete(vehicleId);
                        // Trouver l'arrêt le plus proche
                        let closestIndex = 0;
                        let minDistance = getDistance(lat, lng, route.stops[0].latitude, route.stops[0].longitude);
                        for (let i = 0; i < route.stops.length; i++) {
                            const dist = getDistance(lat, lng, route.stops[i].latitude, route.stops[i].longitude);
                            if (dist < minDistance) {
                                minDistance = dist;
                                closestIndex = i;
                            }
                        }
                        const closestStop = route.stops[closestIndex];
                        let targetStop = closestStop;
                        // Si le car est à moins de 100m du relais courant, on cible l'arrêt suivant s'il existe
                        if (minDistance <= 0.1 && closestIndex + 1 < totalStops) {
                            targetStop = route.stops[closestIndex + 1];
                            stopProchain = `${targetStop.nom} (Prochain)`;
                        }
                        else if (minDistance <= 0.1 && closestIndex + 1 >= totalStops) {
                            stopProchain = `Sur place (${closestStop.nom})`;
                        }
                        else {
                            stopProchain = targetStop.nom;
                        }
                        const distToTarget = getDistance(lat, lng, targetStop.latitude, targetStop.longitude);
                        // Conversion vitesse : si immobile/embouteillage (vitesse < 3 km/h), estimer à 20 km/h en ville
                        const currentSpeedKmH = (speed || 0) * 3.6;
                        const calcSpeed = currentSpeedKmH > 5 ? currentSpeedKmH : 20;
                        eta = Math.max(1, Math.round((distToTarget / calcSpeed) * 60));
                    }
                }
                // 4. Mettre en cache Redis avec eta et stopProchain inclus (TTL 30s)
                await (0, redis_service_1.setVehicleLocation)(user.companyId, vehicleId, { lat, lng, speed, bearing, timestamp, eta, stopProchain });
                // 5. Rediffuser la position aux usagers connectés
                io.to(roomName).emit('vehicle:position', {
                    vehicleId,
                    lat,
                    lng,
                    speed,
                    bearing,
                    eta,
                    stopProchain,
                });
            }
            catch (error) {
                console.error('Erreur lors de la réception de la position:', error);
            }
        });
        // Événement 3 : L'usager s'abonne à la géolocalisation d'un véhicule
        socket.on('user:subscribe_vehicle', async (payload) => {
            try {
                const { vehicleId } = payload;
                const roomName = `${user.companyId}:trip:${vehicleId}`;
                await socket.join(roomName);
                console.log(`[Socket] Usager ${user.userId} s'est abonné au véhicule: ${roomName}`);
                // Renvoyer immédiatement la dernière position connue depuis Redis (si disponible)
                const lastLoc = await (0, redis_service_1.getVehicleLocation)(user.companyId, vehicleId);
                if (lastLoc) {
                    socket.emit('vehicle:position', {
                        vehicleId,
                        lat: lastLoc.lat,
                        lng: lastLoc.lng,
                        speed: lastLoc.speed,
                        bearing: lastLoc.bearing,
                        eta: lastLoc.eta ?? 10,
                        stopProchain: lastLoc.stopProchain ?? 'En cours de calcul...',
                    });
                }
            }
            catch (error) {
                console.error('Erreur lors du user:subscribe_vehicle:', error);
            }
        });
        // Déconnexion
        socket.on('disconnect', () => {
            console.log(`[Socket] Utilisateur déconnecté: ${user.userId}`);
        });
    });
};
exports.initializeSocketService = initializeSocketService;
