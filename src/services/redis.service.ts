import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => {
  console.log('Connecté à Redis avec succès !');
});

redis.on('error', (err) => {
  console.error('❌ Erreur de connexion Redis:', err);
});

export const setVehicleLocation = async (
  companyId: string,
  vehicleId: string,
  locationData: { lat: number; lng: number; speed: number; bearing: number; timestamp: string }
): Promise<void> => {
  const key = `tracking:${companyId}:${vehicleId}`;
  await redis.set(key, JSON.stringify(locationData), 'EX', 30); // TTL 30s
};

export const getVehicleLocation = async (
  companyId: string,
  vehicleId: string
): Promise<{ lat: number; lng: number; speed: number; bearing: number; timestamp: string } | null> => {
  const key = `tracking:${companyId}:${vehicleId}`;
  const data = await redis.get(key);
  if (!data) return null;
  return JSON.parse(data);
};

export const deleteVehicleLocation = async (
  companyId: string,
  vehicleId: string
): Promise<void> => {
  const key = `tracking:${companyId}:${vehicleId}`;
  await redis.del(key);
};

export default redis;
