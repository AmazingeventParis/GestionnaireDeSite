const router = require('express').Router();
const nodemailer = require('nodemailer');
const { rateLimit } = require('express-rate-limit');

// Rate limit: 5 submissions per 15 minutes per IP
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de demandes, reessayez dans 15 minutes' }
});

// SMTP transporter (lazy init)
let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.office365.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: { ciphers: 'SSLv3' }
    });
  }
  return transporter;
}

// POST / - public contact form submission (no auth required)
router.post('/', contactLimiter, async (req, res) => {
  try {
    const { nom, societe, email, telephone, type_evenement, date_evenement, ville, message, _honey } = req.body;

    // Honeypot anti-spam
    if (_honey) {
      return res.json({ ok: true });
    }

    // Validation
    const errors = [];
    if (!nom || nom.trim().length < 2) errors.push('Nom requis (min 2 caracteres)');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Email invalide');
    if (!type_evenement) errors.push('Type d\'evenement requis');

    if (errors.length) {
      return res.status(400).json({ error: errors.join(', ') });
    }

    // Sanitize
    const safe = (s) => s ? String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;').trim() : '—';

    const typeLabels = { mariage: 'Mariage', anniversaire: 'Anniversaire', corporate: 'Evenement corporate', soiree: 'Soiree privee', autre: 'Autre' };
    const typeLabel = typeLabels[type_evenement] || safe(type_evenement);
    const dest = process.env.CONTACT_EMAIL || 'contact@shootnbox.fr';

    // Format date
    let dateStr = '—';
    if (date_evenement) {
      try { dateStr = new Date(date_evenement).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { dateStr = safe(date_evenement); }
    }

    // Build email HTML
    const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#1e1e2e;color:#e6edf3;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#E51981,#7828C8);padding:24px 32px;">
        <h1 style="margin:0;font-size:22px;color:#fff;">Nouvelle demande de contact</h1>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Via shootnbox.fr/contacts</p>
      </div>
      <div style="padding:24px 32px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:10px 0;color:#a0a0b0;width:140px;vertical-align:top;">Nom / Prenom</td>
            <td style="padding:10px 0;color:#e6edf3;font-weight:600;">${safe(nom)}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#a0a0b0;vertical-align:top;">Societe</td>
            <td style="padding:10px 0;color:#e6edf3;">${safe(societe)}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#a0a0b0;vertical-align:top;">Email</td>
            <td style="padding:10px 0;"><a href="mailto:${safe(email)}" style="color:#E51981;">${safe(email)}</a></td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#a0a0b0;vertical-align:top;">Telephone</td>
            <td style="padding:10px 0;color:#e6edf3;">${safe(telephone)}</td>
          </tr>
          <tr style="border-top:1px solid #30363d;">
            <td style="padding:10px 0;color:#a0a0b0;vertical-align:top;">Evenement</td>
            <td style="padding:10px 0;color:#e6edf3;">${typeLabel}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#a0a0b0;vertical-align:top;">Date</td>
            <td style="padding:10px 0;color:#e6edf3;">${dateStr}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#a0a0b0;vertical-align:top;">Ville</td>
            <td style="padding:10px 0;color:#e6edf3;">${safe(ville)}</td>
          </tr>
          <tr style="border-top:1px solid #30363d;">
            <td style="padding:14px 0;color:#a0a0b0;vertical-align:top;">Message</td>
            <td style="padding:14px 0;color:#e6edf3;line-height:1.5;">${safe(message).replace(/\n/g, '<br>')}</td>
          </tr>
        </table>
      </div>
      <div style="padding:16px 32px;background:#161b22;color:#8b949e;font-size:12px;text-align:center;">
        Envoye depuis le formulaire de contact Shootnbox
      </div>
    </div>`;

    // Send email
    await getTransporter().sendMail({
      from: `"Shootnbox Contact" <${process.env.SMTP_USER}>`,
      replyTo: email,
      to: dest,
      subject: `Contact Shootnbox — ${safe(nom)} — ${typeLabel}`,
      html
    });

    console.log(`[ContactForm] Email sent: ${nom} <${email}> — ${typeLabel}`);
    res.json({ ok: true });

  } catch (err) {
    console.error('[ContactForm] Error:', err.message);
    res.status(500).json({ error: 'Erreur lors de l\'envoi, reessayez ou contactez-nous par telephone.' });
  }
});

module.exports = router;
