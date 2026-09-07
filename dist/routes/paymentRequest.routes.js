"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const paymentRequest_controller_1 = require("../controllers/paymentRequest.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
// Soumettre un justificatif de paiement (Compagnie)
router.post('/pay', auth_middleware_1.authMiddleware, paymentRequest_controller_1.submitPaymentProof);
// Obtenir la liste des demandes de paiement (Super Admin & Compagnie)
router.get('/', auth_middleware_1.authMiddleware, paymentRequest_controller_1.getPaymentRequests);
// Approuver/Rejeter un paiement (Super Admin ONLY)
router.patch('/:id/approve', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRoles)([client_1.UserRole.SUPER_ADMIN]), paymentRequest_controller_1.approvePaymentRequest);
router.patch('/:id/reject', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRoles)([client_1.UserRole.SUPER_ADMIN]), paymentRequest_controller_1.rejectPaymentRequest);
exports.default = router;
