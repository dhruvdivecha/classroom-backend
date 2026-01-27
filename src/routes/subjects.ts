import express from 'express';
import { departments, subjects } from '../db/schema';
import { ilike, or, and, eq } from 'drizzle-orm/sql/expressions/conditions';
import { db } from '../db/db';
import { sql } from 'drizzle-orm/sql/sql';
import { desc, getTableColumns } from 'drizzle-orm';

const router = express.Router();

router.get('/',async (_req, res) => {
    try{
        const { search, department, page=1, limit=10 } = _req.query;

        const currentPage =  Math.max(1, Number(page));
        const limitPerPage = Math.max(1, Math.min(100, Number(limit)));
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

export default router;