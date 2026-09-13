/**
 * Service d'envoi de SMS & WhatsApp pour BabiTrack
 * - Supporte Twilio pour SMS et WhatsApp Sandbox
 * - Formatage automatique des numéros ivoiriens (ex: 0701020304 -> +2250701020304)
 * - Fallback transparent vers un Mock Console en dev si les identifiants Twilio ne sont pas configurés
 */

export interface SendOtpResult {
  success: boolean;
  channel: 'sms' | 'whatsapp';
  formattedPhone: string;
  simulated: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Normalise un numéro de téléphone pour l'envoi international (+225 pour la Côte d'Ivoire par défaut)
 */
export const formatInternationalPhone = (phone: string): string => {
  const clean = phone.replace(/[\s\-\(\)]/g, '').trim();

  // Si commence déjà par +
  if (clean.startsWith('+')) {
    return clean;
  }

  // Si commence par 00
  if (clean.startsWith('00')) {
    return `+${clean.substring(2)}`;
  }

  // Si commence par 225
  if (clean.startsWith('225')) {
    return `+${clean}`;
  }

  // Format local ivoirien standard (10 chiffres commençant par 01, 05 ou 07)
  if (clean.length === 10 && clean.startsWith('0')) {
    return `+225${clean}`;
  }

  // Format local sans le 0 (9 chiffres)
  if (clean.length === 9) {
    return `+2250${clean}`;
  }

  // Repli générique avec +225
  return `+225${clean}`;
};

/**
 * Envoie un code OTP à l'usager par SMS ou WhatsApp via Twilio (ou mode Simulation si non configuré)
 */
export const sendOtpMessage = async (
  rawPhone: string,
  otp: string,
  channel: 'sms' | 'whatsapp' = 'sms'
): Promise<SendOtpResult> => {
  const formattedPhone = formatInternationalPhone(rawPhone);
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  const fromWhatsApp = process.env.TWILIO_WHATSAPP_FROM || '+14155238886'; // Twilio Sandbox par défaut

  const smsBody = `BabiTrack : Votre code de vérification est ${otp}. Valable 10 minutes. Ne le partagez avec personne.`;
  const whatsappBody = `*BabiTrack Sécurité*\n\nVotre code de vérification est : *${otp}*\n\nCe code est valable pendant 10 minutes. Ne le transmettez à personne.`;

  // Vérifier si Twilio est configuré dans l'environnement
  const hasTwilioCredentials = !!(accountSid && authToken && (channel === 'whatsapp' || fromNumber));

  if (!hasTwilioCredentials) {
    // Mode Simulation / Dev (Console Logger)
    console.log('\n=============================================================');
    console.log(`📱 [SMS / WHATSAPP MOCK - BABITRACK]`);
    console.log(`Canal           : ${channel.toUpperCase()}`);
    console.log(`Destinataire    : ${formattedPhone} (saisi: ${rawPhone})`);
    console.log(`Code OTP        : >>> ${otp} <<<`);
    console.log(`Validité        : 10 minutes`);
    console.log('=============================================================\n');

    return {
      success: true,
      channel,
      formattedPhone,
      simulated: true,
      messageId: `mock-${Date.now()}`,
    };
  }

  try {
    // Chargement dynamique du client Twilio
    const twilio = require('twilio');
    const client = twilio(accountSid, authToken);

    let message;
    if (channel === 'whatsapp') {
      message = await client.messages.create({
        from: `whatsapp:${fromWhatsApp}`,
        to: `whatsapp:${formattedPhone}`,
        body: whatsappBody,
      });
      console.log(`[Twilio WhatsApp] Message envoyé avec succès à ${formattedPhone} (SID: ${message.sid})`);
    } else {
      message = await client.messages.create({
        from: fromNumber,
        to: formattedPhone,
        body: smsBody,
      });
      console.log(`[Twilio SMS] SMS envoyé avec succès à ${formattedPhone} (SID: ${message.sid})`);
    }

    return {
      success: true,
      channel,
      formattedPhone,
      simulated: false,
      messageId: message.sid,
    };
  } catch (error: any) {
    console.error(`[Twilio Error] Échec de l'envoi (${channel}) à ${formattedPhone}:`, error.message || error);
    
    // En cas d'erreur de Twilio (ex: numéro sandbox non lié ou solde insuffisant),
    // logger le code en console pour ne jamais bloquer l'administrateur ou les tests
    console.log('\n⚠️ [TWILIO FALLBACK VERS CONSOLE]');
    console.log(`Code OTP pour ${formattedPhone} : ${otp}`);
    console.log('─────────────────────────────────────────────────────────────\n');

    return {
      success: true,
      channel,
      formattedPhone,
      simulated: true,
      messageId: `fallback-error-${Date.now()}`,
      error: error.message,
    };
  }
};
