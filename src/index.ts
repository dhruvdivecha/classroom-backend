import { eq } from 'drizzle-orm';
import { db, pool } from './db/db';
import { departments } from './db/schema';

async function main() {
	try {
		console.log('Performing CRUD operations...');

		const [newDepartment] = await db
			.insert(departments)
			.values({
				code: 'CS',
				name: 'Computer Science',
				description: 'All CS courses',
			})
			.returning();

		if (!newDepartment) {
			throw new Error('Failed to create department');
		}

		console.log('✅ CREATE: Department created:', newDepartment);

		const foundDepartment = await db
			.select()
			.from(departments)
			.where(eq(departments.id, newDepartment.id));
		console.log('✅ READ: Found department:', foundDepartment[0]);

		const [updatedDepartment] = await db
			.update(departments)
			.set({ name: 'CS & Engineering' })
			.where(eq(departments.id, newDepartment.id))
			.returning();

		if (!updatedDepartment) {
			throw new Error('Failed to update department');
		}

		console.log('✅ UPDATE: Department updated:', updatedDepartment);

		await db.delete(departments).where(eq(departments.id, newDepartment.id));
		console.log('✅ DELETE: Department deleted.');

		console.log('\nCRUD operations completed successfully.');
	} catch (error) {
		console.error('❌ Error performing CRUD operations:', error);
		process.exit(1);
	} finally {
		if (pool && typeof (pool as { end: () => Promise<void> }).end === 'function') {
			await (pool as { end: () => Promise<void> }).end();
			console.log('Database pool closed.');
		}
	}
}

main();
