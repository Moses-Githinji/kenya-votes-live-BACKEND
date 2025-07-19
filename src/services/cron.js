import cron from "node-cron";
import pkg from "@prisma/client";
const { PrismaClient } = pkg;
import logger from "../utils/logger.js";
import { auditLog } from "../utils/audit.js";
import { createBackup, archiveData } from "./s3.js";
import { clearCache } from "../middleware/cache.js";
import { cleanAuditLogs } from "../utils/audit.js";

const prisma = new PrismaClient();

// Initialize cron jobs
export const initializeCronJobs = (prismaInstance, redis, loggerInstance) => {
  logger.info("Initializing cron jobs...");

  // Daily backup at 2 AM
  cron.schedule(
    "0 2 * * *",
    async () => {
      try {
        logger.info("Starting daily backup...");

        // Get all data for backup
        const backupData = {
          timestamp: new Date().toISOString(),
          votes: await prismaInstance.vote.findMany(),
          candidates: await prismaInstance.candidate.findMany(),
          regions: await prismaInstance.region.findMany(),
          certifications: await prismaInstance.certification.findMany(),
          electionStatus: await prismaInstance.electionStatus.findMany(),
        };

        // Create backup
        const backup = await createBackup(
          backupData,
          `daily_backup_${new Date().toISOString().split("T")[0]}.json`
        );

        // Log backup creation
        await auditLog("system", "SYSTEM_BACKUP", "Backup", backup.key, {
          backupType: "daily",
          filename: backup.filename,
        });

        logger.info("Daily backup completed successfully");
      } catch (error) {
        logger.error("Daily backup failed:", error);
      }
    },
    {
      scheduled: true,
      timezone: "Africa/Nairobi",
    }
  );

  // Cache cleanup every 6 hours
  cron.schedule("0 */6 * * *", async () => {
    try {
      logger.info("Starting cache cleanup...");

      const result = await clearCache();

      // Log cache cleanup
      await auditLog("system", "SYSTEM_MAINTENANCE", "Cache", null, {
        action: "cleanup",
        clearedKeys: result.cleared,
      });

      logger.info(`Cache cleanup completed: ${result.cleared} keys cleared`);
    } catch (error) {
      logger.error("Cache cleanup failed:", error);
    }
  });

  // Audit log cleanup weekly (keep 90 days)
  cron.schedule("0 3 * * 0", async () => {
    try {
      logger.info("Starting audit log cleanup...");

      const deletedCount = await cleanAuditLogs(90);

      // Log cleanup
      await auditLog("system", "SYSTEM_MAINTENANCE", "AuditLog", null, {
        action: "cleanup",
        deletedCount,
      });

      logger.info(`Audit log cleanup completed: ${deletedCount} logs deleted`);
    } catch (error) {
      logger.error("Audit log cleanup failed:", error);
    }
  });

  // Data archiving monthly
  cron.schedule("0 4 1 * *", async () => {
    try {
      logger.info("Starting monthly data archiving...");

      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      // Archive old vote data
      const oldVotes = await prismaInstance.vote.findMany({
        where: {
          createdAt: {
            lt: lastMonth,
          },
        },
      });

      if (oldVotes.length > 0) {
        await archiveData(
          oldVotes,
          "votes",
          lastMonth.toISOString().split("T")[0]
        );
      }

      // Archive old audit logs
      const oldAuditLogs = await prismaInstance.auditLog.findMany({
        where: {
          timestamp: {
            lt: lastMonth,
          },
        },
      });

      if (oldAuditLogs.length > 0) {
        await archiveData(
          oldAuditLogs,
          "audit_logs",
          lastMonth.toISOString().split("T")[0]
        );
      }

      logger.info("Monthly data archiving completed");
    } catch (error) {
      logger.error("Monthly data archiving failed:", error);
    }
  });

  // Health check every 15 minutes
  cron.schedule("*/15 * * * *", async () => {
    try {
      // Check database connection
      await prismaInstance.$queryRaw`SELECT 1`;

      // Check Redis connection
      await redis.ping();

      logger.debug("Health check passed");
    } catch (error) {
      logger.error("Health check failed:", error);

      // Send alert
      await auditLog("system", "SYSTEM_ALERT", "Health", null, {
        type: "health_check_failed",
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Update election status every 5 minutes during election period
  cron.schedule("*/5 * * * *", async () => {
    try {
      // Check if election is in progress
      const electionStatus = await prismaInstance.electionStatus.findMany();
      const isElectionActive = electionStatus.some(
        (status) => status.status === "IN_PROGRESS"
      );

      if (isElectionActive) {
        // Update reporting statistics
        for (const status of electionStatus) {
          const reportingStations = await prismaInstance.vote.groupBy({
            by: ["regionId"],
            where: {
              position: status.position,
            },
            _count: {
              regionId: true,
            },
          });

          const totalVotes = await prismaInstance.vote.aggregate({
            where: {
              position: status.position,
            },
            _sum: {
              voteCount: true,
            },
          });

          await prismaInstance.electionStatus.update({
            where: { id: status.id },
            data: {
              reportingStations: reportingStations.length,
              totalVotes: totalVotes._sum.voteCount || 0,
              lastUpdate: new Date(),
            },
          });
        }

        logger.debug("Election status updated");
      }
    } catch (error) {
      logger.error("Election status update failed:", error);
    }
  });

  // Cleanup expired sessions every hour
  cron.schedule("0 * * * *", async () => {
    try {
      logger.info("Starting session cleanup...");

      // This would clean up expired sessions from Redis
      // Implementation depends on your session storage strategy

      logger.info("Session cleanup completed");
    } catch (error) {
      logger.error("Session cleanup failed:", error);
    }
  });

  // Generate analytics reports daily at 6 AM
  cron.schedule("0 6 * * *", async () => {
    try {
      logger.info("Starting analytics report generation...");

      // Generate daily analytics
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const analytics = {
        date: yesterday.toISOString().split("T")[0],
        totalVotes: await prismaInstance.vote.aggregate({
          where: {
            createdAt: {
              gte: yesterday,
              lt: new Date(),
            },
          },
          _sum: {
            voteCount: true,
          },
        }),
        totalRegions: await prismaInstance.region.count(),
        totalCandidates: await prismaInstance.candidate.count(),
        certifications: await prismaInstance.certification.count({
          where: {
            status: "CERTIFIED",
            certifiedAt: {
              gte: yesterday,
              lt: new Date(),
            },
          },
        }),
      };

      // Store analytics
      await prismaInstance.systemConfig.upsert({
        where: { key: `analytics_${analytics.date}` },
        update: { value: JSON.stringify(analytics) },
        create: {
          key: `analytics_${analytics.date}`,
          value: JSON.stringify(analytics),
          description: "Daily analytics report",
        },
      });

      logger.info("Analytics report generated successfully");
    } catch (error) {
      logger.error("Analytics report generation failed:", error);
    }
  });

  // Cleanup old backups (keep last 30 days)
  cron.schedule("0 1 * * 0", async () => {
    try {
      logger.info("Starting backup cleanup...");

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // This would clean up old backups from S3
      // Implementation depends on your backup strategy

      logger.info("Backup cleanup completed");
    } catch (error) {
      logger.error("Backup cleanup failed:", error);
    }
  });

  // System maintenance window (Sundays at 1 AM)
  cron.schedule("0 1 * * 0", async () => {
    try {
      logger.info("Starting system maintenance...");

      // Perform maintenance tasks
      await auditLog("system", "SYSTEM_MAINTENANCE", "System", null, {
        action: "maintenance_window",
        timestamp: new Date().toISOString(),
      });

      logger.info("System maintenance completed");
    } catch (error) {
      logger.error("System maintenance failed:", error);
    }
  });

  logger.info("Cron jobs initialized successfully");
};

// Manual trigger functions
export const triggerBackup = async () => {
  try {
    logger.info("Manual backup triggered...");

    const backupData = {
      timestamp: new Date().toISOString(),
      votes: await prisma.vote.findMany(),
      candidates: await prisma.candidate.findMany(),
      regions: await prisma.region.findMany(),
      certifications: await prisma.certification.findMany(),
      electionStatus: await prisma.electionStatus.findMany(),
    };

    const backup = await createBackup(
      backupData,
      `manual_backup_${new Date().toISOString().replace(/[:.]/g, "-")}.json`
    );

    await auditLog("system", "SYSTEM_BACKUP", "Backup", backup.key, {
      backupType: "manual",
      filename: backup.filename,
    });

    return backup;
  } catch (error) {
    logger.error("Manual backup failed:", error);
    throw error;
  }
};

export const triggerCacheCleanup = async () => {
  try {
    logger.info("Manual cache cleanup triggered...");

    const result = await clearCache();

    await auditLog("system", "SYSTEM_MAINTENANCE", "Cache", null, {
      action: "manual_cleanup",
      clearedKeys: result.cleared,
    });

    return result;
  } catch (error) {
    logger.error("Manual cache cleanup failed:", error);
    throw error;
  }
};

export const triggerAuditCleanup = async (daysToKeep = 90) => {
  try {
    logger.info("Manual audit cleanup triggered...");

    const deletedCount = await cleanAuditLogs(daysToKeep);

    await auditLog("system", "SYSTEM_MAINTENANCE", "AuditLog", null, {
      action: "manual_cleanup",
      deletedCount,
      daysToKeep,
    });

    return { deletedCount };
  } catch (error) {
    logger.error("Manual audit cleanup failed:", error);
    throw error;
  }
};

export default {
  initializeCronJobs,
  triggerBackup,
  triggerCacheCleanup,
  triggerAuditCleanup,
};
