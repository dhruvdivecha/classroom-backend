import express from 'express';
import { db } from '../db/db.js';
import { classes, departments, subjects, user, enrollments, joinRequests } from '../db/schema/index.js';
import { eq, sql, gte, and, desc, inArray } from 'drizzle-orm';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// All dashboard routes require authentication
router.use(authMiddleware);

router.get('/stats', async (req: AuthRequest, res) => {
  try {
    const userRole = req.user!.role;
    const userId = req.user!.id;

    if (userRole === 'admin') {
      // Admin sees all cumulative data
      const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(user);
      const [teacherCount] = await db.select({ count: sql<number>`count(*)` }).from(user).where(eq(user.role, 'teacher'));
      const [studentCount] = await db.select({ count: sql<number>`count(*)` }).from(user).where(eq(user.role, 'student'));
      const [deptCount] = await db.select({ count: sql<number>`count(*)` }).from(departments);
      const [subjectCount] = await db.select({ count: sql<number>`count(*)` }).from(subjects);
      const [classCount] = await db.select({ count: sql<number>`count(*)` }).from(classes);
      const [enrollmentCount] = await db.select({ count: sql<number>`count(*)` }).from(enrollments);

      res.json({
        data: {
          totalUsers: userCount?.count ?? 0,
          totalTeachers: teacherCount?.count ?? 0,
          totalStudents: studentCount?.count ?? 0,
          totalDepartments: deptCount?.count ?? 0,
          totalSubjects: subjectCount?.count ?? 0,
          totalClasses: classCount?.count ?? 0,
          totalEnrollments: enrollmentCount?.count ?? 0,
        },
      });
    } else if (userRole === 'teacher') {
      // Teacher sees their classes only
      const [classCount] = await db.select({ count: sql<number>`count(*)` }).from(classes).where(eq(classes.teacherId, userId));
      const [enrollmentCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(enrollments)
        .innerJoin(classes, eq(enrollments.classId, classes.id))
        .where(eq(classes.teacherId, userId));
      const [pendingRequestsCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(joinRequests)
        .innerJoin(classes, eq(joinRequests.classId, classes.id))
        .where(and(eq(classes.teacherId, userId), eq(joinRequests.status, 'pending')));

      res.json({
        data: {
          myClasses: classCount?.count ?? 0,
          totalStudents: enrollmentCount?.count ?? 0,
          pendingJoinRequests: pendingRequestsCount?.count ?? 0,
        },
      });
    } else if (userRole === 'student') {
      // Student sees their enrolled classes
      const [enrolledClassesCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(enrollments)
        .where(eq(enrollments.studentId, userId));
      const [pendingRequestsCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(joinRequests)
        .where(and(eq(joinRequests.studentId, userId), eq(joinRequests.status, 'pending')));

      res.json({
        data: {
          enrolledClasses: enrolledClassesCount?.count ?? 0,
          pendingRequests: pendingRequestsCount?.count ?? 0,
        },
      });
    } else {
      res.status(403).json({ message: 'Forbidden' });
    }
  } catch (e) {
    console.error('Dashboard stats:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Enrollment trends: count of enrollments per month (last 6 months)
router.get('/enrollment-trends', async (req: AuthRequest, res) => {
  try {
    const userRole = req.user!.role;
    const userId = req.user!.id;
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    let rows;
    if (userRole === 'admin') {
      // Admin sees all enrollments
      rows = await db
        .select({
          month: sql<string>`to_char(${enrollments.createdAt}, 'YYYY-MM')`,
          count: sql<number>`count(*)::int`,
        })
        .from(enrollments)
        .where(gte(enrollments.createdAt, sixMonthsAgo))
        .groupBy(sql`to_char(${enrollments.createdAt}, 'YYYY-MM')`)
        .orderBy(sql`to_char(${enrollments.createdAt}, 'YYYY-MM')`);
    } else if (userRole === 'teacher') {
      // Teacher sees enrollments in their classes
      rows = await db
        .select({
          month: sql<string>`to_char(${enrollments.createdAt}, 'YYYY-MM')`,
          count: sql<number>`count(*)::int`,
        })
        .from(enrollments)
        .innerJoin(classes, eq(enrollments.classId, classes.id))
        .where(and(eq(classes.teacherId, userId), gte(enrollments.createdAt, sixMonthsAgo)))
        .groupBy(sql`to_char(${enrollments.createdAt}, 'YYYY-MM')`)
        .orderBy(sql`to_char(${enrollments.createdAt}, 'YYYY-MM')`);
    } else if (userRole === 'student') {
      // Student sees their own enrollments
      rows = await db
        .select({
          month: sql<string>`to_char(${enrollments.createdAt}, 'YYYY-MM')`,
          count: sql<number>`count(*)::int`,
        })
        .from(enrollments)
        .where(and(eq(enrollments.studentId, userId), gte(enrollments.createdAt, sixMonthsAgo)))
        .groupBy(sql`to_char(${enrollments.createdAt}, 'YYYY-MM')`)
        .orderBy(sql`to_char(${enrollments.createdAt}, 'YYYY-MM')`);
    } else {
      return res.status(403).json({ message: 'Forbidden' });
    }

    res.json({ data: rows });
  } catch (e) {
    console.error('Enrollment trends:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Classes by department
router.get('/classes-by-department', async (req: AuthRequest, res) => {
  try {
    const userRole = req.user!.role;
    const userId = req.user!.id;

    let rows;
    if (userRole === 'admin') {
      // Admin sees all classes by department
      rows = await db
        .select({
          departmentName: departments.name,
          departmentId: departments.id,
          count: sql<number>`count(${classes.id})::int`,
        })
        .from(departments)
        .leftJoin(subjects, eq(subjects.departmentId, departments.id))
        .leftJoin(classes, eq(classes.subjectId, subjects.id))
        .groupBy(departments.id, departments.name);
    } else if (userRole === 'teacher') {
      // Teacher sees their classes by department
      rows = await db
        .select({
          departmentName: departments.name,
          departmentId: departments.id,
          count: sql<number>`count(${classes.id})::int`,
        })
        .from(departments)
        .leftJoin(subjects, eq(subjects.departmentId, departments.id))
        .innerJoin(classes, and(eq(classes.subjectId, subjects.id), eq(classes.teacherId, userId)))
        .groupBy(departments.id, departments.name);
    } else {
      // Students don't see this chart
      return res.json({ data: [] });
    }

    res.json({ data: rows.map((r) => ({ name: r.departmentName, count: r.count, departmentId: r.departmentId })) });
  } catch (e) {
    console.error('Classes by department:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Capacity status: classes at capacity vs under
router.get('/capacity-status', async (req: AuthRequest, res) => {
  try {
    const userRole = req.user!.role;
    const userId = req.user!.id;

    let allClasses;
    if (userRole === 'admin') {
      allClasses = await db.select({ id: classes.id, capacity: classes.capacity }).from(classes);
    } else if (userRole === 'teacher') {
      allClasses = await db.select({ id: classes.id, capacity: classes.capacity }).from(classes).where(eq(classes.teacherId, userId));
    } else {
      // Students don't see this chart
      return res.json({ data: [] });
    }

    if (allClasses.length === 0) {
      return res.json({ data: [{ name: 'At capacity', value: 0 }, { name: 'Under capacity', value: 0 }] });
    }

    const classIds = allClasses.map(c => c.id);
    const enrollmentCounts = await db
      .select({ classId: enrollments.classId, count: sql<number>`count(*)` })
      .from(enrollments)
      .where(inArray(enrollments.classId, classIds))
      .groupBy(enrollments.classId);
    const countMap = new Map(enrollmentCounts.map((r) => [r.classId, Number(r.count)]));
    let atCap = 0;
    let under = 0;
    for (const c of allClasses) {
      const enrolled = countMap.get(c.id) ?? 0;
      if (enrolled >= c.capacity) atCap++;
      else under++;
    }
    res.json({ data: [{ name: 'At capacity', value: atCap }, { name: 'Under capacity', value: under }] });
  } catch (e) {
    console.error('Capacity status:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// User distribution by role
router.get('/user-distribution', async (_req, res) => {
  try {
    const rows = await db
      .select({ role: user.role, count: sql<number>`count(*)::int` })
      .from(user)
      .groupBy(user.role);
    res.json({ data: rows.map((r) => ({ name: r.role, value: r.count })) });
  } catch (e) {
    console.error('User distribution:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Activity feed: recent enrollments (last 20)
router.get('/activity', async (req: AuthRequest, res) => {
  try {
    const userRole = req.user!.role;
    const userId = req.user!.id;

    let rows;
    if (userRole === 'admin') {
      // Admin sees all recent enrollments
      rows = await db
        .select({
          id: enrollments.id,
          createdAt: enrollments.createdAt,
          studentName: user.name,
          studentEmail: user.email,
          classId: classes.id,
          className: classes.name,
        })
        .from(enrollments)
        .innerJoin(user, eq(enrollments.studentId, user.id))
        .innerJoin(classes, eq(enrollments.classId, classes.id))
        .orderBy(desc(enrollments.createdAt))
        .limit(20);
    } else if (userRole === 'teacher') {
      // Teacher sees enrollments in their classes
      rows = await db
        .select({
          id: enrollments.id,
          createdAt: enrollments.createdAt,
          studentName: user.name,
          studentEmail: user.email,
          classId: classes.id,
          className: classes.name,
        })
        .from(enrollments)
        .innerJoin(user, eq(enrollments.studentId, user.id))
        .innerJoin(classes, eq(enrollments.classId, classes.id))
        .where(eq(classes.teacherId, userId))
        .orderBy(desc(enrollments.createdAt))
        .limit(20);
    } else if (userRole === 'student') {
      // Student sees their own enrollments
      rows = await db
        .select({
          id: enrollments.id,
          createdAt: enrollments.createdAt,
          studentName: user.name,
          studentEmail: user.email,
          classId: classes.id,
          className: classes.name,
        })
        .from(enrollments)
        .innerJoin(user, eq(enrollments.studentId, user.id))
        .innerJoin(classes, eq(enrollments.classId, classes.id))
        .where(eq(enrollments.studentId, userId))
        .orderBy(desc(enrollments.createdAt))
        .limit(20);
    } else {
      return res.status(403).json({ message: 'Forbidden' });
    }

    res.json({ data: rows });
  } catch (e) {
    console.error('Activity:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Teacher-specific stats
router.get('/teacher-stats', async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== 'teacher' && req.user!.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const userId = req.user!.role === 'admin' ? req.query.teacherId as string : req.user!.id;
    if (!userId) {
      return res.status(400).json({ message: 'teacherId required for admin' });
    }

    const [classCount] = await db.select({ count: sql<number>`count(*)` }).from(classes).where(eq(classes.teacherId, userId));
    const [enrollmentCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(enrollments)
      .innerJoin(classes, eq(enrollments.classId, classes.id))
      .where(eq(classes.teacherId, userId));
    const [pendingRequestsCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(joinRequests)
      .innerJoin(classes, eq(joinRequests.classId, classes.id))
      .where(and(eq(classes.teacherId, userId), eq(joinRequests.status, 'pending')));

    res.json({
      data: {
        classesTaught: classCount?.count ?? 0,
        totalStudents: enrollmentCount?.count ?? 0,
        pendingJoinRequests: pendingRequestsCount?.count ?? 0,
      },
    });
  } catch (e) {
    console.error('Teacher stats:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Student-specific stats
router.get('/student-stats', async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== 'student' && req.user!.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const userId = req.user!.role === 'admin' ? req.query.studentId as string : req.user!.id;
    if (!userId) {
      return res.status(400).json({ message: 'studentId required for admin' });
    }

    const [enrolledClassesCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(enrollments)
      .where(eq(enrollments.studentId, userId));
    const [pendingRequestsCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(joinRequests)
      .where(and(eq(joinRequests.studentId, userId), eq(joinRequests.status, 'pending')));

    // Get enrolled classes with details
    const enrolledClasses = await db
      .select({
        id: classes.id,
        name: classes.name,
        description: classes.description,
        capacity: classes.capacity,
        status: classes.status,
        subjectName: subjects.name,
        teacherName: user.name,
        teacherEmail: user.email,
      })
      .from(enrollments)
      .innerJoin(classes, eq(enrollments.classId, classes.id))
      .innerJoin(subjects, eq(classes.subjectId, subjects.id))
      .innerJoin(user, eq(classes.teacherId, user.id))
      .where(eq(enrollments.studentId, userId))
      .orderBy(desc(enrollments.createdAt))
      .limit(10);

    res.json({
      data: {
        enrolledClasses: enrolledClassesCount?.count ?? 0,
        pendingRequests: pendingRequestsCount?.count ?? 0,
        classes: enrolledClasses,
      },
    });
  } catch (e) {
    console.error('Student stats:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
