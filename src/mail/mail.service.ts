import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { ticketResponseTemplate } from './templates/ticket-response.template';
import { resetPasswordTemplate } from './templates/reset-password.template';

/**
 * Mail Service
 * * Transactional email delivery layer using AWS Simple Email Service (SES).
 * Handles all outbound email communications with built-in error recovery and logging.
 *
 * @remarks
 * Operational Characteristics:
 * - Lazy Initialization: SES client is created during module initialization via `OnModuleInit`.
 * - Error Resilience: Failed email sends do not block upstream operations; logged for monitoring.
 * - Sender Identity: Emails are sent from a verified AWS SES sender address.
 * - Template System: Supports HTML email templates for consistent brand presentation.
 *
 * Security Considerations:
 * - AWS credentials are sourced from environment variables and validated at startup.
 * - Email addresses are user-provided and should be validated before processing.
 * - Sensitive ticket data is included in email HTML; ensure HTTPS and proper access controls.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private sesClient!: SESClient;
  private readonly fromEmail = 'eppychatbot@gmail.com';

  constructor(private readonly configService: ConfigService) {}

  /**
   * Initialize AWS SES client with credentials from environment configuration.
   * * Called automatically by NestJS module lifecycle after dependency injection.
   *
   * @remarks
   * Lifecycle Binding:
   * - Executes once per application startup.
   * - Validates AWS credentials availability before creating the SES client.
   * - Logs successful initialization for monitoring and troubleshooting.
   *
   * @throws {Error} If required AWS environment variables are missing or invalid.
   * @security Reads sensitive credentials; ensure process.env is properly guarded.
   */
  onModuleInit() {
    this.sesClient = new SESClient({
      region: this.configService.getOrThrow<string>('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow<string>(
          'AWS_SECRET_ACCESS_KEY',
        ),
      },
    });

    this.logger.log(`MailService ready — sender: ${this.fromEmail}`);
  }

  /**
   * Send ticket response notification email to user.
   * * Notifies a user that their support ticket has received an administrative response.
   *
   * @param data - Email content and recipient information.
   * @param data.toEmail - Recipient email address.
   * @param data.userName - Name of the user for personalization.
   * @param data.ticketId - Unique ticket identifier for reference.
   * @param data.ticketTitle - Original ticket subject line.
   * @param data.ticketStatus - Current workflow status of the ticket.
   * @param data.adminResponse - Administrator's resolution message.
   *
   * @returns Promise that resolves when email is sent or error is caught.
   *
   * @remarks
   * Error Handling:
   * - Failed sends are caught and logged; never throws to prevent blocking caller.
   * - Use logs to identify delivery issues without impacting ticket workflow.
   * - Transient SES failures (rate limits) are expected and logged for monitoring.
   *
   * @security
   * - Email content includes ticket details; verify recipient owns the ticket before calling.
   * - HTML template is pre-rendered; output is trusted and safe from injection.
   */
  async sendTicketResponseNotification(data: {
    toEmail: string;
    userName: string;
    ticketId: string;
    ticketTitle: string;
    ticketStatus: string;
    adminResponse: string;
  }): Promise<void> {
    const html = ticketResponseTemplate({
      userName: data.userName,
      ticketTitle: data.ticketTitle,
      ticketStatus: data.ticketStatus,
      adminResponse: data.adminResponse,
      ticketId: data.ticketId,
    });

    try {
      await this.sesClient.send(
        new SendEmailCommand({
          Source: `Eppy Helpdesk <${this.fromEmail}>`,
          Destination: {
            ToAddresses: [data.toEmail],
          },
          Message: {
            Subject: {
              Data: `[Eppy] Tiket Anda Telah Mendapat Respons — ${data.ticketTitle}`,
              Charset: 'UTF-8',
            },
            Body: {
              Html: {
                Data: html,
                Charset: 'UTF-8',
              },
            },
          },
        }),
      );

      this.logger.log(
        `[sendTicketResponseNotification] email sent to ${data.toEmail} for ticket ${data.ticketId}`,
      );
    } catch (error) {
      // Tidak throw — gagal kirim email tidak boleh gagalkan response admin
      this.logger.error(
        `[sendTicketResponseNotification] failed to send email to ${data.toEmail} for ticket ${data.ticketId}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async sendPasswordResetEmail(data: {
    toEmail: string;
    userName: string;
    resetUrl: string;
    expiresInMinutes: number;
  }): Promise<void> {
    const html = resetPasswordTemplate({
      userName: data.userName,
      resetUrl: data.resetUrl,
      expiresInMinutes: data.expiresInMinutes,
    });
 
    await this.send({
      toEmail: data.toEmail,
      subject: '[Eppy] Password Reset Request',
      html,
      context: `password reset for ${data.toEmail}`,
    });
  }

  private async send(data: {
    toEmail: string;
    subject: string;
    html: string;
    context: string;
  }): Promise<void> {
    try {
      await this.sesClient.send(
        new SendEmailCommand({
          Source: `Eppy Helpdesk <${this.fromEmail}>`,
          Destination: { ToAddresses: [data.toEmail] },
          Message: {
            Subject: { Data: data.subject, Charset: 'UTF-8' },
            Body: { Html: { Data: data.html, Charset: 'UTF-8' } },
          },
        }),
      );
      this.logger.log(`[send] email sent to ${data.toEmail} — ${data.context}`);
    } catch (error) {
      this.logger.error(
        `[send] failed to send email to ${data.toEmail} — ${data.context}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
