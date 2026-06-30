"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeSocketService = void 0;
const jwt_1 = require("../utils/jwt");
const redis_service_1 = require("./redis.service");
const prisma_1 = __importDefault(require("../prisma"));
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
                const locationData = { lat, lng, speed, bearing, timestamp };
                // 2. Mettre en cache Redis (TTL 30s)
                await (0, redis_service_1.setVehicleLocation)(user.companyId, vehicleId, locationData);
                // 3. Sauvegarder l'historique en base de données PostgreSQL
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
                // 4. Déterminer le prochain arrêt et estimer l'ETA
                // Trouver la route associée au véhicule
                const route = await prisma_1.default.route.findFirst({
                    where: { vehicleId, companyId: user.companyId },
                    include: { stops: { orderBy: { ordre: 'asc' } } },
                });
                let stopProchain = 'Non configuré';
                let eta = 10; // ETA par défaut (10 minutes)
                if (route && route.stops.length > 0) {
                    // Trouver l'arrêt le plus proche
                    let closestStop = route.stops[0];
                    let minDistance = getDistance(lat, lng, closestStop.latitude, closestStop.longitude);
                    for (const stop of route.stops) {
                        const dist = getDistance(lat, lng, stop.latitude, stop.longitude);
                        if (dist < minDistance) {
                            minDistance = dist;
                            closestStop = stop;
                        }
                    }
                    // Déterminer le prochain arrêt
                    // Si on est à plus de 150 mètres (0.15 km) de l'arrêt le plus proche, le prochain arrêt est cet arrêt le plus proche.
                    // Sinon, on considère qu'on est à cet arrêt (ou dépassé), le prochain arrêt devient le suivant sur le trajet.
                    const distToClosest = getDistance(lat, lng, closestStop.latitude, closestStop.longitude);
                    let targetStop = closestStop;
                    if (distToClosest < 0.15) {
                        const nextStopIndex = route.stops.findIndex(s => s.id === closestStop.id) + 1;
                        if (nextStopIndex < route.stops.length) {
                            targetStop = route.stops[nextStopIndex];
                        }
                    }
                    stopProchain = targetStop.nom;
                    // Calculer la distance restante vers l'arrêt cible
                    const distToTarget = getDistance(lat, lng, targetStop.latitude, targetStop.longitude);
                    // Calculer l'ETA : Vitesse de calcul en km/h (minimum 20 km/h pour éviter division par zéro / valeurs infinies)
                    const calcSpeed = speed > 2 ? speed : 20;
                    eta = Math.round((distToTarget / calcSpeed) * 60); // temps en minutes
                }
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
                        eta: 5, // Estimé à 5 min en attendant la prochaine transmission réelle
                        stopProchain: 'En cours de calcul...',
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
