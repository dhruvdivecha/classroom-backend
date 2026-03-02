import express, { Request, Response } from 'express';
import subjectsRouter from './routes/subjects.js';
import usersRouter from './routes/users.js';
import departmentsRouter from './routes/departments.js';
import classRouter from './routes/classes.js';
import dashboardRouter from './routes/dashboard.js';
import joinRequestsRouter from './routes/join-requests.js';
import cors from 'cors';
import securityMiddleware from './middleware/security.js';
import { optionalAuthMiddleware } from './middleware/auth.js';
import { toNodeHandler } from 'better-auth/node'
import { auth } from './lib/auth.js';


const app = express();
const PORT = 8000;

app.use(cors({
    origin: (origin, callback) => {
        const allowed = process.env.FRONTEND_URL || 'http://localhost:5173';
        // Allow the main frontend URL, Vercel preview deployments, and requests with no origin (e.g. server-to-server)
        if (!origin || origin === allowed || /\.vercel\.app$/.test(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true
}))

app.all('/api/auth/*splat', toNodeHandler(auth));

app.use(express.json());

// Optional auth so rate limits can use req.user.role (must run before security)
app.use(optionalAuthMiddleware);
app.use(securityMiddleware);

app.use('/api/subjects', subjectsRouter);
app.use('/api/users', usersRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/classes', classRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/join-requests', joinRequestsRouter); 

app.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'Classroom backend is running' });
});

app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});
