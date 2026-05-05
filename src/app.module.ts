import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AiModule } from './ai/ai.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { ConversationModule } from './conversation/conversation.module';
import { ChatModule } from './chat/chat.module';
import { TicketModule } from './ticket/ticket.module';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        // Database
        DATABASE_URL: Joi.string().required(),

        // JWT
        JWT_SECRET_KEY: Joi.string().required(),
        JWT_EXPIRES_IN: Joi.string().required(),

        // AI Service
        AI_SERVICE_URL: Joi.string().uri().required(),
        AI_SERVICE_TIMEOUT_MS: Joi.number().default(30000),

        // Storage
        STORAGE_TYPE: Joi.string().valid('s3').default('s3'),
        AWS_S3_BUCKET_NAME: Joi.string().required(),
        AWS_REGION: Joi.string().required(),
        AWS_ACCESS_KEY_ID: Joi.string().required(),
        AWS_SECRET_ACCESS_KEY: Joi.string().required(),
      }),
    }),
    AuthModule,
    AiModule,
    KnowledgeModule,
    ConversationModule,
    ChatModule,
    TicketModule,
  ],
})
export class AppModule {}
