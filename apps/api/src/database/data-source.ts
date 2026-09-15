import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { join } from 'path';
import { loadConfig } from '../config/configuration';

loadEnv({ path: join(__dirname, '..', '..', '..', '..', '.env') });

const config = loadConfig();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  username: config.database.user,
  password: config.database.password,
  entities: [join(__dirname, '..', 'entities', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false,
  logging: false,
});

export default AppDataSource;
