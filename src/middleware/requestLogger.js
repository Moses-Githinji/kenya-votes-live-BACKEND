import logger from "../utils/logger.js";

export const requestLogger = (req, res, next) => {
  const start = Date.now();

  // Log request start
  logger.info("Request started", {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    timestamp: new Date().toISOString(),
  });

  // Use res.on('finish') instead of overriding res.end
  res.on("finish", () => {
    const duration = Date.now() - start;

    // Log request completion
    logger.info("Request completed", {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get("Content-Length") || 0,
      timestamp: new Date().toISOString(),
    });
  });

  next();
};
