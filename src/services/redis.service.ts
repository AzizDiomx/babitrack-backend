import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Extraction automatique du hostname pour TLS SNI (Requis par Layerbase, Upstash, Redis Cloud)
let redisHostname: string | undefined = undefined;
try {
  const parsedUrl = new URL(REDIS_URL);
  redisHostname = parsedUrl.hostname;
} catch (err) {
  // Ignorer si URL invalide
}

// Configuration hautement disponible et tolérante aux pannes (Layerbase, Upstash, Render, Redis Cloud)
const isTls = REDIS_URL.startsWith('rediss://');

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null, // Evite la limite de 3 retries fatales lors des reconnexions
  enableReadyCheck: true,
  keepAlive: 10000, // Envoie un Keep-Alive toutes les 10s pour prévenir ECONNRESET
  retryStrategy(times) {
    // Reconnexion progressive (de 100ms à 3s max)
    return Math.min(times * 200, 3000);
  },
  tls: isTls
    ? {
        servername: redisHostname,
        rejectUnauthorized: false,
      }
    : undefined,
});

redis.on('connect', () => {
  console.log('⚡ Connecté à Redis avec succès !');
});

redis.on('error', (err: any) => {
  // Masquer les avertissements de reconnexion automatique ECONNRESET
  if (err.code !== 'ECONNRESET') {
    console.error('⚠️ Avertissement Redis:', err.message || err);
  }
});

// Cache de secours en mémoire en cas d'indisponibilité temporaire de Redis
const memoryFallback = new Map<string, { data: string; expiresAt: number }>();

export const setVehicleLocation = async (
  companyId: string,
  vehicleId: string,
  locationData: { lat: number; lng: number; speed: number; bearing: number; timestamp: string; eta?: number; stopProchain?: string }
): Promise<void> => {
  const key = `tracking:${companyId}:${vehicleId}`;
  const serialized = JSON.stringify(locationData);

  try {
    if (redis.status === 'ready') {
      await redis.set(key, serialized, 'EX', 30); // TTL 30s
      return;
    }
  } catch (err) {
    // Fallback silencieux vers la mémoire vive si Redis est en réinitialisation
  }

  // Fallback In-Memory
  memoryFallback.set(key, { data: serialized, expiresAt: Date.now() + 30000 });
};

export const getVehicleLocation = async (
  companyId: string,
  vehicleId: string
): Promise<{ lat: number; lng: number; speed: number; bearing: number; timestamp: string; eta?: number; stopProchain?: string } | null> => {
  const key = `tracking:${companyId}:${vehicleId}`;

  try {
    if (redis.status === 'ready') {
      const data = await redis.get(key);
      if (data) return JSON.parse(data);
    }
  } catch (err) {
    // Fallback silencieux vers la mémoire vive
  }

  // Vérification dans le cache mémoire de secours
  const fallbackItem = memoryFallback.get(key);
  if (fallbackItem) {
    if (fallbackItem.expiresAt > Date.now()) {
      return JSON.parse(fallbackItem.data);
    }
    memoryFallback.delete(key);
  }

  return null;
};

export const deleteVehicleLocation = async (
  companyId: string,
  vehicleId: string
): Promise<void> => {
  const key = `tracking:${companyId}:${vehicleId}`;
  try {
    if (redis.status === 'ready') {
      await redis.del(key);
    }
  } catch (err) {}
  memoryFallback.delete(key);
};

export default redis;
