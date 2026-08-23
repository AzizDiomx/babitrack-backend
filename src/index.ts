import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import path from 'path';

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
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  }
});

app.set('io', io);

const PORT = process.env.PORT || 3000;

// Middlewares globaux
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

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
