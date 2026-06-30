"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.importAbonnes = void 0;
const xlsx_1 = __importDefault(require("xlsx"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma_1 = __importDefault(require("../prisma"));
const client_1 = require("@prisma/client");
const importAbonnes = async (req, res) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId) {
            res.status(401).json({ error: 'Non autorisé.' });
            return;
        }
        if (!req.file) {
            res.status(400).json({ error: 'Aucun fichier uploadé.' });
            return;
        }
        // 1. Lire le fichier Excel depuis le buffer
        const workbook = xlsx_1.default.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = xlsx_1.default.utils.sheet_to_json(sheet);
        if (rows.length === 0) {
            res.status(400).json({ error: 'Le fichier Excel est vide.' });
            return;
        }
        // Récupérer les limites de la compagnie
        const company = await prisma_1.default.company.findUnique({
            where: { id: companyId },
            select: { maxUsers: true },
        });
        if (!company) {
            res.status(404).json({ error: 'Compagnie non trouvée.' });
            return;
        }
        let currentUsersCount = await prisma_1.default.user.count({
            where: { companyId },
        });
        let success = 0;
        let failures = 0;
        let duplicates = 0;
        const details = [];
        // Générer un mot de passe temporaire par défaut crypté
        const tempPasswordHash = await bcrypt_1.default.hash('BabiTrack@2026', 12);
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2; // Index Excel commence à 2 (1-based + entête)
            // Normalisation des colonnes (gérer la casse et les espaces)
            const nom = row['Nom'] || row['nom'];
            const prenom = row['Prénom'] || row['prénom'] || row['Prenom'] || row['prenom'];
            const telephone = String(row['Téléphone'] || row['téléphone'] || row['Telephone'] || row['telephone'] || '').trim();
            const typeAbonnementRaw = String(row['Type abonnement'] || row['type abonnement'] || row['type'] || '').trim();
            const statutRaw = String(row['Statut'] || row['statut'] || '').trim();
            if (!nom || !prenom || !telephone || !typeAbonnementRaw) {
                failures++;
                details.push({
                    row: rowNum,
                    name: `${nom || ''} ${prenom || ''}`.trim() || 'Inconnu',
                    status: 'ERROR',
                    error: 'Champs obligatoires manquants (Nom, Prénom, Téléphone, Type abonnement).',
                });
                continue;
            }
            // Vérifier si l'utilisateur existe déjà
            const existingUser = await prisma_1.default.user.findUnique({
                where: { telephone },
            });
            if (existingUser) {
                duplicates++;
                details.push({
                    row: rowNum,
                    name: `${nom} ${prenom}`,
                    status: 'DUPLICATE',
                    error: `Le numéro de téléphone ${telephone} existe déjà en base de données.`,
                });
                continue;
            }
            // Valider le type d'abonnement
            let typeAbonnement = client_1.SubscriptionType.ALLER_RETOUR;
            if (Object.values(client_1.SubscriptionType).includes(typeAbonnementRaw)) {
                typeAbonnement = typeAbonnementRaw;
            }
            // Valider le statut
            let statut = client_1.SubscriptionStatus.ACTIF;
            if (Object.values(client_1.SubscriptionStatus).includes(statutRaw)) {
                statut = statutRaw;
            }
            // Valider le quota de l'abonnement
            if (currentUsersCount >= company.maxUsers) {
                failures++;
                details.push({
                    row: rowNum,
                    name: `${nom} ${prenom}`,
                    status: 'ERROR',
                    error: `Quota maximal d'utilisateurs (${company.maxUsers}) de votre forfait atteint. Cet abonné n'a pas pu être importé.`,
                });
                continue;
            }
            try {
                // Insérer l'usager et son abonnement
                await prisma_1.default.$transaction(async (tx) => {
                    const user = await tx.user.create({
                        data: {
                            companyId,
                            nom,
                            prenom,
                            telephone,
                            password: tempPasswordHash,
                            role: client_1.UserRole.USAGER,
                            statut,
                        },
                    });
                    await tx.subscription.create({
                        data: {
                            companyId,
                            userId: user.id,
                            type: typeAbonnement,
                            montant: typeAbonnement === client_1.SubscriptionType.ALLER_RETOUR ? 15000 : 8000, // montant simulé
                            dateDebut: new Date(),
                            dateFin: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 jours
                            statut,
                        },
                    });
                });
                success++;
                currentUsersCount++;
                details.push({
                    row: rowNum,
                    name: `${nom} ${prenom}`,
                    status: 'SUCCESS',
                });
            }
            catch (err) {
                failures++;
                details.push({
                    row: rowNum,
                    name: `${nom} ${prenom}`,
                    status: 'ERROR',
                    error: err.message || 'Erreur lors de la création en base.',
                });
            }
        }
        res.json({
            success,
            failures,
            duplicates,
            details,
        });
    }
    catch (error) {
        console.error('Erreur lors de l\'import des abonnés:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.importAbonnes = importAbonnes;
