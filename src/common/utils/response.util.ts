export class ResponseUtil {
  static success<T>(message: string, data: T) {
    return {
      message,
      data,
    };
  }

  static error(message: string, errors: any = null) {
    return {
      message,
      errors,
    };
  }
}