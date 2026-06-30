import prisma from '../../prisma';

export const cleanDatabase = async () => {
  // Supprimer toutes les données en cascade
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "Notification", "TripEvent", "VehicleLocation", "Subscription", "Stop", "Route", "Vehicle", "User", "Company" CASCADE;
  `);
};
