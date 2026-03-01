import express from 'express';
import { db } from '../db/db.js';
import { classes, departments, subjects, user, enrollments } from '../db/schema/index.js';
import { ilike, or, and, eq } from 'drizzle-orm/sql/expressions/conditions';
import { sql } from 'drizzle-orm/sql/sql';
import { desc, getTableColumns } from 'drizzle-orm';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// All class routes require authentication
router.use(authMiddleware);

router.post('/', requireRole('admin', 'teacher'), async (req: AuthRequest, res) => {
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

router.get('/', async (req: AuthRequest, res) => {
    try {
        const { search, subject, teacher, teacherId, page = '1', limit = '10' } = req.query;

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

        if (teacherId) {
            filterConditions.push(eq(classes.teacherId, String(teacherId)));
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

router.get('/:id', async (req: AuthRequest, res) => {
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
});

router.put('/:id', requireRole('admin', 'teacher'), async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid class ID' });
    const [existing] = await db.select().from(classes).where(eq(classes.id, id));
    if (!existing) return res.status(404).json({ message: 'Class not found' });
    try {
        const { name, teacherId, subjectId, capacity, description, status, bannerUrl, bannerCldPubId, schedules } = req.body;
        const [updated] = await db.update(classes).set({
            ...(name !== undefined && { name: String(name).trim() }),
            ...(teacherId !== undefined && { teacherId: String(teacherId) }),
            ...(subjectId !== undefined && { subjectId: Number(subjectId) }),
            ...(capacity !== undefined && { capacity: Number(capacity) }),
            ...(description !== undefined && { description: description ? String(description) : null }),
            ...(status !== undefined && (status === 'active' || status === 'inactive' || status === 'archived') && { status }),
            ...(bannerUrl !== undefined && { bannerUrl: bannerUrl ? String(bannerUrl) : null }),
            ...(bannerCldPubId !== undefined && { bannerCldPubId: bannerCldPubId ? String(bannerCldPubId) : null }),
            ...(Array.isArray(schedules) && { schedules }),
        }).where(eq(classes.id, id)).returning();
        res.json({ data: updated });
    } catch (e) {
        console.error('Class update:', e);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.delete('/:id', requireRole('admin', 'teacher'), async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid class ID' });
    const [existing] = await db.select().from(classes).where(eq(classes.id, id));
    if (!existing) return res.status(404).json({ message: 'Class not found' });
    try {
        await db.delete(classes).where(eq(classes.id, id));
        res.status(200).json({ data: { id } });
    } catch (e) {
        console.error('Class delete:', e);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Enrollments for a class: list, enroll, unenroll
router.get('/:id/enrollments', async (req: AuthRequest, res) => {
    const classId = Number(req.params.id);
    if (!Number.isFinite(classId)) return res.status(400).json({ message: 'Invalid class ID' });
    const [cls] = await db.select().from(classes).where(eq(classes.id, classId));
    if (!cls) return res.status(404).json({ message: 'Class not found' });
    const list = await db
        .select({
            id: enrollments.id,
            studentId: enrollments.studentId,
            classId: enrollments.classId,
            createdAt: enrollments.createdAt,
            student: { id: user.id, name: user.name, email: user.email, role: user.role },
        })
        .from(enrollments)
        .innerJoin(user, eq(enrollments.studentId, user.id))
        .where(eq(enrollments.classId, classId))
        .orderBy(desc(enrollments.createdAt));
    res.json({ data: list });
});

router.post('/:id/enrollments', requireRole('admin', 'teacher'), async (req: AuthRequest, res) => {
    const classId = Number(req.params.id);
    if (!Number.isFinite(classId)) return res.status(400).json({ message: 'Invalid class ID' });
    const { studentId } = req.body;
    if (!studentId) return res.status(400).json({ message: 'studentId is required' });
    const [cls] = await db.select().from(classes).where(eq(classes.id, classId));
    if (!cls) return res.status(404).json({ message: 'Class not found' });
    const [student] = await db.select().from(user).where(eq(user.id, studentId));
    if (!student) return res.status(404).json({ message: 'Student not found' });
    if (student.role !== 'student') return res.status(400).json({ message: 'User must have role student' });
    const [count] = await db.select({ count: sql<number>`count(*)` }).from(enrollments).where(eq(enrollments.classId, classId));
    if ((count?.count ?? 0) >= cls.capacity) return res.status(400).json({ message: 'Class is at capacity' });
    try {
        const [created] = await db.insert(enrollments).values({ classId, studentId }).returning();
        res.status(201).json({ data: created });
    } catch (e: unknown) {
        if (e && typeof (e as { code?: string }).code === 'string' && (e as { code: string }).code === '23505') {
            return res.status(400).json({ message: 'Student already enrolled' });
        }
        console.error('Enroll:', e);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.delete('/:id/enrollments/:studentId', requireRole('admin', 'teacher'), async (req: AuthRequest, res) => {
    const classId = Number(req.params.id);
    const { studentId } = req.params;
    if (!Number.isFinite(classId) || !studentId) return res.status(400).json({ message: 'Invalid params' });
    const result = await db.delete(enrollments).where(and(eq(enrollments.classId, classId), eq(enrollments.studentId, studentId))).returning({ id: enrollments.id });
    if (result.length === 0) return res.status(404).json({ message: 'Enrollment not found' });
    res.status(200).json({ data: result[0] });
});

export default router;