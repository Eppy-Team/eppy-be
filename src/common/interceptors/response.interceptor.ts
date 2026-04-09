import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, any>
{
  intercept(context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      map((response) => {
        if (
          response &&
          typeof response === 'object' &&
          'message' in response &&
          'data' in response
        ) {
          return {
            status: 'success',
            message: response.message,
            data: response.data,
          };
        }

        return {
          status: 'success',
          message: 'Request successful',
          data: response,
        };
      }),
    );
  }
}