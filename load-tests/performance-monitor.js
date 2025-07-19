import { performance } from "perf_hooks";
import os from "os";

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      memory: [],
      cpu: [],
      responseTimes: [],
      errors: [],
      requests: 0,
    };
    this.startTime = Date.now();
    this.monitoring = false;
  }

  startMonitoring() {
    this.monitoring = true;
    this.monitorInterval = setInterval(() => {
      this.captureMetrics();
    }, 1000); // Capture metrics every second

    console.log("📊 Performance monitoring started...");
  }

  stopMonitoring() {
    this.monitoring = false;
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
    console.log("📊 Performance monitoring stopped.");
  }

  captureMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const loadAvg = os.loadavg();

    this.metrics.memory.push({
      timestamp: Date.now(),
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
    });

    this.metrics.cpu.push({
      timestamp: Date.now(),
      user: cpuUsage.user,
      system: cpuUsage.system,
      loadAverage: loadAvg,
    });
  }

  recordRequest(responseTime, success = true, error = null) {
    this.metrics.requests++;
    this.metrics.responseTimes.push({
      timestamp: Date.now(),
      responseTime,
      success,
    });

    if (!success) {
      this.metrics.errors.push({
        timestamp: Date.now(),
        error: error?.message || "Unknown error",
      });
    }
  }

  getCurrentStats() {
    const currentMemory = this.metrics.memory[this.metrics.memory.length - 1];
    const currentCpu = this.metrics.cpu[this.metrics.cpu.length - 1];

    return {
      memory: {
        rss: currentMemory?.rss || 0,
        heapUsed: currentMemory?.heapUsed || 0,
        heapTotal: currentMemory?.heapTotal || 0,
        external: currentMemory?.external || 0,
      },
      cpu: {
        user: currentCpu?.user || 0,
        system: currentCpu?.system || 0,
        loadAverage: currentCpu?.loadAverage || [0, 0, 0],
      },
      requests: this.metrics.requests,
      avgResponseTime: this.getAverageResponseTime(),
      errorRate: this.getErrorRate(),
    };
  }

  getAverageResponseTime() {
    if (this.metrics.responseTimes.length === 0) return 0;

    const total = this.metrics.responseTimes.reduce(
      (sum, req) => sum + req.responseTime,
      0
    );
    return total / this.metrics.responseTimes.length;
  }

  getErrorRate() {
    if (this.metrics.responseTimes.length === 0) return 0;

    const errors = this.metrics.responseTimes.filter(
      (req) => !req.success
    ).length;
    return (errors / this.metrics.responseTimes.length) * 100;
  }

  getMemoryTrend() {
    if (this.metrics.memory.length < 2) return "stable";

    const recent = this.metrics.memory.slice(-10);
    const first = recent[0];
    const last = recent[recent.length - 1];

    const growth = ((last.heapUsed - first.heapUsed) / first.heapUsed) * 100;

    if (growth > 10) return "increasing";
    if (growth < -10) return "decreasing";
    return "stable";
  }

  generateReport() {
    const duration = (Date.now() - this.startTime) / 1000;
    const avgResponseTime = this.getAverageResponseTime();
    const errorRate = this.getErrorRate();
    const memoryTrend = this.getMemoryTrend();

    const currentMemory = this.metrics.memory[this.metrics.memory.length - 1];
    const currentCpu = this.metrics.cpu[this.metrics.cpu.length - 1];

    console.log("\n📊 PERFORMANCE MONITORING REPORT");
    console.log("==================================");
    console.log(`Test Duration: ${duration.toFixed(2)}s`);
    console.log(`Total Requests: ${this.metrics.requests}`);
    console.log(
      `Requests/Second: ${(this.metrics.requests / duration).toFixed(2)}`
    );
    console.log(`Average Response Time: ${avgResponseTime.toFixed(2)}ms`);
    console.log(`Error Rate: ${errorRate.toFixed(2)}%`);

    console.log("\n💾 MEMORY USAGE:");
    console.log(`RSS: ${(currentMemory?.rss / 1024 / 1024).toFixed(2)} MB`);
    console.log(
      `Heap Used: ${(currentMemory?.heapUsed / 1024 / 1024).toFixed(2)} MB`
    );
    console.log(
      `Heap Total: ${(currentMemory?.heapTotal / 1024 / 1024).toFixed(2)} MB`
    );
    console.log(
      `External: ${(currentMemory?.external / 1024 / 1024).toFixed(2)} MB`
    );
    console.log(`Memory Trend: ${memoryTrend}`);

    console.log("\n🖥️  CPU USAGE:");
    console.log(`User CPU: ${(currentCpu?.user / 1000000).toFixed(2)}s`);
    console.log(`System CPU: ${(currentCpu?.system / 1000000).toFixed(2)}s`);
    console.log(
      `Load Average: ${currentCpu?.loadAverage.map((l) => l.toFixed(2)).join(", ")}`
    );

    // Performance recommendations
    console.log("\n💡 PERFORMANCE RECOMMENDATIONS:");

    if (avgResponseTime > 500) {
      console.log(
        "⚠️  Response times are high - consider optimizing database queries"
      );
    }

    if (errorRate > 5) {
      console.log("⚠️  Error rate is high - investigate application errors");
    }

    if (memoryTrend === "increasing") {
      console.log("⚠️  Memory usage is increasing - check for memory leaks");
    }

    if (currentMemory?.heapUsed / currentMemory?.heapTotal > 0.8) {
      console.log(
        "⚠️  High heap usage - consider increasing Node.js memory limit"
      );
    }

    if (currentCpu?.loadAverage[0] > os.cpus().length) {
      console.log("⚠️  High system load - consider scaling horizontally");
    }

    return {
      duration,
      requests: this.metrics.requests,
      avgResponseTime,
      errorRate,
      memory: currentMemory,
      cpu: currentCpu,
      memoryTrend,
    };
  }

  // Real-time monitoring display
  startRealTimeDisplay() {
    this.displayInterval = setInterval(() => {
      const stats = this.getCurrentStats();
      const duration = (Date.now() - this.startTime) / 1000;

      process.stdout.write("\x1B[2J\x1B[0f"); // Clear screen
      console.log("📊 REAL-TIME PERFORMANCE MONITORING");
      console.log("====================================");
      console.log(
        `Duration: ${duration.toFixed(1)}s | Requests: ${stats.requests} | RPS: ${(stats.requests / duration).toFixed(1)}`
      );
      console.log(
        `Avg Response: ${stats.avgResponseTime.toFixed(1)}ms | Error Rate: ${stats.errorRate.toFixed(2)}%`
      );
      console.log(
        `Memory: ${(stats.memory.heapUsed / 1024 / 1024).toFixed(1)}MB | CPU Load: ${stats.cpu.loadAverage[0].toFixed(2)}`
      );
      console.log("Press Ctrl+C to stop monitoring...\n");
    }, 1000);
  }

  stopRealTimeDisplay() {
    if (this.displayInterval) {
      clearInterval(this.displayInterval);
    }
  }
}

// Export for use in other tests
export { PerformanceMonitor };

// Example usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const monitor = new PerformanceMonitor();
  monitor.startMonitoring();
  monitor.startRealTimeDisplay();

  // Stop after 30 seconds
  setTimeout(() => {
    monitor.stopMonitoring();
    monitor.stopRealTimeDisplay();
    monitor.generateReport();
    process.exit(0);
  }, 30000);
}
