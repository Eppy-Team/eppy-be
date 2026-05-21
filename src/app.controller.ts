import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';

@Controller({ version: VERSION_NEUTRAL })
export class AppController {
  @Get()
  healthCheck() {
    return {
      message: 'Eppy Backend Service is running',
      data: {
        status: 'ok',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
      },
    };
  }
}