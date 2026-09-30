import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import path from 'path';
import { globalApiLimiter } from './middlewares/rateLimiter.middleware';

// Configuration CORS sécurisée (Production & Développement)
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:8081',
      'https://babitrack.net',
      'https://www.babitrack.net',
    ];

const isOriginAllowed = (origin: string | undefined): boolean => {
  // Autoriser les requêtes sans header Origin (applications mobiles React Native, curl, backend-to-backend)
  if (!origin) return true;

  // Autoriser les origines spécifiées ou les sous-domaines de babitrack.net
  if (
    allowedOrigins.includes(origin) ||
    /^https:\/\/([a-z0-9-]+\.)?babitrack\.net$/.test(origin)
  ) {
    return true;
  }

  // En environnement hors-production, autoriser le réseau local et les émulateurs mobiles
  if (
    process.env.NODE_ENV !== 'production' &&
    /^(http:\/\/localhost:\d+|http:\/\/127\.0\.0\.1:\d+|http:\/\/192\.168\.\d+\.\d+:\d+|http:\/\/10\.0\.2\.2:\d+)/.test(origin)
  ) {
    return true;
  }

  return false;
};

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Bloqué par la politique de sécurité CORS BabiTrack: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

// Charger les variables d'environnement
dotenv.config();

import companyRoutes from './routes/company.routes';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import vehicleRoutes from './routes/vehicle.routes';
import routeRoutes from './routes/route.routes';
import tripRoutes from './routes/trip.routes';
import notificationRoutes from './routes/notification.routes';
import dashboardRoutes from './routes/dashboard.routes';
import saasPlanRoutes from './routes/saasPlan.routes';
import paymentRequestRoutes from './routes/paymentRequest.routes';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Socket CORS non autorisé: ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  },
});

app.set('io', io);

const PORT = process.env.PORT || 3000;

// Middlewares globaux de sécurité
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors(corsOptions));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Limiteur global sur toutes les routes /api
app.use('/api', globalApiLimiter);

// Routes de l'API
app.use('/api/companies', companyRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/saas-plans', saasPlanRoutes);
app.use('/api/payment-requests', paymentRequestRoutes);

// Route de base de santé de l'API
app.get('/health', (_req, res) => {
  res.json({
    status: 'UP',
    created_at: new Date(),
    service: 'BabiTrack Backend (SaaS Multi-Tenant)'
  });
});

import { initializeSocketService } from './services/socket.service';
import { initSubscriptionCron } from './services/subscriptionCron.service';

initializeSocketService(io);
initSubscriptionCron();

// Démarrer le serveur uniquement s'il n'est pas importé pour les tests
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`BabiTrack Backend démarré avec succès !`);
    console.log(`URL: http://localhost:${PORT}`);
    console.log(`==================================================`);
  });
}

export { app, server, io };
