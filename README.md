# Zeusda's School — Backend

The REST API server for **Zeusda's School**, a full-stack classroom management application with role-based access control for admins, teachers, and students.

<!-- Add screenshots below -->
<p align="center">
  <img src="" alt="App Screenshot 1" width="45%" />
  &nbsp;&nbsp;
  <img src="" alt="App Screenshot 2" width="45%" />
</p>

---

## Tech Stack

| Layer          | Technology                                                    |
| -------------- | ------------------------------------------------------------- |
| Runtime        | **Node.js** with **TypeScript**                               |
| Framework      | **Express 5**                                                 |
| Database       | **PostgreSQL** (Neon Serverless)                              |
| ORM            | **Drizzle ORM**                                               |
| Authentication | **Better Auth** (email + password, session cookies)           |
| Security       | **Arcjet** (bot detection, shield, per-role rate limiting)    |
| Deployment     | **Railway**                                                   |

---

## Features

### Authentication & Authorization
- Email/password sign-up and sign-in with session-based cookies
- Three roles: **Admin**, **Teacher**, **Student**
- Role-based middleware protecting all API routes
- CSRF protection via Better Auth trusted origins

### Department Management
- Full CRUD for academic departments
- Search and pagination support

### Subject Management
- Full CRUD for subjects linked to departments
- Filter by department, search by name/code

### Class Management
- Full CRUD for classes linked to subjects and teachers
- Class schedules (day, start/end time) stored as JSON
- Banner image support via Cloudinary
- Unique invite codes per class
- Capacity tracking and status management (active / inactive / archived)

### Enrollment System
- Admins and class teachers can enroll/remove students
- Students request to join via **Join Requests**
- Teachers and admins can approve or reject join requests
- Prevents duplicate enrollments and requests

### Dashboard & Analytics
- **Admin**: total users/classes/departments, enrollment trends, classes by department, capacity status, user distribution, recent activity
- **Teacher**: own class stats, enrolled students, pending join requests
- **Student**: enrolled classes, pending requests

### Security
- Arcjet Shield (SQL injection, XSS protection) — DRY_RUN in dev, LIVE in production
- Arcjet Bot Detection — blocks automated requests in production
- Per-role sliding window rate limiting (admin: 200/min, teacher/student: 120/min, guest: 30/min)
- CORS restricted to frontend origin + Vercel preview deployments

---

## API Routes

| Method   | Route                                | Auth     | Description                          |
| -------- | ------------------------------------ | -------- | ------------------------------------ |
| `ALL`    | `/api/auth/*`                        | Public   | Better Auth (sign-in, sign-up, etc.) |
| `GET`    | `/api/dashboard/stats`               | Required | Dashboard statistics                 |
| `GET`    | `/api/dashboard/enrollment-trends`   | Required | Enrollment trend data                |
| `GET`    | `/api/dashboard/classes-by-department` | Required | Classes grouped by department      |
| `GET`    | `/api/dashboard/capacity-status`     | Required | Class capacity overview              |
| `GET`    | `/api/dashboard/user-distribution`   | Required | User role distribution               |
| `GET`    | `/api/dashboard/activity`            | Required | Recent enrollment activity           |
| `GET`    | `/api/dashboard/teacher-stats`       | Teacher  | Teacher's own class statistics       |
| `GET`    | `/api/dashboard/student-stats`       | Student  | Student's enrolled classes           |
| `GET`    | `/api/departments`                   | Required | List departments                     |
| `POST`   | `/api/departments`                   | Admin    | Create department                    |
| `GET`    | `/api/departments/:id`               | Required | Get department                       |
| `PUT`    | `/api/departments/:id`               | Admin    | Update department                    |
| `DELETE` | `/api/departments/:id`               | Admin    | Delete department                    |
| `GET`    | `/api/subjects`                      | Required | List subjects                        |
| `POST`   | `/api/subjects`                      | Admin    | Create subject                       |
| `GET`    | `/api/subjects/:id`                  | Required | Get subject                          |
| `PUT`    | `/api/subjects/:id`                  | Admin    | Update subject                       |
| `DELETE` | `/api/subjects/:id`                  | Admin    | Delete subject                       |
| `GET`    | `/api/classes`                       | Required | List classes                         |
| `POST`   | `/api/classes`                       | Admin/Teacher | Create class                    |
| `GET`    | `/api/classes/:id`                   | Required | Get class with enrollments           |
| `PUT`    | `/api/classes/:id`                   | Admin/Teacher | Update class                    |
| `DELETE` | `/api/classes/:id`                   | Admin    | Delete class                         |
| `POST`   | `/api/classes/:id/enroll`            | Admin/Teacher | Enroll student                  |
| `DELETE` | `/api/classes/:id/enroll/:studentId` | Admin/Teacher | Remove student                  |
| `GET`    | `/api/users`                         | Admin    | List users                           |
| `POST`   | `/api/users`                         | Admin    | Create user                          |
| `GET`    | `/api/users/:id`                     | Admin    | Get user                             |
| `PUT`    | `/api/users/:id`                     | Admin    | Update user                          |
| `PATCH`  | `/api/users/:id/verify`              | Admin    | Toggle email verification            |
| `DELETE` | `/api/users/:id`                     | Admin    | Delete user                          |
| `GET`    | `/api/join-requests`                 | Admin/Teacher | List join requests              |
| `POST`   | `/api/join-requests`                 | Student  | Create join request                  |
| `PUT`    | `/api/join-requests/:id/approve`     | Admin/Teacher | Approve request                 |
| `PUT`    | `/api/join-requests/:id/reject`      | Admin/Teacher | Reject request                  |
| `GET`    | `/api/join-requests/pending-count`   | Admin/Teacher | Pending request count           |

