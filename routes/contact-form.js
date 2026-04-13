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

    // Format date (long for body, short JJ/MM/AAAA for subject)
    let dateStr = '—';
    let dateShort = '';
    if (date_evenement) {
      try {
        const d = new Date(date_evenement);
        dateStr = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
        dateShort = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      } catch { dateStr = safe(date_evenement); }
    }

    // Build email HTML — exact copy of send-mail.php admin devis notification layout
    const pink = '#e4177f';
    const logoFooter = 'https://shootnbox.fr/manager/mail/logo_footer_2x.png';

    // Initials for avatar
    const initials = safe(nom).split(/\s+/).map(w => w[0]).join('').substring(0, 2).toUpperCase();

    const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"/><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style type="text/css">
@media only screen and (max-width:600px){.es-wrapper{width:100%!important;}.col-3{display:block!important;width:100%!important;}}
</style></head>
<body style="margin:0;padding:0;background:#f0f0f5;font-family:Arial,Helvetica,sans-serif;">
<div style="background:#f0f0f5;padding:20px 0 40px;">
<table class="es-wrapper" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
<tr><td align="center">
<table width="580" cellspacing="0" cellpadding="0" style="border-collapse:collapse;max-width:580px;width:100%;">

<!-- TOP ALERT BAR (orange) -->
<tr><td style="padding:0 0 16px;">
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#FF7A00;border-radius:14px;">
<tr>
<td style="padding:18px 24px;">
<p style="margin:0;font-size:11px;font-weight:800;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:2px;font-family:Arial,sans-serif;">Nouvelle demande</p>
<p style="margin:6px 0 0;font-size:22px;font-weight:900;color:#fff;font-family:Arial,sans-serif;">Demande de contact</p>
</td>
</tr>
</table>
</td></tr>

<!-- MAIN CARD -->
<tr><td>
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#ffffff;border-radius:16px;overflow:hidden;">

<!-- CLIENT SECTION -->
<tr><td style="padding:28px 28px 0;">
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
<tr>
<td>
<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
<tr>
<td style="width:48px;height:48px;background:${pink};border-radius:50%;text-align:center;vertical-align:middle;">
<span style="font-size:20px;color:#fff;font-weight:900;font-family:Arial,sans-serif;line-height:48px;">${initials}</span>
</td>
<td style="padding-left:14px;">
<p style="margin:0;font-size:18px;font-weight:800;color:#1a1a2e;font-family:Arial,sans-serif;">${safe(nom)}</p>
${societe && societe !== '—' ? `<p style="margin:2px 0 0;font-size:14px;font-weight:700;color:#E51981;font-family:Arial,sans-serif;">&#127970; ${safe(societe)}</p>` : ''}
<p style="margin:3px 0 0;font-size:13px;color:#999;font-family:Arial,sans-serif;">${typeLabel}</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</td></tr>

<!-- Contact pills -->
<tr><td style="padding:14px 28px 0;">
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
<tr>
<td style="width:50%;padding-right:6px;">
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f8f6ff;border-radius:10px;">
<tr><td style="padding:10px 14px;">
<p style="margin:0;font-size:10px;color:#999;text-transform:uppercase;letter-spacing:1px;font-family:Arial,sans-serif;">Email</p>
<p style="margin:3px 0 0;font-size:13px;font-family:Arial,sans-serif;"><a href="mailto:${safe(email)}" style="color:${pink};text-decoration:none;font-weight:600;">${safe(email)}</a></p>
</td></tr>
</table>
</td>
${telephone && telephone !== '—' ? `<td style="width:50%;padding-left:6px;">
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f8f6ff;border-radius:10px;">
<tr><td style="padding:10px 14px;">
<p style="margin:0;font-size:10px;color:#999;text-transform:uppercase;letter-spacing:1px;font-family:Arial,sans-serif;">Telephone</p>
<p style="margin:3px 0 0;font-size:13px;font-weight:700;color:#1a1a2e;font-family:Arial,sans-serif;"><a href="tel:${safe(telephone).replace(/\s/g,'')}" style="color:#1a1a2e;text-decoration:none;">${safe(telephone)}</a></p>
</td></tr>
</table>
</td>` : ''}
</tr>
</table>
</td></tr>

<!-- DIVIDER -->
<tr><td style="padding:20px 28px 0;"><div style="height:1px;background:#e0e0e0;"></div></td></tr>

