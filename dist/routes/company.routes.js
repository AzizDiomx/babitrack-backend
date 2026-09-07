"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const company_controller_1 = require("../controllers/company.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
// Route pour l'administrateur de compagnie (Consultation de son propre abonnement)
router.get('/my-subscription', auth_middleware_1.authMiddleware, company_controller_1.getMyCompanySubscription);
// Routes publiques d'inscription progressive (Landing Page)
router.post('/register-request', company_controller_1.createCompanyRequest);
router.patch('/register-request/:id', company_controller_1.updateCompanyRequest);
// Routes pour le Super Admin
router.post('/', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRoles)([client_1.UserRole.SUPER_ADMIN]), company_controller_1.createCompany);
router.get('/', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRoles)([client_1.UserRole.SUPER_ADMIN]), company_controller_1.getCompanies);
router.post('/:companyId/admin', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRoles)([client_1.UserRole.SUPER_ADMIN]), company_controller_1.createCompanyAdmin);
router.patch('/:companyId/subscription', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRoles)([client_1.UserRole.SUPER_ADMIN]), company_controller_1.updateCompanySubscription);
router.patch('/:companyId/approve', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRoles)([client_1.UserRole.SUPER_ADMIN]), company_controller_1.approveCompanyRequest);
exports.default = router;
