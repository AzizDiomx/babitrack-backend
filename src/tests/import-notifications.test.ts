import request from 'supertest';
import xlsx from 'xlsx';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { AddressInfo } from 'net';
import { app, server } from '../index';
import prisma from '../prisma';
import { cleanDatabase } from './helpers/db.helper';
import bcrypt from 'bcrypt';
import { UserRole, SubscriptionStatus } from '@prisma/client';
import redis from '../services/redis.service';

describe('Module 4 - Import Excel & Notifications', () => {
  let port: number;
  let companyAId: string;
  let adminAToken: string;
  let usagerAToken: string;
  let clientUsagerA: ClientSocket;

  // Fonction utilitaire pour générer un fichier Excel en mémoire
  const generateExcelBuffer = () => {
    const wb = xlsx.utils.book_new();
    const data = [
      ['Nom', 'Prénom', 'Téléphone', 'Type abonnement', 'Statut'],
      ['Diomandé', 'Aziz', '0700000010', 'ALLER_RETOUR', 'ACTIF'],
      ['Kouamé', 'Abel', '0500000020', 'MENSUEL', 'ACTIF'],
      ['Diallo', 'Invalide', '', 'MENSUEL', 'ACTIF'], // Téléphone manquant -> doit échouer
    ];
    const ws = xlsx.utils.aoa_to_sheet(data);
    xlsx.utils.book_append_sheet(wb, ws, 'Abonnes');
    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  };

  beforeAll((done) => {
    server.listen(0, async () => {
      port = (server.address() as AddressInfo).port;

      try {
        await cleanDatabase();

        // 1. Créer une compagnie de test
        const company = await prisma.company.create({
          data: { name: 'Compagnie A', subdomain: 'compagniea' },
        });
        companyAId = company.id;

        // 2. Créer l'Admin de Compagnie A
        const hashedPassword = await bcrypt.hash('password123', 12);
        await prisma.user.create({
          data: {
            companyId: companyAId,
            nom: 'Diallo',
            prenom: 'Admin',
            telephone: '0101010101',
            password: hashedPassword,
            role: UserRole.ADMIN,
            statut: SubscriptionStatus.ACTIF,
          },
        });

        // 3. Créer un Usager de Compagnie A (qui a un token expo)
        await prisma.user.create({
          data: {
            companyId: companyAId,
            nom: 'Soro',
            prenom: 'Usager',
            telephone: '0202020202',
            password: hashedPassword,
            role: UserRole.USAGER,
            statut: SubscriptionStatus.ACTIF,
            expoToken: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]', // Token valide format Expo
          },
        });

        // 4. Se connecter
        const loginAdmin = await request(app).post('/api/auth/login').send({ telephone: '0101010101', password: 'password123' });
        adminAToken = loginAdmin.body.accessToken;

        const loginUsager = await request(app).post('/api/auth/login').send({ telephone: '0202020202', password: 'password123' });
        usagerAToken = loginUsager.body.accessToken;

        done();
      } catch (err) {
        done(err);
      }
    });
  });

  afterAll((done) => {
    if (clientUsagerA?.connected) clientUsagerA.disconnect();
    redis.disconnect();
    cleanDatabase().then(() => {
      prisma.$disconnect().then(() => {
        server.close(done);
      });
    });
  });

  describe('POST /api/users/import (Import Excel)', () => {
    it('doit importer les abonnés valides avec succès et renvoyer un rapport détaillé', async () => {
      const buffer = generateExcelBuffer();

      const res = await request(app)
        .post('/api/users/import')
        .set('Authorization', `Bearer ${adminAToken}`)
        .attach('file', buffer, 'abonnes.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(2); // 2 importations réussies
      expect(res.body.failures).toBe(1); // 1 ligne rejetée (téléphone manquant)
      expect(res.body.duplicates).toBe(0);

      // Vérifier les usagers en base
      const user1 = await prisma.user.findUnique({ where: { telephone: '0700000010' } });
      expect(user1).not.toBeNull();
      expect(user1?.nom).toBe('Diomandé');
      expect(user1?.companyId).toBe(companyAId);

      // Vérifier que sa souscription a été créée
      const sub1 = await prisma.subscription.findFirst({ where: { userId: user1?.id } });
      expect(sub1).not.toBeNull();
      expect(sub1?.statut).toBe(SubscriptionStatus.ACTIF);
    });

    it('doit rejeter l\'import s\'il n\'y a pas de fichier', async () => {
      const res = await request(app)
        .post('/api/users/import')
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/notifications/send & GET /api/notifications', () => {
    it('doit permettre à l\'usager de se connecter via WebSocket', (done) => {
      clientUsagerA = Client(`http://localhost:${port}`, {
        auth: { token: usagerAToken },
      });

      clientUsagerA.on('connect', () => {
        done();
      });
    });

    it('doit envoyer une notification, l\'enregistrer en base, et la diffuser via Socket.IO', (done) => {
      // 1. Configurer l'écouteur Socket.IO pour l'usager
      clientUsagerA.on('notification:push', (data: any) => {
        expect(data.title).toBe('Alerte Retard');
        expect(data.message).toContain('Embouteillage');
        expect(data.type).toBe('RETARD');
        expect(data.severity).toBe('HIGH');
        done();
      });

      // 2. Déclencher l'appel API
      request(app)
        .post('/api/notifications/send')
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({
          title: 'Alerte Retard',
          message: 'Embouteillage sur le boulevard Mitterrand, retard estimé à 20 min.',
          type: 'RETARD',
          severity: 'HIGH',
          audience: 'TOUS',
        })
        .then((res) => {
          expect(res.status).toBe(201);
          expect(res.body.success).toBe(true);
          expect(res.body.sentCount).toBe(1); // Usager A a un token push
        })
        .catch((err) => done(err));
    });

    it('doit lister l\'historique des notifications créées', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${usagerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].title).toBe('Alerte Retard');
      expect(res.body[0].admin.nom).toBe('Diallo');
    });
  });
});
