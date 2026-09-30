import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { setCache, getCache, delCache } from './redis.service';
import { formatInternationalPhone } from './sms.service';
import { getJwtSecret } from '../utils/jwt';

const OTP_TTL_SECONDS = 600; // 10 minutes
const COOLDOWN_SECONDS = 60; // 60 secondes entre deux demandes
const MAX_ATTEMPTS = 5;      // 5 tentatives maximales de validation
const MAX_REQUESTS = 4;      // 4 demandes max par fenêtre de 10 min

interface StoredOtp {
  code: string;
  attempts: number;
}

export interface GenerateOtpResult {
  success: boolean;
  otp?: string;
  formattedPhone: string;
  expiresIn: number;
  cooldown: number;
  error?: string;
}

export interface VerifyOtpResult {
  valid: boolean;
  resetToken?: string;
  formattedPhone?: string;
  error?: string;
}

/**
 * Génère et enregistre un code OTP sécurisé à 6 chiffres pour un numéro de téléphone donné
 */
export const generateAndStoreOtp = async (telephone: string): Promise<GenerateOtpResult> => {
  const formattedPhone = formatInternationalPhone(telephone);
  const cooldownKey = `otp:cooldown:${formattedPhone}`;
  const quotaKey = `otp:quota:${formattedPhone}`;
  const codeKey = `otp:code:${formattedPhone}`;

  // 1. Vérifier le délai minimal entre deux renvois (Cooldown 60s)
  const isCoolingDown = await getCache<string>(cooldownKey);
  if (isCoolingDown) {
    return {
      success: false,
      formattedPhone,
      expiresIn: OTP_TTL_SECONDS,
      cooldown: COOLDOWN_SECONDS,
      error: 'Veuillez patienter 60 secondes avant de demander un nouveau code.',
    };
  }

  // 2. Vérifier le quota maximal de demandes
  const currentRequests = (await getCache<number>(quotaKey)) || 0;
  if (currentRequests >= MAX_REQUESTS) {
    return {
      success: false,
      formattedPhone,
      expiresIn: OTP_TTL_SECONDS,
      cooldown: COOLDOWN_SECONDS,
      error: 'Nombre maximal de demandes atteint. Veuillez réessayer dans 10 minutes.',
    };
  }

  // 3. Générer un code cryptographique à 6 chiffres
  const otp = crypto.randomInt(100000, 1000000).toString();

  // 4. Enregistrer dans Redis / Memory
  await setCache(codeKey, { code: otp, attempts: 0 } as StoredOtp, OTP_TTL_SECONDS);
  await setCache(cooldownKey, '1', COOLDOWN_SECONDS);
  await setCache(quotaKey, currentRequests + 1, OTP_TTL_SECONDS);

  return {
    success: true,
    otp,
    formattedPhone,
    expiresIn: OTP_TTL_SECONDS,
    cooldown: COOLDOWN_SECONDS,
  };
};

/**
 * Vérifie le code OTP saisi par l'utilisateur
 * Si valide, retourne un resetToken temporaire (15 min) permettant de changer le mot de passe
 */
export const verifyOtpCode = async (telephone: string, code: string): Promise<VerifyOtpResult> => {
  const formattedPhone = formatInternationalPhone(telephone);
  const codeKey = `otp:code:${formattedPhone}`;

  const stored = await getCache<StoredOtp>(codeKey);

  if (!stored) {
    return {
      valid: false,
      error: 'Code OTP expiré ou introuvable. Veuillez renvoyer une nouvelle demande.',
    };
  }

  // Vérifier le nombre de tentatives erronées
  if (stored.attempts >= MAX_ATTEMPTS) {
    await delCache(codeKey);
    return {
      valid: false,
      error: 'Nombre maximal d\'essais dépassé. Veuillez demander un nouveau code.',
    };
  }

  // Vérifier l'égalité du code
  if (stored.code !== code.trim()) {
    const updatedAttempts = stored.attempts + 1;
    await setCache(codeKey, { ...stored, attempts: updatedAttempts }, OTP_TTL_SECONDS);
    const remaining = MAX_ATTEMPTS - updatedAttempts;

    return {
      valid: false,
      error: `Code incorrect. Il vous reste ${remaining} tentative${remaining > 1 ? 's' : ''}.`,
    };
  }

  // Code valide : consumer et supprimer l'OTP
  await delCache(codeKey);
  await delCache(`otp:quota:${formattedPhone}`);

  // Générer un jeton JWT de réinitialisation unique à usage limité
  const resetToken = jwt.sign(
    {
      telephone: formattedPhone,
      purpose: 'PASSWORD_RESET',
    },
    getJwtSecret(),
    { expiresIn: '15m' }
  );

  return {
    valid: true,
    resetToken,
    formattedPhone,
  };
};

/**
 * Valide un resetToken JWT et extrait le numéro de téléphone associé
 */
export const verifyResetToken = (resetToken: string): { valid: boolean; telephone?: string; error?: string } => {
  try {
    const decoded = jwt.verify(resetToken, getJwtSecret()) as any;
    if (decoded.purpose !== 'PASSWORD_RESET' || !decoded.telephone) {
      return { valid: false, error: 'Jeton de réinitialisation invalide.' };
    }
    return { valid: true, telephone: decoded.telephone };
  } catch (err: any) {
    return { valid: false, error: 'Le lien ou jeton de réinitialisation a expiré ou est invalide.' };
  }
};
