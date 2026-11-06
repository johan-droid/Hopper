import { Request, Response, NextFunction } from 'express';

export class ApiError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any;

  constructor(statusCode: number, code: string, message: string, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static badRequest(message: string = 'Bad Request', details?: any) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message: string = 'Unauthorized', details?: any) {
    return new ApiError(401, 'UNAUTHORIZED', message, details);
  }

  static forbidden(message: string = 'Forbidden', details?: any) {
    return new ApiError(403, 'FORBIDDEN', message, details);
  }

  static notFound(message: string = 'Resource Not Found', details?: any) {
    return new ApiError(404, 'NOT_FOUND', message, details);
  }

  static conflict(message: string = 'Resource Conflict', details?: any) {
    return new ApiError(409, 'CONFLICT', message, details);
  }

  static internal(message: string = 'Internal Server Error', details?: any) {
    return new ApiError(500, 'INTERNAL_SERVER_ERROR', message, details);
  }
}

/**
 * Global Standardized Error Handling Middleware.
 * Catches all thrown exceptions and formats a uniform JSON error response.
 */
export function errorHandlerMiddleware(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || err.status || 500;
  const code = err.code || (statusCode === 404 ? 'NOT_FOUND' : statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
  const message = err.message || 'An unexpected error occurred';
  const requestId = (res.getHeader('x-request-id') as string) || (req.headers['x-request-id'] as string) || 'unknown';

  if (statusCode >= 500) {
    console.error(`[Hopper Error] [${requestId}] ${req.method} ${req.path}:`, err.stack || err);
  }

  res.status(statusCode).json({
    success: false,
    status: 'error',
    error: {
      code,
      message,
      path: req.path,
      method: req.method,
      requestId,
      ...(err.details ? { details: err.details } : {}),
      ...(process.env.NODE_ENV === 'development' && statusCode >= 500 ? { stack: err.stack } : {}),
    },
  });
}

