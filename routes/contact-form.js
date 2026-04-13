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

    // Build email HTML — same structure as send-mail.php devis template
    const pink = '#e4177f';
    const dark = '#4A1A6B';
    const grey = '#3E3E3E';
    const bgBody = '#eaeaea';
    const bgCard = '#f8f4f0';
    const logoHeader = 'https://shootnbox.fr/reservation/email/xwAsset1@2x.png';
    const logoFooter = 'https://shootnbox.fr/manager/mail/logo_footer_2x.png';

    const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<style type="text/css">
a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}
html,body{margin:0 auto!important;padding:0!important;height:100%!important;width:100%!important;}
table,td{mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;}
table{border-spacing:0;border-collapse:collapse;}
a{text-decoration:none;cursor:pointer;}
.wrapper{width:100%;table-layout:fixed;background-color:${bgBody};padding-bottom:60px;}
.main{width:100%;max-width:600px;background-color:#ffffff;margin:0 auto;border-spacing:0;font-family:sans-serif;}
@media screen and (max-width:480px){.column{display:block!important;width:100%!important;max-width:100%!important;}}
</style></head>
<body style="margin:0;padding:0;background:${bgBody};font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;">Nouvelle demande de contact — ${safe(nom)}</div>
<table class="wrapper" border="0" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;background-color:${bgBody};">
<tr><td align="center" style="padding-bottom:60px;">
<table class="main" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:600px;background-color:#ffffff;margin:0 auto;border-spacing:0;font-family:sans-serif;">

<!-- HEADER BANNER -->
<tr><td align="center" valign="top" style="line-height:0;font-size:0;padding-top:20px;">
<table width="100%" border="0" cellpadding="0" cellspacing="0"><tr>
<td align="center" valign="top">
<img src="${logoHeader}" width="600" height="auto" style="width:100%;max-width:600px;height:auto;display:block;border:0;" alt="Shootnbox"/>
</td></tr></table>
</td></tr>

<!-- TITRE -->
<tr><td align="center" style="padding:25px 20px 15px;">
<p style="font-family:Arial,sans-serif;font-weight:700;font-size:18px;line-height:23px;color:${pink};">
Nouvelle demande de contact
</p>
</td></tr>

<tr><td align="center" style="padding:0 20px 20px;">
<p style="font-family:Arial,sans-serif;font-weight:400;font-size:14px;line-height:23px;color:${grey};">
Un prospect a rempli le formulaire sur <strong>shootnbox.fr/contacts</strong>
</p>
</td></tr>

<!-- RECAP CONTACT -->
<tr><td align="center" style="padding:0 20px;">
<table width="100%" border="0" cellpadding="0" cellspacing="0" style="background:${bgCard};border-radius:10px;">
<tr><td align="center" style="padding:20px 0 13px;">
<p style="font-family:Arial,sans-serif;font-weight:700;font-size:15px;color:${pink};">
D&eacute;tails de la demande
</p>
</td></tr>
<tr><td style="padding:0 25px 25px;">
<table width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif;">

<tr><td style="padding:10px 0;font-size:15px;color:${pink};border-bottom:1px solid #e8e0d8;"><b>Nom / Pr&eacute;nom :</b> <span style="color:${grey};">${safe(nom)}</span></td></tr>

${societe && societe !== '—' ? `<tr><td style="padding:10px 0;font-size:15px;color:${pink};border-bottom:1px solid #e8e0d8;"><b>Soci&eacute;t&eacute; :</b> <span style="color:${grey};">${safe(societe)}</span></td></tr>` : ''}

<tr><td style="padding:10px 0;font-size:15px;color:${pink};border-bottom:1px solid #e8e0d8;"><b>Email :</b> <a href="mailto:${safe(email)}" style="color:${pink};font-weight:bold;">${safe(email)}</a></td></tr>

${telephone && telephone !== '—' ? `<tr><td style="padding:10px 0;font-size:15px;color:${pink};border-bottom:1px solid #e8e0d8;"><b>T&eacute;l&eacute;phone :</b> <span style="color:${grey};">${safe(telephone)}</span></td></tr>` : ''}

<tr><td style="padding:10px 0;font-size:15px;color:${pink};border-bottom:1px solid #e8e0d8;"><b>Type d'&eacute;v&eacute;nement :</b> <span style="color:${grey};">${typeLabel}</span></td></tr>

${dateStr !== '—' ? `<tr><td style="padding:10px 0;font-size:15px;color:${pink};border-bottom:1px solid #e8e0d8;"><b>Date :</b> <span style="color:${grey};">${dateStr}</span></td></tr>` : ''}

${ville && ville !== '—' ? `<tr><td style="padding:10px 0;font-size:15px;color:${pink};border-bottom:1px solid #e8e0d8;"><b>Ville :</b> <span style="color:${grey};">${safe(ville)}</span></td></tr>` : ''}

</table>
</td></tr>

${message && message.trim() ? `<tr><td style="padding:0 20px 20px;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8ee;border-radius:8px;border-left:3px solid #FF7A00;">
<tr><td style="padding:12px 14px;font-family:Arial,sans-serif;font-size:13px;color:#555;line-height:1.5;">
<b style="color:#FF7A00;">Message :</b> ${safe(message).replace(/\n/g, '<br>')}
</td></tr></table>
</td></tr>` : ''}

</table>
</td></tr>

<!-- BOUTON REPONDRE -->
<tr><td align="center" style="padding:25px 20px;">
<table border="0" cellspacing="0" cellpadding="0" align="center"><tr>
<td align="center" bgcolor="${pink}" style="border-radius:20px;padding:14px 36px;">
<a href="mailto:${safe(email)}" style="color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;display:inline-block;">R&eacute;pondre &agrave; ${safe(nom)}</a>
</td></tr></table>
</td></tr>

<!-- AVIS GOOGLE + TRUSTPILOT -->
<tr><td align="center" style="padding:20px 20px 10px;">
<p style="font-family:Arial,sans-serif;font-size:16px;color:${pink};">Nos points forts</p>
</td></tr>
<tr><td align="center" style="padding:10px 20px;">
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:460px;">
<!-- Google -->
<tr><td align="center" style="padding-bottom:12px;">
<a href="https://www.google.com/search?hl=fr-FR&gl=fr&q=Shootnbox+Photobooth+avis&ludocid=1331238237106430303#lrd=0x47e6712e441122c5:0x1279821f9a25615f,1,,,," style="text-decoration:none;">
<table border="0" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:1px solid #e0e0e0;border-radius:12px;">
<tr><td style="padding:12px 20px;" align="center">
<p style="font-family:Arial,sans-serif;font-size:14px;line-height:22px;color:${grey};">
<span style="font-size:18px;font-weight:bold;color:#4285F4;">G</span><span style="font-size:18px;font-weight:bold;color:#EA4335;">o</span><span style="font-size:18px;font-weight:bold;color:#FBBC05;">o</span><span style="font-size:18px;font-weight:bold;color:#4285F4;">g</span><span style="font-size:18px;font-weight:bold;color:#34A853;">l</span><span style="font-size:18px;font-weight:bold;color:#EA4335;">e</span>
&nbsp;&nbsp;<span style="color:#FBBC05;font-size:16px;">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
&nbsp;&nbsp;<span style="font-weight:bold;color:${grey};">4.8/5</span>
<span style="color:#888;font-size:13px;">&nbsp;-&nbsp;1 127 avis</span>
</p></td></tr></table></a>
</td></tr>
<!-- Trustpilot -->
<tr><td align="center">
<a href="https://www.trustpilot.com/review/shootnbox.fr" style="text-decoration:none;">
<table border="0" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:1px solid #e0e0e0;border-radius:12px;">
<tr><td style="padding:12px 20px;" align="center">
<p style="font-family:Arial,sans-serif;font-size:14px;line-height:22px;color:${grey};">
<span style="font-size:16px;font-weight:bold;color:#00B67A;">&#9733; Trustpilot</span>
&nbsp;&nbsp;<span style="color:#00B67A;font-size:16px;">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
&nbsp;&nbsp;<span style="font-weight:bold;color:${grey};">4.7/5</span>
<span style="color:#888;font-size:13px;">&nbsp;-&nbsp;318 avis</span>
</p></td></tr></table></a>
</td></tr>
</table>
</td></tr>

<!-- FOOTER CONTACT BAR -->
<tr><td align="center" style="padding:30px 20px 0;">
<table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;">
<tr><td align="center" style="background-color:${pink};border-radius:10px;padding:12px 20px;">
<a href="mailto:contact@shootnbox.fr" style="font-family:Arial,sans-serif;font-size:12px;color:#ffffff;">contact@shootnbox.fr</a>
<span style="color:rgba(255,255,255,0.4);font-size:12px;">&nbsp;|&nbsp;</span>
<a href="tel:0145016666" style="font-family:Arial,sans-serif;font-size:12px;color:#ffffff;">01 45 01 66 66</a>
<span style="color:rgba(255,255,255,0.4);font-size:12px;">&nbsp;|&nbsp;</span>
<a href="https://shootnbox.fr" style="font-family:Arial,sans-serif;font-size:12px;color:#ffffff;font-weight:bold;">shootnbox.fr</a>
</td></tr></table>
</td></tr>

<!-- FOOTER LOGO -->
<tr><td align="center" style="padding:20px;background-color:${dark};">
<img src="${logoFooter}" alt="Shootnbox" width="120" style="display:block;border:0;margin-bottom:10px;"/>
<p style="font-family:Arial,sans-serif;font-size:13px;color:#ffffff;margin:0;">
<a href="mailto:contact@shootnbox.fr" style="color:#ffffff;text-decoration:none;">contact@shootnbox.fr</a> | 01 45 01 66 66</p>
<p style="font-family:Arial,sans-serif;font-size:11px;color:rgba(255,255,255,0.5);margin:8px 0 0;">
<a href="https://shootnbox.fr" style="color:${pink};text-decoration:none;font-weight:bold;">shootnbox.fr</a></p>
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
