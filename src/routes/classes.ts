import express from 'express';
import { db } from '../db/db.js';
import { classes } from '../db/schema/index.js';

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

export default router;