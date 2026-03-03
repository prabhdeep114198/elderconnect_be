import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import compression from 'compression';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import serverless from 'serverless-http';

// Cache the server instance to avoid cold-start reinitialization
let cachedServer: any;

async function bootstrap() {
  if (cachedServer) return cachedServer;

  const expressApp = express();
  const adapter = new ExpressAdapter(expressApp);

  const app = await NestFactory.create(AppModule, adapter, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const environment = configService.get<string>('app.environment', 'development');
  const port = configService.get<number>('app.port', 3000);

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
  }

  // Initialize the application
  await app.init();

  // If not running on Vercel, start the server
  if (!process.env.VERCEL) {
    await app.listen(port);
    const logger = new Logger('Bootstrap');
    logger.log(`Application is running on: http://localhost:${port}/api`);
  }

  cachedServer = serverless(expressApp);
  return cachedServer;
}

// Start for non-Vercel environments (like Docker/Railway)
if (!process.env.VERCEL) {
  bootstrap().catch((err) => {
    const logger = new Logger('Bootstrap');
    logger.error('Failed to start application', err);
    process.exit(1);
  });
}

// Export the handler for Vercel
export default async (req: any, res: any) => {
  const server = await bootstrap();
  return server(req, res);
};