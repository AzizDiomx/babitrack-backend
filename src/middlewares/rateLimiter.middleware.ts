import rateLimit from 'express-rate-limit';

/**
 * Limiteur de requêtes pour les tentatives de connexion et d'enregistrement (Anti-Brute-Force)
 * 10 tentatives max par IP sur une fenêtre de 15 minutes.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Trop de tentatives de connexion ou d\'accès. Pour votre sécurité, veuillez patienter 15 minutes avant de réessayer.',
  },
});

/**
 * Limiteur pour les demandes et validations d'OTP / Réinitialisation de mot de passe
 * 6 requêtes max par IP sur une fenêtre de 10 minutes.
 */
export const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Trop de demandes de code de sécurité. Veuillez patienter 10 minutes.',
  },
});

/**
 * Limiteur global pour l'ensemble des routes de l'API (Anti-DDoS / Scraping)
 * 300 requêtes par minute par IP.
 */
export const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Limite de requêtes API atteinte. Veuillez espacer vos requêtes.',
  },
});
