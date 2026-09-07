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
      id: '975b601b-9f27-45e7-81f3-46db6021ca5f',
      companyId: company.id,
      nom: 'Trajet Matin — Bandji ➔ SUNU',
      type: RouteType.MATIN,
      vehicleId: vehicle.id,
    },
  });

  const stopsMatin = [
    { id: '23726395-b2bb-4e24-bff5-08d140061e7d', nom: 'Restaurant petit paris', latitude: 5.354745, longitude: -3.879923, ordre: 1 },
    { id: '195fc800-00c2-43ba-bf17-881b6fcd8364', nom: 'Carrefour Bandji', latitude: 5.357201, longitude: -3.884375, ordre: 2 },
    { id: '3040a953-a275-4ae0-8bfb-d36f1c48ef1d', nom: 'Foyer de jeunes', latitude: 5.357543, longitude: -3.888447, ordre: 3 },
    { id: '772c78e4-9348-42b6-80d1-f0746637d6e2', nom: 'Carrefour CIE', latitude: 5.360104, longitude: -3.898163, ordre: 4 },
    { id: '87c4a92b-923d-4f5b-9d1b-9708cffdc812', nom: 'Ancien Barrage', latitude: 5.360402, longitude: -3.90276, ordre: 5 },
    { id: '7c309c2a-8fa0-41d6-938c-18c706faf4e4', nom: 'Syndicat', latitude: 5.366413, longitude: -3.90909, ordre: 6 },
    { id: '2f85565b-931c-488f-81ab-267657bb7254', nom: 'Restaurant Lune', latitude: 5.373425, longitude: -3.911451, ordre: 7 },
    { id: '9f60cb65-7648-4e5e-8fdd-85de0f6f758a', nom: 'Rond point FEH KESSE', latitude: 5.374074, longitude: -3.91197, ordre: 8 },
    { id: 'be4cc924-a86c-4dae-82cd-a0c9df72b43a', nom: 'Panneau Orange', latitude: 5.374326, longitude: -3.921498, ordre: 9 },
    { id: 'caf16108-5e5f-4149-9870-a2f26f59b988', nom: 'Jules Verne', latitude: 5.374197, longitude: -3.923478, ordre: 10 },
    { id: '488e8794-3dcb-4ca3-bcbf-c4ebf78a6942', nom: 'Nouveau goudron', latitude: 5.372563, longitude: -3.929221, ordre: 11 },
    { id: '203bdfd4-577e-40ca-9ab6-6f2bd2c54437', nom: 'Génie 2000', latitude: 5.371074, longitude: -3.934827, ordre: 12 },
    { id: '867a75e7-2996-4957-9eeb-51e9cb513a9f', nom: 'Faya', latitude: 5.370117, longitude: -3.938559, ordre: 13 },
    { id: 'ce7a3366-92be-4fc1-9ee1-df8592e3f1ca', nom: 'Nouveau Camp', latitude: 5.366071, longitude: -3.948052, ordre: 14 },
    { id: '9630ec23-f951-444f-8c03-660ae4bfe9f4', nom: 'Après Barrage', latitude: 5.361249, longitude: -3.959022, ordre: 15 },
    { id: '9e1bbdc0-ca6e-4fd2-b286-9a8425615f70', nom: 'Commissariat', latitude: 5.35975, longitude: -3.961666, ordre: 16 },
    { id: '0a09df99-da36-4845-aac1-31ea44c35855', nom: 'Carrefour 9 kilos', latitude: 5.357937, longitude: -3.964714, ordre: 17 },
    { id: '28fdb1f1-74aa-4412-bc00-56a7d928575a', nom: 'Riviera 2', latitude: 5.353698, longitude: -3.977128, ordre: 18 },
    { id: 'd6f354f1-480a-4eda-b8d5-a4484b4766d4', nom: 'Virage 1', latitude: 5.352552, longitude: -3.982762, ordre: 19 },
    { id: 'd7635428-f3ba-43d2-9ecf-ffbd3c78c42a', nom: 'Pont vallon', latitude: 5.354509, longitude: -3.991494, ordre: 20 },
    { id: 'da5bea74-0c3a-447f-9175-bfebebc37057', nom: 'Pont piéton 1', latitude: 5.354467, longitude: -4.001782, ordre: 21 },
    { id: 'f363b03b-91f5-4a49-be06-32eb38335ece', nom: 'Virage 2', latitude: 5.354463, longitude: -4.012696, ordre: 22 },
    { id: '1303f114-9d79-4627-9612-c6470a35bd04', nom: 'Liberté', latitude: 5.349207, longitude: -4.01362, ordre: 23 },
    { id: 'f74875fb-29d7-4177-b3a7-21bf2e950d93', nom: 'Point Relais #24', latitude: 5.344756, longitude: -4.01656, ordre: 24 },
    { id: '885d1fa0-cf56-41b3-8601-aef26fe6d6e2', nom: 'Point Relais #25', latitude: 5.341247, longitude: -4.017804, ordre: 25 },
    { id: 'a55861a9-f457-464d-be08-565ffd437b3d', nom: 'Point Relais #26', latitude: 5.334253, longitude: -4.018663, ordre: 26 },
    { id: '93aaf7a6-8a04-46c5-8549-f54bf29398d1', nom: 'Stade FHB', latitude: 5.328925, longitude: -4.017933, ordre: 27 },
    { id: '2a166e5d-b535-4403-acb1-128022205471', nom: 'Pont piéton 2', latitude: 5.324547, longitude: -4.015548, ordre: 28 },
    { id: 'f91ff337-4f80-4f8b-8411-ae37f3d03cda', nom: 'Nostalgie', latitude: 5.323849, longitude: -4.016898, ordre: 29 },
    { id: '52c30873-eb38-452e-9d80-e884b71966be', nom: 'Point Relais #30', latitude: 5.321873, longitude: -4.015967, ordre: 30 },
    { id: '8f4d2811-e8ed-4815-a218-906e2296d628', nom: 'Point Relais #31', latitude: 5.320813, longitude: -4.015703, ordre: 31 },
    { id: '10c5570a-35ec-425e-8c84-3aba484a7b6e', nom: 'Sunu', latitude: 5.319337, longitude: -4.015231, ordre: 32 },
  ];

  await prisma.stop.createMany({
    data: stopsMatin.map((s) => ({ ...s, routeId: routeMatin.id })),
  });
  console.log(`🗺️ Trajet Matin créé avec ${stopsMatin.length} arrêts.`);

  // Trajet Soir : Cathédrale -> Bandji
  const routeSoir = await prisma.route.create({
    data: {
      id: '7da1bd0b-d0e2-433c-8575-d737b38e90e9',
      companyId: company.id,
      nom: 'Trajet Soir — Cathédrale ➔ Bandji',
      type: RouteType.SOIR,
      vehicleId: vehicle.id,
    },
  });

  const stopsSoir = [
    { id: 'd64a0d32-e7cc-402a-9f4b-42c448d26eb0', nom: 'Fonction Publique', latitude: 5.325128, longitude: -4.019494, ordre: 1 },
    { id: 'f9753cb7-a933-4322-8d6f-98c4d2ce302f', nom: 'Sorbonne', latitude: 5.322029, longitude: -4.019558, ordre: 2 },
    { id: 'c0888a3c-36b7-422f-9019-cd24dd99b5d4', nom: 'Burger King', latitude: 5.321944, longitude: -4.016731, ordre: 3 },
    { id: 'ed329a67-cda1-4e3f-8640-0af4d21a5c7b', nom: 'Point Relais #4', latitude: 5.321957, longitude: -4.015966, ordre: 4 },
    { id: 'b983164b-0ab1-465d-bbd8-3fb50154019c', nom: 'Pyramide', latitude: 5.321464, longitude: -4.015837, ordre: 5 },
    { id: 'ddd6076e-070e-47d8-9d97-955c2837bd86', nom: 'Mosquée', latitude: 5.319854, longitude: -4.015392, ordre: 6 },
    { id: 'c9a347fe-af0c-4e0f-b225-ba2aa9528509', nom: 'SUNU', latitude: 5.319295, longitude: -4.015188, ordre: 7 },
    { id: '052b8a2f-5325-460f-89ef-0eda84bec11f', nom: 'Point Relais #8', latitude: 5.317539, longitude: -4.013939, ordre: 8 },
    { id: 'ebf55590-0123-47a1-ae95-033f751adca8', nom: 'Point Relais #9', latitude: 5.316052, longitude: -4.015409, ordre: 9 },
    { id: '728b53f1-f270-4fb8-94eb-61367dc8303d', nom: 'Point Relais #10', latitude: 5.318288, longitude: -4.010849, ordre: 10 },
    { id: '6f8b9d7f-c155-4167-8f96-8b85c8c88863', nom: 'Point Relais #11', latitude: 5.320886, longitude: -4.010678, ordre: 11 },
    { id: '6f42556f-4d58-443f-9293-bac1f73c1047', nom: 'Point Relais #12', latitude: 5.324463, longitude: -4.014883, ordre: 12 },
    { id: 'a24ff258-5132-4005-bfbd-c45ffd7fff27', nom: 'Point Relais #13', latitude: 5.330702, longitude: -4.018477, ordre: 13 },
    { id: 'd14e5f11-cd43-40f1-975c-a0516f9093fc', nom: 'Point Relais #14', latitude: 5.336851, longitude: -4.018126, ordre: 14 },
    { id: 'd50d0c86-20be-4b64-8374-3fe7bc74035a', nom: 'Point Relais #15', latitude: 5.343199, longitude: -4.017482, ordre: 15 },
    { id: '24ed8630-33d7-4463-ad76-c2de4b797556', nom: 'Point Relais #16', latitude: 5.347158, longitude: -4.014028, ordre: 16 },
    { id: 'f5307002-175c-4783-bc34-fd1922174490', nom: 'Point Relais #17', latitude: 5.351654, longitude: -4.013556, ordre: 17 },
    { id: '3387e236-3b60-41fd-9616-d38dff3ab115', nom: 'Point Relais #18', latitude: 5.354329, longitude: -4.011131, ordre: 18 },
    { id: 'ca3ccb8d-4afc-41f2-b588-c5929d3dd1f1', nom: 'Point Relais #19', latitude: 5.354389, longitude: -4.001711, ordre: 19 },
    { id: 'f0c4f04d-4afa-4892-8297-be1f4175e393', nom: 'Point Relais #20', latitude: 5.354475, longitude: -3.991454, ordre: 20 },
    { id: 'b14866a7-1fbb-4157-859e-68e43573da62', nom: 'Point Relais #21', latitude: 5.352603, longitude: -3.982759, ordre: 21 },
    { id: '08191a97-dc33-4fc2-a551-8deb97f7d7f6', nom: 'Point Relais #22', latitude: 5.35303, longitude: -3.978907, ordre: 22 },
    { id: 'a5510df6-9669-41d3-ad20-6023cc43b120', nom: 'Point Relais #23', latitude: 5.353562, longitude: -3.977021, ordre: 23 },
    { id: 'a41986be-b116-4f20-9b37-258d9e893bda', nom: 'Point Relais #24', latitude: 5.356509, longitude: -3.967398, ordre: 24 },
    { id: '93ad43a6-924a-41ee-ad56-23c07ca43cdd', nom: 'Point Relais #25', latitude: 5.35791, longitude: -3.964737, ordre: 25 },
    { id: 'b60468fd-acb0-42cb-b51d-92f386455fc6', nom: 'Point Relais #26', latitude: 5.359601, longitude: -3.961669, ordre: 26 },
    { id: 'e227f022-de65-4978-a4dd-79d9f40677a1', nom: 'Point Relais #27', latitude: 5.361152, longitude: -3.958879, ordre: 27 },
    { id: '36f9d126-6bf8-4f0f-aa6a-8e192233c17f', nom: 'Point Relais #28', latitude: 5.36593, longitude: -3.948086, ordre: 28 },
    { id: 'fe5714b8-f02e-4367-b9a9-2b2e12369aac', nom: 'Point Relais #29', latitude: 5.370075, longitude: -3.938558, ordre: 29 },
    { id: 'd04085f5-679f-4f6f-9a29-7a9b972c2ff4', nom: 'Point Relais #30', latitude: 5.372546, longitude: -3.929246, ordre: 30 },
    { id: '9fa8349c-bdce-4f47-98c7-4ea87ebc55db', nom: 'Point Relais #31', latitude: 5.373386, longitude: -3.926392, ordre: 31 },
    { id: 'a4e88754-7764-48ab-8610-f6e2e1fc4569', nom: 'Point Relais #32', latitude: 5.374575, longitude: -3.918098, ordre: 32 },
    { id: 'f2afda48-e7c2-4055-b472-4d43fa9309f1', nom: 'Point Relais #33', latitude: 5.373676, longitude: -3.911446, ordre: 33 },
    { id: '814e9295-483b-4e38-bc90-13869f43767d', nom: 'Point Relais #34', latitude: 5.362601, longitude: -3.907496, ordre: 34 },
    { id: 'b4c48016-b264-4e12-984a-3db419faf4d2', nom: 'Point Relais #35', latitude: 5.359776, longitude: -3.898613, ordre: 35 },
    { id: '49e5fa37-3484-4d02-b34b-9fa8ef566669', nom: 'Point Relais #36', latitude: 5.361261, longitude: -3.894138, ordre: 36 },
    { id: '4640f3cb-87d8-4109-b8f4-b06147019309', nom: 'Point Relais #37', latitude: 5.357893, longitude: -3.891361, ordre: 37 },
    { id: 'a68098db-7922-4835-833c-cbe01ddc2638', nom: 'Point Relais #38', latitude: 5.356841, longitude: -3.883206, ordre: 38 },
    { id: '6096542f-f60a-4a49-a4e7-095eaa5a3203', nom: 'Point Relais #39', latitude: 5.354817, longitude: -3.880282, ordre: 39 },
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
