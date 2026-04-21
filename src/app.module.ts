import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AiModule } from './ai/ai.module';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        JWT_SECRET_KEY: Joi.string().required(),
        JWT_EXPIRES_IN: Joi.string().required(),
        DATABASE_URL: Joi.string().required(),
        AI_SERVICE_URL: Joi.string().uri().required(),
        AI_SERVICE_TIMEOUT_MS: Joi.number().default(30000),
      }),
    }),
    AuthModule,
    AiModule,
  ],
})
export class AppModule {}
