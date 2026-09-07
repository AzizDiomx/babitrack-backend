"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const saasPlan_controller_1 = require("../controllers/saasPlan.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
// Lecture publique / authentifiée des offres
router.get('/', saasPlan_controller_1.getSaasPlans);
// Administration réservée au Super Admin
router.post('/', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRoles)([client_1.UserRole.SUPER_ADMIN]), saasPlan_controller_1.createSaasPlan);
router.put('/:id', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRoles)([client_1.UserRole.SUPER_ADMIN]), saasPlan_controller_1.updateSaasPlan);
router.delete('/:id', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRoles)([client_1.UserRole.SUPER_ADMIN]), saasPlan_controller_1.deleteSaasPlan);
exports.default = router;
