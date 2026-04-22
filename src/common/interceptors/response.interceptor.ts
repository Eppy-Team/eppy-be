import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, any> {
  intercept(context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      map((response) => {
        const message = response?.message || 'Request successful';
        let data = response;

        if (response && typeof response === 'object') {
          if ('data' in response) {
            data = response.data;
          } else if (
            'message' in response &&
            Object.keys(response).length === 1
          ) {
            data = null;
          } else if ('message' in response) {
            const { message: _, ...rest } = response;
            data = Object.keys(rest).length > 0 ? rest : null;
          }
        }

        return {
          status: 'success',
          message: message,
          data: data,
          meta: response?.meta ?? undefined,
        };
      }),
    );
  }
}
