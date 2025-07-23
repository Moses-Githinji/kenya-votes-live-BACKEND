import logger from "../utils/logger.js";
import jwt from "jsonwebtoken";
import pkg from "@prisma/client";
const { PrismaClient } = pkg;

const prisma = new PrismaClient();

export default function websocketRoutes(io, prismaInstance, redis) {
  // Store connected clients and their subscriptions
  const clientSubscriptions = new Map();
  const rateLimiter = new Map();
  const connectionCounts = new Map();
  const heartbeatIntervals = new Map();

  // Configuration
  const MAX_CONNECTIONS_PER_IP =
    parseInt(process.env.WS_MAX_CONNECTIONS_PER_IP) || 10;
  const HEARTBEAT_INTERVAL =
    parseInt(process.env.WS_HEARTBEAT_INTERVAL) || 30000;
  const RATE_LIMIT_WINDOW = 60000; // 1 minute
  const RATE_LIMIT_MAX_REQUESTS = 10;

  // Input validation constants
  const VALID_POSITIONS = [
    "PRESIDENT",
    "GOVERNOR",
    "SENATOR",
    "MP",
    "WOMAN_REPRESENTATIVE",
    "COUNTY_ASSEMBLY_MEMBER",
  ];
  const VALID_REGION_TYPES = [
    "NATIONAL",
    "COUNTY",
    "CONSTITUENCY",
    "WARD",
    "POLLING_STATION",
  ];

  // Data sanitization function
  function sanitizeInput(input, maxLength = 100) {
    if (typeof input !== "string") return "";
    return input.trim().substring(0, maxLength);
  }

  // Rate limiting function
  function checkRateLimit(socketId) {
    const now = Date.now();
    const clientRequests = rateLimiter.get(socketId) || [];

    // Remove old requests outside the window
    const validRequests = clientRequests.filter(
      (time) => now - time < RATE_LIMIT_WINDOW
    );

    if (validRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
      return false;
    }

    validRequests.push(now);
    rateLimiter.set(socketId, validRequests);
    return true;
  }

  // Authentication middleware
  async function authenticateSocket(socket) {
    try {
      const token =
        socket.handshake.auth.token ||
        socket.handshake.headers.authorization?.replace("Bearer ", "");

      if (!token) {
        return { authenticated: false, user: null, role: "PUBLIC" };
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await prismaInstance.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user || !user.isActive) {
        return { authenticated: false, user: null, role: "PUBLIC" };
      }

      return { authenticated: true, user, role: user.role };
    } catch (error) {
      logger.error("Socket authentication error:", error);
      return { authenticated: false, user: null, role: "PUBLIC" };
    }
  }

  io.on("connection", async (socket) => {
    const clientIP = socket.handshake.address;
    const currentCount = connectionCounts.get(clientIP) || 0;

    // Check connection limits
    if (currentCount >= MAX_CONNECTIONS_PER_IP) {
      logger.warn(`Connection limit exceeded for IP: ${clientIP}`);
      socket.emit("error", { message: "Connection limit exceeded" });
      socket.disconnect();
      return;
    }

    connectionCounts.set(clientIP, currentCount + 1);
    logger.info(`Client connected: ${socket.id} from ${clientIP}`);

    // Set up heartbeat
    const heartbeatInterval = setInterval(() => {
      socket.emit("ping");
    }, HEARTBEAT_INTERVAL);

    heartbeatIntervals.set(socket.id, heartbeatInterval);

    // Handle heartbeat responses
    socket.on("pong", () => {
      // Client responded to ping
      logger.debug(`Heartbeat response from ${socket.id}`);
    });

    // Subscribe to real-time updates for a specific region/position
    socket.on("subscribe", async (data) => {
      try {
        // Rate limiting
        if (!checkRateLimit(socket.id)) {
          socket.emit("error", { message: "Rate limit exceeded" });
          return;
        }

        // Input validation and sanitization
        const sanitizedData = {
          position: sanitizeInput(data.position, 50),
          regionCode: sanitizeInput(data.regionCode, 100),
          regionType: sanitizeInput(data.regionType, 50),
        };

        if (!sanitizedData.position || !sanitizedData.regionCode) {
          socket.emit("error", {
            message: "Position and regionCode are required",
          });
          return;
        }

        if (!VALID_POSITIONS.includes(sanitizedData.position)) {
          socket.emit("error", { message: "Invalid position" });
          return;
        }

        if (
          sanitizedData.regionType &&
          !VALID_REGION_TYPES.includes(sanitizedData.regionType)
        ) {
          socket.emit("error", { message: "Invalid region type" });
          return;
        }

        const room = `updates:${sanitizedData.position}:${sanitizedData.regionCode}`;
        socket.join(room);

        // Store client subscription
        clientSubscriptions.set(socket.id, {
          position: sanitizedData.position,
          regionCode: sanitizedData.regionCode,
          regionType: sanitizedData.regionType,
          room,
          timestamp: new Date(),
        });

        logger.info(`Client ${socket.id} subscribed to ${room}`);

        // Send current data immediately
        const currentData = await getCurrentResults(
          sanitizedData.position,
          sanitizedData.regionCode
        );
        socket.emit("currentData", currentData);

        socket.emit("subscribed", {
          message: "Successfully subscribed to real-time updates",
          room,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error("Error in subscribe:", error);
        socket.emit("error", { message: "Failed to subscribe" });
      }
    });

    // Subscribe to election status updates
    socket.on("subscribeStatus", async () => {
      try {
        // Rate limiting
        if (!checkRateLimit(socket.id)) {
          socket.emit("error", { message: "Rate limit exceeded" });
          return;
        }

        const room = "election:status";
        socket.join(room);

        // Send current status immediately
        const status = await getElectionStatus();
        socket.emit("electionStatus", status);

        socket.emit("subscribed", {
          message: "Successfully subscribed to election status",
          room,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error("Error in subscribeStatus:", error);
        socket.emit("error", { message: "Failed to subscribe to status" });
      }
    });

    // Subscribe to commissioner notifications
    socket.on("subscribeCommissioner", async (data) => {
      try {
        // Rate limiting
        if (!checkRateLimit(socket.id)) {
          socket.emit("error", { message: "Rate limit exceeded" });
          return;
        }
        // Authentication required for commissioner subscriptions
        const auth = await authenticateSocket(socket);
        if (!auth.authenticated || auth.role !== "IEBC_COMMISSIONER") {
          socket.emit("error", { message: "Unauthorized" });
          return;
        }
        const room = `commissioner:${auth.user.id}`;
        socket.join(room);
        logger.info(`Commissioner ${auth.user.id} subscribed to notifications`);
        socket.emit("subscribed", {
          message: "Successfully subscribed to commissioner notifications",
          room,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error("Error in subscribeCommissioner:", error);
        socket.emit("error", {
          message: "Failed to subscribe to commissioner notifications",
        });
      }
    });

    // Subscribe to returning officer notifications
    socket.on("subscribeReturningOfficer", async (data) => {
      try {
        if (!checkRateLimit(socket.id)) {
          socket.emit("error", { message: "Rate limit exceeded" });
          return;
        }
        const auth = await authenticateSocket(socket);
        if (!auth.authenticated || auth.role !== "RETURNING_OFFICER") {
          socket.emit("error", { message: "Unauthorized" });
          return;
        }
        const room = `returning:${auth.user.id}`;
        socket.join(room);
        logger.info(
          `Returning Officer ${auth.user.id} subscribed to notifications`
        );
        socket.emit("subscribed", {
          message: "Successfully subscribed to returning officer notifications",
          room,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error("Error in subscribeReturningOfficer:", error);
        socket.emit("error", {
          message: "Failed to subscribe to returning officer notifications",
        });
      }
    });

    // Subscribe to presiding officer notifications
    socket.on("subscribePresidingOfficer", async (data) => {
      try {
        if (!checkRateLimit(socket.id)) {
          socket.emit("error", { message: "Rate limit exceeded" });
          return;
        }
        const auth = await authenticateSocket(socket);
        if (!auth.authenticated || auth.role !== "PRESIDING_OFFICER") {
          socket.emit("error", { message: "Unauthorized" });
          return;
        }
        const room = `presiding:${auth.user.id}`;
        socket.join(room);
        logger.info(
          `Presiding Officer ${auth.user.id} subscribed to notifications`
        );
        socket.emit("subscribed", {
          message: "Successfully subscribed to presiding officer notifications",
          room,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error("Error in subscribePresidingOfficer:", error);
        socket.emit("error", {
          message: "Failed to subscribe to presiding officer notifications",
        });
      }
    });

    // Subscribe to election clerk notifications
    socket.on("subscribeElectionClerk", async (data) => {
      try {
        if (!checkRateLimit(socket.id)) {
          socket.emit("error", { message: "Rate limit exceeded" });
          return;
        }
        const auth = await authenticateSocket(socket);
        if (!auth.authenticated || auth.role !== "ELECTION_CLERK") {
          socket.emit("error", { message: "Unauthorized" });
          return;
        }
        const room = `clerk:${auth.user.id}`;
        socket.join(room);
        logger.info(
          `Election Clerk ${auth.user.id} subscribed to notifications`
        );
        socket.emit("subscribed", {
          message: "Successfully subscribed to election clerk notifications",
          room,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error("Error in subscribeElectionClerk:", error);
        socket.emit("error", {
          message: "Failed to subscribe to election clerk notifications",
        });
      }
    });

    // Subscribe to system administrator notifications
    socket.on("subscribeSysAdmin", async (data) => {
      try {
        if (!checkRateLimit(socket.id)) {
          socket.emit("error", { message: "Rate limit exceeded" });
          return;
        }
        const auth = await authenticateSocket(socket);
        if (!auth.authenticated || auth.role !== "SYSTEM_ADMINISTRATOR") {
          socket.emit("error", { message: "Unauthorized" });
          return;
        }
        const room = `sysadmin:${auth.user.id}`;
        socket.join(room);
        logger.info(
          `System Administrator ${auth.user.id} subscribed to notifications`
        );
        socket.emit("subscribed", {
          message:
            "Successfully subscribed to system administrator notifications",
          room,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error("Error in subscribeSysAdmin:", error);
        socket.emit("error", {
          message: "Failed to subscribe to system administrator notifications",
        });
      }
    });

    // Handle client disconnection
    socket.on("disconnect", () => {
      logger.info(`Client disconnected: ${socket.id}`);

      // Clean up resources
      clientSubscriptions.delete(socket.id);
      rateLimiter.delete(socket.id);

      // Clear heartbeat interval
      const interval = heartbeatIntervals.get(socket.id);
      if (interval) {
        clearInterval(interval);
        heartbeatIntervals.delete(socket.id);
      }

      // Update connection count
      const newCount = connectionCounts.get(clientIP) - 1;
      if (newCount <= 0) {
        connectionCounts.delete(clientIP);
      } else {
        connectionCounts.set(clientIP, newCount);
      }
    });

    // Handle errors
    socket.on("error", (error) => {
      logger.error(`Socket error for ${socket.id}:`, error);
    });

    // Handle ping from client
    socket.on("ping", () => {
      socket.emit("pong");
    });
  });

  // Function to get current results
  async function getCurrentResults(position, regionCode) {
    try {
      const votes = await prismaInstance.vote.findMany({
        where: {
          position,
          regionCode,
          candidate: {
            isActive: true,
          },
        },
        include: {
          candidate: true,
        },
        orderBy: {
          voteCount: "desc",
        },
      });

      const totalVotes = votes.reduce((sum, vote) => sum + vote.voteCount, 0);

      return {
        position,
        regionCode,
        totalVotes,
        results: votes.map((vote) => ({
          candidateId: vote.candidateId,
          name: vote.candidate.name,
          party: vote.candidate.party,
          voteCount: vote.voteCount,
          percentage:
            totalVotes > 0
              ? ((vote.voteCount / totalVotes) * 100).toFixed(2)
              : "0.00",
        })),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error("Error getting current results:", error);
      throw error;
    }
  }

  // Function to get election status
  async function getElectionStatus() {
    try {
      // Fetch all election status entries
      const status = await prismaInstance.electionStatus.findMany();

      // Fetch all regions in one go for mapping
      const regionIds = status.map((pos) => pos.regionId).filter(Boolean);
      let regionMap = {};
      if (regionIds.length > 0) {
        const regions = await prismaInstance.region.findMany({
          where: { id: { in: regionIds } },
        });
        regionMap = Object.fromEntries(regions.map((r) => [r.id, r]));
      }

      return {
        positions: status.map((pos) => ({
          position: pos.position,
          status: pos.status,
          totalStations: pos.totalStations,
          reportingStations: pos.reportingStations,
          reportingPercentage:
            pos.totalStations > 0
              ? ((pos.reportingStations / pos.totalStations) * 100).toFixed(1)
              : "0.0",
          totalVotes: pos.totalVotes,
          lastUpdate: pos.lastUpdate,
          // Add correct region info if available
          region:
            regionMap[pos.regionId]?.name ||
            regionMap[pos.regionId]?.code ||
            null,
          regionId: pos.regionId || null,
        })),
        overallStatus: status.every((pos) => pos.status === "COMPLETED")
          ? "COMPLETED"
          : "IN_PROGRESS",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error("Error getting election status:", error);
      throw error;
    }
  }

  // Function to broadcast vote updates
  async function broadcastVoteUpdate(position, regionCode, voteData) {
    try {
      const room = `updates:${position}:${regionCode}`;
      const updatedData = await getCurrentResults(position, regionCode);

      io.to(room).emit("voteUpdate", {
        ...updatedData,
        updateType: "vote",
        source: voteData.source,
      });

      logger.info(`Broadcasted vote update to ${room}`);
    } catch (error) {
      logger.error("Error broadcasting vote update:", error);
    }
  }

  // Function to broadcast election status updates
  async function broadcastStatusUpdate() {
    try {
      const status = await getElectionStatus();

      io.to("election:status").emit("statusUpdate", status);

      logger.info("Broadcasted status update");
    } catch (error) {
      logger.error("Error broadcasting status update:", error);
    }
  }

  // Function to send admin notifications
  function sendAdminNotification(userId, notification) {
    try {
      const room = `sysadmin:${userId}`; // Assuming SYSTEM_ADMINISTRATOR is the only admin role now

      io.to(room).emit("adminNotification", {
        ...notification,
        timestamp: new Date().toISOString(),
      });

      logger.info(`Sent admin notification to ${room}`);
    } catch (error) {
      logger.error("Error sending admin notification:", error);
    }
  }

  // Function to broadcast system alerts
  function broadcastSystemAlert(alert) {
    try {
      io.emit("systemAlert", {
        ...alert,
        timestamp: new Date().toISOString(),
      });

      logger.info("Broadcasted system alert");
    } catch (error) {
      logger.error("Error broadcasting system alert:", error);
    }
  }

  // Function to get connection statistics
  function getConnectionStats() {
    return {
      totalConnections: io.engine.clientsCount,
      connectionsPerIP: Object.fromEntries(connectionCounts),
      activeSubscriptions: clientSubscriptions.size,
      rateLimitedClients: rateLimiter.size,
    };
  }

  // Function to disconnect client
  function disconnectClient(socketId, reason = "Admin disconnect") {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit("disconnect", { reason });
      socket.disconnect();
      logger.info(`Admin disconnected client ${socketId}: ${reason}`);
    }
  }

  // Export functions for use in other parts of the application
  return {
    broadcastVoteUpdate,
    broadcastStatusUpdate,
    sendAdminNotification,
    broadcastSystemAlert,
    getCurrentResults,
    getElectionStatus,
    getConnectionStats,
    disconnectClient,
  };
}
