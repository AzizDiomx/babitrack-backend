import request from 'supertest';
import { app } from '../index';
import prisma from '../prisma';
import { cleanDatabase } from './helpers/db.helper';
import bcrypt from 'bcrypt';
import { UserRole, SubscriptionStatus, VehicleStatus } from '@prisma/client';
import redis from '../services/redis.service';

describe('Module 5 - Dashboard & Statistiques', () => {
  let companyAId: string;
  let companyBId: string;

  let adminAToken: string;
  let vehicleAId: string;
  let userAId: string;

  beforeAll(async () => {
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

    // 2. Créer l'Admin de Compagnie A
    const hashedPassword = await bcrypt.hash('password123', 12);
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

    // 3. Se connecter
    const loginAdmin = await request(app).post('/api/auth/login').send({ telephone: '0101010101', password: 'password123' });
    adminAToken = loginAdmin.body.accessToken;

    // 4. Créer 2 Usagers ACTIFs pour Compagnie A
    const userA = await prisma.user.create({
      data: {
        companyId: companyAId,
        nom: 'Kouassi',
        prenom: 'Usager A1',
        telephone: '0202020202',
        password: hashedPassword,
        role: UserRole.USAGER,
        statut: SubscriptionStatus.ACTIF,
      },
    });
    userAId = userA.id;

    await prisma.user.create({
      data: {
        companyId: companyAId,
        nom: 'Koffi',
        prenom: 'Usager A2',
        telephone: '0303030303',
        password: hashedPassword,
        role: UserRole.USAGER,
        statut: SubscriptionStatus.ACTIF,
      },
    });

    // Créer 1 Usager EN_ATTENTE pour Compagnie A
    await prisma.user.create({
      data: {
        companyId: companyAId,
        nom: 'Zadi',
        prenom: 'Usager A3',
        telephone: '0404040404',
        password: hashedPassword,
        role: UserRole.USAGER,
        statut: SubscriptionStatus.EN_ATTENTE,
      },
    });

    // Créer 1 Usager ACTIF pour Compagnie B (ne doit pas être compté dans Compagnie A)
    await prisma.user.create({
      data: {
        companyId: companyBId,
        nom: 'Soro',
        prenom: 'Usager B1',
        telephone: '0505050505',
        password: hashedPassword,
        role: UserRole.USAGER,
        statut: SubscriptionStatus.ACTIF,
      },
    });

    // 5. Créer des Véhicules pour Compagnie A
    // Un véhicule en service
    const vehicle1 = await prisma.vehicle.create({
      data: {
        companyId: companyAId,
        immatriculation: 'CI-100-AA',
        capacite: 30,
        statut: VehicleStatus.EN_SERVICE,
      },
    });
    vehicleAId = vehicle1.id;

    // Un véhicule en panne
    await prisma.vehicle.create({
      data: {
        companyId: companyAId,
        immatriculation: 'CI-200-BB',
        capacite: 30,
        statut: VehicleStatus.PANNE,
      },
    });

    // Un véhicule en service pour Compagnie B (ne doit pas être compté dans Compagnie A)
    await prisma.vehicle.create({
      data: {
        companyId: companyBId,
        immatriculation: 'CI-300-CC',
        capacite: 30,
        statut: VehicleStatus.EN_SERVICE,
      },
    });

    // 6. Créer des Notifications
    // Une notification pour Compagnie A créée il y a 2h
    await prisma.notification.create({
      data: {
        companyId: companyAId,
        title: 'Alerte Retard',
        message: 'Retard estimé de 20m.',
        type: 'RETARD',
        severity: 'HIGH',
        audience: 'TOUS',
        sentAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
        createdBy: (await prisma.user.findFirst({ where: { companyId: companyAId, role: UserRole.ADMIN } }))!.id,
      },
    });

    // Une notification pour Compagnie A créée il y a 2 jours (hors des dernières 24h)
    await prisma.notification.create({
      data: {
        companyId: companyAId,
        title: 'Annonce',
        message: 'Bienvenue sur la plateforme.',
        type: 'INFO',
        severity: 'LOW',
        audience: 'TOUS',
        sentAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48h ago
        createdBy: (await prisma.user.findFirst({ where: { companyId: companyAId, role: UserRole.ADMIN } }))!.id,
      },
    });

    // 7. Créer un événement d'embarquement aujourd'hui pour Compagnie A
    await prisma.tripEvent.create({
      data: {
        vehicleId: vehicleAId,
        userId: userAId,
        eventType: 'embarkation',
        created_at: new Date(), // aujourd'hui
      },
    });
  });

  afterAll(async () => {
    redis.disconnect();
    await cleanDatabase();
    await prisma.$disconnect();
  });

  describe('GET /api/dashboard/stats', () => {
    it('doit renvoyer les statistiques correctes et isolées par compagnie', async () => {
      const res = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('stats');
      expect(res.body).toHaveProperty('embarkationsToday');

      const stats = res.body.stats;
      // 2 usagers actifs (A1 et A2). L'usager A3 (EN_ATTENTE) et B1 (compagnie B) sont exclus.
      expect(stats.activeSubscriptions).toBe(2);

      // 1 véhicule en service pour Compagnie A. Celui de Compagnie B est exclu.
      expect(stats.activeVehicles).toBe(1);

      // 1 véhicule en panne pour Compagnie A.
      expect(stats.brokenVehicles).toBe(1);

      // 1 notification dans les dernières 24h. Celle d'il y a 48h est exclue.
      expect(stats.notificationsCount).toBe(1);

      // 1 embarquement aujourd'hui pour le véhicule A1
      const embarkStats = res.body.embarkationsToday;
      const vehicleStats = embarkStats.find((v: any) => v.vehicleId === vehicleAId);
      expect(vehicleStats).toBeDefined();
      expect(vehicleStats.count).toBe(1);
      expect(vehicleStats.immatriculation).toBe('CI-100-AA');
    });

    it('doit refuser l\'accès aux non-admins', async () => {
      // Usager A1 se connecte
      const loginUsager = await request(app).post('/api/auth/login').send({ telephone: '0202020202', password: 'password123' });
      const usagerToken = loginUsager.body.accessToken;

      const res = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${usagerToken}`);

      expect(res.status).toBe(403);
    });
  });
});
