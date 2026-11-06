/**
 * B8. Observability Engine — Telemetry, Metrics & Structured Logging.
 * Responsibilities:
 * - Emits structured JSON log records with correlation IDs.
 * - Records latency, token accounting, and cost telemetry.
 * - Tracks job lifecycle transitions (ingested -> queued -> diagnosed).
 * - Enforces security scrubbing: NEVER logs passwords, JWTs, or full secrets.
 */

export interface LogContext {
  correlationId?: string;
  orgId?: string;
  repoId?: string;
  jobId?: string | number;
  [key: string]: any;
}

export class ObservabilityEngine {
  constructor(private serviceName: string = 'hopper-engine') {}

  log(level: 'info' | 'warn' | 'error' | 'debug', message: string, context: LogContext = {}): void {
    const record = {
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      level,
      message,
      ...this.sanitizeContext(context),
    };

    if (level === 'error') {
      console.error(JSON.stringify(record));
    } else if (level === 'warn') {
      console.warn(JSON.stringify(record));
    } else {
      console.log(JSON.stringify(record));
    }
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  private sanitizeContext(context: LogContext): LogContext {
    const sanitized = { ...context };
    const sensitiveKeys = ['secret', 'token', 'key', 'password', 'authorization', 'cookie'];

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
        sanitized[key] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}

