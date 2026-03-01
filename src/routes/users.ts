import express from 'express';
import { user } from '../db/schema/index.js';
import { ilike, or, and, eq } from 'drizzle-orm/sql/expressions/conditions';
import { db } from '../db/db.js';
import { sql } from 'drizzle-orm/sql/sql';
import { desc, getTableColumns } from 'drizzle-orm';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// All user routes require authentication and admin role (teachers can't access)
router.use(authMiddleware);
router.use(requireRole('admin'));

router.get('/', async (req: AuthRequest, res) => {
    try {
        const { search, role, emailVerified, page = '1', limit = '10' } = req.query;

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

        if (search) {
            filterConditions.push(
                or(
                    ilike(user.name, `%${search}%`),
                    ilike(user.email, `%${search}%`)
                )
            );
        }

        if (role) {
            const roleValue = role as string;
            if (roleValue === 'student' || roleValue === 'teacher' || roleValue === 'admin') {
                filterConditions.push(eq(user.role, roleValue));
            }
        }

        if (emailVerified !== undefined) {
            const verified = emailVerified === 'true';
            filterConditions.push(eq(user.emailVerified, verified));
        }

        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(user)
            .where(whereClause);

        const totalItems = countResult[0]?.count || 0;

        const usersList = await db
            .select({
                ...getTableColumns(user)
            })
            .from(user)
            .where(whereClause)
            .limit(limitPerPage)
            .offset(offset)
            .orderBy(desc(user.createdAt));

        res.status(200).json({
            data: usersList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalItems,
                totalPages: Math.ceil(totalItems / limitPerPage)
            }
        });

    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/:id', async (req: AuthRequest, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'Invalid ID' });
    const [row] = await db.select(getTableColumns(user)).from(user).where(eq(user.id, id));
    if (!row) return res.status(404).json({ message: 'User not found' });
    res.json({ data: row });
});

router.post('/', async (req: AuthRequest, res) => {
    try {
        const { name, email, role } = req.body;
        if (!email?.trim()) return res.status(400).json({ message: 'Email is required' });
        const crypto = await import('crypto');
        const newId = crypto.randomUUID();
        const [created] = await db.insert(user).values({
            id: newId,
            name: name ? String(name).trim() : null,
            email: String(email).trim().toLowerCase(),
            role: role === 'admin' || role === 'teacher' || role === 'student' ? role : 'student',
        }).returning();
        res.status(201).json({ data: created });
    } catch (e: unknown) {
        const msg = e && typeof (e as { code?: string }).code === 'string' && (e as { code: string }).code === '23505'
            ? 'User with this email already exists'
            : 'Internal server error';
        res.status(500).json({ message: msg });
    }
});

router.put('/:id', async (req: AuthRequest, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'Invalid ID' });
    const [existing] = await db.select().from(user).where(eq(user.id, id));
    if (!existing) return res.status(404).json({ message: 'User not found' });
    try {
        const { name, email, role, image, imageCldPubId, emailVerified } = req.body;
        const [updated] = await db.update(user).set({
            ...(name !== undefined && { name: name ? String(name).trim() : null }),
            ...(email !== undefined && { email: String(email).trim().toLowerCase() }),
            ...(role !== undefined && (role === 'admin' || role === 'teacher' || role === 'student') && { role }),
            ...(image !== undefined && { image: image ? String(image) : null }),
            ...(imageCldPubId !== undefined && { imageCldPubId: imageCldPubId ? String(imageCldPubId) : null }),
            ...(emailVerified !== undefined && { emailVerified: Boolean(emailVerified) }),
        }).where(eq(user.id, id)).returning();
        res.json({ data: updated });
    } catch (e: unknown) {
        const msg = e && typeof (e as { code?: string }).code === 'string' && (e as { code: string }).code === '23505'
            ? 'User with this email already exists'
            : 'Internal server error';
        res.status(500).json({ message: msg });
    }
});

// PATCH /:id/verify — approve or deny a user's email verification
router.patch('/:id/verify', async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { verified } = req.body;
    if (!id) return res.status(400).json({ message: 'Invalid ID' });
    if (typeof verified !== 'boolean') return res.status(400).json({ message: '"verified" boolean is required' });
    const [existing] = await db.select().from(user).where(eq(user.id, id));
    if (!existing) return res.status(404).json({ message: 'User not found' });
    try {
        const [updated] = await db.update(user).set({ emailVerified: verified }).where(eq(user.id, id)).returning();
        res.json({ data: updated });
    } catch (e) {
        console.error('Verify user error:', e);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.delete('/:id', async (req: AuthRequest, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'Invalid ID' });
    const [existing] = await db.select().from(user).where(eq(user.id, id));
    if (!existing) return res.status(404).json({ message: 'User not found' });
    try {
        await db.delete(user).where(eq(user.id, id));
        res.status(200).json({ data: { id } });
    } catch (e) {
        console.error('User delete:', e);
        res.status(500).json({ message: 'Cannot delete user (may have classes or enrollments)' });
    }
});

export default router;
