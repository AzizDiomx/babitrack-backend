import request from 'supertest';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { AddressInfo } from 'net';
import { app, server } from '../index';
import prisma from '../prisma';
import { cleanDatabase } from './helpers/db.helper';
import bcrypt from 'bcrypt';
import { UserRole, SubscriptionStatus, RouteType } from '@prisma/client';
import redis from '../services/redis.service';

describe('Module 2 - Véhicules & Tracking Temps Réel (Redis + Socket.IO)', () => {
  let port: number;
  let companyAId: string;
  let companyBId: string;

  let adminAToken: string;
  let chauffeurAToken: string;
  let usagerAToken: string;
  let usagerBToken: string;

  let chauffeurAId: string;
  let vehicleAId: string;
  let routeAId: string;

  let clientChauffeur: ClientSocket;
  let clientUsagerA: ClientSocket;
  let clientUsagerB: ClientSocket;

  beforeAll((done) => {
    // Démarrer le serveur HTTP sur un port aléatoire pour les tests
    server.listen(0, async () => {
      port = (server.address() as AddressInfo).port;
      console.log(`[Test] Serveur de test démarré sur le port ${port}`);

      try {
        await cleanDatabase();

        // 1. Créer deux compagnies
        const companyA = await prisma.company.create({
          data: { name: 'Compagnie A', subdomain: 'compagniea' },
        });
        companyAId = companyA.id;

        const companyB = await prisma.company.create({
          data: { name: 'Compagnie B', subdomain: 'compagnieb' },
        });
        companyBId = companyB.id;

        // 2. Créer les rôles de Compagnie A
        const hashedPassword = await bcrypt.hash('password123', 12);
        
        // Admin A
        await prisma.user.create({
          data: {
            companyId: companyAId,
            nom: 'Diallo',
            prenom: 'Admin',
            telephone: '0101010101',
            email: 'admin@a.com',
            password: hashedPassword,
            role: UserRole.ADMIN,
            statut: SubscriptionStatus.ACTIF,
          },
        });

        // Chauffeur A
        const chauffeurA = await prisma.user.create({
          data: {
            companyId: companyAId,
            nom: 'Bamba',
            prenom: 'Chauffeur',
            telephone: '0202020202',
            password: hashedPassword,
            role: UserRole.CHAUFFEUR,
            statut: SubscriptionStatus.ACTIF,
          },
        });
        chauffeurAId = chauffeurA.id;

        // Usager A
        await prisma.user.create({
          data: {
            companyId: companyAId,
            nom: 'Kouassi',
            prenom: 'Usager',
            telephone: '0303030303',
            password: hashedPassword,
            role: UserRole.USAGER,
            statut: SubscriptionStatus.ACTIF,
          },
        });

        // Usager B (Compagnie B)
        await prisma.user.create({
          data: {
            companyId: companyBId,
            nom: 'Zadi',
            prenom: 'Usager B',
            telephone: '0404040404',
            password: hashedPassword,
            role: UserRole.USAGER,
            statut: SubscriptionStatus.ACTIF,
          },
        });

        // 3. Obtenir les tokens de connexion
        const loginAdminA = await request(app).post('/api/auth/login').send({ telephone: '0101010101', password: 'password123' });
        adminAToken = loginAdminA.body.accessToken;

        const loginChauffeurA = await request(app).post('/api/auth/login').send({ telephone: '0202020202', password: 'password123' });
        chauffeurAToken = loginChauffeurA.body.accessToken;

        const loginUsagerA = await request(app).post('/api/auth/login').send({ telephone: '0303030303', password: 'password123' });
        usagerAToken = loginUsagerA.body.accessToken;

        const loginUsagerB = await request(app).post('/api/auth/login').send({ telephone: '0404040404', password: 'password123' });
        usagerBToken = loginUsagerB.body.accessToken;

        // 4. Créer un véhicule pour Compagnie A assigné à Chauffeur A
        const resVehicle = await request(app)
          .post('/api/vehicles')
          .set('Authorization', `Bearer ${adminAToken}`)
          .send({
            immatriculation: 'CI-123-AB',
            capacite: 30,
            chauffeurId: chauffeurAId,
          });
        vehicleAId = resVehicle.body.id;

        // 5. Pré-configurer un trajet (Route) et deux arrêts pour Compagnie A
        const route = await prisma.route.create({
          data: {
            companyId: companyAId,
            nom: 'Trajet Matin — Bandji',
            type: RouteType.MATIN,
            vehicleId: vehicleAId,
          },
        });
        routeAId = route.id;

        await prisma.stop.createMany({
          data: [
            { nom: 'Arrêt 1 : Bandji', latitude: 5.3484, longitude: -4.0152, ordre: 1, routeId: routeAId },
            { nom: 'Arrêt 2 : Lycée Garçons', latitude: 5.3520, longitude: -4.0110, ordre: 2, routeId: routeAId },
          ],
        });

        done();
      } catch (error) {
        done(error);
      }
    });
  });

  afterAll((done) => {
    // Fermer les connexions socket ouvertes
    if (clientChauffeur?.connected) clientChauffeur.disconnect();
    if (clientUsagerA?.connected) clientUsagerA.disconnect();
    if (clientUsagerB?.connected) clientUsagerB.disconnect();

    redis.disconnect();
    cleanDatabase().then(() => {
      prisma.$disconnect().then(() => {
        server.close(done);
      });
    });
  });

  describe('GET /api/vehicles', () => {
    it('doit récupérer la liste des véhicules de Compagnie A', async () => {
      const res = await request(app)
        .get('/api/vehicles')
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].immatriculation).toBe('CI-123-AB');
      expect(res.body[0].chauffeur.id).toBe(chauffeurAId);
    });
  });

  describe('WebSocket Real-time & Redis Cache (Socket.IO)', () => {
    it('doit permettre aux clients de se connecter via WebSocket avec authentification JWT', (done) => {
      let connectedCount = 0;
      const checkDone = () => {
        connectedCount++;
        if (connectedCount === 3) done();
      };

      clientChauffeur = Client(`http://localhost:${port}`, {
        auth: { token: chauffeurAToken },
      });
      clientChauffeur.on('connect', checkDone);

      clientUsagerA = Client(`http://localhost:${port}`, {
        auth: { token: usagerAToken },
      });
      clientUsagerA.on('connect', checkDone);

      clientUsagerB = Client(`http://localhost:${port}`, {
        auth: { token: usagerBToken },
      });
      clientUsagerB.on('connect', checkDone);
    });

    it('doit diffuser la position GPS du chauffeur aux usagers abonnés de la même compagnie', (done) => {
      const locationPayload = {
        lat: 5.3450,
        lng: -4.0180,
        speed: 15.5, // 15.5 km/h
        vehicleId: vehicleAId,
        timestamp: new Date().toISOString(),
      };

      // Usager B (Compagnie B) ne doit PAS recevoir la position (Isolation)
      const mockBReceived = jest.fn();
      clientUsagerB.on('vehicle:position', mockBReceived);

      // Usager A (Compagnie A) doit recevoir la position
      clientUsagerA.on('vehicle:position', (data: any) => {
        expect(data).toHaveProperty('lat');
        expect(data.lat).toBe(locationPayload.lat);
        expect(data.lng).toBe(locationPayload.lng);
        expect(data.bearing).toBeDefined();
        expect(data.stopProchain).toBe('Arrêt 1 : Bandji');
        expect(data.eta).toBeGreaterThanOrEqual(0);

        // Attendre un court instant pour s'assurer que B n'a rien reçu
        setTimeout(async () => {
          expect(mockBReceived).not.toHaveBeenCalled();

          // Vérifier que la position est en cache Redis
          const cached = await redis.get(`tracking:${companyAId}:${vehicleAId}`);
          expect(cached).not.toBeNull();
          const parsed = JSON.parse(cached!);
          expect(parsed.lat).toBe(locationPayload.lat);

          // Vérifier que l'historique a été créé dans PostgreSQL
          const history = await prisma.vehicleLocation.findFirst({
            where: { vehicleId: vehicleAId },
            orderBy: { timestamp: 'desc' },
          });
          expect(history).not.toBeNull();
          expect(history?.latitude).toBe(locationPayload.lat);

          done();
        }, 100);
      });

      // Simulation du chauffeur rejoignant son trajet
      clientChauffeur.emit('driver:join_trip', {
        vehicleId: vehicleAId,
        routeId: routeAId,
        tripType: 'MATIN',
      });

      // Simulation de l'usager s'abonnant au véhicule
      clientUsagerA.emit('user:subscribe_vehicle', { vehicleId: vehicleAId });
      clientUsagerB.emit('user:subscribe_vehicle', { vehicleId: vehicleAId });

      // Attendre un peu avant d'émettre la position
      setTimeout(() => {
        clientChauffeur.emit('driver:location', locationPayload);
      }, 50);
    });
  });

  describe('GET /api/vehicles/:id/location', () => {
    it('doit récupérer la dernière position du véhicule (depuis Redis cache)', async () => {
      const res = await request(app)
        .get(`/api/vehicles/${vehicleAId}/location`)
        .set('Authorization', `Bearer ${usagerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.lat).toBe(5.3450);
      expect(res.body.lng).toBe(-4.0180);
      expect(res.body.bearing).toBeDefined();
    });

    it('doit refuser l\'accès si l\'usager est d\'une autre compagnie', async () => {
      const res = await request(app)
        .get(`/api/vehicles/${vehicleAId}/location`)
        .set('Authorization', `Bearer ${usagerBToken}`);

      expect(res.status).toBe(404); // Le véhicule n'appartient pas à sa compagnie
    });
  });
});
