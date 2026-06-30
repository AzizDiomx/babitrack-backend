import request from 'supertest';
import { app } from '../index';
import prisma from '../prisma';
import { cleanDatabase } from './helpers/db.helper';
import bcrypt from 'bcrypt';
import { UserRole, SubscriptionStatus } from '@prisma/client';
import redis from '../services/redis.service';

describe('Module 1 - Authentification & Usagers (SaaS Multi-Tenant)', () => {
  let companyAId: string;
  let companyBId: string;

  let adminAToken: string;

  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    await cleanDatabase();

    // 1. Créer deux compagnies de test
    const companyA = await prisma.company.create({
      data: { name: 'Compagnie A', subdomain: 'compagniea' },
    });
    companyAId = companyA.id;

    const companyB = await prisma.company.create({
      data: { name: 'Compagnie B', subdomain: 'compagnieb' },
    });
    companyBId = companyB.id;

    // 2. Créer un administrateur pour Compagnie A
    const hashedAdminPassword = await bcrypt.hash('adminpassword123', 12);
    await prisma.user.create({
      data: {
        companyId: companyAId,
        nom: 'Diallo',
        prenom: 'Moussa',
        telephone: '0102030405',
        email: 'admin@compagniea.com',
        password: hashedAdminPassword,
        role: UserRole.ADMIN,
        statut: SubscriptionStatus.ACTIF,
      },
    });

    // 3. Créer un administrateur pour Compagnie B
    await prisma.user.create({
      data: {
        companyId: companyBId,
        nom: 'Koffi',
        prenom: 'Jean',
        telephone: '0506070809',
        email: 'admin@compagnieb.com',
        password: hashedAdminPassword,
        role: UserRole.ADMIN,
        statut: SubscriptionStatus.ACTIF,
      },
    });

    // 4. Se connecter pour obtenir les tokens d'administration
    const loginAdminA = await request(app)
      .post('/api/auth/login')
      .send({ telephone: '0102030405', password: 'adminpassword123' });
    adminAToken = loginAdminA.body.accessToken;


  });

  afterAll(async () => {
    redis.disconnect();
    await cleanDatabase();
    await prisma.$disconnect();
  });

  describe('POST /api/auth/register/company/:companyId (Inscription Usager)', () => {
    it('doit enregistrer un usager avec succès pour Compagnie A', async () => {
      const res = await request(app)
        .post(`/api/auth/register/company/${companyAId}`)
        .send({
          nom: 'Diomandé',
          prenom: 'Aziz',
          telephone: '0700000001',
          email: 'aziz@diomande.com',
          password: 'userpassword123',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.nom).toBe('Diomandé');
      expect(res.body.role).toBe(UserRole.USAGER);
      expect(res.body.statut).toBe(SubscriptionStatus.EN_ATTENTE);
      expect(res.body.companyId).toBe(companyAId);
      expect(res.body).not.toHaveProperty('password');

      userAId = res.body.id;
    });

    it('doit enregistrer un usager avec succès pour Compagnie B', async () => {
      const res = await request(app)
        .post(`/api/auth/register/company/${companyBId}`)
        .send({
          nom: 'Kouamé',
          prenom: 'Abel',
          telephone: '0500000002',
          email: 'abel@kouame.com',
          password: 'userpassword123',
        });

      expect(res.status).toBe(201);
      userBId = res.body.id;
    });

    it('doit échouer si le numéro de téléphone est déjà utilisé', async () => {
      const res = await request(app)
        .post(`/api/auth/register/company/${companyAId}`)
        .send({
          nom: 'Diomandé Bis',
          prenom: 'Aziz',
          telephone: '0700000001', // déjà utilisé
          password: 'userpassword123',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /api/auth/login', () => {
    it('doit connecter un usager avec succès', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          telephone: '0700000001',
          password: 'userpassword123',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user.nom).toBe('Diomandé');
    });

    it('doit échouer avec de mauvais identifiants', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          telephone: '0700000001',
          password: 'wrongpassword',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/users (Administration)', () => {
    it('doit récupérer uniquement les usagers de la même compagnie (Isolation logique)', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      // Devrait lister l'usager A de Compagnie A
      const hasUserA = res.body.some((u: any) => u.id === userAId);
      expect(hasUserA).toBe(true);

      // Ne devrait PAS lister l'usager B de Compagnie B
      const hasUserB = res.body.some((u: any) => u.id === userBId);
      expect(hasUserB).toBe(false);
    });

    it('doit interdire l\'accès si le token est manquant', async () => {
      const res = await request(app).get('/api/users');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/users/:id/subscription (Validation d\'abonnement)', () => {
    it('doit permettre à l\'admin de Compagnie A d\'activer l\'abonnement de l\'usager A', async () => {
      const res = await request(app)
        .patch(`/api/users/${userAId}/subscription`)
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({
          statut: SubscriptionStatus.ACTIF,
          type: 'MENSUEL',
          montant: 15000,
        });

      expect(res.status).toBe(200);
      expect(res.body.statut).toBe(SubscriptionStatus.ACTIF);

      // Vérifier en base de données qu'une souscription a bien été créée
      const sub = await prisma.subscription.findFirst({
        where: { userId: userAId },
      });
      expect(sub).toBeDefined();
      expect(sub?.statut).toBe(SubscriptionStatus.ACTIF);
      expect(sub?.montant).toBe(15000);
    });

    it('doit refuser d\'activer l\'abonnement d\'un usager d\'une autre compagnie', async () => {
      const res = await request(app)
        .patch(`/api/users/${userBId}/subscription`) // Usager de B
        .set('Authorization', `Bearer ${adminAToken}`) // Admin de A
        .send({
          statut: SubscriptionStatus.ACTIF,
        });

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('PATCH /api/users/:id/qr/reset (Réinitialisation QR)', () => {
    it('doit permettre à l\'admin de Compagnie A de réinitialiser le token QR de l\'usager A', async () => {
      const originalUser = await prisma.user.findUnique({ where: { id: userAId } });
      const originalQr = originalUser?.qrToken;

      const res = await request(app)
        .patch(`/api/users/${userAId}/qr/reset`)
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.qrToken).toBeDefined();
      expect(res.body.qrToken).not.toBe(originalQr);
    });

    it('doit refuser la réinitialisation QR pour un usager d\'une autre compagnie', async () => {
      const res = await request(app)
        .patch(`/api/users/${userBId}/qr/reset`) // Usager de B
        .set('Authorization', `Bearer ${adminAToken}`); // Admin de A

      expect(res.status).toBe(403);
    });
  });
});
