const router = require('express').Router();
const supabase = require('../lib/supabase');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../utils/audit');
const { getClientIp } = require('../middleware/threatDetector');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { execSync } = require('child_process');

const BACKUPS_DIR = path.join(__dirname, '..', 'backups');
const PREVIEWS_DIR = path.join(__dirname, '..', 'previews');
const CONFIG_PATH = path.join(__dirname, '..', 'site-config.json');
const BUILD_SCRIPT = path.join(__dirname, '..', 'scripts', 'build.js');

// Ensure backups directory exists
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// POST / — create backup
router.post('/', verifyToken, requireRole('admin'), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';
  const { description } = req.body || {};

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.zip`;
    const filePath = path.join(BACKUPS_DIR, filename);

    // Create ZIP archive
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(filePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', resolve);
      archive.on('error', reject);

      archive.pipe(output);

      // Add previews directory if it exists
      if (fs.existsSync(PREVIEWS_DIR)) {
        archive.directory(PREVIEWS_DIR, 'previews');
      }

      // Add site-config.json if it exists
      if (fs.existsSync(CONFIG_PATH)) {
        archive.file(CONFIG_PATH, { name: 'site-config.json' });
      }

      archive.finalize();
    });

    const stats = fs.statSync(filePath);

    // Record in database
    const { data: backup, error } = await supabase
      .from('site_manager_backups')
      .insert({
        user_id: req.user.id,
        type: 'manual',
        file_path: filename,
        file_size_bytes: stats.size,
        description: description || null
      })
      .select()
      .single();

    if (error) {
      // Clean up file on DB error
      fs.unlinkSync(filePath);
      return res.status(500).json({ error: 'Erreur lors de l\'enregistrement du backup', details: error.message });
    }

    await logAudit({
      userId: req.user.id,
      action: 'backup_create',
      entityType: 'backup',
      entityId: backup.id,
      details: { filename, size: stats.size, description },
      ip,
      userAgent
    });

    res.status(201).json(backup);
  } catch (err) {
    console.error('[Backups] Create error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la creation du backup' });
  }
});

// GET / — list backups (paginated)
router.get('/', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const { data: backups, error, count } = await supabase
      .from('site_manager_backups')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la recuperation des backups' });
    }

    res.json({ backups, total: count, page, limit });
  } catch (err) {
    console.error('[Backups] List error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /:id/download — download backup ZIP
router.get('/:id/download', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { data: backup, error } = await supabase
      .from('site_manager_backups')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !backup) {
      return res.status(404).json({ error: 'Backup non trouve' });
    }

    const filePath = path.join(BACKUPS_DIR, backup.file_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Fichier backup introuvable sur le disque' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${backup.file_path}"`);
    res.setHeader('Content-Type', 'application/zip');

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err) {
    console.error('[Backups] Download error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /:id/restore — restore from backup
router.post('/:id/restore', verifyToken, requireRole('admin'), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const { data: backup, error } = await supabase
      .from('site_manager_backups')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !backup) {
      return res.status(404).json({ error: 'Backup non trouve' });
    }

    const filePath = path.join(BACKUPS_DIR, backup.file_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Fichier backup introuvable sur le disque' });
    }

    // Unzip backup — replace previews/ and site-config.json
    const tmpDir = path.join(BACKUPS_DIR, `restore-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      execSync(`unzip -o "${filePath}" -d "${tmpDir}"`, { timeout: 30000 });

      // Restore previews directory
      const restoredPreviews = path.join(tmpDir, 'previews');
      if (fs.existsSync(restoredPreviews)) {
        // Remove existing previews
        if (fs.existsSync(PREVIEWS_DIR)) {
          fs.rmSync(PREVIEWS_DIR, { recursive: true, force: true });
        }
        fs.cpSync(restoredPreviews, PREVIEWS_DIR, { recursive: true });
      }

      // Restore site-config.json
      const restoredConfig = path.join(tmpDir, 'site-config.json');
      if (fs.existsSync(restoredConfig)) {
        fs.copyFileSync(restoredConfig, CONFIG_PATH);
      }

      // Run build script if it exists
      if (fs.existsSync(BUILD_SCRIPT)) {
        try {
          execSync(`node "${BUILD_SCRIPT}"`, { timeout: 60000, cwd: path.join(__dirname, '..') });
        } catch (buildErr) {
          console.error('[Backups] Build warning:', buildErr.message);
        }
      }
    } finally {
      // Clean up temp directory
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    await logAudit({
      userId: req.user.id,
      action: 'backup_restore',
      entityType: 'backup',
      entityId: backup.id,
      details: { filename: backup.file_path },
      ip,
      userAgent
    });

    res.json({ message: 'Backup restaure avec succes' });
  } catch (err) {
    console.error('[Backups] Restore error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la restauration du backup' });
  }
});

// DELETE /:id — delete backup
router.delete('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const { data: backup, error } = await supabase
      .from('site_manager_backups')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !backup) {
      return res.status(404).json({ error: 'Backup non trouve' });
    }

    // Delete file from disk
    const filePath = path.join(BACKUPS_DIR, backup.file_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database
    const { error: delError } = await supabase
      .from('site_manager_backups')
      .delete()
      .eq('id', req.params.id);

    if (delError) {
      return res.status(500).json({ error: 'Erreur lors de la suppression en base' });
    }

    await logAudit({
      userId: req.user.id,
      action: 'backup_delete',
      entityType: 'backup',
      entityId: backup.id,
      details: { filename: backup.file_path },
      ip,
      userAgent
    });

    res.json({ message: 'Backup supprime' });
  } catch (err) {
    console.error('[Backups] Delete error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
