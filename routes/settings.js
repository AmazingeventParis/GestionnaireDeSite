const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { z } = require('zod');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../utils/audit');
const { getClientIp } = require('../middleware/threatDetector');

const { getActiveSite } = require('../middleware/activeSite');
const _DEFAULT_CONFIG_PATH = path.join(__dirname, '..', 'site-config.json');
const BUILD_SCRIPT = path.join(__dirname, '..', 'scripts', 'build.js');

function readConfig(configPath) {
  const p = configPath || getActiveSite().configPath || _DEFAULT_CONFIG_PATH;
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function writeConfig(config, configPath) {
  const p = configPath || getActiveSite().configPath || _DEFAULT_CONFIG_PATH;
  fs.writeFileSync(p, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Deep merge two objects. Source values overwrite target values.
 */
function deepMerge(target, source) {
  const output = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      output[key] = deepMerge(target[key], source[key]);
    } else {
      output[key] = source[key];
    }
  }
  return output;
}

// Zod schema for partial config validation
const topBannerSchema = z.object({
  enabled: z.boolean().optional(),
  text: z.string().optional(),
  bgColor: z.string().optional(),
  link: z.string().optional()
}).optional();

const configSchema = z.object({
  identity: z.object({
    name: z.string().max(200).optional(),
    tagline: z.string().max(500).optional(),
    logo: z.string().max(1000).optional(),
    logoWhite: z.string().max(1000).optional(),
    favicon: z.string().max(1000).optional()
  }).optional(),
  colors: z.object({
    primary: z.string().max(20).optional(),
    secondary: z.string().max(20).optional(),
    tertiary: z.string().max(20).optional(),
    accent1: z.string().max(20).optional(),
    accent2: z.string().max(20).optional(),
    textDark: z.string().max(20).optional(),
    textLight: z.string().max(20).optional(),
    bgMain: z.string().max(20).optional(),
    bgAlt: z.string().max(20).optional()
  }).optional(),
  typography: z.object({
    fontMain: z.string().max(100).optional(),
    fontHeadings: z.string().max(100).optional(),
    sizes: z.any().optional()
  }).optional(),
  sections: z.any().optional(),
  header: z.object({
    logoPosition: z.enum(['left', 'center', 'right']).optional(),
    logoSize: z.string().max(20).optional(),
    sticky: z.boolean().optional(),
    transparentOnHero: z.boolean().optional(),
    scrollEffect: z.enum(['shadow', 'shrink', 'none']).optional(),
    height: z.object({
      desktop: z.string().optional(),
      mobile: z.string().optional()
    }).optional(),
    ctaText: z.string().max(200).optional(),
    ctaLink: z.string().max(500).optional(),
    phone: z.string().max(30).optional(),
    topBanner: topBannerSchema,
    mobileHamburger: z.enum(['left', 'right']).optional(),
    menuItems: z.array(z.any()).optional()
  }).optional(),
  footer: z.object({
    columns: z.array(z.any()).optional(),
    socials: z.object({
      instagram: z.string().optional(),
      facebook: z.string().optional(),
      linkedin: z.string().optional(),
      tiktok: z.string().optional(),
      youtube: z.string().optional()
    }).optional(),
    copyright: z.string().max(500).optional(),
    legalPage: z.string().max(500).optional()
  }).optional(),
  cta: z.object({
    borderRadius: z.string().max(20).optional(),
    style: z.enum(['gradient', 'solid', 'outline', 'ghost']).optional(),
    hoverEffect: z.enum(['shine', 'scale', 'shadow', 'none']).optional(),
    defaultText: z.string().max(200).optional(),
    defaultLink: z.string().max(500).optional()
  }).optional(),
  layout: z.object({
    maxWidth: z.string().max(20).optional(),
    sectionPadding: z.object({
      desktop: z.string().optional(),
      mobile: z.string().optional()
    }).optional(),
    borderRadius: z.string().max(20).optional()
  }).optional(),
  contact: z.object({
    phone: z.string().max(30).optional(),
    email: z.string().max(200).optional(),
    address: z.string().max(500).optional(),
    hours: z.string().max(500).optional(),
    mapsPlaceId: z.string().max(200).optional()
  }).optional(),
  seo: z.object({
    titleTemplate: z.string().max(200).optional(),
    defaultDescription: z.string().max(500).optional(),
    noindex: z.boolean().optional(),
    ogImageDefault: z.string().max(1000).optional(),
    gtmId: z.string().max(50).optional(),
    searchConsoleId: z.string().max(200).optional()
  }).optional(),
  scripts: z.object({
    headCustom: z.string().max(5000).optional(),
    bodyEndCustom: z.string().max(5000).optional(),
    cookieConsent: z.object({
      enabled: z.boolean().optional(),
      text: z.string().max(1000).optional()
    }).optional(),
    chatWidget: z.string().max(5000).optional()
  }).optional(),
  deploy: z.object({
    domain: z.string().max(200).optional(),
    coolifyUuid: z.string().max(100).optional(),
    coolifyToken: z.string().max(200).optional(),
    cacheMaxAge: z.string().max(20).optional(),
    compression: z.boolean().optional(),
    minify: z.boolean().optional()
  }).optional()
}).partial();

// ==================== ROUTES ====================

/**
 * GET / — Read and return the site config
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const config = readConfig(req.activeSite && req.activeSite.configPath);
    res.json(config);
  } catch (err) {
    console.error('[Settings] Read error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la lecture de la configuration' });
  }
});

/**
 * PUT / — Validate and merge partial update into site config
 * Admin only.
 */
router.put('/', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    // Validate with Zod
    const parseResult = configSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Donnees invalides',
        details: parseResult.error.issues.map(i => ({
          path: i.path.join('.'),
          message: i.message
        }))
      });
    }

    const cp = req.activeSite && req.activeSite.configPath;
    const currentConfig = readConfig(cp);
    const updatedConfig = deepMerge(currentConfig, parseResult.data);
    writeConfig(updatedConfig, cp);

    await logAudit({
      userId: req.user.id,
      action: 'settings_update',
      entityType: 'settings',
      entityId: 'site-config',
      details: { updatedSections: Object.keys(parseResult.data) },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: 'Configuration mise a jour', config: updatedConfig });
  } catch (err) {
    console.error('[Settings] Update error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la mise a jour de la configuration' });
  }
});

/**
 * POST /rebuild — Run the build script
 * Admin only.
 */
router.post('/rebuild', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    let buildOutput = '';
    try {
      buildOutput = execSync(`node ${BUILD_SCRIPT}`, {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf-8',
        timeout: 60000
      });
    } catch (buildErr) {
      console.error('[Settings] Build error:', buildErr.message);
      return res.status(500).json({
        error: 'Erreur lors du build',
        details: buildErr.stderr || buildErr.message
      });
    }

    await logAudit({
      userId: req.user.id,
      action: 'site_rebuild',
      entityType: 'settings',
      entityId: 'site-config',
      details: { buildOutput: buildOutput.slice(0, 500) },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: 'Site reconstruit avec succes', buildOutput });
  } catch (err) {
    console.error('[Settings] Rebuild error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la reconstruction' });
  }
});

module.exports = router;
