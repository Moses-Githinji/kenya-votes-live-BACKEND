import pkg from "@prisma/client";
const { PrismaClient } = pkg;
import logger from "./logger.js";
import { generateAuditChecksum } from "./checksum.js";

const prisma = new PrismaClient();

// Audit log levels
export const AUDIT_LEVELS = {
  INFO: "INFO",
  WARNING: "WARNING",
  ERROR: "ERROR",
  CRITICAL: "CRITICAL",
};

// Audit actions
export const AUDIT_ACTIONS = {
  // User management
  USER_LOGIN: "USER_LOGIN",
  USER_LOGOUT: "USER_LOGOUT",
  USER_CREATE: "USER_CREATE",
  USER_UPDATE: "USER_UPDATE",
  USER_DELETE: "USER_DELETE",
  USER_ROLE_CHANGE: "USER_ROLE_CHANGE",

  // Vote management
  VOTE_CREATE: "VOTE_CREATE",
  VOTE_UPDATE: "VOTE_UPDATE",
  VOTE_DELETE: "VOTE_DELETE",
  VOTE_VERIFY: "VOTE_VERIFY",
  VOTE_CORRECT: "VOTE_CORRECT",

  // Candidate management
  CANDIDATE_CREATE: "CANDIDATE_CREATE",
  CANDIDATE_UPDATE: "CANDIDATE_UPDATE",
  CANDIDATE_DELETE: "CANDIDATE_DELETE",

  // Certification
  RESULTS_CERTIFY: "RESULTS_CERTIFY",
  RESULTS_DISPUTE: "RESULTS_DISPUTE",
  RESULTS_UNCERTIFY: "RESULTS_UNCERTIFY",

  // Data management
  DATA_EXPORT: "DATA_EXPORT",
  DATA_IMPORT: "DATA_IMPORT",
  DATA_BACKUP: "DATA_BACKUP",
  DATA_RESTORE: "DATA_RESTORE",

  // System management
  SYSTEM_CONFIG_UPDATE: "SYSTEM_CONFIG_UPDATE",
  SYSTEM_MAINTENANCE: "SYSTEM_MAINTENANCE",
  SYSTEM_BACKUP: "SYSTEM_BACKUP",

  // Security events
  SECURITY_LOGIN_FAILED: "SECURITY_LOGIN_FAILED",
  SECURITY_ACCESS_DENIED: "SECURITY_ACCESS_DENIED",
  SECURITY_RATE_LIMIT_EXCEEDED: "SECURITY_RATE_LIMIT_EXCEEDED",
  SECURITY_SUSPICIOUS_ACTIVITY: "SECURITY_SUSPICIOUS_ACTIVITY",

  // API usage
  API_KEY_CREATE: "API_KEY_CREATE",
  API_KEY_UPDATE: "API_KEY_UPDATE",
  API_KEY_DELETE: "API_KEY_DELETE",
  API_KEY_USAGE: "API_KEY_USAGE",

  // Feedback management
  FEEDBACK_CREATE: "FEEDBACK_CREATE",
  FEEDBACK_UPDATE: "FEEDBACK_UPDATE",
  FEEDBACK_RESOLVE: "FEEDBACK_RESOLVE",
};

// Create audit log entry
export const auditLog = async (
  userId,
  action,
  resource,
  resourceId = null,
  details = {},
  level = AUDIT_LEVELS.INFO
) => {
  try {
    const auditData = {
      userId,
      action,
      resource,
      resourceId,
      details,
      ipAddress: details.ipAddress || null,
      userAgent: details.userAgent || null,
      timestamp: new Date(),
    };

    // Generate checksum for audit data integrity
    const checksum = generateAuditChecksum(auditData);

    // Store in database
    const auditEntry = await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource,
        resourceId,
        details,
        ipAddress: details.ipAddress,
        userAgent: details.userAgent,
      },
    });

    // Log to Winston logger
    logger.info("Audit Log Created", {
      auditId: auditEntry.id,
      userId,
      action,
      resource,
      resourceId,
      checksum,
      level,
      timestamp: auditEntry.timestamp,
    });

    return auditEntry;
  } catch (error) {
    logger.error("Failed to create audit log:", {
      error: error.message,
      userId,
      action,
      resource,
      resourceId,
    });
    throw error;
  }
};

// Create security audit log
export const securityAuditLog = async (
  event,
  details,
  level = AUDIT_LEVELS.WARNING
) => {
  try {
    const securityData = {
      event,
      details,
      timestamp: new Date(),
      ipAddress: details.ipAddress || null,
      userAgent: details.userAgent || null,
    };

    // Log to Winston logger with security level
    logger.warn("Security Event", {
      event,
      details,
      level,
      timestamp: securityData.timestamp,
    });

    // Store in database if user is involved
    if (details.userId) {
      await auditLog(details.userId, event, "SECURITY", null, details, level);
    }

    return securityData;
  } catch (error) {
    logger.error("Failed to create security audit log:", {
      error: error.message,
      event,
      details,
    });
    throw error;
  }
};

