import logger from "../utils/logger.js";

export const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error("Error occurred:", {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  });

  // Handle Prisma errors
  if (err.code === "P2002") {
    return res.status(409).json({
      error: "Conflict",
      message: "A record with this information already exists",
    });
  }

  if (err.code === "P2025") {
    return res.status(404).json({
      error: "Not Found",
      message: "The requested record was not found",
    });
  }

  if (err.code === "P2003") {
    return res.status(400).json({
      error: "Bad Request",
      message: "Invalid foreign key reference",
    });
  }

  // Handle validation errors
  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: "Validation Error",
      message: err.message,
      details: err.details,
    });
  }

  // Handle JWT errors
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid token",
    });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Token expired",
    });
  }

  // Handle rate limiting errors
  if (err.status === 429) {
    return res.status(429).json({
      error: "Too Many Requests",
      message: "Rate limit exceeded. Please try again later.",
    });
  }

  // Handle Redis errors
  if (err.code === "ECONNREFUSED" && err.syscall === "connect") {
    logger.error("Redis connection failed:", err);
    return res.status(503).json({
      error: "Service Unavailable",
      message: "Cache service temporarily unavailable",
    });
  }

  // Handle database connection errors
  if (err.code === "ECONNREFUSED" && err.syscall === "connect") {
    logger.error("Database connection failed:", err);
    return res.status(503).json({
      error: "Service Unavailable",
      message: "Database temporarily unavailable",
    });
  }

  // Handle file upload errors
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      error: "Bad Request",
      message: "File size too large",
    });
  }

  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    return res.status(400).json({
      error: "Bad Request",
      message: "Unexpected file field",
    });
  }

  // Handle general errors
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || "Internal Server Error";

  // Don't expose internal errors in production
  const response = {
    error: statusCode === 500 ? "Internal Server Error" : err.name || "Error",
    message:
      process.env.NODE_ENV === "production" && statusCode === 500
        ? "An unexpected error occurred"
        : message,
  };

  // Add additional details in development
  if (process.env.NODE_ENV !== "production") {
    response.stack = err.stack;
    response.details = err;
  }

  res.status(statusCode).json(response);
};

// 404 handler
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `The requested endpoint ${req.originalUrl} does not exist`,
    timestamp: new Date().toISOString(),
  });
};

// Async error wrapper
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
