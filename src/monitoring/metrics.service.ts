import { Injectable, Logger } from '@nestjs/common';
import { register, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  // HTTP Metrics
  private readonly httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
  });

  private readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.5, 1, 2, 5, 10],
  });

  // Database Metrics
  private readonly databaseConnectionsActive = new Gauge({
    name: 'database_connections_active',
    help: 'Number of active database connections',
    labelNames: ['database'],
  });

  private readonly databaseQueryDuration = new Histogram({
    name: 'database_query_duration_seconds',
    help: 'Duration of database queries in seconds',
    labelNames: ['database', 'operation'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  });

  // Application Metrics
  private readonly activeUsers = new Gauge({
    name: 'active_users_total',
    help: 'Number of currently active users',
  });

  private readonly deviceTelemetryReceived = new Counter({
    name: 'device_telemetry_received_total',
    help: 'Total number of telemetry messages received',
    labelNames: ['device_type'],
  });

  private readonly sosAlertsTriggered = new Counter({
    name: 'sos_alerts_triggered_total',
    help: 'Total number of SOS alerts triggered',
    labelNames: ['alert_type'],
  });

  private readonly notificationsSent = new Counter({
    name: 'notifications_sent_total',
    help: 'Total number of notifications sent',
    labelNames: ['type', 'status'],
  });

  private readonly medicationReminders = new Counter({
    name: 'medication_reminders_total',
    help: 'Total number of medication reminders sent',
    labelNames: ['status'],
  });

  // Media Metrics
  private readonly mediaUploads = new Counter({
    name: 'media_uploads_total',
    help: 'Total number of media files uploaded',
    labelNames: ['type', 'status'],
  });

  private readonly mediaStorageUsed = new Gauge({
    name: 'media_storage_used_bytes',
    help: 'Total storage used for media files in bytes',
    labelNames: ['user_id'],
  });

  // Authentication Metrics
  private readonly authenticationAttempts = new Counter({
    name: 'authentication_attempts_total',
    help: 'Total number of authentication attempts',
    labelNames: ['method', 'status'],
  });

  private readonly activeJwtTokens = new Gauge({
    name: 'active_jwt_tokens',
    help: 'Number of active JWT tokens',
  });

  constructor() {
    // Collect default Node.js metrics
    collectDefaultMetrics({ register });
    this.logger.log('Metrics service initialized with Prometheus collectors');
  }

  // HTTP Metrics Methods
  recordHttpRequest(method: string, route: string, statusCode: number, duration: number) {
    this.httpRequestsTotal.inc({ method, route, status_code: statusCode });
    this.httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
  }

  // Database Metrics Methods
  setDatabaseConnections(database: string, count: number) {
    this.databaseConnectionsActive.set({ database }, count);
  }

  recordDatabaseQuery(database: string, operation: string, duration: number) {
    this.databaseQueryDuration.observe({ database, operation }, duration);
  }

  // Application Metrics Methods
  setActiveUsers(count: number) {
    this.activeUsers.set(count);
  }

  recordDeviceTelemetry(deviceType: string) {
    this.deviceTelemetryReceived.inc({ device_type: deviceType });
  }

  recordSOSAlert(alertType: string) {
    this.sosAlertsTriggered.inc({ alert_type: alertType });
  }

  recordNotificationSent(type: string, status: string) {
    this.notificationsSent.inc({ type, status });
  }

  recordMedicationReminder(status: string) {
    this.medicationReminders.inc({ status });
  }

  // Media Metrics Methods
  recordMediaUpload(type: string, status: string) {
    this.mediaUploads.inc({ type, status });
  }

  setMediaStorageUsed(userId: string, bytes: number) {
    this.mediaStorageUsed.set({ user_id: userId }, bytes);
  }

  // Authentication Metrics Methods
  recordAuthenticationAttempt(method: string, status: string) {
    this.authenticationAttempts.inc({ method, status });
  }

  setActiveJwtTokens(count: number) {
    this.activeJwtTokens.set(count);
  }

  // Get metrics for Prometheus scraping
  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  // Get metrics as JSON for internal use
  async getMetricsJson(): Promise<any> {
    const metrics = await register.getMetricsAsJSON();
    return metrics;
  }

  // Reset all metrics (useful for testing)
  resetMetrics() {
    register.resetMetrics();
    this.logger.log('All metrics have been reset');
  }

  // Custom business metrics
  async getBusinessMetrics(): Promise<any> {
    const metrics = await this.getMetricsJson();
    
    // Extract business-relevant metrics
    const businessMetrics = {
      users: {
        active: this.getMetricValue(metrics, 'active_users_total'),
        authenticationAttempts: this.getMetricValue(metrics, 'authentication_attempts_total'),
      },
      devices: {
        telemetryReceived: this.getMetricValue(metrics, 'device_telemetry_received_total'),
        sosAlerts: this.getMetricValue(metrics, 'sos_alerts_triggered_total'),
      },
      notifications: {
        sent: this.getMetricValue(metrics, 'notifications_sent_total'),
        medicationReminders: this.getMetricValue(metrics, 'medication_reminders_total'),
      },
      media: {
        uploads: this.getMetricValue(metrics, 'media_uploads_total'),
        storageUsed: this.getMetricValue(metrics, 'media_storage_used_bytes'),
      },
      system: {
        httpRequests: this.getMetricValue(metrics, 'http_requests_total'),
        databaseConnections: this.getMetricValue(metrics, 'database_connections_active'),
      },
    };

    return businessMetrics;
  }

  private getMetricValue(metrics: any[], metricName: string): any {
    const metric = metrics.find(m => m.name === metricName);
    if (!metric) return null;

    if (metric.type === 'counter' || metric.type === 'gauge') {
      return metric.values || [];
    } else if (metric.type === 'histogram') {
      return {
        buckets: metric.values?.filter((v: any) => v.metricName?.includes('_bucket')) || [],
        count: metric.values?.find((v: any) => v.metricName?.includes('_count'))?.value || 0,
        sum: metric.values?.find((v: any) => v.metricName?.includes('_sum'))?.value || 0,
      };
    }

    return metric.values || [];
  }

  // Health check for metrics system
  async isHealthy(): Promise<boolean> {
    try {
      await this.getMetrics();
      return true;
    } catch (error) {
      this.logger.error('Metrics system health check failed:', error);
      return false;
    }
  }
}
