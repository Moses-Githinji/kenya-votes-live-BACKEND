import jwt from "jsonwebtoken";
import pkg from "@prisma/client";
const { PrismaClient } = pkg;
import logger from "../utils/logger.js";

const prisma = new PrismaClient();

// JWT verification middleware
export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Access denied",
        message: "No token provided",
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      return res.status(401).json({
        error: "Access denied",
        message: "No token provided",
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded) {
      return res.status(401).json({
        error: "Access denied",
        message: "Invalid token",
      });
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        error: "Access denied",
        message: "User not found or inactive",
      });
    }

    // Check if user has admin role
    if (user.role === "PUBLIC") {
      return res.status(403).json({
        error: "Access denied",
        message: "Admin access required",
      });
    }

    // Add user to request object
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    next();
  } catch (error) {
    logger.error("Authentication error:", error);

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        error: "Access denied",
        message: "Invalid token",
      });
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Access denied",
        message: "Token expired",
      });
    }

    res.status(500).json({
      error: "Authentication failed",
      message: "Internal server error",
    });
  }
};

// Role-based access control middleware
export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Access denied",
        message: "Authentication required",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Access denied",
        message: `Required role: ${roles.join(" or ")}`,
      });
    }

    next();
  };
};

// Super admin only middleware
export const requireSuperAdmin = requireRole(["SUPER_ADMIN"]);

// Admin or super admin middleware
export const requireAdmin = requireRole(["ADMIN", "SUPER_ADMIN"]);

// API key authentication middleware
export const apiKeyAuth = async (req, res, next) => {
  try {
    const apiKey = req.headers["x-api-key"];

    if (!apiKey) {
      return res.status(401).json({
        error: "Access denied",
        message: "API key required",
      });
    }

    // Check API key in database
    const keyRecord = await prisma.apiKey.findUnique({
      where: { key: apiKey },
    });

    if (!keyRecord || !keyRecord.isActive) {
      return res.status(401).json({
        error: "Access denied",
        message: "Invalid or inactive API key",
      });
    }

    // Check if API key has expired
    if (keyRecord.expiresAt && new Date() > keyRecord.expiresAt) {
      return res.status(401).json({
        error: "Access denied",
        message: "API key expired",
      });
    }

    // Check rate limiting
    const rateLimitKey = `rate_limit:${apiKey}`;
    const currentCount = await redis.incr(rateLimitKey);

    if (currentCount === 1) {
      await redis.expire(rateLimitKey, 3600); // 1 hour
    }

    if (currentCount > keyRecord.rateLimit) {
      return res.status(429).json({
        error: "Rate limit exceeded",
        message: "Too many requests",
      });
    }

    // Add API key info to request
    req.apiKey = {
      id: keyRecord.id,
      name: keyRecord.name,
      permissions: keyRecord.permissions,
      rateLimit: keyRecord.rateLimit,
    };

    next();
  } catch (error) {
    logger.error("API key authentication error:", error);
    res.status(500).json({
      error: "Authentication failed",
      message: "Internal server error",
    });
  }
};

// Permission check middleware
export const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.apiKey) {
      return res.status(401).json({
        error: "Access denied",
        message: "API key required",
      });
    }

    const permissions = req.apiKey.permissions;

    if (!permissions.includes(permission)) {
      return res.status(403).json({
        error: "Access denied",
        message: `Permission required: ${permission}`,
      });
    }

    next();
  };
};

// Generate JWT token
export const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "24h",
    }
  );
};

// Verify Auth0 token (for Auth0 integration)
export const verifyAuth0Token = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Access denied",
        message: "No token provided",
      });
    }

    const token = authHeader.substring(7);

    // Verify Auth0 token
    const response = await fetch(
      `https://${process.env.AUTH0_DOMAIN}/userinfo`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      return res.status(401).json({
        error: "Access denied",
        message: "Invalid Auth0 token",
      });
    }

    const userInfo = await response.json();

    // Find or create user in database
    let user = await prisma.user.findUnique({
      where: { auth0Id: userInfo.sub },
    });

    if (!user) {
      // Create new user
      user = await prisma.user.create({
        data: {
          email: userInfo.email,
          name: userInfo.name,
          auth0Id: userInfo.sub,
          role: "ADMIN", // Default role for Auth0 users
        },
      });
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // Add user to request object
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    next();
  } catch (error) {
    logger.error("Auth0 verification error:", error);
    res.status(500).json({
      error: "Authentication failed",
      message: "Internal server error",
    });
  }
};