<!-- RESERVATION DETAILS -->
<tr><td style="padding:20px 28px 0;">
<p style="margin:0 0 14px;font-size:11px;font-weight:800;color:${pink};text-transform:uppercase;letter-spacing:2px;font-family:Arial,sans-serif;">&#128197; Evenement</p>
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
<tr>
<td class="col-3" style="width:33%;padding-right:6px;">
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#fef7f0;border-radius:10px;border:1px solid #fce8d5;">
<tr><td style="padding:14px;text-align:center;">
<p style="margin:0;font-size:22px;">&#128100;</p>
<p style="margin:4px 0 0;font-size:10px;color:#999;text-transform:uppercase;letter-spacing:0.5px;font-family:Arial,sans-serif;">Type</p>
<p style="margin:4px 0 0;font-size:15px;font-weight:800;color:#1a1a2e;font-family:Arial,sans-serif;">${typeLabel}</p>
</td></tr>
</table>
</td>
${dateStr !== '—' ? `<td class="col-3" style="width:33%;padding:0 3px;">
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f0f4ff;border-radius:10px;border:1px solid #d5e0fc;">
<tr><td style="padding:14px;text-align:center;">
<p style="margin:0;font-size:22px;">&#128197;</p>
<p style="margin:4px 0 0;font-size:10px;color:#999;text-transform:uppercase;letter-spacing:0.5px;font-family:Arial,sans-serif;">Date</p>
<p style="margin:4px 0 0;font-size:15px;font-weight:800;color:#1a1a2e;font-family:Arial,sans-serif;">${dateStr}</p>
</td></tr>
</table>
</td>` : ''}
${ville && ville !== '—' ? `<td class="col-3" style="width:33%;padding-left:6px;">
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f5f0ff;border-radius:10px;border:1px solid #e0d5fc;">
<tr><td style="padding:14px;text-align:center;">
<p style="margin:0;font-size:22px;">&#128205;</p>
<p style="margin:4px 0 0;font-size:10px;color:#999;text-transform:uppercase;letter-spacing:0.5px;font-family:Arial,sans-serif;">Ville</p>
<p style="margin:4px 0 0;font-size:15px;font-weight:800;color:#1a1a2e;font-family:Arial,sans-serif;">${safe(ville)}</p>
</td></tr>
</table>
</td>` : ''}
</tr>
</table>
</td></tr>

${message && message.trim() ? `
<!-- MESSAGE CLIENT -->
<tr><td style="padding:18px 28px 0;">
<p style="margin:0 0 10px;font-size:11px;font-weight:800;color:#FF7A00;text-transform:uppercase;letter-spacing:2px;font-family:Arial,sans-serif;">&#128172; Message du client</p>
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#fff8ee;border-radius:12px;border-left:4px solid #FF7A00;">
<tr><td style="padding:16px 18px;font-size:14px;font-family:Arial,sans-serif;color:#555;line-height:1.6;font-style:italic;">
&laquo; ${safe(message).replace(/\n/g, '<br>')} &raquo;
</td></tr>
</table>
</td></tr>` : ''}

<!-- CTA BUTTONS -->
<tr><td style="padding:24px 28px 28px;">
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
<tr>
<td align="center" width="50%" style="padding:0 6px 0 0;">
<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;">
<tr>
<td align="center" bgcolor="#1a1a2e" style="background:#1a1a2e;border-radius:14px;">
<a href="mailto:${safe(email)}" style="display:inline-block;width:100%;background:#1a1a2e;color:#ffffff;text-align:center;padding:18px 10px;text-decoration:none;font-size:15px;font-weight:700;font-family:Arial,sans-serif;border-radius:14px;box-sizing:border-box;">&#9993; R&eacute;pondre</a>
</td>
</tr>
</table>
</td>
${telephone && telephone !== '—' ? `<td align="center" width="50%" style="padding:0 0 0 6px;">
<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;">
<tr>
<td align="center" bgcolor="${pink}" style="background:${pink};border-radius:14px;">
<a href="tel:${safe(telephone).replace(/\s/g,'')}" style="display:inline-block;width:100%;background:${pink};color:#ffffff;text-align:center;padding:18px 10px;text-decoration:none;font-size:15px;font-weight:700;font-family:Arial,sans-serif;border-radius:14px;box-sizing:border-box;">&#128222; Appeler</a>
</td>
</tr>
</table>
</td>` : ''}
</tr>
</table>
</td></tr>

</table>
</td></tr>

<!-- FOOTER -->
<tr><td style="padding:20px 0 0;">
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
<tr><td align="center" style="padding:16px;">
<img src="${logoFooter}" alt="Shootnbox" width="90" style="display:block;border:0;margin:0 auto 8px;opacity:0.4;" />
<p style="font-family:Arial,sans-serif;font-size:11px;color:#999;margin:0;">Notification interne</p>
</td></tr>
</table>
</td></tr>

</table>
</td></tr></table>
</div>
</body></html>`;

    // Send email
    await getTransporter().sendMail({
      from: `"Shootnbox Contact" <${process.env.SMTP_USER}>`,
      replyTo: email,
      to: dest,
      subject: `Demande de contact - ${nom.trim()} - ${typeLabel}${dateShort ? ' - ' + dateShort : ''}`,
      encoding: 'utf-8',
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
