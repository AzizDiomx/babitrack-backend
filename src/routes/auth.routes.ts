import { Router } from 'express';
import { login, register, refresh, forgotPassword, verifyOtp, resetPassword } from '../controllers/auth.controller';
import { authLimiter, otpLimiter } from '../middlewares/rateLimiter.middleware';

const router = Router();

router.post('/login', authLimiter, login);
router.post('/register/company/:companyId', authLimiter, register);
router.post('/refresh', refresh);

// Routes Mot de passe oublié & OTP (SMS / WhatsApp) protégées par rate-limiting
router.post('/forgot-password', otpLimiter, forgotPassword);
router.post('/verify-otp', otpLimiter, verifyOtp);
router.post('/reset-password', otpLimiter, resetPassword);

export default router;
