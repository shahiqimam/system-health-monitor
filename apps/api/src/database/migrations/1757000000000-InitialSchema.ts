import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1757000000000 implements MigrationInterface {
  name = 'InitialSchema1757000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`CREATE TYPE "users_role_enum" AS ENUM('ADMIN', 'OPERATOR', 'VIEWER')`);
    await queryRunner.query(`CREATE TYPE "monitor_targets_method_enum" AS ENUM('GET', 'HEAD')`);
    await queryRunner.query(
      `CREATE TYPE "monitor_targets_status_enum" AS ENUM('UNKNOWN', 'UP', 'DEGRADED', 'DOWN', 'PAUSED')`,
    );
    await queryRunner.query(`CREATE TYPE "check_results_status_enum" AS ENUM('SUCCESS', 'FAILURE')`);
    await queryRunner.query(
      `CREATE TYPE "check_results_error_type_enum" AS ENUM('TIMEOUT', 'DNS', 'CONNECTION', 'TLS', 'INVALID_STATUS', 'REDIRECT_LIMIT', 'BLOCKED_TARGET', 'UNKNOWN')`,
    );
    await queryRunner.query(
      `CREATE TYPE "incidents_status_enum" AS ENUM('OPEN', 'ACKNOWLEDGED', 'RESOLVED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "audit_events_action_enum" AS ENUM('TARGET_CREATED', 'TARGET_UPDATED', 'TARGET_PAUSED', 'TARGET_RESUMED', 'TARGET_ARCHIVED', 'MANUAL_CHECK_REQUESTED', 'INCIDENT_OPENED', 'INCIDENT_ACKNOWLEDGED', 'INCIDENT_RESOLVED', 'INCIDENT_NOTE_ADDED', 'INCIDENT_NOTE_UPDATED')`,
    );

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(120) NOT NULL,
        "email" character varying(255) NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "role" "users_role_enum" NOT NULL DEFAULT 'VIEWER',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_users" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_users_email" ON "users" ("email")`);

    await queryRunner.query(`
      CREATE TABLE "monitor_targets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(120) NOT NULL,
        "url" character varying(2048) NOT NULL,
        "method" "monitor_targets_method_enum" NOT NULL DEFAULT 'GET',
        "expected_status_min" integer NOT NULL DEFAULT 200,
        "expected_status_max" integer NOT NULL DEFAULT 399,
        "interval_seconds" integer NOT NULL DEFAULT 60,
        "timeout_ms" integer NOT NULL DEFAULT 5000,
        "follow_redirects" boolean NOT NULL DEFAULT false,
        "max_redirects" integer NOT NULL DEFAULT 3,
        "enabled" boolean NOT NULL DEFAULT true,
        "archived" boolean NOT NULL DEFAULT false,
        "status" "monitor_targets_status_enum" NOT NULL DEFAULT 'UNKNOWN',
        "consecutive_failures" integer NOT NULL DEFAULT 0,
        "consecutive_successes" integer NOT NULL DEFAULT 0,
        "last_checked_at" TIMESTAMP WITH TIME ZONE,
        "last_success_at" TIMESTAMP WITH TIME ZONE,
        "last_failure_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_monitor_targets" PRIMARY KEY ("id"),
        CONSTRAINT "chk_targets_status_range" CHECK ("expected_status_min" <= "expected_status_max")
      )`);
    await queryRunner.query(`CREATE INDEX "idx_targets_status" ON "monitor_targets" ("status")`);
    await queryRunner.query(`CREATE INDEX "idx_targets_enabled" ON "monitor_targets" ("enabled")`);

    await queryRunner.query(`
      CREATE TABLE "check_results" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "target_id" uuid NOT NULL,
        "status" "check_results_status_enum" NOT NULL,
        "http_status" integer,
        "latency_ms" integer,
        "error_type" "check_results_error_type_enum",
        "error_message" character varying(300),
        "checked_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_check_results" PRIMARY KEY ("id"),
        CONSTRAINT "fk_check_results_target" FOREIGN KEY ("target_id")
          REFERENCES "monitor_targets"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX "idx_check_results_target_checked_at" ON "check_results" ("target_id", "checked_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_check_results_status_checked_at" ON "check_results" ("status", "checked_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "incidents" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "target_id" uuid NOT NULL,
        "status" "incidents_status_enum" NOT NULL DEFAULT 'OPEN',
        "started_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "acknowledged_at" TIMESTAMP WITH TIME ZONE,
        "acknowledged_by_id" uuid,
        "resolved_at" TIMESTAMP WITH TIME ZONE,
        "failure_count_at_open" integer NOT NULL,
        "summary" character varying(300) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_incidents" PRIMARY KEY ("id"),
        CONSTRAINT "fk_incidents_target" FOREIGN KEY ("target_id")
          REFERENCES "monitor_targets"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_incidents_ack_user" FOREIGN KEY ("acknowledged_by_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )`);
    await queryRunner.query(
      `CREATE INDEX "idx_incidents_target_status" ON "incidents" ("target_id", "status")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_incidents_one_active_per_target" ON "incidents" ("target_id") WHERE "status" <> 'RESOLVED'`,
    );

    await queryRunner.query(`
      CREATE TABLE "incident_notes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "incident_id" uuid NOT NULL,
        "author_id" uuid,
        "content" character varying(2000) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_incident_notes" PRIMARY KEY ("id"),
        CONSTRAINT "fk_incident_notes_incident" FOREIGN KEY ("incident_id")
          REFERENCES "incidents"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_incident_notes_author" FOREIGN KEY ("author_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )`);
    await queryRunner.query(
      `CREATE INDEX "idx_incident_notes_incident" ON "incident_notes" ("incident_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "audit_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "actor_id" uuid,
        "action" "audit_events_action_enum" NOT NULL,
        "entity_type" character varying(60) NOT NULL,
        "entity_id" uuid,
        "metadata" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_audit_events" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX "idx_audit_events_entity" ON "audit_events" ("entity_type", "entity_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "incident_notes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "incidents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "check_results"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "monitor_targets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "audit_events_action_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "incidents_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "check_results_error_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "check_results_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "monitor_targets_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "monitor_targets_method_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);
  }
}
