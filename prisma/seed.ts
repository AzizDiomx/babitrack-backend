import { PrismaClient, UserRole, SubscriptionStatus, RouteType, VehicleStatus, SubscriptionType } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Début du seeding de la base de données...');

  // 1. Création de la Compagnie Système (pour le Super Admin)
  const systemCompany = await prisma.company.upsert({
    where: { subdomain: 'system' },
    update: {
      plan: 'PREMIUM',
      maxVehicles: 999,
      maxUsers: 9999,
      subscriptionExpiresAt: null,
    },
    create: {
      name: 'BabiTrack Hosting',
      subdomain: 'system',
      status: 'ACTIVE',
      plan: 'PREMIUM',
      maxVehicles: 999,
      maxUsers: 9999,
      subscriptionExpiresAt: null,
    },
  });
  console.log(`Compagnie système créée/trouvée: ${systemCompany.name} (${systemCompany.id})`);

  // 1.1. Création de la Compagnie (SaaS Tenant)
  const company = await prisma.company.upsert({
    where: { subdomain: 'sotra' },
    update: {
      plan: 'PREMIUM',
      maxVehicles: 50,
      maxUsers: 1000,
      subscriptionExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 an
    },
    create: {
      name: 'Compagnie SOTRA Scolaire',
      subdomain: 'sotra',
      status: 'ACTIVE',
      plan: 'PREMIUM',
      maxVehicles: 50,
      maxUsers: 1000,
      subscriptionExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 an
    },
  });
  console.log(`Compagnie créée/trouvée: ${company.name} (${company.id})`);

  // 2. Création des utilisateurs par défaut (mot de passe hashé)
  const passwordHash = await bcrypt.hash('BabiTrack@2026', 12);

  // Super Admin
  const superadmin = await prisma.user.upsert({
    where: { telephone: '0000000000' },
    update: {},
    create: {
      companyId: systemCompany.id,
      nom: 'SaaS',
      prenom: 'Owner',
      telephone: '0000000000',
      email: 'superadmin@babitrack.com',
      password: passwordHash,
      role: UserRole.SUPER_ADMIN,
      statut: SubscriptionStatus.ACTIF,
    },
  });
  console.log(`👤 Super Admin créé/trouvé: ${superadmin.prenom} ${superadmin.nom}`);

  // Admin
  const admin = await prisma.user.upsert({
    where: { telephone: '0101010101' },
    update: {},
    create: {
      companyId: company.id,
      nom: 'Diomandé',
      prenom: 'Ismaël',
      telephone: '0101010101',
      email: 'admin@babitrack.com',
      password: passwordHash,
      role: UserRole.ADMIN,
      statut: SubscriptionStatus.ACTIF,
    },
  });
  console.log(`👤 Admin créé/trouvé: ${admin.prenom} ${admin.nom}`);

  // Chauffeur
  const chauffeur = await prisma.user.upsert({
    where: { telephone: '0202020202' },
    update: {},
    create: {
      companyId: company.id,
      nom: 'Bamba',
      prenom: 'Moussa',
      telephone: '0202020202',
      email: 'chauffeur@babitrack.com',
      password: passwordHash,
      role: UserRole.CHAUFFEUR,
      statut: SubscriptionStatus.ACTIF,
    },
  });
  console.log(`👤 Chauffeur créé/trouvé: ${chauffeur.prenom} ${chauffeur.nom}`);

  // Usager actif (Abonnement valide)
  const usager = await prisma.user.upsert({
    where: { telephone: '0303030303' },
    update: {},
    create: {
      companyId: company.id,
      nom: 'Koffi',
      prenom: 'Abel',
      telephone: '0303030303',
      email: 'abel@babitrack.com',
      password: passwordHash,
      role: UserRole.USAGER,
      statut: SubscriptionStatus.ACTIF,
      qrToken: 'user-abel-koffi-qr-token',
    },
  });
  console.log(`👤 Usager ACTIF créé/trouvé: ${usager.prenom} ${usager.nom}`);

  // Usager en attente de validation
  const usagerPending = await prisma.user.upsert({
    where: { telephone: '0404040404' },
    update: {},
    create: {
      companyId: company.id,
      nom: 'Diop',
      prenom: 'Fatou',
      telephone: '0404040404',
      email: 'fatou@babitrack.com',
      password: passwordHash,
      role: UserRole.USAGER,
      statut: SubscriptionStatus.EN_ATTENTE,
      qrToken: 'user-fatou-diop-qr-token',
    },
  });
  console.log(`👤 Usager EN_ATTENTE créé/trouvé: ${usagerPending.prenom} ${usagerPending.nom}`);

  // 3. Création du Véhicule assigné au Chauffeur
  const vehicle = await prisma.vehicle.upsert({
    where: { immatriculation: 'CI-789-EF' },
    update: {
      chauffeurId: chauffeur.id,
    },
    create: {
      companyId: company.id,
      immatriculation: 'CI-789-EF',
      capacite: 45,
      statut: VehicleStatus.HORS_SERVICE,
      chauffeurId: chauffeur.id,
    },
  });
  console.log(`🚌 Véhicule créé/trouvé: ${vehicle.immatriculation}`);

  // 4. Création de la Souscription active pour l'usager actif
  const dateDebut = new Date();
  const dateFin = new Date();
  dateFin.setDate(dateDebut.getDate() + 30); // Valide pour 30 jours

  const subscription = await prisma.subscription.create({
    data: {
      companyId: company.id,
      userId: usager.id,
      type: SubscriptionType.ALLER_RETOUR,
      montant: 15000,
      dateDebut,
      dateFin,
      statut: SubscriptionStatus.ACTIF,
      activatedBy: admin.id,
    },
  });
  console.log(`💳 Abonnement créé pour ${usager.prenom} (ID: ${subscription.id})`);

  // 5. Création des Trajets et Arrêts pré-configurés
  // Supprimer les anciens trajets et arrêts pour éviter les doublons lors des re-runs du seed
  await prisma.stop.deleteMany({ where: { route: { companyId: company.id } } });
  await prisma.route.deleteMany({ where: { companyId: company.id } });

  // Trajet Matin : Bandji -> SUNU
  const routeMatin = await prisma.route.create({
    data: {
      companyId: company.id,
      nom: 'Trajet Matin — Bandji ➔ SUNU',
      type: RouteType.MATIN,
      vehicleId: vehicle.id,
    },
  });

  const stopsMatin = [
    { nom: 'Bandji', latitude: 5.3484, longitude: -4.0152, ordre: 1 },
    { nom: 'Lycée Garçons', latitude: 5.3520, longitude: -4.0110, ordre: 2 },
    { nom: 'Socofrais', latitude: 5.3550, longitude: -4.0080, ordre: 3 },
    { nom: 'Voie de contournement', latitude: 5.3580, longitude: -4.0040, ordre: 4 },
    { nom: 'Carrefour Akandjé', latitude: 5.3610, longitude: -4.0010, ordre: 5 },
    { nom: 'Feh Kesse', latitude: 5.3680, longitude: -3.9920, ordre: 6 },
    { nom: 'Panneau Orange', latitude: 5.3720, longitude: -3.9850, ordre: 7 },
    { nom: 'Jules Verne', latitude: 5.3760, longitude: -3.9780, ordre: 8 },
    { nom: 'Nouveau Goudron', latitude: 5.3810, longitude: -3.9720, ordre: 9 },
    { nom: 'Génie 2000', latitude: 5.3860, longitude: -3.9650, ordre: 10 },
    { nom: 'Notre Dame de l\'Espérance', latitude: 5.3900, longitude: -3.9600, ordre: 11 },
    { nom: 'Faya', latitude: 5.3940, longitude: -3.9550, ordre: 12 },
    { nom: 'Nouveau Camp', latitude: 5.3980, longitude: -3.9500, ordre: 13 },
    { nom: '9 Kilo', latitude: 5.4020, longitude: -3.9450, ordre: 14 },
    { nom: 'Riviera 2', latitude: 5.3430, longitude: -3.9900, ordre: 15 },
    { nom: 'Pont Vallon', latitude: 5.3500, longitude: -3.9800, ordre: 16 },
    { nom: 'Pyramide', latitude: 5.3260, longitude: -4.0200, ordre: 17 },
    { nom: 'Mosquée', latitude: 5.3500, longitude: -4.0100, ordre: 18 },
    { nom: 'SUNU', latitude: 5.3400, longitude: -4.0120, ordre: 19 },
  ];

  await prisma.stop.createMany({
    data: stopsMatin.map((s) => ({ ...s, routeId: routeMatin.id })),
  });
  console.log(`🗺️ Trajet Matin créé avec ${stopsMatin.length} arrêts.`);

  // Trajet Soir : Cathédrale -> Bandji
  const routeSoir = await prisma.route.create({
    data: {
      companyId: company.id,
      nom: 'Trajet Soir — Cathédrale ➔ Bandji',
      type: RouteType.SOIR,
      vehicleId: vehicle.id,
    },
  });

  const stopsSoir = [
    { nom: 'Cathédrale', latitude: 5.3200, longitude: -4.0200, ordre: 1 },
    { nom: 'Fonction Publique', latitude: 5.3250, longitude: -4.0180, ordre: 2 },
    { nom: 'Sorbonne', latitude: 5.3180, longitude: -4.0220, ordre: 3 },
    { nom: 'Burger King', latitude: 5.3420, longitude: -3.9920, ordre: 4 },
    { nom: 'Pyramide', latitude: 5.3260, longitude: -4.0200, ordre: 5 },
    { nom: 'SUNU', latitude: 5.3400, longitude: -4.0120, ordre: 6 },
    { nom: 'Pont Vallon', latitude: 5.3500, longitude: -3.9800, ordre: 7 },
    { nom: 'Riviera 2', latitude: 5.3430, longitude: -3.9900, ordre: 8 },
    { nom: '9 Kilo', latitude: 5.4020, longitude: -3.9450, ordre: 9 },
    { nom: 'Nouveau Camp', latitude: 5.3980, longitude: -3.9500, ordre: 10 },
    { nom: 'Faya', latitude: 5.3940, longitude: -3.9550, ordre: 11 },
    { nom: 'Notre Dame de l\'Espérance', latitude: 5.3900, longitude: -3.9600, ordre: 12 },
    { nom: 'Génie 2000', latitude: 5.3860, longitude: -3.9650, ordre: 13 },
    { nom: 'Nouveau Goudron', latitude: 5.3810, longitude: -3.9720, ordre: 14 },
    { nom: 'Jules Verne', latitude: 5.3760, longitude: -3.9780, ordre: 15 },
    { nom: 'Voie de contournement', latitude: 5.3580, longitude: -4.0040, ordre: 16 },
    { nom: 'Socofrais', latitude: 5.3550, longitude: -4.0080, ordre: 17 },
    { nom: 'Lycée Garçons', latitude: 5.3520, longitude: -4.0110, ordre: 18 },
    { nom: 'Bandji', latitude: 5.3484, longitude: -4.0152, ordre: 19 },
  ];

  await prisma.stop.createMany({
    data: stopsSoir.map((s) => ({ ...s, routeId: routeSoir.id })),
  });
  console.log(`🗺️ Trajet Soir créé avec ${stopsSoir.length} arrêts.`);

  console.log('🌿 Seeding terminé avec succès !');
}

main()
  .catch((e) => {
    console.error('❌ Erreur lors du seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
