import { Request, Response } from 'express';
import prisma from '../prisma';

export const submitPaymentProof = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    const { plan, billingCycle, amount, paymentMethod, transactionRef, notes } = req.body;

    if (!companyId) {
      res.status(401).json({ error: 'Non autorisé.' });
      return;
    }

    if (!transactionRef || !paymentMethod || !plan) {
      res.status(400).json({ error: 'Référence de transaction, moyen de paiement et forfait requis.' });
      return;
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      res.status(404).json({ error: 'Compagnie non trouvée.' });
      return;
    }

    const paymentRequest = await (prisma as any).paymentRequest.create({
      data: {
        companyId,
        plan: plan.toUpperCase().trim(),
        billingCycle: (billingCycle || 'ANNUEL').toUpperCase().trim(),
        amount: parseFloat(amount) || 0,
        paymentMethod: paymentMethod.toUpperCase().trim(),
        transactionRef: transactionRef.trim(),
        notes: notes || null,
        status: 'PENDING',
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            subdomain: true,
          },
        },
      },
    });

    // Notify Super Admin via Socket.IO if available
    const io = req.app.get('io');
    if (io) {
      io.emit('new_payment_request', paymentRequest);
    }

    res.status(201).json(paymentRequest);
  } catch (error) {
    console.error('Erreur submitPaymentProof:', error);
    res.status(500).json({ error: 'Erreur lors de la soumission de la preuve de paiement' });
  }
};

export const getPaymentRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    const isSuperAdmin = req.user?.role === 'SUPER_ADMIN';
    const companyId = req.user?.companyId;

    const whereCondition: any = {};
    if (!isSuperAdmin) {
      if (!companyId) {
        res.status(401).json({ error: 'Non autorisé.' });
        return;
      }
      whereCondition.companyId = companyId;
    }

    const requests = await (prisma as any).paymentRequest.findMany({
      where: whereCondition,
      include: {
        company: {
          select: {
            id: true,
            name: true,
            subdomain: true,
            plan: true,
            subscriptionExpiresAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(requests);
  } catch (error) {
    console.error('Erreur getPaymentRequests:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des demandes de paiement' });
  }
};

export const approvePaymentRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const paymentRequest = await (prisma as any).paymentRequest.findUnique({
      where: { id },
      include: { company: true },
    });

    if (!paymentRequest) {
      res.status(404).json({ error: 'Demande de paiement introuvable.' });
      return;
    }

    if (paymentRequest.status === 'APPROVED') {
      res.status(400).json({ error: 'Cette demande a déjà été approuvée.' });
      return;
    }

    // Determine extension duration
    const isAnnual = paymentRequest.billingCycle === 'ANNUEL';
    const durationDays = isAnnual ? 365 : 30;
    const now = new Date();

    let currentExpires = paymentRequest.company.subscriptionExpiresAt
      ? new Date(paymentRequest.company.subscriptionExpiresAt)
      : now;

    if (currentExpires < now) {
      currentExpires = now;
    }

    const newExpiresAt = new Date(currentExpires.getTime() + durationDays * 24 * 60 * 60 * 1000);

    // Determine maxVehicles & maxUsers
    let maxVehicles = paymentRequest.company.maxVehicles;
    let maxUsers = paymentRequest.company.maxUsers;

    if (paymentRequest.plan === 'ESSENTIEL') {
      maxVehicles = 10;
      maxUsers = 150;
    } else if (paymentRequest.plan === 'PREMIUM') {
      maxVehicles = 50;
      maxUsers = 1000;
    }

    // Update Company subscription
    await prisma.company.update({
      where: { id: paymentRequest.companyId },
      data: {
        plan: paymentRequest.plan,
        status: 'ACTIVE',
        subscriptionExpiresAt: newExpiresAt,
        maxVehicles,
        maxUsers,
      },
    });

    // Update PaymentRequest status
    const updatedRequest = await (prisma as any).paymentRequest.update({
      where: { id },
      data: { status: 'APPROVED' },
    });

    res.json({
      message: 'Paiement approuvé et licence prolongée avec succès !',
      paymentRequest: updatedRequest,
      newExpiresAt,
    });
  } catch (error) {
    console.error('Erreur approvePaymentRequest:', error);
    res.status(500).json({ error: 'Erreur lors de l\'approbation du paiement' });
  }
};

export const rejectPaymentRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const updated = await (prisma as any).paymentRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        notes: notes || 'Justificatif non conforme ou montant non reçu.',
      },
    });

    res.json({ message: 'Demande de paiement rejetée.', paymentRequest: updated });
  } catch (error) {
    console.error('Erreur rejectPaymentRequest:', error);
    res.status(500).json({ error: 'Erreur lors du rejet du paiement' });
  }
};
