/**
 * Runs before AppModule is imported, so `loadConfig()` reads these values.
 *
 * dotenv does not overwrite variables that already exist in process.env, so
 * anything set here wins over the repository .env file.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_HOST = process.env.E2E_DATABASE_HOST ?? 'localhost';
process.env.DATABASE_PORT = process.env.E2E_DATABASE_PORT ?? '5432';
process.env.DATABASE_NAME = process.env.E2E_DATABASE_NAME ?? 'pulsewatch_test';
process.env.DATABASE_USER = process.env.E2E_DATABASE_USER ?? 'pulsewatch';
process.env.DATABASE_PASSWORD = process.env.E2E_DATABASE_PASSWORD ?? 'change_me';

process.env.JWT_SECRET = 'e2e_test_secret_value_not_used_anywhere_else';
process.env.JWT_EXPIRES_IN = '1h';

// The scheduler is disabled so the tests own the timing completely: every
// check in these specs is triggered explicitly via check-now.
process.env.SCHEDULER_ENABLED = 'false';

// The specs check a local http.createServer on 127.0.0.1, which the default
// SSRF policy would (correctly) refuse.
process.env.ALLOW_PRIVATE_TARGETS = 'true';

process.env.FAILURE_THRESHOLD = '3';
process.env.RECOVERY_THRESHOLD = '2';
process.env.MIN_CHECK_INTERVAL_SECONDS = '15';
process.env.SWAGGER_ENABLED = 'false';
