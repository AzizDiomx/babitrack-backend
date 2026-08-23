import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 100 },  // Ramp-up à 100 utilisateurs virtuels
    { duration: '1m', target: 500 },   // Montée en charge à 500 utilisateurs virtuels
    { duration: '30s', target: 1000 }, // Peak Stress à 1 000 utilisateurs virtuels
    { duration: '30s', target: 0 },    // Récupération
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],    // Taux d'erreur < 1%
    http_req_duration: ['p(95)<200'],  // 95% des requêtes < 200ms
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // 1. Test Health Check
  const resHealth = http.get(`${BASE_URL}/health`);
  check(resHealth, {
    'Health Check status 200': (r) => r.status === 200,
    'Health Check response time < 50ms': (r) => r.timings.duration < 50,
  });

  // 2. Test Consultation Tarifs SaaS (Read-Heavy)
  const resPlans = http.get(`${BASE_URL}/api/saas-plans`);
  check(resPlans, {
    'SaaS Plans status 200': (r) => r.status === 200,
  });

  // 3. Simuler Émission Coordonnées GPS Chauffeur
  const payloadGps = JSON.stringify({
    tripId: 'simulated-trip-123',
    latitude: 5.3489 + (Math.random() - 0.5) * 0.01,
    longitude: -4.0305 + (Math.random() - 0.5) * 0.01,
    speed: 45,
    timestamp: new Date().toISOString()
  });

  const paramsGps = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const resGps = http.post(`${BASE_URL}/api/trips/event`, payloadGps, paramsGps);
  check(resGps, {
    'GPS Event response status <= 404': (r) => r.status < 500,
  });

  sleep(1);
}
