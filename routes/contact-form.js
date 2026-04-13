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

    // Build email HTML — matches admin devis notification template from send-mail.php
    const pink = '#e4177f';
    const dark = '#4A1A6B';
    const grey = '#3E3E3E';
    const bgBody = '#eaeaea';
    const bgCard = '#f8f4f0';
    const logoFooter = 'https://shootnbox.fr/manager/mail/logo_footer_2x.png';

    // Initials for avatar
    const initials = safe(nom).split(/\s+/).map(w => w[0]).join('').substring(0, 2).toUpperCase();

    const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<style type="text/css">
a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}
html,body{margin:0 auto!important;padding:0!important;}
table,td{mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;}
table{border-spacing:0;border-collapse:collapse;}
a{text-decoration:none;}
.wrapper{width:100%;table-layout:fixed;background-color:${bgBody};padding-bottom:60px;}
.main{width:100%;max-width:600px;background-color:#ffffff;margin:0 auto;border-spacing:0;font-family:Arial,sans-serif;}
@media screen and (max-width:480px){.column{display:block!important;width:100%!important;}}
</style></head>
<body style="margin:0;padding:0;background:${bgBody};font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;">Nouvelle demande de contact &mdash; ${safe(nom)}${societe && societe !== '—' ? ' (' + safe(societe) + ')' : ''} &mdash; ${typeLabel}</div>
<table class="wrapper" border="0" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;background-color:${bgBody};">
<tr><td align="center" style="padding:20px 0 60px;">
<table class="main" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:600px;background-color:#ffffff;margin:0 auto;border-spacing:0;font-family:Arial,sans-serif;border-radius:8px;overflow:hidden;">

<!-- HEADER: dark gradient -->
<tr><td align="center" style="background:linear-gradient(135deg,${dark} 0%,#2d1045 100%);padding:30px 20px 24px;">
<p style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.4);margin:0 0 8px;">Notification interne</p>
<p style="font-family:Arial,sans-serif;font-size:22px;font-weight:900;color:#ffffff;margin:0 0 6px;">Nouvelle demande</p>
<p style="font-family:Arial,sans-serif;font-size:15px;font-weight:400;color:rgba(255,255,255,0.7);margin:0;">Demande de contact</p>
</td></tr>

<!-- PROSPECT CARD -->
<tr><td style="padding:24px 25px 0;">
<table width="100%" border="0" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #f0edf5;border-radius:14px;overflow:hidden;">
<tr><td style="padding:20px;">
<table width="100%" border="0" cellpadding="0" cellspacing="0">
<tr>
<!-- Avatar initials -->
<td width="52" valign="top" style="padding-right:14px;">
<div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,${pink},#ff6eb4);text-align:center;line-height:48px;font-family:Arial,sans-serif;font-size:18px;font-weight:900;color:#ffffff;">${initials}</div>
</td>
<td valign="top">
<p style="font-family:Arial,sans-serif;font-size:17px;font-weight:900;color:#1a1a2e;margin:0 0 2px;">${safe(nom)}</p>
${societe && societe !== '—' ? `<p style="font-family:Arial,sans-serif;font-size:13px;color:#888;margin:0 0 2px;">&#127970; ${safe(societe)}</p>` : ''}
<p style="font-family:Arial,sans-serif;font-size:12px;color:${pink};font-weight:700;margin:0;">${typeLabel}</p>
</td>
</tr>
</table>
</td></tr>
<!-- Separator -->
<tr><td style="padding:0 20px;"><div style="height:1px;background:#f0edf5;"></div></td></tr>
<!-- Contact details -->
<tr><td style="padding:14px 20px;">
<table width="100%" border="0" cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif;">
<tr>
<td style="padding:6px 0;font-size:13px;color:#888;width:90px;vertical-align:top;">Email</td>
<td style="padding:6px 0;font-size:14px;font-weight:700;"><a href="mailto:${safe(email)}" style="color:${pink};text-decoration:none;">${safe(email)}</a></td>
</tr>
${telephone && telephone !== '—' ? `<tr>
<td style="padding:6px 0;font-size:13px;color:#888;vertical-align:top;">T&eacute;l&eacute;phone</td>
<td style="padding:6px 0;font-size:14px;font-weight:700;color:#1a1a2e;"><a href="tel:${safe(telephone).replace(/\s/g,'')}" style="color:#1a1a2e;text-decoration:none;">${safe(telephone)}</a></td>
</tr>` : ''}
</table>
</td></tr>
</table>
</td></tr>

<!-- RESERVATION DETAILS -->
<tr><td style="padding:16px 25px 0;">
<table width="100%" border="0" cellpadding="0" cellspacing="0" style="background:${bgCard};border-radius:12px;overflow:hidden;">
<tr>
<td style="padding:16px;text-align:center;${dateStr !== '—' ? 'border-right:1px solid #e8e0d8;' : ''}width:33%;">
<span style="font-family:Arial,sans-serif;font-size:10px;color:#999;text-transform:uppercase;letter-spacing:1px;">&#128197; Type</span><br/>
<strong style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a2e;">${typeLabel}</strong>
</td>
${dateStr !== '—' ? `<td style="padding:16px;text-align:center;${ville && ville !== '—' ? 'border-right:1px solid #e8e0d8;' : ''}width:33%;">
<span style="font-family:Arial,sans-serif;font-size:10px;color:#999;text-transform:uppercase;letter-spacing:1px;">&#128197; Date</span><br/>
<strong style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a2e;">${dateStr}</strong>
</td>` : ''}
${ville && ville !== '—' ? `<td style="padding:16px;text-align:center;width:33%;">
<span style="font-family:Arial,sans-serif;font-size:10px;color:#999;text-transform:uppercase;letter-spacing:1px;">&#128205; Ville</span><br/>
<strong style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a2e;">${safe(ville)}</strong>
</td>` : ''}
</tr>
</table>
</td></tr>

<!-- MESSAGE -->
${message && message.trim() ? `<tr><td style="padding:16px 25px 0;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8ee;border-radius:8px;border-left:3px solid #FF7A00;">
<tr><td style="padding:14px 16px;font-family:Arial,sans-serif;">
<p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#FF7A00;margin:0 0 8px;">&#128172; Message du client</p>
<p style="font-size:14px;color:#555;line-height:1.6;margin:0;">&laquo; ${safe(message).replace(/\n/g, '<br>')} &raquo;</p>
</td></tr></table>
</td></tr>` : ''}

<!-- ACTION BUTTONS -->
<tr><td align="center" style="padding:24px 25px 8px;">
<table border="0" cellspacing="0" cellpadding="0" align="center"><tr>
<td align="center" bgcolor="${pink}" style="border-radius:20px;padding:14px 32px;">
<a href="mailto:${safe(email)}" style="color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">&#9993; R&eacute;pondre</a>
</td>
<td width="12"></td>
${telephone && telephone !== '—' ? `<td align="center" bgcolor="#1a1a2e" style="border-radius:20px;padding:14px 32px;">
<a href="tel:${safe(telephone).replace(/\s/g,'')}" style="color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">&#128222; Appeler</a>
</td>` : ''}
</tr></table>
</td></tr>

<!-- FOOTER -->
<tr><td align="center" style="padding:24px 20px;background-color:${dark};">
<img src="${logoFooter}" alt="Shootnbox" width="100" style="display:block;border:0;margin:0 auto 10px;"/>
<p style="font-family:Arial,sans-serif;font-size:12px;color:rgba(255,255,255,0.5);margin:0;">Notification interne &mdash; Formulaire de contact shootnbox.fr</p>
</td></tr>

</table>
</td></tr></table>
</body></html>`;

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
