import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: (process.env.WITNESS_ORIGINS ?? 'http://localhost:3000,http://localhost:3001').split(',') });
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