---

## Database Schema

```
user           ──< session
  │                account
  │                verification
  │
  ├──< classes          (teacher)
  ├──< enrollments      (student)
  └──< join_requests    (student)

departments ──< subjects ──< classes ──< enrollments
                                    ──< join_requests
```

**Tables**: `user`, `session`, `account`, `verification`, `departments`, `subjects`, `classes`, `enrollments`, `join_requests`

---

## Getting Started

### Prerequisites

- **Node.js** v18+
- **PostgreSQL** database (or a [Neon](https://neon.tech) account for serverless)
- **Arcjet** account for a site key ([arcjet.com](https://arcjet.com))

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd classroom-backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Environment variables

Create a `.env` file in the project root:

```env
# Database
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"

# Auth
BETTER_AUTH_SECRET="your-secret-key-min-32-chars"
BETTER_AUTH_BASE_URL="http://localhost:8000"

# Frontend origin (for CORS & trusted origins)
FRONTEND_URL="http://localhost:5173"

# Security
ARCJET_KEY="ajkey_your_arcjet_site_key"

# Optional
NODE_ENV="development"
```

### 4. Run database migrations

```bash
npm run db:generate
npm run db:migrate
```

### 5. Start the development server

```bash
npm run dev
```

The server starts at **http://localhost:8000**.

### 6. Promote a user to admin

After signing up through the frontend, promote a user to admin:

```bash
npx tsx scripts/promote-admin.ts admin@example.com
```

---

## Production Deployment (Railway)

1. Push to your GitHub repo
2. Connect the repo to [Railway](https://railway.app)
3. Set environment variables in Railway dashboard:
   - `DATABASE_URL`
   - `BETTER_AUTH_SECRET`
   - `BETTER_AUTH_BASE_URL` — your Railway public URL (e.g. `https://your-app.up.railway.app`)
   - `FRONTEND_URL` — your Vercel frontend URL (e.g. `https://your-app.vercel.app`)
   - `ARCJET_KEY`
   - `NODE_ENV=production`

4. Railway will run `npm run build` then `npm start` automatically.

---

## Scripts

| Script           | Description                              |
| ---------------- | ---------------------------------------- |
| `npm run dev`    | Start dev server with hot reload (tsx)   |
| `npm run build`  | Compile TypeScript to JavaScript         |
| `npm start`      | Run compiled production server           |
| `npm run db:generate` | Generate Drizzle migration files    |
| `npm run db:migrate`  | Apply migrations to the database    |

---

## Project Structure

```
src/
├── index.ts              # Express app entry point
├── config/
│   └── arcjet.ts         # Arcjet security configuration
├── db/
│   ├── db.ts             # Neon + Drizzle database connection
│   └── schema/
│       ├── auth.ts       # User, session, account tables
│       ├── app.ts        # Departments, subjects, classes, enrollments
│       └── index.ts      # Schema barrel export
├── lib/
│   └── auth.ts           # Better Auth configuration
├── middleware/
│   ├── auth.ts           # Auth & role-based middleware
│   └── security.ts       # Arcjet rate limiting & protection
├── routes/
│   ├── users.ts          # User management (admin)
│   ├── departments.ts    # Department CRUD
│   ├── subjects.ts       # Subject CRUD
│   ├── classes.ts        # Class CRUD + enrollments
│   ├── dashboard.ts      # Analytics endpoints
│   └── join-requests.ts  # Join request management
scripts/
└── promote-admin.ts      # CLI tool to promote user to admin
drizzle/
└── ...                   # Generated SQL migration files
```

---

## License

ISC
