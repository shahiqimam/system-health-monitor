import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const configService = app.get(ConfigService<AppConfig, true>);

  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.enableCors({
    origin: configService.get('corsOrigin', { infer: true }),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  if (configService.get('swaggerEnabled', { infer: true })) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('PulseWatch API')
        .setDescription(
          'Service health and uptime monitor. Educational portfolio project - not a production observability platform.',
        )
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.get('apiPort', { infer: true });
  await app.listen(port, '0.0.0.0');

  const ssrf = configService.get('ssrf', { infer: true });
  if (ssrf.allowPrivateTargets) {
    Logger.warn(
      'ALLOW_PRIVATE_TARGETS=true: private and loopback destinations are monitorable. ' +
        'Intended for a trusted local lab only - never enable on an internet-exposed deployment.',
      'Bootstrap',
    );
  }
  Logger.log(`PulseWatch API listening on port ${port} (prefix /api/v1)`, 'Bootstrap');
}

void bootstrap();
