import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/db";
import * as schema from "../db/schema/auth";

// Validate required environment variables at module initialization
if (!process.env.BETTER_AUTH_SECRET) {
    console.error("FATAL ERROR: BETTER_AUTH_SECRET environment variable is required but not set.");
    console.error("Please set BETTER_AUTH_SECRET in your .env file.");
    process.exit(1);
}

const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET;

export const auth = betterAuth({
    secret: BETTER_AUTH_SECRET,
    trustedOrigins: [process.env.FRONTEND_URL || "http://localhost:5173"],
    database: drizzleAdapter(db, {
        provider: "pg", // or "mysql", "sqlite"
        schema,
    }),
    emailAndPassword: {
        enabled: true,
    },
    user: {
        additionalFields: {
            role: {
                type: 'string', required: true, defaultValue: 'student', input: true
            },
            imageCldPubId: {
                type: 'string', required: false, input: true
            }
        }
    },
});