// Create performance audit log
export const performanceAuditLog = async (operation, duration, details) => {
  try {
    const performanceData = {
      operation,
      duration,
      details,
      timestamp: new Date(),
    };

    // Log to Winston logger
    logger.info("Performance Metric", {
      operation,
      duration: `${duration}ms`,
      details,
      timestamp: performanceData.timestamp,
    });

    return performanceData;
  } catch (error) {
    logger.error("Failed to create performance audit log:", {
      error: error.message,
      operation,
      duration,
    });
    throw error;
  }
};

// Create API usage audit log
export const apiUsageAuditLog = async (
  apiKeyId,
  endpoint,
  method,
  responseTime,
  statusCode,
  details = {}
) => {
  try {
    const apiUsageData = {
      apiKeyId,
      endpoint,
      method,
      responseTime,
      statusCode,
      details,
      timestamp: new Date(),
    };

    // Log to Winston logger
    logger.info("API Usage", {
      apiKeyId,
      endpoint,
      method,
      responseTime: `${responseTime}ms`,
      statusCode,
      details,
      timestamp: apiUsageData.timestamp,
    });

    return apiUsageData;
  } catch (error) {
    logger.error("Failed to create API usage audit log:", {
      error: error.message,
      apiKeyId,
      endpoint,
    });
    throw error;
  }
};

// Create data integrity audit log
export const dataIntegrityAuditLog = async (
  operation,
  dataType,
  checksum,
  verificationResult,
  details = {}
) => {
  try {
    const integrityData = {
      operation,
      dataType,
      checksum,
      verificationResult,
      details,
      timestamp: new Date(),
    };

    // Log to Winston logger
    logger.info("Data Integrity Check", {
      operation,
      dataType,
      checksum,
      verificationResult,
      details,
      timestamp: integrityData.timestamp,
    });

    return integrityData;
  } catch (error) {
    logger.error("Failed to create data integrity audit log:", {
      error: error.message,
      operation,
      dataType,
    });
    throw error;
  }
};

// Create system event audit log
export const systemEventAuditLog = async (
  event,
  details,
  level = AUDIT_LEVELS.INFO
) => {
  try {
    const systemData = {
      event,
      details,
      level,
      timestamp: new Date(),
    };

    // Log to Winston logger
    logger.info("System Event", {
      event,
      details,
      level,
      timestamp: systemData.timestamp,
    });

    return systemData;
  } catch (error) {
    logger.error("Failed to create system event audit log:", {
      error: error.message,
      event,
      details,
    });
    throw error;
  }
};

// Get audit logs with filtering
export const getAuditLogs = async (filters = {}) => {
  try {
    const {
      userId,
      action,
      resource,
      startDate,
      endDate,
      level,
      page = 1,
      limit = 50,
    } = filters;

    const whereClause = {};

    if (userId) whereClause.userId = userId;
    if (action) whereClause.action = action;
    if (resource) whereClause.resource = resource;
    if (startDate || endDate) {
      whereClause.timestamp = {};
      if (startDate) whereClause.timestamp.gte = new Date(startDate);
      if (endDate) whereClause.timestamp.lte = new Date(endDate);
    }

    const logs = await prisma.auditLog.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: {
        timestamp: "desc",
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    const total = await prisma.auditLog.count({ where: whereClause });

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    logger.error("Failed to get audit logs:", error);
    throw error;
  }
};

// Export audit logs
export const exportAuditLogs = async (filters = {}, format = "json") => {
  try {
    const { logs } = await getAuditLogs({ ...filters, limit: 10000 });

    if (format === "csv") {
      const csvData = logs.map((log) => ({
        ID: log.id,
        User: log.user?.name || "Unknown",
        Action: log.action,
        Resource: log.resource,
        ResourceID: log.resourceId || "",
        IPAddress: log.ipAddress || "",
        Timestamp: log.timestamp.toISOString(),
        Details: JSON.stringify(log.details),
      }));

      return csvData;
    }

    return logs;
  } catch (error) {
    logger.error("Failed to export audit logs:", error);
    throw error;
  }
};

// Clean old audit logs
export const cleanAuditLogs = async (daysToKeep = 90) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const deletedCount = await prisma.auditLog.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate,
        },
      },
    });

    logger.info(
      `Cleaned ${deletedCount.count} old audit logs older than ${daysToKeep} days`
    );

    return deletedCount.count;
  } catch (error) {
    logger.error("Failed to clean audit logs:", error);
    throw error;
  }
};
