import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai.service';

/**
 * AI Module
 * * An infrastructure-level module that encapsulates integration with external 
 * AI microservices. It provides a resilient abstraction layer for RAG operations, 
 * high-dimensional embedding generation, and vector search orchestration.
 *
 * @remarks
 * Cross-Module Integration:
 * - KnowledgeModule: Uses this module for asynchronous document vectorization.
 * - ChatModule: Uses this module for context-aware RAG (Retrieval-Augmented Generation) inference.
 *
 * Configuration Requirement:
 * Requires AI_SERVICE_URL, AI_SERVICE_TIMEOUT_MS, and AI_SERVICE_MOCK to be 
 * defined in the environment via ConfigModule.
 */
@Module({
  imports: [ConfigModule],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}