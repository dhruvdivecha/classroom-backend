import {
	pgTable,
	text,
	timestamp,
	boolean,
	index,
	uniqueIndex,
	pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/* -----------------------------------------------------
 * ENUMS
 * --------------------------------------------------- */

export const roleEnum = pgEnum("role", ["student", "teacher", "admin"]);

/* -----------------------------------------------------
 * USER
 * --------------------------------------------------- */

export const user = pgTable("user", {
	id: text("id").primaryKey(),

	name: text("name"),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").notNull().default(false),
	image: text("image"),

	// ✅ custom fields (allowed)
	role: roleEnum("role").notNull().default("student"),
	imageCldPubId: text("image_cld_pub_id"),

	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
});

/* -----------------------------------------------------
 * SESSION
 * --------------------------------------------------- */

export const session = pgTable(
	"session",
	{
		id: text("id").primaryKey(),

		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		token: text("token").notNull().unique(),

		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),

		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => ({
		userIdIdx: index("session_user_id_idx").on(table.userId),
		tokenIdx: uniqueIndex("session_token_idx").on(table.token),
	})
);

/* -----------------------------------------------------
 * ACCOUNT
 * --------------------------------------------------- */

export const account = pgTable(
	"account",
	{
		id: text("id").primaryKey(),

		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),

		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),

		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),

		accessTokenExpiresAt: timestamp("access_token_expires_at", {
			withTimezone: true,
		}),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
			withTimezone: true,
		}),

		scope: text("scope"),
		password: text("password"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => ({
		userIdIdx: index("account_user_id_idx").on(table.userId),
		accountProviderIdx: uniqueIndex("account_provider_unique_idx").on(
			table.providerId,
			table.accountId
		),
	})
);

/* -----------------------------------------------------
 * VERIFICATION
 * --------------------------------------------------- */

export const verification = pgTable(
	"verification",
	{
		id: text("id").primaryKey(),

		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => ({
		identifierIdx: index("verification_identifier_idx").on(
			table.identifier
		),
	})
);

/* -----------------------------------------------------
 * RELATIONS
 * --------------------------------------------------- */

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));
