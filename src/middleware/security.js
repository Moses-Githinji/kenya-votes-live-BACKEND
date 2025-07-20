import rateLimit from "express-rate-limit";
import slowDown from "express-slow-down";
import redis from "../services/redis.js";
import logger from "../utils/logger.js";

// DDoS Protection - Track IP addresses
const ipTracker = new Map();
const DDoS_THRESHOLD = 1000; // requests per minute
const DDoS_WINDOW = 60000; // 1 minute

// Clean up old IP entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipTracker.entries()) {
    if (now - data.lastSeen > DDoS_WINDOW) {
      ipTracker.delete(ip);
    }
  }
}, 30000); // Clean every 30 seconds

// DDoS detection middleware
export const ddosProtection = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();

  if (!ipTracker.has(ip)) {
    ipTracker.set(ip, {
      count: 1,
      firstSeen: now,
      lastSeen: now,
      blocked: false,
    });
  } else {
    const data = ipTracker.get(ip);
    data.count++;
    data.lastSeen = now;

    // Check if IP should be blocked
    if (data.count > DDoS_THRESHOLD && !data.blocked) {
      data.blocked = true;
      logger.warn(`DDoS attack detected from IP: ${ip}, count: ${data.count}`);

      // Block IP in Redis for 1 hour
      if (redis) {
        redis.setex(`blocked:${ip}`, 3600, "ddos");
      }
    }

    // If IP is blocked, reject request
    if (data.blocked) {
      return res.status(429).json({
        error: "Too many requests",
        message:
          "Your IP has been temporarily blocked due to suspicious activity",
        retryAfter: 3600,
      });
    }
  }

  next();
};

// Enhanced rate limiting per IP
export const enhancedRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req) => {
    // Different limits for different endpoints
    if (req.path.includes("/admin")) {
      return 100; // Stricter for admin
    }
    if (req.path.includes("/api/results")) {
      return 2000; // Higher for results (most accessed)
    }
    if (req.path.includes("/api/status")) {
      return 1000; // Medium for status
    }
    return 500; // Default
  },
  message: {
    error: "Rate limit exceeded",
    message: "Too many requests from this IP",
    retryAfter: "15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  keyGenerator: (req) => {
    // Use API key if available, otherwise use IP
    return req.headers["x-api-key"] || req.ip || req.connection.remoteAddress;
  },
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for ${req.ip} accessing ${req.path}`);
    res.status(429).json({
      error: "Rate limit exceeded",
      message: "Too many requests from this IP",
      retryAfter: "15 minutes",
    });
  },
});

// Slow down requests after certain threshold
export const requestSlowDown = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: (req) => {
    if (req.path.includes("/admin")) return 50;
    if (req.path.includes("/api/results")) return 1000;
    return 200;
  },
  delayMs: (req) => {
    if (req.path.includes("/admin")) return 1000;
    return 200;
  },
  maxDelayMs: 5000,
  keyGenerator: (req) => {
    return req.headers["x-api-key"] || req.ip || req.connection.remoteAddress;
  },
});

// Security headers middleware
export const securityHeaders = (req, res, next) => {
  // Basic security headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Content Security Policy
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https:; " +
      "font-src 'self' data:; " +
      "connect-src 'self' ws: wss:; " +
      "frame-ancestors 'none';"
  );

  // HSTS (HTTP Strict Transport Security)
  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  next();
};

// Request validation middleware
export const requestValidation = (req, res, next) => {
  // Block suspicious user agents
  const userAgent = req.get("User-Agent") || "";
  const suspiciousPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python/i,
    /java/i,
    /perl/i,
  ];

  const isSuspicious = suspiciousPatterns.some((pattern) =>
    pattern.test(userAgent)
  );

  if (isSuspicious && !req.headers["x-api-key"]) {
    logger.warn(`Suspicious user agent blocked: ${userAgent} from ${req.ip}`);
    return res.status(403).json({
      error: "Access denied",
      message: "Suspicious request detected",
    });
  }

  // Validate request size
  const contentLength = parseInt(req.get("Content-Length") || "0");
  if (contentLength > 10 * 1024 * 1024) {
    // 10MB limit
    return res.status(413).json({
      error: "Request too large",
      message: "Request body exceeds 10MB limit",
    });
  }

  next();
};

// IP whitelist/blacklist middleware
export const ipFilter = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;

  // Check if IP is blocked in Redis
  if (redis) {
    redis.get(`blocked:${ip}`, (err, blocked) => {
      if (err) {
        logger.error("Redis error in IP filter:", err);
        return next();
      }

      if (blocked) {
        logger.warn(`Blocked IP attempted access: ${ip}`);
        return res.status(403).json({
          error: "Access denied",
          message: "Your IP has been blocked",
        });
      }

      next();
    });
  } else {
    next();
  }
};

// API key validation middleware
export const validateApiKey = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey) {
    return next(); // Allow requests without API key
  }

  // Validate API key format
  if (!/^[a-zA-Z0-9]{32,64}$/.test(apiKey)) {
    return res.status(401).json({
      error: "Invalid API key",
      message: "API key format is invalid",
    });
  }

  // Check API key in Redis cache first
  if (redis) {
    redis.get(`apikey:${apiKey}`, (err, cached) => {
      if (err) {
        logger.error("Redis error in API key validation:", err);
        return next();
      }

      if (cached) {
        const keyData = JSON.parse(cached);
        req.apiKeyData = keyData;
        return next();
      }

      // If not in cache, validate against database
      validateApiKeyFromDB(apiKey, req, res, next);
    });
  } else {
    validateApiKeyFromDB(apiKey, req, res, next);
  }
};

// Validate API key from database
async function validateApiKeyFromDB(apiKey, req, res, next) {
  try {
    // This would validate against your database
    // For now, we'll just allow the request
    req.apiKeyData = { key: apiKey, permissions: ["read"] };

    // Cache the result in Redis
    if (redis) {
      redis.setex(`apikey:${apiKey}`, 300, JSON.stringify(req.apiKeyData)); // 5 minutes cache
    }

    next();
  } catch (error) {
    logger.error("API key validation error:", error);
    return res.status(401).json({
      error: "Invalid API key",
      message: "API key validation failed",
    });
  }
}

// Request logging for security
export const securityLogging = (req, res, next) => {
  const startTime = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const logData = {
      timestamp: new Date().toISOString(),
      ip: req.ip || req.connection.remoteAddress,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      userAgent: req.get("User-Agent"),
      apiKey: req.headers["x-api-key"] ? "present" : "none",
      contentLength: req.get("Content-Length") || 0,
    };

    // Log suspicious activities
    if (res.statusCode >= 400 || duration > 5000) {
      logger.warn("Suspicious request detected:", logData);
    }

    // Log all requests for security analysis
    logger.info("Request logged:", logData);
  });

  next();
};

// Export all security middlewares
export const securityMiddleware = [
  ddosProtection,
  ipFilter,
  securityHeaders,
  requestValidation,
  validateApiKey,
  enhancedRateLimit,
  requestSlowDown,
  securityLogging,
];
