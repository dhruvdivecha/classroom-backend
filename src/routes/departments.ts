import express from 'express';
import { db } from '../db/db.js';
import { departments } from '../db/schema/index.js';
import { ilike, or, and, eq } from 'drizzle-orm/sql/expressions/conditions';
import { sql } from 'drizzle-orm/sql/sql';
import { desc, getTableColumns } from 'drizzle-orm';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// All department routes require authentication
router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res) => {
  try {
    const { search, page = '1', limit = '10' } = req.query;
    const pageValue = Array.isArray(page) ? page[0] : page;
    const limitValue = Array.isArray(limit) ? limit[0] : limit;
    const parsedPage = Math.max(1, parseInt(String(pageValue), 10) || 1);
    const parsedLimit = Math.max(1, Math.min(100, parseInt(String(limitValue), 10) || 10));
    const offset = (parsedPage - 1) * parsedLimit;

    const searchStr = typeof search === 'string' ? search : Array.isArray(search) ? search[0] : '';
    const whereClause = searchStr
      ? or(
          ilike(departments.name, `%${searchStr}%`),
          ilike(departments.code, `%${searchStr}%`)
        )
      : undefined;

    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(departments)
      .where(whereClause);
    const total = countRow?.count ?? 0;

    const data = await db
      .select(getTableColumns(departments))
      .from(departments)
      .where(whereClause)
      .orderBy(desc(departments.createdAt))
      .limit(parsedLimit)
      .offset(offset);

    res.json({
      data,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (e) {
    console.error('Departments list:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/:id', async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid ID' });
  const [row] = await db.select().from(departments).where(eq(departments.id, id));
  if (!row) return res.status(404).json({ message: 'Department not found' });
  res.json({ data: row });
});

router.post('/', requireRole('admin'), async (req: AuthRequest, res) => {
  try {
    const { code, name, description } = req.body;
    if (!code?.trim() || !name?.trim()) {
      return res.status(400).json({ message: 'Code and name are required' });
    }
    const [created] = await db.insert(departments).values({
      code: String(code).trim(),
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
    }).returning();
    res.status(201).json({ data: created });
  } catch (e: unknown) {
    const msg = e && typeof (e as { code?: string }).code === 'string' && (e as { code: string }).code === '23505'
      ? 'Department with this code already exists'
      : 'Internal server error';
    res.status(500).json({ message: msg });
  }
});

router.put('/:id', requireRole('admin'), async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid ID' });
  const [existing] = await db.select().from(departments).where(eq(departments.id, id));
  if (!existing) return res.status(404).json({ message: 'Department not found' });
  try {
    const { code, name, description } = req.body;
    const [updated] = await db
      .update(departments)
      .set({
        ...(code !== undefined && { code: String(code).trim() }),
        ...(name !== undefined && { name: String(name).trim() }),
        ...(description !== undefined && { description: description ? String(description).trim() : null }),
      })
      .where(eq(departments.id, id))
      .returning();
    res.json({ data: updated });
  } catch (e: unknown) {
    const msg = e && typeof (e as { code?: string }).code === 'string' && (e as { code: string }).code === '23505'
      ? 'Department with this code already exists'
      : 'Internal server error';
    res.status(500).json({ message: msg });
  }
});

router.delete('/:id', requireRole('admin'), async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid ID' });
  const [existing] = await db.select().from(departments).where(eq(departments.id, id));
  if (!existing) return res.status(404).json({ message: 'Department not found' });
  try {
    await db.delete(departments).where(eq(departments.id, id));
    res.status(200).json({ data: { id } });
  } catch (e) {
    console.error('Department delete:', e);
    res.status(500).json({ message: 'Cannot delete department (may have subjects)' });
  }
});

export default router;
