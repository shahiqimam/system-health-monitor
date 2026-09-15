import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { RetentionService } from './retention.service';

/** Documented manual command: `npm run retention:prune --workspace apps/api`. */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const deleted = await app.get(RetentionService).pruneOldChecks();
    Logger.log(`Retention prune removed ${deleted} check results`, 'RetentionCli');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  Logger.error(`Retention prune failed: ${(error as Error).message}`, 'RetentionCli');
  process.exit(1);
});
