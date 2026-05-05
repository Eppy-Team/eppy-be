import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { ticketResponseTemplate } from './templates/ticket-response.template';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private sesClient!: SESClient;
  private readonly fromEmail = 'eppychatbot@gmail.com';

  constructor(private readonly configService: ConfigService) {}

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
}
