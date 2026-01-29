import express, { Request, Response } from 'express';
import subjectsRouter from './routes/subjects';
import cors from 'cors';
import securityMiddleware from './middleware/security';

const app = express();
const PORT = 8000;

app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE', ],
    credentials: true
}))

app.use(express.json());

app.use(securityMiddleware);

app.use('/api/subjects', subjectsRouter);

app.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'Classroom backend is running' });
});

app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});
