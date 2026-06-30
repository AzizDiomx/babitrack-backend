import request from 'supertest';
import { app } from '../index';
import prisma from '../prisma';
import { cleanDatabase } from './helpers/db.helper';
import bcrypt from 'bcrypt';
import { UserRole, SubscriptionStatus } from '@prisma/client';
import redis from '../services/redis.service';

describe('Module 3 - Trajets & Embarquement (QR Scan)', () => {
  let companyAId: string;
  let companyBId: string;

  let adminAToken: string;
  let chauffeurAToken: string;
  let chauffeurBToken: string;

  let vehicleAId: string;
  let userAId: string;
  let userBId: string;
  let userPendingId: string;

  let qrTokenUserA: string;
  let qrTokenUserB: string;
  let qrTokenUserPending: string;

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
    await prisma.user.create({
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

    // Chauffeur B (Compagnie B)
    await prisma.user.create({
      data: {
        companyId: companyBId,
        nom: 'Kouassi',
        prenom: 'Chauffeur B',
        telephone: '0505050505',
        password: hashedPassword,
        role: UserRole.CHAUFFEUR,
        statut: SubscriptionStatus.ACTIF,
      },
    });

    // Usager A (ACTIF)
    const userA = await prisma.user.create({
      data: {
        companyId: companyAId,
        nom: 'Kouassi',
        prenom: 'Usager A',
        telephone: '0303030303',
        password: hashedPassword,
        role: UserRole.USAGER,
        statut: SubscriptionStatus.ACTIF,
      },
    });
    userAId = userA.id;
    qrTokenUserA = userA.qrToken;

    // Créer une souscription active pour l'usager A
    await prisma.subscription.create({
      data: {
        companyId: companyAId,
        userId: userAId,
        type: 'ALLER_RETOUR',
        montant: 15000,
        dateDebut: new Date(),
        dateFin: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // valide
        statut: SubscriptionStatus.ACTIF,
      },
    });

    // Usager B (ACTIF de Compagnie B)
    const userB = await prisma.user.create({
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
    userBId = userB.id;
    qrTokenUserB = userB.qrToken;

    // Usager A2 (EN_ATTENTE)
    const userPending = await prisma.user.create({
      data: {
        companyId: companyAId,
        nom: 'Goli',
        prenom: 'Usager En Attente',
        telephone: '0606060606',
        password: hashedPassword,
        role: UserRole.USAGER,
        statut: SubscriptionStatus.EN_ATTENTE,
      },
    });
    userPendingId = userPending.id;
    qrTokenUserPending = userPending.qrToken;

    // 3. Obtenir les tokens de connexion
    const loginAdminA = await request(app).post('/api/auth/login').send({ telephone: '0101010101', password: 'password123' });
    adminAToken = loginAdminA.body.accessToken;

    const loginChauffeurA = await request(app).post('/api/auth/login').send({ telephone: '0202020202', password: 'password123' });
    chauffeurAToken = loginChauffeurA.body.accessToken;

    const loginChauffeurB = await request(app).post('/api/auth/login').send({ telephone: '0505050505', password: 'password123' });
    chauffeurBToken = loginChauffeurB.body.accessToken;

    // 4. Créer un véhicule pour Compagnie A
    const resVehicle = await request(app)
      .post('/api/vehicles')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        immatriculation: 'CI-123-AB',
        capacite: 30,
      });
    vehicleAId = resVehicle.body.id;
  });

  afterAll(async () => {
    redis.disconnect();
    await cleanDatabase();
    await prisma.$disconnect();
  });

  describe('POST /api/routes (Création d\'itinéraires)', () => {
    it('doit créer un trajet et ses arrêts avec succès', async () => {
      const res = await request(app)
        .post('/api/routes')
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({
          nom: 'Trajet Matin — Bandji',
          type: 'MATIN',
          vehicleId: vehicleAId,
          stops: [
            { nom: 'Bandji', latitude: 5.3484, longitude: -4.0152, ordre: 1 },
            { nom: 'Lycée Garçons', latitude: 5.3520, longitude: -4.0110, ordre: 2 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.nom).toBe('Trajet Matin — Bandji');
      expect(res.body.stops.length).toBe(2);
      expect(res.body.stops[0].nom).toBe('Bandji');
    });
  });

  describe('GET /api/routes', () => {
    it('doit lister les trajets de la compagnie', async () => {
      const res = await request(app)
        .get('/api/routes')
        .set('Authorization', `Bearer ${chauffeurAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].stops.length).toBe(2);
    });
  });

  describe('POST /api/trips/scan (Validation Code QR d\'Embarquement)', () => {
    it('doit autoriser l\'embarquement pour un usager actif (GREEN)', async () => {
      const res = await request(app)
        .post('/api/trips/scan')
        .set('Authorization', `Bearer ${chauffeurAToken}`)
        .send({
          qrToken: qrTokenUserA,
          vehicleId: vehicleAId,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('GREEN');
      expect(res.body.user.nom).toBe('Kouassi');

      // Vérifier la création de l'événement en base
      const event = await prisma.tripEvent.findFirst({
        where: { userId: userAId, eventType: 'embarkation' },
      });
      expect(event).not.toBeNull();
      expect(event?.vehicleId).toBe(vehicleAId);
    });

    it('doit refuser l\'embarquement pour un usager en attente (RED)', async () => {
      const res = await request(app)
        .post('/api/trips/scan')
        .set('Authorization', `Bearer ${chauffeurAToken}`)
        .send({
          qrToken: qrTokenUserPending,
          vehicleId: vehicleAId,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.status).toBe('RED');
      expect(res.body.message).toContain('attente');

      // Pas d'événement créé
      const event = await prisma.tripEvent.findFirst({
        where: { userId: userPendingId },
      });
      expect(event).toBeNull();
    });

    it('doit refuser l\'embarquement pour un usager d\'une autre compagnie (Isolation Multi-Tenant)', async () => {
      const res = await request(app)
        .post('/api/trips/scan')
        .set('Authorization', `Bearer ${chauffeurAToken}`) // Chauffeur de Compagnie A
        .send({
          qrToken: qrTokenUserB, // Usager de Compagnie B
          vehicleId: vehicleAId,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.status).toBe('RED');
      expect(res.body.message).toContain('Compagnie différente');

      // Pas d'événement créé
      const event = await prisma.tripEvent.findFirst({
        where: { userId: userBId },
      });
      expect(event).toBeNull();
    });

    it('doit refuser si le chauffeur appartient à une autre compagnie (Isolation route)', async () => {
      const res = await request(app)
        .post('/api/trips/scan')
        .set('Authorization', `Bearer ${chauffeurBToken}`) // Chauffeur de Compagnie B
        .send({
          qrToken: qrTokenUserA, // Usager de Compagnie A
          vehicleId: vehicleAId,
        });

      // Le code QR de l'usager A n'appartient pas à la Compagnie B du chauffeur
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.status).toBe('RED');
      expect(res.body.message).toContain('Compagnie différente');
    });
  });
});
