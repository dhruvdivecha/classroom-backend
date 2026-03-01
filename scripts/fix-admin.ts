import 'dotenv/config';
import { db } from '../src/db/db.js';
import { user } from '../src/db/schema/auth.js';
import { eq } from 'drizzle-orm';

const [updated] = await db
  .update(user)
  .set({ role: 'admin', emailVerified: true })
  .where(eq(user.email, 'admin@test.com'))
  .returning({ id: user.id, email: user.email, role: user.role, emailVerified: user.emailVerified });

if (updated) {
  console.log('Updated:', JSON.stringify(updated, null, 2));
} else {
  console.error('No user found with email: admin@test.com');
  process.exit(1);
}
