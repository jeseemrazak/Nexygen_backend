import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // CORS_ORIGIN overrides this list (comma-separated) when set. Otherwise, only the deployed
  // dashboard and local dev ever need to call this API cross-origin — reflecting any origin
  // by default let any website's browser JS read your data using a visitor's own cookie/token.
  const defaultAllowedOrigins = [
    'http://187.127.117.99:3001',
    'https://187.127.117.99:3001',
    'http://localhost:3000',
    'http://localhost:3001',
  ];
  const corsOrigin = process.env.CORS_ORIGIN;
  app.enableCors({ origin: corsOrigin ? corsOrigin.split(',') : defaultAllowedOrigins });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Uploaded files (logos, delivery signatures) contain business data — require the same
  // valid session token every other route needs. `?token=` is accepted alongside the
  // Bearer header since plain <img>/<a> tags can't set an Authorization header.
  const jwtService = app.get(JwtService);
  app.use('/uploads', (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const token = bearer || (req.query?.token as string | undefined);
    if (!token) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    jwtService
      .verifyAsync(token)
      .then(() => next())
      .catch(() => res.status(401).json({ message: 'Unauthorized' }));
  });

  // 🔥 THE FIX: process.cwd() ensures it always finds the root uploads folder!
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3002;
  await app.listen(port);
}
bootstrap();