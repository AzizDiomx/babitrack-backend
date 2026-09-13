import { Router } from 'express';
import { login, register, refresh, forgotPassword, verifyOtp, resetPassword } from '../controllers/auth.controller';

const router = Router();

router.post('/login', login);
router.post('/register/company/:companyId', register);
router.post('/refresh', refresh);

// Routes Mot de passe oublié & OTP (SMS / WhatsApp)
router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);

export default router;
