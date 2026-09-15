import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Server, createServer } from 'http';
import { AddressInfo } from 'net';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { UserRole } from '../src/common/enums';
import { User } from '../src/entities';

export const SEED_PASSWORD = 'E2ePassword123!';

export interface E2EContext {
  app: INestApplication;
  dataSource: DataSource;
  tokens: Record<UserRole, string>;
}

export async function bootstrapE2E(): Promise<E2EContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  const dataSource = app.get(DataSource);
  await resetDatabase(dataSource);
  await seedUsers(dataSource);

  const tokens = {} as Record<UserRole, string>;
  for (const role of [UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER]) {
    tokens[role] = await login(app, `${role.toLowerCase()}@e2e.local`);
  }

  return { app, dataSource, tokens };
}

export async function resetDatabase(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    'TRUNCATE TABLE audit_events, incident_notes, incidents, check_results, monitor_targets, users RESTART IDENTITY CASCADE',
  );
}

export async function seedUsers(dataSource: DataSource): Promise<void> {
  const users = dataSource.getRepository(User);
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 4);
  for (const role of [UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER]) {
    await users.save(
      users.create({
        name: `${role} E2E`,
        email: `${role.toLowerCase()}@e2e.local`,
        role,
        passwordHash,
      }),
    );
  }
}

export async function login(app: INestApplication, email: string): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: SEED_PASSWORD })
    .expect(200);
  return response.body.accessToken;
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** A controllable local endpoint so no test ever depends on the internet. */
export class FakeTargetServer {
  private server!: Server;
  private statusCode = 200;
  port = 0;

  async start(): Promise<void> {
    this.server = createServer((_req, res) => {
      res.writeHead(this.statusCode, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: this.statusCode }));
    });
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.port = (this.server.address() as AddressInfo).port;
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}/health`;
  }

  succeed(): void {
    this.statusCode = 200;
  }

  fail(status = 503): void {
    this.statusCode = status;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
