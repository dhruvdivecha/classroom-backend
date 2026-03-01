/**
 * Promote an existing user to admin by email.
 *
 * Usage:
 *   npx tsx scripts/promote-admin.ts admin@example.com
 *   # or
 *   PROMOTE_ADMIN_EMAIL=admin@example.com npx tsx scripts/promote-admin.ts
 *
 * Requires DATABASE_URL in .env (or environment).
 */

import 'dotenv/config';
import { db } from '../src/db/db.js';
import { user } from '../src/db/schema/auth.js';
import { eq } from 'drizzle-orm';

const email =
  process.env.PROMOTE_ADMIN_EMAIL ?? process.argv[2];

if (!email?.trim()) {
  console.error('Usage: npx tsx scripts/promote-admin.ts <email>');
  console.error('   or: PROMOTE_ADMIN_EMAIL=admin@example.com npx tsx scripts/promote-admin.ts');
  process.exit(1);
}

async function main() {
  const [updated] = await db
    .update(user)
    .set({ role: 'admin' })
    .where(eq(user.email, email.trim()))
    .returning({ id: user.id, email: user.email, role: user.role });

  if (!updated) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  console.log(`User promoted to admin: ${updated.email} (id: ${updated.id})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
