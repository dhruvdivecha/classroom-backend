import express from 'express';
import { db } from '../db/db.js';
import { joinRequests, classes, enrollments, user } from '../db/schema/index.js';
import { eq, and, or, sql } from 'drizzle-orm';
import { getTableColumns } from 'drizzle-orm';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Create join request (student only)
router.post('/', requireRole('student'), async (req: AuthRequest, res) => {
  try {
    const { classId, message } = req.body;
    const studentId = req.user!.id;

    if (!classId) {
      return res.status(400).json({ message: 'classId is required' });
    }

    // Check if class exists
    const [classRecord] = await db.select().from(classes).where(eq(classes.id, Number(classId)));
    if (!classRecord) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // Check if already enrolled
    const [existingEnrollment] = await db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.studentId, studentId), eq(enrollments.classId, Number(classId))));
    
    if (existingEnrollment) {
      return res.status(400).json({ message: 'Already enrolled in this class' });
    }

    // Check if request already exists
    const [existingRequest] = await db
      .select()
      .from(joinRequests)
      .where(
        and(
          eq(joinRequests.studentId, studentId),
          eq(joinRequests.classId, Number(classId)),
        )
      );

    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return res.status(400).json({ message: 'Join request already pending' });
      }
      if (existingRequest.status === 'rejected') {
        return res.status(403).json({ message: 'You have been rejected from entering this class' });
      }
      if (existingRequest.status === 'approved') {
        return res.status(400).json({ message: 'You are already approved for this class' });
      }
    }

    // Create join request
    const [created] = await db
      .insert(joinRequests)
      .values({
        studentId,
        classId: Number(classId),
        message: message ? String(message) : null,
        status: 'pending',
      })
      .returning();

    res.status(201).json({ data: created });
  } catch (error) {
    console.error('Create join request error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// List join requests (filtered by role)
router.get('/', async (req: AuthRequest, res) => {
  try {
    const userRole = req.user!.role;
    const userId = req.user!.id;

    if (userRole === 'student') {
      // Students see their own requests
      const requests = await db
        .select({
          ...getTableColumns(joinRequests),
          class: { ...getTableColumns(classes), name: classes.name },
        })
        .from(joinRequests)
        .leftJoin(classes, eq(joinRequests.classId, classes.id))
        .where(eq(joinRequests.studentId, userId))
        .orderBy(joinRequests.createdAt);

      return res.json({ data: requests });
    } else if (userRole === 'teacher') {
      // Teachers see requests for their classes
      const requests = await db
        .select({
          ...getTableColumns(joinRequests),
          student: { id: user.id, name: user.name, email: user.email },
          class: { ...getTableColumns(classes), name: classes.name },
        })
        .from(joinRequests)
        .innerJoin(classes, eq(joinRequests.classId, classes.id))
        .innerJoin(user, eq(joinRequests.studentId, user.id))
        .where(and(eq(classes.teacherId, userId), eq(joinRequests.status, 'pending')))
        .orderBy(joinRequests.createdAt);

      return res.json({ data: requests });
    } else if (userRole === 'admin') {
      // Admins see all requests
      const requests = await db
        .select({
          ...getTableColumns(joinRequests),
          student: { id: user.id, name: user.name, email: user.email },
          class: { ...getTableColumns(classes), name: classes.name },
        })
        .from(joinRequests)
        .innerJoin(classes, eq(joinRequests.classId, classes.id))
        .innerJoin(user, eq(joinRequests.studentId, user.id))
        .orderBy(joinRequests.createdAt);

      return res.json({ data: requests });
    }

    res.status(403).json({ message: 'Forbidden' });
  } catch (error) {
    console.error('List join requests error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get pending count for teacher
router.get('/pending-count', requireRole('teacher', 'admin'), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;

    let count: number;
    if (userRole === 'admin') {
      const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(joinRequests)
        .where(eq(joinRequests.status, 'pending'));
      count = Number(result?.count || 0);
    } else {
      const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(joinRequests)
        .innerJoin(classes, eq(joinRequests.classId, classes.id))
        .where(and(eq(classes.teacherId, userId), eq(joinRequests.status, 'pending')));
      count = Number(result?.count || 0);
    }

    res.json({ data: { count } });
  } catch (error) {
    console.error('Pending count error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Approve join request (teacher only)
router.put('/:id/approve', requireRole('teacher', 'admin'), async (req: AuthRequest, res) => {
  try {
    const requestId = Number(req.params.id);
    const userId = req.user!.id;
    const userRole = req.user!.role;

    if (!Number.isFinite(requestId)) {
      return res.status(400).json({ message: 'Invalid request ID' });
    }

    // Get the join request with class info
    const [request] = await db
      .select({
        ...getTableColumns(joinRequests),
        class: { ...getTableColumns(classes), teacherId: classes.teacherId },
      })
      .from(joinRequests)
      .innerJoin(classes, eq(joinRequests.classId, classes.id))
      .where(eq(joinRequests.id, requestId));

    if (!request) {
      return res.status(404).json({ message: 'Join request not found' });
    }

    // Check if teacher owns the class (unless admin)
    if (userRole !== 'admin' && request.class.teacherId !== userId) {
      return res.status(403).json({ message: 'Forbidden - Not your class' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Request already processed' });
    }

    // Check capacity
    const [enrollmentCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(enrollments)
      .where(eq(enrollments.classId, request.classId));

    if ((enrollmentCount?.count || 0) >= request.class.capacity) {
      return res.status(400).json({ message: 'Class is at capacity' });
    }

    // Check if already enrolled
    const [existingEnrollment] = await db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.studentId, request.studentId), eq(enrollments.classId, request.classId)));

    if (existingEnrollment) {
      // Delete the request since already enrolled
      await db.delete(joinRequests).where(eq(joinRequests.id, requestId));
      return res.json({ data: { message: 'Already enrolled', enrollment: existingEnrollment } });
    }

    // Create enrollment
    const [enrollment] = await db
      .insert(enrollments)
      .values({
        studentId: request.studentId,
        classId: request.classId,
      })
      .returning();

    // Update request status
    await db
      .update(joinRequests)
      .set({ status: 'approved' })
      .where(eq(joinRequests.id, requestId));

    res.json({ data: { enrollment, request: { ...request, status: 'approved' } } });
  } catch (error) {
    console.error('Approve request error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Reject join request (teacher only)
router.put('/:id/reject', requireRole('teacher', 'admin'), async (req: AuthRequest, res) => {
  try {
    const requestId = Number(req.params.id);
    const userId = req.user!.id;
    const userRole = req.user!.role;

    if (!Number.isFinite(requestId)) {
      return res.status(400).json({ message: 'Invalid request ID' });
    }

    // Get the join request with class info
    const [request] = await db
      .select({
        ...getTableColumns(joinRequests),
        class: { ...getTableColumns(classes), teacherId: classes.teacherId },
      })
      .from(joinRequests)
      .innerJoin(classes, eq(joinRequests.classId, classes.id))
      .where(eq(joinRequests.id, requestId));

    if (!request) {
      return res.status(404).json({ message: 'Join request not found' });
    }

    // Check if teacher owns the class (unless admin)
    if (userRole !== 'admin' && request.class.teacherId !== userId) {
      return res.status(403).json({ message: 'Forbidden - Not your class' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Request already processed' });
    }

    // Update request status
    const [updated] = await db
      .update(joinRequests)
      .set({ status: 'rejected' })
      .where(eq(joinRequests.id, requestId))
      .returning();

    res.json({ data: updated });
  } catch (error) {
    console.error('Reject request error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
