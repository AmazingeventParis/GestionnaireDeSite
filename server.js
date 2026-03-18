const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://supabase-api.swipego.app';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3MTI3NDIyMCwiZXhwIjo0OTI2OTQ3ODIwLCJyb2xlIjoiYW5vbiJ9.4c5wruvy-jj3M8fSjhmgR4FvdF6za-mgawlkB_B0uB0';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3MTI3NDIyMCwiZXhwIjo0OTI2OTQ3ODIwLCJyb2xlIjoic2VydmljZV9yb2xlIn0.iqPsHjDWX9X2942nD1lsSin0yNvob06s0qP_FDTShns';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// --- API Routes ---

// Sites CRUD
app.get('/api/sites', async (req, res) => {
  const { data, error } = await supabase
    .from('site_manager_sites')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/sites/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('site_manager_sites')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: error.message });
  res.json(data);
});

app.post('/api/sites', async (req, res) => {
  const { data, error } = await supabase
    .from('site_manager_sites')
    .insert(req.body)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/sites/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('site_manager_sites')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.delete('/api/sites/:id', async (req, res) => {
  const { error } = await supabase
    .from('site_manager_sites')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// Tasks CRUD
app.get('/api/sites/:siteId/tasks', async (req, res) => {
  const { data, error } = await supabase
    .from('site_manager_tasks')
    .select('*')
    .eq('site_id', req.params.siteId)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/tasks', async (req, res) => {
  const { data, error } = await supabase
    .from('site_manager_tasks')
    .insert(req.body)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/tasks/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('site_manager_tasks')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.delete('/api/tasks/:id', async (req, res) => {
  const { error } = await supabase
    .from('site_manager_tasks')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// Notes
app.get('/api/sites/:siteId/notes', async (req, res) => {
  const { data, error } = await supabase
    .from('site_manager_notes')
    .select('*')
    .eq('site_id', req.params.siteId)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/notes', async (req, res) => {
  const { data, error } = await supabase
    .from('site_manager_notes')
    .insert(req.body)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

app.delete('/api/notes/:id', async (req, res) => {
  const { error } = await supabase
    .from('site_manager_notes')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// Contacts
app.get('/api/sites/:siteId/contacts', async (req, res) => {
  const { data, error } = await supabase
    .from('site_manager_contacts')
    .select('*')
    .eq('site_id', req.params.siteId)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/contacts', async (req, res) => {
  const { data, error } = await supabase
    .from('site_manager_contacts')
    .insert(req.body)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

app.delete('/api/contacts/:id', async (req, res) => {
  const { error } = await supabase
    .from('site_manager_contacts')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// Credentials
app.get('/api/sites/:siteId/credentials', async (req, res) => {
  const { data, error } = await supabase
    .from('site_manager_credentials')
    .select('*')
    .eq('site_id', req.params.siteId)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/credentials', async (req, res) => {
  const { data, error } = await supabase
    .from('site_manager_credentials')
    .insert(req.body)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

app.delete('/api/credentials/:id', async (req, res) => {
  const { error } = await supabase
    .from('site_manager_credentials')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// Monitors
app.get('/api/sites/:siteId/monitors', async (req, res) => {
  const { data, error } = await supabase
    .from('site_manager_monitors')
    .select('*')
    .eq('site_id', req.params.siteId);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Stats dashboard
app.get('/api/stats', async (req, res) => {
  const [sites, tasks, monitors] = await Promise.all([
    supabase.from('site_manager_sites').select('id, status'),
    supabase.from('site_manager_tasks').select('id, status'),
    supabase.from('site_manager_monitors').select('id, is_up'),
  ]);
  res.json({
    total_sites: (sites.data || []).length,
    active_sites: (sites.data || []).filter(s => s.status === 'active').length,
    total_tasks: (tasks.data || []).length,
    pending_tasks: (tasks.data || []).filter(t => t.status === 'todo' || t.status === 'in_progress').length,
    monitors_up: (monitors.data || []).filter(m => m.is_up).length,
    monitors_total: (monitors.data || []).length,
  });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Gestionnaire de Site running on port ${PORT}`);
});
