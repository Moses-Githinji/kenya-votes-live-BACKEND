import Redis from "ioredis";
import logger from "../utils/logger.js";

// Create Redis client only if REDIS_URL is provided
let redis = null;

if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL);
} else {
  logger.warn("REDIS_URL not provided, cache functionality will be disabled");
}

// Cache middleware factory - Optimized TTL
export const cacheMiddleware = (ttl = 1800) => {
  // Increased from 300 to 1800 seconds (30 minutes)
  return async (req, res, next) => {
    try {
      // Skip caching for admin routes or when cache is disabled
      if (req.path.includes("/admin") || req.headers["x-skip-cache"]) {
        return next();
      }

      // Generate cache key based on request
      const cacheKey = generateCacheKey(req);

      // Try to get cached response
      if (!redis) {
        // Skip caching if Redis is not available
        return next();
      }

      const cachedResponse = await redis.get(cacheKey);

      if (cachedResponse) {
        const parsed = JSON.parse(cachedResponse);

        // Add cache headers
        res.set({
          "X-Cache": "HIT",
          "X-Cache-Key": cacheKey,
          "Cache-Control": `public, max-age=${ttl}`,
        });

        return res.json(parsed);
      }

      // Store original send method
      const originalSend = res.json;

      // Override send method to cache response
      res.json = function (data) {
        // Restore original method
        res.json = originalSend;

        // Cache the response
        if (redis) {
          redis
            .setex(cacheKey, ttl, JSON.stringify(data))
            .catch((err) => logger.error("Cache set error:", err));
        }

        // Add cache headers
        res.set({
          "X-Cache": "MISS",
          "X-Cache-Key": cacheKey,
          "Cache-Control": `public, max-age=${ttl}`,
        });

        // Send response
        return originalSend.call(this, data);
      };

      next();
    } catch (error) {
      logger.error("Cache middleware error:", error);
      // Continue without caching on error
      next();
    }
  };
};

// Generate cache key from request
function generateCacheKey(req) {
  const { url, method, query, params } = req;

  // Create a unique key based on request details
  const keyParts = [
    method,
    url,
    JSON.stringify(query),
    JSON.stringify(params),
    req.headers["accept-language"] || "en",
    req.headers["x-api-key"] || "public",
  ];

  return `cache:${Buffer.from(keyParts.join("|")).toString("base64")}`;
}

// Cache invalidation middleware
export const invalidateCache = (pattern) => {
  return async (req, res, next) => {
    try {
      // Store original send method
      const originalSend = res.json;

      // Override send method to invalidate cache
      res.json = function (data) {
        // Restore original method
        res.json = originalSend;

        // Invalidate cache based on pattern
        invalidateCacheByPattern(pattern, req).catch((err) =>
          logger.error("Cache invalidation error:", err)
        );

        // Send response
        return originalSend.call(this, data);
      };

      next();
    } catch (error) {
      logger.error("Cache invalidation middleware error:", error);
      next();
    }
  };
};

// Invalidate cache by pattern
async function invalidateCacheByPattern(pattern, req) {
  if (!redis) {
    logger.warn("Redis not available, cache invalidation skipped");
    return;
  }
  try {
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);
      logger.info(
        `Invalidated ${keys.length} cache keys matching pattern: ${pattern}`
      );
    }
  } catch (error) {
    logger.error("Error invalidating cache:", error);
  }
}

// Cache warming function
export const warmCache = async (endpoints) => {
  try {
    logger.info("Starting cache warming...");

    for (const endpoint of endpoints) {
      try {
        // Make request to endpoint
        const response = await fetch(endpoint.url, {
          method: endpoint.method || "GET",
          headers: endpoint.headers || {},
        });

        if (response.ok) {
          const data = await response.json();
          const cacheKey = `cache:${Buffer.from(endpoint.url).toString("base64")}`;

          await redis.setex(
            cacheKey,
            endpoint.ttl || 300,
            JSON.stringify(data)
          );
          logger.info(`Warmed cache for: ${endpoint.url}`);
        }
      } catch (error) {
        logger.error(`Failed to warm cache for ${endpoint.url}:`, error);
      }
    }

    logger.info("Cache warming completed");
  } catch (error) {
    logger.error("Cache warming error:", error);
  }
};

// Cache statistics
export const getCacheStats = async () => {
  try {
    const info = await redis.info();
    const keys = await redis.keys("cache:*");

    return {
      totalKeys: keys.length,
      memoryUsage: info.match(/used_memory_human:(.+)/)?.[1] || "Unknown",
      hitRate: info.match(/keyspace_hits:(.+)/)?.[1] || "Unknown",
      missRate: info.match(/keyspace_misses:(.+)/)?.[1] || "Unknown",
    };
  } catch (error) {
    logger.error("Error getting cache stats:", error);
    return null;
  }
};

// Clear all cache
export const clearCache = async () => {
  try {
    const keys = await redis.keys("cache:*");

    if (keys.length > 0) {
      await redis.del(...keys);
      logger.info(`Cleared ${keys.length} cache keys`);
    }

    return { cleared: keys.length };
  } catch (error) {
    logger.error("Error clearing cache:", error);
    throw error;
  }
};

// Cache health check
export const checkCacheHealth = async () => {
  if (!redis) {
    return { status: "disabled", message: "Cache service is not configured" };
  }
  try {
    await redis.ping();
    return { status: "healthy", message: "Cache service is operational" };
  } catch (error) {
    logger.error("Cache health check failed:", error);
    return { status: "unhealthy", message: "Cache service is down" };
  }
};

// Export Redis instance for direct use
export { redis };
