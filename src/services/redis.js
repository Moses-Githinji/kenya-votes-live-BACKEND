import Redis from "ioredis";
import logger from "../utils/logger.js";

// Create Redis client only if REDIS_URL is provided
let redis = null;

if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keepAlive: 30000,
    connectTimeout: 10000,
    commandTimeout: 5000,
    retryDelayOnClusterDown: 300,
    enableReadyCheck: false,
    maxLoadingTimeout: 10000,
  });

  // Redis event handlers
  redis.on("connect", () => {
    logger.info("Redis connected successfully");
  });

  redis.on("error", (error) => {
    logger.error("Redis connection error:", error);
  });

  redis.on("close", () => {
    logger.warn("Redis connection closed");
  });

  redis.on("reconnecting", () => {
    logger.info("Redis reconnecting...");
  });
} else {
  logger.warn("REDIS_URL not provided, Redis functionality will be disabled");
}

// Initialize Redis connection
export const initializeRedis = () => {
  return redis;
};

// Cache operations
export const cacheGet = async (key) => {
  if (!redis) {
    logger.warn("Redis not available, cacheGet returning null");
    return null;
  }
  try {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    logger.error("Redis get error:", error);
    return null;
  }
};

export const cacheSet = async (key, value, ttl = 3600) => {
  if (!redis) {
    logger.warn("Redis not available, cacheSet returning false");
    return false;
  }
  try {
    await redis.setex(key, ttl, JSON.stringify(value));
    return true;
  } catch (error) {
    logger.error("Redis set error:", error);
    return false;
  }
};

export const cacheDelete = async (key) => {
  try {
    await redis.del(key);
    return true;
  } catch (error) {
    logger.error("Redis delete error:", error);
    return false;
  }
};

export const cacheExists = async (key) => {
  try {
    return await redis.exists(key);
  } catch (error) {
    logger.error("Redis exists error:", error);
    return false;
  }
};

export const cacheExpire = async (key, ttl) => {
  try {
    return await redis.expire(key, ttl);
  } catch (error) {
    logger.error("Redis expire error:", error);
    return false;
  }
};

// Hash operations
export const hashGet = async (key, field) => {
  try {
    const value = await redis.hget(key, field);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    logger.error("Redis hget error:", error);
    return null;
  }
};

export const hashSet = async (key, field, value) => {
  try {
    await redis.hset(key, field, JSON.stringify(value));
    return true;
  } catch (error) {
    logger.error("Redis hset error:", error);
    return false;
  }
};

export const hashGetAll = async (key) => {
  try {
    const hash = await redis.hgetall(key);
    const result = {};
    for (const [field, value] of Object.entries(hash)) {
      result[field] = JSON.parse(value);
    }
    return result;
  } catch (error) {
    logger.error("Redis hgetall error:", error);
    return {};
  }
};

export const hashDelete = async (key, field) => {
  try {
    await redis.hdel(key, field);
    return true;
  } catch (error) {
    logger.error("Redis hdel error:", error);
    return false;
  }
};

// List operations
export const listPush = async (key, value) => {
  try {
    await redis.lpush(key, JSON.stringify(value));
    return true;
  } catch (error) {
    logger.error("Redis lpush error:", error);
    return false;
  }
};

