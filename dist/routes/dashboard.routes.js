"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dashboard_controller_1 = require("../controllers/dashboard.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
router.get('/stats', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRoles)([client_1.UserRole.ADMIN]), dashboard_controller_1.getDashboardStats);
exports.default = router;
