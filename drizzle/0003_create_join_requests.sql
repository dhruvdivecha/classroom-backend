CREATE TYPE "public"."join_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "join_requests" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "join_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"student_id" text NOT NULL,
	"class_id" integer NOT NULL,
	"status" "join_request_status" DEFAULT 'pending' NOT NULL,
	"message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "join_requests_student_id_idx" ON "join_requests" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "join_requests_class_id_idx" ON "join_requests" USING btree ("class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "join_requests_student_class_unique" ON "join_requests" USING btree ("student_id","class_id");
