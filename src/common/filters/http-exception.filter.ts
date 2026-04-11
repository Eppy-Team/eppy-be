import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

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

    response.status(statusCode).json({
      status: 'error',
      message,
      errors,
    });
  }
}