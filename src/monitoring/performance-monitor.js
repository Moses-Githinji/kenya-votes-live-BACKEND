import { performance } from "perf_hooks";
import os from "os";
import { PrismaClient } from "@prisma/client";
import logger from "../utils/logger.js";

const prisma = new PrismaClient();

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      cpu: [],
      memory: [],
      responseTimes: [],
      databaseQueries: [],
      errors: [],
      requests: [],
    };

    this.startTime = Date.now();
    this.requestCount = 0;
    this.errorCount = 0;
    this.dbQueryCount = 0;
    this.totalResponseTime = 0;

    // Start monitoring
    this.startSystemMonitoring();
    this.startDatabaseMonitoring();
  }

  // System resource monitoring
  startSystemMonitoring() {
    setInterval(() => {
      const cpuUsage = os.loadavg();
      const memoryUsage = {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        percentage: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100,
      };

      this.metrics.cpu.push({
        timestamp: Date.now(),
        load1: cpuUsage[0],
        load5: cpuUsage[1],
        load15: cpuUsage[2],
      });

      this.metrics.memory.push({
        timestamp: Date.now(),
        ...memoryUsage,
      });

      // Keep only last 1000 measurements
      if (this.metrics.cpu.length > 1000) {
        this.metrics.cpu.shift();
        this.metrics.memory.shift();
      }

      // Alert if thresholds exceeded
      this.checkThresholds(cpuUsage, memoryUsage);
    }, 5000); // Every 5 seconds
  }

  // Database performance monitoring
  startDatabaseMonitoring() {
    setInterval(async () => {
      try {
        const startTime = performance.now();

        // Test database connection and performance
        await prisma.$queryRaw`SELECT 1`;

        const endTime = performance.now();
        const queryTime = endTime - startTime;

        this.metrics.databaseQueries.push({
          timestamp: Date.now(),
          queryTime,
          connectionPool: await this.getConnectionPoolStatus(),
        });

        if (this.metrics.databaseQueries.length > 1000) {
          this.metrics.databaseQueries.shift();
        }

        // Alert if database is slow
        if (queryTime > 1000) {
          logger.warn(`Database query taking too long: ${queryTime}ms`);
        }
      } catch (error) {
        logger.error("Database monitoring error:", error);
        this.metrics.errors.push({
          timestamp: Date.now(),
          type: "database",
          error: error.message,
        });
      }
    }, 10000); // Every 10 seconds
  }

  // Track request performance
  trackRequest(req, res, next) {
    const startTime = performance.now();
    this.requestCount++;

    // Use res.on('finish') instead of overriding res.end
    res.on("finish", () => {
      const endTime = performance.now();
      const responseTime = endTime - startTime;

      this.totalResponseTime += responseTime;
      this.metrics.responseTimes.push({
        timestamp: Date.now(),
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        responseTime,
        userAgent: req.get("User-Agent"),
        ip: req.ip,
      });

      if (this.metrics.responseTimes.length > 10000) {
        this.metrics.responseTimes.shift();
      }

      // Track errors
      if (res.statusCode >= 400) {
        this.errorCount++;
        this.metrics.errors.push({
          timestamp: Date.now(),
          type: "http",
          statusCode: res.statusCode,
          url: req.url,
          method: req.method,
          ip: req.ip,
        });
      }

      // Alert if response time is too high
      if (responseTime > 5000) {
        logger.warn(
          `Slow response detected: ${responseTime}ms for ${req.method} ${req.url}`
        );
      }
    });

    next();
  }

  // Track database queries
  trackDatabaseQuery(query, duration) {
    this.dbQueryCount++;
    this.metrics.databaseQueries.push({
      timestamp: Date.now(),
      query: query.substring(0, 100), // Truncate long queries
      duration,
      type: "custom",
    });
  }

  // Check system thresholds
  checkThresholds(cpuUsage, memoryUsage) {
    // CPU threshold (load average > 80% of CPU cores)
    const cpuCores = os.cpus().length;
    if (cpuUsage[0] > cpuCores * 0.8) {
      logger.warn(
        `High CPU usage detected: ${cpuUsage[0]} (${cpuCores} cores)`
      );
    }

    // Memory threshold (> 90% usage)
    if (memoryUsage.percentage > 90) {
      logger.warn(
        `High memory usage detected: ${memoryUsage.percentage.toFixed(2)}%`
      );
    }
  }

  // Get connection pool status
  async getConnectionPoolStatus() {
    try {
      // This would need to be implemented based on your database setup
      // For PostgreSQL, you might query pg_stat_activity
      return {
        active: 0,
        idle: 0,
        total: 0,
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  // Get performance metrics
  getMetrics() {
    const uptime = Date.now() - this.startTime;
    const avgResponseTime =
      this.requestCount > 0 ? this.totalResponseTime / this.requestCount : 0;
    const errorRate =
      this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0;

    return {
      system: {
        uptime,
        requestCount: this.requestCount,
        errorCount: this.errorCount,
        errorRate: errorRate.toFixed(2) + "%",
        avgResponseTime: avgResponseTime.toFixed(2) + "ms",
        dbQueryCount: this.dbQueryCount,
      },
      current: {
        cpu: this.metrics.cpu[this.metrics.cpu.length - 1] || null,
        memory: this.metrics.memory[this.metrics.memory.length - 1] || null,
        database:
          this.metrics.databaseQueries[
            this.metrics.databaseQueries.length - 1
          ] || null,
      },
      recent: {
        responseTimes: this.metrics.responseTimes.slice(-100),
        errors: this.metrics.errors.slice(-50),
      },
      averages: {
        cpu: this.calculateAverage(this.metrics.cpu, "load1"),
        memory: this.calculateAverage(this.metrics.memory, "percentage"),
        responseTime: this.calculateAverage(
          this.metrics.responseTimes,
          "responseTime"
        ),
        dbQueryTime: this.calculateAverage(
          this.metrics.databaseQueries,
          "queryTime"
        ),
      },
    };
  }

  // Calculate average for a metric
  calculateAverage(array, field) {
    if (array.length === 0) return 0;
    const sum = array.reduce((acc, item) => acc + (item[field] || 0), 0);
    return (sum / array.length).toFixed(2);
  }

  // Get health status
  getHealthStatus() {
    const metrics = this.getMetrics();
    const cpuLoad = metrics.current.cpu?.load1 || 0;
    const memoryUsage = metrics.current.memory?.percentage || 0;
    const avgResponseTime = parseFloat(metrics.averages.responseTime) || 0;
    const errorRate = parseFloat(metrics.system.errorRate) || 0;

    const status = {
      overall: "healthy",
      checks: {
        cpu: cpuLoad < 2 ? "healthy" : "warning",
        memory: memoryUsage < 80 ? "healthy" : "warning",
        responseTime: avgResponseTime < 1000 ? "healthy" : "warning",
        errorRate: errorRate < 5 ? "healthy" : "critical",
        database: "healthy", // Would need actual DB health check
      },
    };

    // Determine overall status
    if (
      status.checks.errorRate === "critical" ||
      (status.checks.cpu === "warning" && status.checks.memory === "warning")
    ) {
      status.overall = "critical";
    } else if (
      Object.values(status.checks).some((check) => check === "warning")
    ) {
      status.overall = "warning";
    }

    return status;
  }

  // Export metrics for external monitoring
  exportMetrics() {
    return {
      timestamp: Date.now(),
      metrics: this.getMetrics(),
      health: this.getHealthStatus(),
    };
  }

  // Clear old metrics
  clearOldMetrics() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    this.metrics.responseTimes = this.metrics.responseTimes.filter(
      (m) => m.timestamp > oneHourAgo
    );
    this.metrics.errors = this.metrics.errors.filter(
      (m) => m.timestamp > oneHourAgo
    );
  }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

// Clear old metrics every hour
setInterval(
  () => {
    performanceMonitor.clearOldMetrics();
  },
  60 * 60 * 1000
);

export default performanceMonitor;
