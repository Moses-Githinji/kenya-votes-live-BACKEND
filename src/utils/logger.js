import winston from "winston";
import pkg from "winston-elasticsearch";
const { ElasticsearchTransport } = pkg;

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: "kenya-votes-backend",
    environment: process.env.NODE_ENV || "development",
  },
  transports: [
    // File transports
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: "logs/combined.log",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Add Elasticsearch transport in production
if (process.env.NODE_ENV === "production" && process.env.ELASTICSEARCH_URL) {
  logger.add(
    new ElasticsearchTransport({
      level: "info",
      clientOpts: {
        node: process.env.ELASTICSEARCH_URL,
        index: "kenya-votes-logs",
        auth: {
          username: process.env.ELASTICSEARCH_USERNAME,
          password: process.env.ELASTICSEARCH_PASSWORD,
        },
      },
      ensureMappingTemplate: true,
      mappingTemplate: {
        index_patterns: ["kenya-votes-logs"],
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
        },
      },
    })
  );
}

// Add console transport in development
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

// Create a stream object for Morgan
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

// Helper functions for structured logging
export const logRequest = (req, res, next) => {
  logger.info("HTTP Request", {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    userId: req.user?.id,
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
  next();
};

export const logResponse = (req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info("HTTP Response", {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get("Content-Length"),
      userId: req.user?.id,
      environment: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
    });
  });

  next();
};

export const logError = (error, req = null) => {
  logger.error("Application Error", {
    error: error.message,
    stack: error.stack,
    url: req?.originalUrl,
    method: req?.method,
    userId: req?.user?.id,
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
};

export const logSecurity = (event, details) => {
  logger.warn("Security Event", {
    event,
    details,
    environment: process.env.NODE_ENV || "development",
    userId: details?.userId || null,
    timestamp: new Date().toISOString(),
  });
};

export const logAudit = (action, resource, resourceId, userId, details) => {
  logger.info("Audit Log", {
    action,
    resource,
    resourceId,
    userId,
    details,
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
};

export const logPerformance = (operation, duration, details) => {
  logger.info("Performance Metric", {
    operation,
    duration: `${duration}ms`,
    details,
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
};

export default logger;
