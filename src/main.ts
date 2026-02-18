import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import compression from 'compression';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { getMetadataArgsStorage } from 'typeorm';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3000);
  const environment = configService.get<string>('app.environment', 'development');

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: environment === 'production' ? undefined : false,
    }),
  );

  // Compression middleware
  app.use(compression());

  // Cookie parser
  app.use(cookieParser());

  // CORS configuration
  app.enableCors({
    origin:
      environment === 'production'
        ? configService.get<string[]>('app.allowedOrigins', [])
        : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-KEY'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // API prefix
  app.setGlobalPrefix('api');

  // Swagger documentation
  if (environment !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Elder Connect API')
      .setDescription('IoT-enabled elderly care platform API documentation')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addTag('Authentication', 'User authentication and authorization')
      .addTag('Profile', 'User profile and medication management')
      .addTag('Device', 'IoT device and telemetry management')
      .addTag('Media', 'File upload and media management')
      .addTag('Notifications', 'Notification and alert system')
      .addServer(`http://localhost:${port}`, 'Development server')
      .addServer(`https://api.elderconnect.com`, 'Production server')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });

    logger.log(`Swagger documentation available at http://localhost:${port}/api/docs`);
  }

  // 🔹 Debug: print all registered TypeORM entities
  logger.log(
    'Registered TypeORM entities: ' +
      getMetadataArgsStorage().tables.map((t) => t.target.toString()).join(', '),
  );

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.log('SIGTERM received, shutting down gracefully');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.log('SIGINT received, shutting down gracefully');
    await app.close();
    process.exit(0);
  });

  // Start the application
  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 Elder Connect API is running on: http://localhost:${port}/api`);
  logger.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
  logger.log(`🏥 Health Check: http://localhost:${port}/health`);
  logger.log(`🌍 Environment: ${environment}`);
}

bootstrap().catch((error) => {
  console.error('Failed to start the application:', error);
  process.exit(1);
});