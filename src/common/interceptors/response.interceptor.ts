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
        return {
          status: 'success',
          message: response?.message || 'Request successful',
          data: response?.data ?? response,
          meta: response?.meta ?? undefined,
        };
      }),
    );
  }
}