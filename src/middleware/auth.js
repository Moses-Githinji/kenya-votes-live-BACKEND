import jwt from "jsonwebtoken";
import pkg from "@prisma/client";
const { PrismaClient } = pkg;
import logger from "../utils/logger.js";
import { sendEmail } from "../utils/email.js";

const prisma = new PrismaClient();

// JWT verification middleware
export default function authenticateToken(req, res, next) {
  (async () => {
    try {
      const authHeader = req.headers && req.headers.authorization;

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

      // Add user to request object
      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      };

      // Send login email for all admin roles
      const adminRoleMessages = {
        SYSTEM_ADMINISTRATOR: {
          subject: "System Administrator Login | Kenya Votes Live",
          main_message:
            "You have successfully logged in as a SYSTEM ADMINISTRATOR.",
          content_title: "System Administrator Login Alert",
          cta_text: "Go to Admin Dashboard",
        },
        IEBC_COMMISSIONER: {
          subject: "IEBC Commissioner Login | Kenya Votes Live",
          main_message:
            "You have successfully logged in as an IEBC COMMISSIONER.",
          content_title: "Commissioner Login Alert",
          cta_text: "Go to Commissioner Dashboard",
        },
        RETURNING_OFFICER: {
          subject: "Returning Officer Login | Kenya Votes Live",
          main_message:
            "You have successfully logged in as a RETURNING OFFICER.",
          content_title: "Returning Officer Login Alert",
          cta_text: "Go to Returning Officer Dashboard",
        },
        PRESIDING_OFFICER: {
          subject: "Presiding Officer Login | Kenya Votes Live",
          main_message:
            "You have successfully logged in as a PRESIDING OFFICER.",
          content_title: "Presiding Officer Login Alert",
          cta_text: "Go to Presiding Officer Dashboard",
        },
        ELECTION_CLERK: {
          subject: "Election Clerk Login | Kenya Votes Live",
          main_message: "You have successfully logged in as an ELECTION CLERK.",
          content_title: "Election Clerk Login Alert",
          cta_text: "Go to Clerk Dashboard",
        },
      };
      if (adminRoleMessages[user.role]) {
        const msg = adminRoleMessages[user.role];
        try {
          await sendEmail({
            to: user.email,
            subject: msg.subject,
            templateData: {
              greeting: "Dear",
              user_name: user.name,
              main_message: msg.main_message,
              content_title: msg.content_title,
              content_details: `Login time: ${new Date().toLocaleString()}`,
              status_label: "Success",
              cta_url: process.env.BACKEND_URL || "http://localhost:4000",
              cta_text: msg.cta_text,
              additional_info:
                "If this was not you, please contact support immediately.",
            },
          });
        } catch (e) {
          logger.error(`Failed to send ${user.role} login email:`, e);
        }
      }

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
      next(error);
    }
  })();
}

// Role-based access control middleware for new roles
export function requireRole(roles) {
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
}

// Middleware for each new role
export const requireIEBCCommissioner = requireRole(["IEBC_COMMISSIONER"]);
export const requireReturningOfficer = requireRole(["RETURNING_OFFICER"]);
export const requirePresidingOfficer = requireRole(["PRESIDING_OFFICER"]);
export const requireElectionClerk = requireRole(["ELECTION_CLERK"]);
export const requireSystemAdministrator = requireRole(["SYSTEM_ADMINISTRATOR"]);

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
