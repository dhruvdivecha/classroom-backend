import AgentAPI from 'apminsight';
AgentAPI.config();

import express, { Request, Response } from 'express';
import subjectsRouter from './routes/subjects.js';
import cors from 'cors';
import securityMiddleware from './middleware/security.js';
import { toNodeHandler } from 'better-auth/node'
import { auth } from './lib/auth';


const app = express();
const PORT = 8000;

app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE', ],
    credentials: true
}))

app.all('/api/auth/*splat', toNodeHandler(auth));

app.use(express.json());

app.use(securityMiddleware);

app.use('/api/subjects', subjectsRouter);

app.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'Classroom backend is running' });
});

app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});
