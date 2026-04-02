const { z } = require('zod');

/**
 * Validate request body/params/query against Zod schemas
 * Usage: router.post('/items', validate({ body: mySchema }), handler)
 */
function validate(schemas) {
  return (req, res, next) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation echouee',
          details: err.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }
      next(err);
    }
  };
}

// --- Common schemas ---

const uuidParam = z.object({
  id: z.string().uuid('ID invalide')
});

const siteIdParam = z.object({
  siteId: z.string().uuid('Site ID invalide')
});

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50)
}).partial();

const siteSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url(),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(['active', 'inactive', 'maintenance', 'archived']).default('active'),
  category: z.string().max(100).default('website'),
  favicon_url: z.string().url().nullable().optional(),
  screenshot_url: z.string().url().nullable().optional(),
  tech_stack: z.array(z.string()).optional(),
  hosting_provider: z.string().max(200).nullable().optional(),
  domain_registrar: z.string().max(200).nullable().optional(),
  ssl_expiry: z.string().datetime().nullable().optional(),
  domain_expiry: z.string().datetime().nullable().optional()
}).strict();

const siteUpdateSchema = siteSchema.partial();

const taskSchema = z.object({
  site_id: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(['todo', 'in_progress', 'done', 'cancelled']).default('todo'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  due_date: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional()
}).strict();

const taskUpdateSchema = taskSchema.partial().omit({ site_id: true });

const noteSchema = z.object({
  site_id: z.string().uuid(),
  content: z.string().min(1).max(10000),
  type: z.enum(['note', 'incident', 'update', 'billing']).default('note')
}).strict();

const contactSchema = z.object({
  site_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  role: z.string().max(100).default('owner'),
  notes: z.string().max(5000).nullable().optional()
}).strict();

const credentialSchema = z.object({
  site_id: z.string().uuid(),
  service: z.string().min(1).max(200),
  username: z.string().max(500).nullable().optional(),
  password_encrypted: z.string().max(2000).nullable().optional(),
  url: z.string().max(1000).nullable().optional(),
  notes: z.string().max(5000).nullable().optional()
}).strict();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  remember: z.boolean().optional().default(false)
});

const userSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).max(200),
  role: z.enum(['admin', 'editor', 'viewer']).default('editor')
});

const userUpdateSchema = z.object({
  email: z.string().email().optional(),
  username: z.string().min(3).max(50).optional(),
  password: z.string().min(8).max(200).optional(),
  role: z.enum(['admin', 'editor', 'viewer']).optional(),
  is_active: z.boolean().optional()
});

module.exports = {
  validate,
  schemas: {
    uuidParam, siteIdParam, paginationQuery,
    siteSchema, siteUpdateSchema,
    taskSchema, taskUpdateSchema,
    noteSchema, contactSchema, credentialSchema,
    loginSchema, userSchema, userUpdateSchema
  }
};
