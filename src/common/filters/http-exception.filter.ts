import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let statusCode = 500;
    let message = 'Internal server error';
    let errors: any = [];

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else {
        const r = res as any;

        if (Array.isArray(r.message)) {
          message = 'Validation failed';
          errors = r.message;
        } else {
          message = r.message || message;
          errors = r.errors || [];
        }
      }
    }

    this.logger.error(
      `${request.method} ${request.url} ${statusCode}`,
      exception instanceof Error ? exception.stack : JSON.stringify(exception),
    );
    
    response.status(statusCode).json({
      status: 'error',
      message,
      errors,
    });
  }
}