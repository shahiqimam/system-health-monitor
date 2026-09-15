import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { HttpMethod, TargetStatus, UserRole } from '../common/enums';
import { MonitorTarget, User } from '../entities';
import { AppDataSource } from './data-source';

/**
 * Seeds demo users and demo monitor targets.
 *
 * Targets point at the Compose demo services so the demo never depends on a
 * third-party internet endpoint (spec 46).
 */
const DEMO_USERS = [
  {
    name: 'Ada Admin',
    email: 'admin@pulsewatch.local',
    role: UserRole.ADMIN,
    password: process.env.SEED_ADMIN_PASSWORD ?? 'AdminPass123!',
  },
  {
    name: 'Otto Operator',
    email: 'operator@pulsewatch.local',
    role: UserRole.OPERATOR,
    password: process.env.SEED_OPERATOR_PASSWORD ?? 'OperatorPass123!',
  },
  {
    name: 'Vera Viewer',
    email: 'viewer@pulsewatch.local',
    role: UserRole.VIEWER,
    password: process.env.SEED_VIEWER_PASSWORD ?? 'ViewerPass123!',
  },
];

const DEMO_TARGETS = [
  {
    name: 'Demo healthy service',
    url: process.env.DEMO_HEALTHY_URL ?? 'http://demo-healthy:8081/health',
    intervalSeconds: 30,
    expectedStatusMin: 200,
    expectedStatusMax: 299,
  },
  {
    name: 'Demo flaky service',
    url: process.env.DEMO_FLAKY_URL ?? 'http://demo-flaky:8082/health',
    intervalSeconds: 30,
    expectedStatusMin: 200,
    expectedStatusMax: 299,
  },
];

export async function seed(): Promise<void> {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();

  const users = AppDataSource.getRepository(User);
  const targets = AppDataSource.getRepository(MonitorTarget);

  for (const demo of DEMO_USERS) {
    if (await users.findOne({ where: { email: demo.email } })) {
      console.log(`user exists: ${demo.email}`);
      continue;
    }
    await users.save(
      users.create({
        name: demo.name,
        email: demo.email,
        role: demo.role,
        passwordHash: await bcrypt.hash(demo.password, 10),
      }),
    );
    console.log(`created user: ${demo.email} (${demo.role})`);
  }

  for (const demo of DEMO_TARGETS) {
    if (await targets.findOne({ where: { name: demo.name } })) {
      console.log(`target exists: ${demo.name}`);
      continue;
    }
    await targets.save(
      targets.create({
        ...demo,
        method: HttpMethod.GET,
        timeoutMs: 5000,
        followRedirects: false,
        maxRedirects: 3,
        enabled: true,
        archived: false,
        status: TargetStatus.UNKNOWN,
      }),
    );
    console.log(`created target: ${demo.name} -> ${demo.url}`);
  }

  console.log('seed complete');
}

if (require.main === module) {
  seed()
    .then(async () => {
      await AppDataSource.destroy();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('seed failed:', (error as Error).message);
      if (AppDataSource.isInitialized) await AppDataSource.destroy();
      process.exit(1);
    });
}
