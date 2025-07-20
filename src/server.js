import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import slowDown from "express-slow-down";
import dotenv from "dotenv";
import pkg from "@prisma/client";
const { PrismaClient } = pkg;
import Redis from "ioredis";
import { Kafka } from "kafkajs";
import winston from "winston";
import { ElasticsearchTransport } from "winston-elasticsearch";
import path from "path";
import { fileURLToPath } from "url";

// Import routes
import publicRoutes from "./routes/public.js";
import adminRoutes from "./routes/admin.js";
import websocketRoutes from "./routes/websocket.js";

// Import middleware
import { authMiddleware } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { cacheMiddleware } from "./middleware/cache.js";
import { securityMiddleware } from "./middleware/security.js";

// Import services
import { initializeKafka } from "./services/kafka.js";
import { initializeRedis } from "./services/redis.js";
import { initializeElasticsearch } from "./services/elasticsearch.js";
import { initializeS3 } from "./services/s3.js";
import { initializeCronJobs } from "./services/cron.js";

// Load environment variables
dotenv.config();

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// Configure Winston logger first
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: "kenya-votes-backend" },
  transports: [
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
    new ElasticsearchTransport({
      level: "info",
      clientOpts: {
        node: process.env.ELASTICSEARCH_URL || "http://localhost:9200",
        index: "kenya-votes-logs",
      },
    }),
  ],
});
// check if the logger is working
logger.info("Logger initialized");

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  );
}

// Initialize Prisma only if DATABASE_URL is provided
let prisma = null;

if (process.env.DATABASE_URL) {
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    // Optimized connection pool for high concurrency
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
    // Connection pool configuration
    __internal: {
      engine: {
        connectionLimit: 20, // Increased from default 10
        pool: {
          min: 5,
          max: 20,
          acquireTimeoutMillis: 30000,
          createTimeoutMillis: 30000,
          destroyTimeoutMillis: 5000,
          idleTimeoutMillis: 30000,
          reapIntervalMillis: 1000,
          createRetryIntervalMillis: 200,
        },
      },
    },
  });
} else {
  logger.warn(
    "DATABASE_URL not provided, database functionality will be disabled"
  );
}

// Initialize services
const redis = initializeRedis();
const kafka = initializeKafka();
const elasticsearch = initializeElasticsearch();
let s3 = null;

// Initialize S3 asynchronously
(async () => {
  try {
    s3 = await initializeS3();
  } catch (error) {
    logger.error("Failed to initialize S3:", error);
  }
})();

// Rate limiting - Optimized for high traffic
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased from 100 to 1000 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  skipFailedRequests: false, // Count failed requests
});

const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 500, // Increased from 50 to 500 requests per 15 minutes
  delayMs: 200, // Reduced from 500ms to 200ms delay
  maxDelayMs: 2000, // Maximum delay of 2 seconds
});

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  })
);

// CORS configuration
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
  })
);

// Compression for low-bandwidth optimization
app.use(compression());

// Performance monitoring
import performanceMonitor from "./monitoring/performance-monitor.js";

// Request logging
app.use(
  morgan("combined", {
    stream: { write: (message) => logger.info(message.trim()) },
  })
);
app.use(requestLogger);

// Security middleware (DDoS protection, rate limiting, etc.)
app.use(securityMiddleware);

// Performance monitoring middleware
app.use(performanceMonitor.trackRequest.bind(performanceMonitor));

// Legacy rate limiting (replaced by enhanced security middleware)
// app.use("/api/", limiter);
// app.use("/api/", speedLimiter);

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Static file serving for local uploads
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
    version: "1.0.0",
    checks: {
      database: prisma ? "connected" : "disconnected",
      redis: redis ? "connected" : "disconnected",
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
    },
  });
});

// Performance metrics endpoint
app.get("/metrics", (req, res) => {
  res.status(200).json(performanceMonitor.exportMetrics());
});

// Health status endpoint
app.get("/health/status", (req, res) => {
  res.status(200).json(performanceMonitor.getHealthStatus());
});

// API Documentation
app.get("/api-docs", (req, res) => {
  res.json({
    name: "Kenya Votes Live API",
    version: "1.0.0",
    description: "Real-time election monitoring API for Kenya 2027",
    endpoints: {
      public: {
        results: "GET /api/results/:position/:regionType/:regionId",
        candidates: "GET /api/candidates/:id",
        search: "GET /api/candidates/search",
        map: "GET /api/map/:regionType/:regionId?",
        historical: "GET /api/historical/:year/:regionId",
        feedback: "POST /api/feedback",
        status: "GET /api/status",
        turnout: "GET /api/turnout/:regionType/:regionId",
      },
      admin: {
        votes: "POST /api/admin/votes",
        verify: "POST /api/admin/verify/:regionId",
        certify: "POST /api/admin/certify/:regionId",
        candidates: "POST /api/admin/candidates",
        logs: "GET /api/admin/logs",
        export: "GET /api/admin/export/:position/:regionType/:regionId",
        health: "GET /api/admin/health",
      },
    },
  });
});

// Mount routes
app.use("/api", publicRoutes);
app.use("/api/admin", authMiddleware, adminRoutes);

// WebSocket routes
if (prisma) {
  websocketRoutes(io, prisma, redis);
} else {
  logger.warn("WebSocket routes disabled - database not available");
}

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    message: `The requested endpoint ${req.originalUrl} does not exist`,
    timestamp: new Date().toISOString(),
  });
});

// Initialize cron jobs only if prisma is available
if (prisma) {
  initializeCronJobs(prisma, redis, logger);
} else {
  logger.warn("Cron jobs disabled - database not available");
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");
  if (prisma) await prisma.$disconnect();
  if (redis) await redis.quit();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down gracefully");
  if (prisma) await prisma.$disconnect();
  if (redis) await redis.quit();
  process.exit(0);
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`API docs: http://localhost:${PORT}/api-docs`);
});

export { app, server, io, prisma, redis, kafka, elasticsearch, s3, logger };
