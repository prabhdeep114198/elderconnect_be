import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/typeorm';
import { Connection } from 'typeorm';
import * as os from 'os';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectConnection('auth') private readonly authConnection: Connection,
    @InjectConnection('profile') private readonly profileConnection: Connection,
    @InjectConnection('vitals') private readonly vitalsConnection: Connection,
    @InjectConnection('media') private readonly mediaConnection: Connection,
    @InjectConnection('audit') private readonly auditConnection: Connection,
  ) {}

  async getHealthStatus() {
    const databases = await this.checkDatabases();
    const allHealthy = Object.values(databases).every(status => status === 'healthy');

    return {
      status: allHealthy ? 'healthy' : 'unhealthy',
      uptime: process.uptime(),
      environment: this.configService.get('app.environment'),
      version: process.env.npm_package_version || '1.0.0',
      databases,
    };
  }

  async getDetailedHealthStatus() {
    const [databases, system, memory] = await Promise.all([
      this.checkDatabases(),
      this.getSystemInfo(),
      this.getMemoryUsage(),
    ]);

    const allHealthy = Object.values(databases).every(status => status === 'healthy');

    return {
      status: allHealthy ? 'healthy' : 'unhealthy',
      uptime: process.uptime(),
      environment: this.configService.get('app.environment'),
      version: process.env.npm_package_version || '1.0.0',
      databases,
      system,
      memory,
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    };
  }

  async getMetrics() {
    const [databases, memory, system] = await Promise.all([
      this.getDatabaseMetrics(),
      this.getMemoryUsage(),
      this.getSystemInfo(),
    ]);

    return {
      databases,
      memory,
      system,
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        cpuUsage: process.cpuUsage(),
        memoryUsage: process.memoryUsage(),
      },
    };
  }

  private async checkDatabases() {
    const connections = {
      auth: this.authConnection,
      profile: this.profileConnection,
      vitals: this.vitalsConnection,
      media: this.mediaConnection,
      audit: this.auditConnection,
    };

    const results: Record<string, string> = {};

    for (const [name, connection] of Object.entries(connections)) {
      try {
        await connection.query('SELECT 1');
        results[name] = 'healthy';
      } catch (error) {
        this.logger.error(`Database ${name} health check failed:`, error);
        results[name] = 'unhealthy';
      }
    }

    return results;
  }

  private async getDatabaseMetrics() {
    const connections = {
      auth: this.authConnection,
      profile: this.profileConnection,
      vitals: this.vitalsConnection,
      media: this.mediaConnection,
      audit: this.auditConnection,
    };

    const metrics: Record<string, any> = {};

    for (const [name, connection] of Object.entries(connections)) {
      try {
        // Get connection pool stats
        const driver = connection.driver as any;
        const pool = driver.master || driver.pool;

        metrics[name] = {
          isConnected: connection.isConnected,
          totalConnections: pool?.totalCount || 0,
          idleConnections: pool?.idleCount || 0,
          waitingClients: pool?.waitingCount || 0,
        };

        // Get database size (PostgreSQL specific)
        if (connection.options.type === 'postgres') {
          const sizeResult = await connection.query(`
            SELECT pg_size_pretty(pg_database_size(current_database())) as size
          `);
          metrics[name].size = sizeResult[0]?.size || 'unknown';
        }
      } catch (error) {
        this.logger.error(`Failed to get metrics for ${name}:`, error);
        metrics[name] = { error: 'Failed to retrieve metrics' };
      }
    }

    return metrics;
  }

  private getMemoryUsage() {
    const usage = process.memoryUsage();
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;

    return {
      process: {
        rss: this.formatBytes(usage.rss),
        heapTotal: this.formatBytes(usage.heapTotal),
        heapUsed: this.formatBytes(usage.heapUsed),
        external: this.formatBytes(usage.external),
        arrayBuffers: this.formatBytes(usage.arrayBuffers || 0),
      },
      system: {
        total: this.formatBytes(total),
        free: this.formatBytes(free),
        used: this.formatBytes(used),
        usagePercentage: Math.round((used / total) * 100),
      },
    };
  }

  private getSystemInfo() {
    const loadAvg = os.loadavg();
    const cpus = os.cpus();

    return {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cpus: cpus.length,
      loadAverage: {
        '1m': loadAvg[0].toFixed(2),
        '5m': loadAvg[1].toFixed(2),
        '15m': loadAvg[2].toFixed(2),
      },
      uptime: os.uptime(),
    };
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${Math.round(size * 100) / 100} ${units[unitIndex]}`;
  }
}
