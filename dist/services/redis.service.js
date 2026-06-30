"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteVehicleLocation = exports.getVehicleLocation = exports.setVehicleLocation = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new ioredis_1.default(REDIS_URL, {
    maxRetriesPerRequest: 3,
});
redis.on('connect', () => {
    console.log('Connecté à Redis avec succès !');
});
redis.on('error', (err) => {
    console.error('❌ Erreur de connexion Redis:', err);
});
const setVehicleLocation = async (companyId, vehicleId, locationData) => {
    const key = `tracking:${companyId}:${vehicleId}`;
    await redis.set(key, JSON.stringify(locationData), 'EX', 30); // TTL 30s
};
exports.setVehicleLocation = setVehicleLocation;
const getVehicleLocation = async (companyId, vehicleId) => {
    const key = `tracking:${companyId}:${vehicleId}`;
    const data = await redis.get(key);
    if (!data)
        return null;
    return JSON.parse(data);
};
exports.getVehicleLocation = getVehicleLocation;
const deleteVehicleLocation = async (companyId, vehicleId) => {
    const key = `tracking:${companyId}:${vehicleId}`;
    await redis.del(key);
};
exports.deleteVehicleLocation = deleteVehicleLocation;
exports.default = redis;
