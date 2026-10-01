import { db } from './index.ts';
import { users } from './schema.ts';
import { eq } from 'drizzle-orm';

export async function getOrCreateUser(uid: string, email: string, name: string, role: string) {
  // Use upsert to handle concurrent inserts of the same user ID safely.
  // Updates email/name if the user already exists, or inserts a new record.
  const result = await db.insert(users)
    .values({
      id: uid, // In our new schema, id is the primary key and we map UID to it
      uid,
      name,
      email,
      role
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: {
        email,
        name,
      },
    })
    .returning();

  return result[0];
}
