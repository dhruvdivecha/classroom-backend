import express from 'express';
import { departments, subjects } from '../db/schema/index.js';
import { ilike, or, and, eq } from 'drizzle-orm/sql/expressions/conditions';
import { db } from '../db/db.js';
import { sql } from 'drizzle-orm/sql/sql';
import { desc, getTableColumns } from 'drizzle-orm';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// All subject routes require authentication
router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res) => {
    try{
        const { search, department, page = '1', limit = '10' } = req.query;

        const pageValue = Array.isArray(page) ? page[0] : page;
        const limitValue = Array.isArray(limit) ? limit[0] : limit;

        const parsedPage = Number.parseInt(String(pageValue), 10);
        const parsedLimit = Number.parseInt(String(limitValue), 10);

        const safePage = Number.isFinite(parsedPage) ? parsedPage : 1;
        const safeLimit = Number.isFinite(parsedLimit) ? parsedLimit : 10;

        const currentPage = Math.max(1, safePage);
        const limitPerPage = Math.max(1, Math.min(100, safeLimit));
        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions = [];

        if (search){
            filterConditions.push(
                or(
                    ilike(subjects.name, `%${search}%`), 
                    ilike(subjects.code, `%${search}%`)));
        }

        if (department){
            filterConditions.push(
                ilike(departments.name, `%${department}%`)
            );
        }

        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(subjects)
        .leftJoin(departments, eq(subjects.departmentId, departments.id))
        .where(whereClause)
        
        const totalItems = countResult[0]?.count || 0;

        const subjectsList = await db
        .select({
            ...getTableColumns(subjects),
            department: { ...getTableColumns(departments) }
        }).from(subjects).leftJoin(departments, eq(subjects.departmentId, departments.id))
        .where(whereClause)
        .limit(limitPerPage)
        .offset(offset)
        .orderBy(desc(subjects.createdAt));

        res.status(200).json({
            data: subjectsList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalItems,
                totalPages: Math.ceil(totalItems / limitPerPage)
            }
        }); 

    }catch(error){
        console.error('Error fetching subjects:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/:id', async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid ID' });
  const [row] = await db
    .select({
      ...getTableColumns(subjects),
      department: { ...getTableColumns(departments) },
    })
    .from(subjects)
    .leftJoin(departments, eq(subjects.departmentId, departments.id))
    .where(eq(subjects.id, id));
  if (!row) return res.status(404).json({ message: 'Subject not found' });
  res.json({ data: row });
});

router.post('/', requireRole('admin', 'teacher'), async (req: AuthRequest, res) => {
  try {
    const { name, code, description, departmentId } = req.body;
    if (!name?.trim() || !code?.trim() || departmentId == null) {
      return res.status(400).json({ message: 'Name, code and departmentId are required' });
    }
    const [created] = await db
      .insert(subjects)
      .values({
        name: String(name).trim(),
        code: String(code).trim(),
        description: description ? String(description).trim() : null,
        departmentId: Number(departmentId),
      })
      .returning();
    res.status(201).json({ data: created });
  } catch (e: unknown) {
    const msg = e && typeof (e as { code?: string }).code === 'string' && (e as { code: string }).code === '23505'
      ? 'Subject with this code already exists'
      : 'Internal server error';
    res.status(500).json({ message: msg });
  }
});

router.put('/:id', requireRole('admin', 'teacher'), async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid ID' });
  const [existing] = await db.select().from(subjects).where(eq(subjects.id, id));
  if (!existing) return res.status(404).json({ message: 'Subject not found' });
  try {
    const { name, code, description, departmentId } = req.body;
    const [updated] = await db
      .update(subjects)
      .set({
        ...(name !== undefined && { name: String(name).trim() }),
        ...(code !== undefined && { code: String(code).trim() }),
        ...(description !== undefined && { description: description ? String(description).trim() : null }),
        ...(departmentId !== undefined && { departmentId: Number(departmentId) }),
      })
      .where(eq(subjects.id, id))
      .returning();
    res.json({ data: updated });
  } catch (e: unknown) {
    const msg = e && typeof (e as { code?: string }).code === 'string' && (e as { code: string }).code === '23505'
      ? 'Subject with this code already exists'
      : 'Internal server error';
    res.status(500).json({ message: msg });
  }
});

router.delete('/:id', requireRole('admin', 'teacher'), async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid ID' });
  const [existing] = await db.select().from(subjects).where(eq(subjects.id, id));
  if (!existing) return res.status(404).json({ message: 'Subject not found' });
  try {
    await db.delete(subjects).where(eq(subjects.id, id));
    res.status(200).json({ data: { id } });
  } catch (e) {
    console.error('Subject delete:', e);
    res.status(500).json({ message: 'Cannot delete subject (may have classes)' });
  }
});

export default router;