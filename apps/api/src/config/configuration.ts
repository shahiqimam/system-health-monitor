const int = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const bool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true' || value === '1';
};

export interface AppConfig {
  nodeEnv: string;
  apiPort: number;
  corsOrigin: string;
  swaggerEnabled: boolean;
  jwtSecret: string;
  jwtExpiresIn: string;
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  scheduler: {
    enabled: boolean;
    tickSeconds: number;
    maxConcurrentChecks: number;
  };
  checks: {
    defaultIntervalSeconds: number;
    minIntervalSeconds: number;
    maxIntervalSeconds: number;
    defaultTimeoutMs: number;
    minTimeoutMs: number;
    maxTimeoutMs: number;
    failureThreshold: number;
    recoveryThreshold: number;
    maxRedirects: number;
    retentionDays: number;
  };
  ssrf: {
    allowPrivateTargets: boolean;
    maxUrlLength: number;
    maxHostnameLength: number;
  };
}

export const loadConfig = (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  apiPort: int(process.env.API_PORT, 3001),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  swaggerEnabled: bool(process.env.SWAGGER_ENABLED, process.env.NODE_ENV !== 'production'),
  jwtSecret: process.env.JWT_SECRET ?? 'insecure_dev_secret_replace_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
  database: {
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: int(process.env.DATABASE_PORT, 5432),
    name: process.env.DATABASE_NAME ?? 'pulsewatch',
    user: process.env.DATABASE_USER ?? 'pulsewatch',
    password: process.env.DATABASE_PASSWORD ?? 'pulsewatch',
  },
  scheduler: {
    enabled: bool(process.env.SCHEDULER_ENABLED, true),
    tickSeconds: int(process.env.SCHEDULER_TICK_SECONDS, 15),
    maxConcurrentChecks: int(process.env.MAX_CONCURRENT_CHECKS, 10),
  },
  checks: {
    defaultIntervalSeconds: int(process.env.DEFAULT_CHECK_INTERVAL_SECONDS, 60),
    minIntervalSeconds: int(process.env.MIN_CHECK_INTERVAL_SECONDS, 15),
    maxIntervalSeconds: int(process.env.MAX_CHECK_INTERVAL_SECONDS, 86400),
    defaultTimeoutMs: int(process.env.DEFAULT_TIMEOUT_MS, 5000),
    minTimeoutMs: int(process.env.MIN_TIMEOUT_MS, 500),
    maxTimeoutMs: int(process.env.MAX_TIMEOUT_MS, 30000),
    failureThreshold: int(process.env.FAILURE_THRESHOLD, 3),
    recoveryThreshold: int(process.env.RECOVERY_THRESHOLD, 2),
    maxRedirects: int(process.env.MAX_REDIRECTS, 3),
    retentionDays: int(process.env.CHECK_RETENTION_DAYS, 30),
  },
  ssrf: {
    allowPrivateTargets: bool(process.env.ALLOW_PRIVATE_TARGETS, false),
    maxUrlLength: int(process.env.MAX_URL_LENGTH, 2048),
    maxHostnameLength: int(process.env.MAX_HOSTNAME_LENGTH, 253),
  },
});

export default loadConfig;
