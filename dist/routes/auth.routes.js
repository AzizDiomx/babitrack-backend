"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const rateLimiter_middleware_1 = require("../middlewares/rateLimiter.middleware");
const router = (0, express_1.Router)();
router.post('/login', rateLimiter_middleware_1.authLimiter, auth_controller_1.login);
router.post('/register/company/:companyId', rateLimiter_middleware_1.authLimiter, auth_controller_1.register);
router.post('/refresh', auth_controller_1.refresh);
// Routes Mot de passe oublié & OTP (SMS / WhatsApp) protégées par rate-limiting
router.post('/forgot-password', rateLimiter_middleware_1.otpLimiter, auth_controller_1.forgotPassword);
router.post('/verify-otp', rateLimiter_middleware_1.otpLimiter, auth_controller_1.verifyOtp);
router.post('/reset-password', rateLimiter_middleware_1.otpLimiter, auth_controller_1.resetPassword);
exports.default = router;
