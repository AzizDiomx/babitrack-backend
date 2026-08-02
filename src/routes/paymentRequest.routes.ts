import { Router } from 'express';
import { 
  submitPaymentProof, 
  getPaymentRequests, 
  approvePaymentRequest, 
  rejectPaymentRequest 
} from '../controllers/paymentRequest.controller';
import { authMiddleware, requireRoles } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

// Soumettre un justificatif de paiement (Compagnie)
router.post('/pay', authMiddleware, submitPaymentProof);

// Obtenir la liste des demandes de paiement (Super Admin & Compagnie)
router.get('/', authMiddleware, getPaymentRequests);

// Approuver/Rejeter un paiement (Super Admin ONLY)
router.patch('/:id/approve', authMiddleware, requireRoles([UserRole.SUPER_ADMIN]), approvePaymentRequest);
router.patch('/:id/reject', authMiddleware, requireRoles([UserRole.SUPER_ADMIN]), rejectPaymentRequest);

export default router;
