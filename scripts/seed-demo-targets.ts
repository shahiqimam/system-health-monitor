/**
 * Entry point kept at the documented path. The implementation lives in the API
 * workspace (apps/api/src/database/seed.ts) so it compiles into the API image
 * and can run there without ts-node.
 *
 * Local:  npm run seed
 * Docker: docker compose exec api node dist/database/seed.js
 */
import { AppDataSource } from '../apps/api/src/database/data-source';
import { seed } from '../apps/api/src/database/seed';

seed()
  .then(async () => {
    await AppDataSource.destroy();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error('seed failed:', (error as Error).message);
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
    process.exit(1);
  });
