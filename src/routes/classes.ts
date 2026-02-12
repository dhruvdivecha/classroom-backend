import express from 'express';
import { db } from '../db/db.js';
import { classes, departments, subjects, user } from '../db/schema/index.js';
import { ilike, or, and, eq } from 'drizzle-orm/sql/expressions/conditions';
import { sql } from 'drizzle-orm/sql/sql';
import { desc, getTableColumns } from 'drizzle-orm';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { name, teacherId, subjectId, capacity, description, status, bannerUrl, bannerCldPubId } = req.body;

        const [createdClass] = await db
            .insert(classes)
            .values({
                name,
                teacherId,
                subjectId,
                capacity,
                description,
                status,
                bannerUrl,
                bannerCldPubId,
                inviteCode: Math.random().toString(36).substring(2, 8),
                schedules: []
            })
            .returning({ id: classes.id });

        if(!createdClass) throw Error;

        res.status(201).json({ data: createdClass });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/', async (_req, res) => {
    try {
        const { search, subject, teacher, page = '1', limit = '10' } = _req.query;

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
                    ilike(classes.name, `%${search}%`),
                    ilike(classes.inviteCode, `%${search}%`)
                )
            );
        }

        if (subject) {
            filterConditions.push(ilike(subjects.name, `%${subject}%`));
        }

        if (teacher) {
            filterConditions.push(ilike(user.name, `%${teacher}%`));
        }

        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(user, eq(classes.teacherId, user.id))
            .where(whereClause);

        const totalItems = countResult[0]?.count || 0;

        const classesList = await db
            .select({
                ...getTableColumns(classes),
                subject: { ...getTableColumns(subjects) },
                teacher: { ...getTableColumns(user) }
            })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(user, eq(classes.teacherId, user.id))
            .where(whereClause)
            .limit(limitPerPage)
            .offset(offset)
            .orderBy(desc(classes.createdAt));

        res.status(200).json({
            data: classesList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalItems,
                totalPages: Math.ceil(totalItems / limitPerPage)
            }
        });

    } catch (error) {
        console.error('Error fetching classes:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/:id', async (req, res) => {
    const classID = Number(req.params.id);

    if(!Number.isFinite(classID)){
        return res.status(400).json({ message: 'Invalid class ID' });
    }

    const [classDetails] = await db
        .select({
            ...getTableColumns(classes),
            subject: { ...getTableColumns(subjects) },
            teacher: { ...getTableColumns(user) },
            department: { ...getTableColumns(departments) }
        })
        .from(classes)
        .leftJoin(subjects, eq(classes.subjectId, subjects.id))
        .leftJoin(user, eq(classes.teacherId, user.id))
        .leftJoin(departments, eq(subjects.departmentId, departments.id))
        .where(eq(classes.id, classID));

    if (!classDetails) {
        return res.status(404).json({ message: 'Class not found' });
    }

    res.status(200).json({ data: classDetails });
})

export default router;