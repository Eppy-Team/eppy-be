import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailService } from './mail.service';

/**
 * Mail Module
 * * Centralized email delivery layer powered by AWS SES.
 * Provides transactional email capabilities for system notifications and user communications.
 *
 * @remarks
 * Integration Points:
 * - Exports `MailService` for injection into dependent modules.
 * - Requires AWS credentials and configuration to be available via `ConfigModule`.
 * - Currently supports ticket response notifications; extensible for additional email types.
 *
 * Dependencies:
 * - `ConfigModule`: Provides environment variables for AWS authentication.
 * - `MailService`: Core email delivery implementation using AWS SES SDK.
 */
@Module({
  imports: [ConfigModule],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
