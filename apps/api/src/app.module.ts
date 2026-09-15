import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ChecksModule } from './checks/checks.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AppConfig, loadConfig } from './config/configuration';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { IncidentsModule } from './incidents/incidents.module';
import { MetricsModule } from './metrics/metrics.module';
import { RetentionModule } from './retention/retention.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { TargetsModule } from './targets/targets.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [loadConfig],
      envFilePath: [join(__dirname, '..', '..', '..', '.env'), '.env'],
    }),
    // Scheduling is registered exactly once, here (spec 5).
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => {
        const db = configService.get('database', { infer: true });
        return {
          type: 'postgres' as const,
          host: db.host,
          port: db.port,
          database: db.name,
          username: db.user,
          password: db.password,
          entities: [join(__dirname, 'entities', '*.entity.{ts,js}')],
          migrations: [join(__dirname, 'database', 'migrations', '*.{ts,js}')],
          migrationsRun: true,
          synchronize: false,
          autoLoadEntities: true,
        };
      },
    }),
    AuditModule,
    AuthModule,
    UsersModule,
    ChecksModule,
    MetricsModule,
    SchedulerModule,
    TargetsModule,
    IncidentsModule,
    DashboardModule,
    RetentionModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