export const listPop = async (key) => {
  try {
    const value = await redis.rpop(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    logger.error("Redis rpop error:", error);
    return null;
  }
};

export const listRange = async (key, start = 0, end = -1) => {
  try {
    const values = await redis.lrange(key, start, end);
    return values.map((value) => JSON.parse(value));
  } catch (error) {
    logger.error("Redis lrange error:", error);
    return [];
  }
};

export const listLength = async (key) => {
  try {
    return await redis.llen(key);
  } catch (error) {
    logger.error("Redis llen error:", error);
    return 0;
  }
};

// Set operations
export const setAdd = async (key, value) => {
  try {
    await redis.sadd(key, JSON.stringify(value));
    return true;
  } catch (error) {
    logger.error("Redis sadd error:", error);
    return false;
  }
};

export const setRemove = async (key, value) => {
  try {
    await redis.srem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    logger.error("Redis srem error:", error);
    return false;
  }
};

export const setMembers = async (key) => {
  try {
    const members = await redis.smembers(key);
    return members.map((member) => JSON.parse(member));
  } catch (error) {
    logger.error("Redis smembers error:", error);
    return [];
  }
};

export const setExists = async (key, value) => {
  try {
    return await redis.sismember(key, JSON.stringify(value));
  } catch (error) {
    logger.error("Redis sismember error:", error);
    return false;
  }
};

// Sorted set operations
export const zsetAdd = async (key, score, value) => {
  try {
    await redis.zadd(key, score, JSON.stringify(value));
    return true;
  } catch (error) {
    logger.error("Redis zadd error:", error);
    return false;
  }
};

export const zsetRange = async (
  key,
  start = 0,
  end = -1,
  withScores = false
) => {
  try {
    const options = withScores ? "WITHSCORES" : undefined;
    const values = await redis.zrange(key, start, end, options);

    if (withScores) {
      const result = [];
      for (let i = 0; i < values.length; i += 2) {
        result.push({
          value: JSON.parse(values[i]),
          score: parseFloat(values[i + 1]),
        });
      }
      return result;
    }

    return values.map((value) => JSON.parse(value));
  } catch (error) {
    logger.error("Redis zrange error:", error);
    return [];
  }
};

export const zsetScore = async (key, value) => {
  try {
    return await redis.zscore(key, JSON.stringify(value));
  } catch (error) {
    logger.error("Redis zscore error:", error);
    return null;
  }
};

// Pub/Sub operations
export const publish = async (channel, message) => {
  try {
    await redis.publish(channel, JSON.stringify(message));
    return true;
  } catch (error) {
    logger.error("Redis publish error:", error);
    return false;
  }
};

export const subscribe = async (channel, callback) => {
  try {
    const subscriber = redis.duplicate();
    await subscriber.subscribe(channel);

    subscriber.on("message", (ch, message) => {
      try {
        const parsedMessage = JSON.parse(message);
        callback(parsedMessage);
      } catch (error) {
        logger.error("Error parsing Redis message:", error);
      }
    });

    return subscriber;
  } catch (error) {
    logger.error("Redis subscribe error:", error);
    return null;
  }
};

// Rate limiting
export const rateLimit = async (key, limit, window) => {
  try {
    const current = await redis.incr(key);

    if (current === 1) {
      await redis.expire(key, window);
    }

    return {
      current,
      limit,
      remaining: Math.max(0, limit - current),
      reset: await redis.ttl(key),
    };
  } catch (error) {
    logger.error("Redis rate limit error:", error);
    return { current: 0, limit, remaining: limit, reset: window };
  }
};

// Session management
export const setSession = async (sessionId, data, ttl = 3600) => {
  try {
    await redis.setex(`session:${sessionId}`, ttl, JSON.stringify(data));
    return true;
  } catch (error) {
    logger.error("Redis set session error:", error);
    return false;
  }
};

export const getSession = async (sessionId) => {
  try {
    const data = await redis.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error("Redis get session error:", error);
    return null;
  }
};

export const deleteSession = async (sessionId) => {
  try {
    await redis.del(`session:${sessionId}`);
    return true;
  } catch (error) {
    logger.error("Redis delete session error:", error);
    return false;
  }
};

// Health check
export const healthCheck = async () => {
  if (!redis) {
    return { status: "disabled", message: "Redis is not configured" };
  }
  try {
    await redis.ping();
    return { status: "healthy", message: "Redis is operational" };
  } catch (error) {
    logger.error("Redis health check failed:", error);
    return { status: "unhealthy", message: "Redis is down" };
  }
};

// Statistics
export const getStats = async () => {
  try {
    const info = await redis.info();
    const keys = await redis.dbsize();

    return {
      keys,
      memory: info.match(/used_memory_human:(.+)/)?.[1] || "Unknown",
      connectedClients: info.match(/connected_clients:(.+)/)?.[1] || "Unknown",
      uptime: info.match(/uptime_in_seconds:(.+)/)?.[1] || "Unknown",
    };
  } catch (error) {
    logger.error("Redis stats error:", error);
    return null;
  }
};

// Cleanup
export const cleanup = async () => {
  try {
    await redis.quit();
    logger.info("Redis connection closed");
  } catch (error) {
    logger.error("Redis cleanup error:", error);
  }
};

export default redis;
