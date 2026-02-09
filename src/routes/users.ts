import express from 'express';
import { user } from '../db/schema/index.js';
import { ilike, or, and, eq } from 'drizzle-orm/sql/expressions/conditions';
import { db } from '../db/db.js';
import { sql } from 'drizzle-orm/sql/sql';
import { desc, getTableColumns } from 'drizzle-orm';

const router = express.Router();

router.get('/', async (_req, res) => {
    try {
        const { search, role, page = '1', limit = '10' } = _req.query;

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

export default router;
