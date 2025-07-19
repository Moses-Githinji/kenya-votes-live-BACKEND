import express from "express";
import { body, param, query, validationResult } from "express-validator";
import pkg from "@prisma/client";
const { PrismaClient } = pkg;
import Redis from "ioredis";
import { createObjectCsvWriter } from "csv-writer";
import logger from "../utils/logger.js";
import { generateChecksum } from "../utils/checksum.js";
import { auditLog } from "../utils/audit.js";

const router = express.Router();
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL);

// Manual vote entry
router.post(
  "/votes",
  [
    body("candidateId").isString().notEmpty(),
    body("regionId").isString().notEmpty(),
    body("position").isIn([
      "PRESIDENT",
      "GOVERNOR",
      "SENATOR",
      "MP",
      "WOMAN_REPRESENTATIVE",
      "COUNTY_ASSEMBLY_MEMBER",
    ]),
    body("voteCount").isInt({ min: 0 }),
    body("source").isIn(["KIEMS", "MANUAL", "CORRECTED"]),
    body("reason").optional().isString(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { candidateId, regionId, position, voteCount, source, reason } =
        req.body;
      const userId = req.user.id;

      // Check if vote record exists
      const existingVote = await prisma.vote.findFirst({
        where: {
          candidateId,
          regionId,
          position,
          timestamp: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      });

      let vote;
      if (existingVote) {
        // Update existing vote
        const oldValue = existingVote.voteCount;
        vote = await prisma.vote.update({
          where: { id: existingVote.id },
          data: {
            voteCount,
            source,
            updatedAt: new Date(),
          },
        });

        // Log the update
        await prisma.voteUpdate.create({
          data: {
            voteId: vote.id,
            userId,
            oldValue,
            newValue: voteCount,
            reason: reason || "Manual update",
          },
        });
      } else {
        // Create new vote record
        vote = await prisma.vote.create({
          data: {
            candidateId,
            regionId,
            position,
            voteCount,
            source,
            checksum: generateChecksum({
              candidateId,
              regionId,
              position,
              voteCount,
            }),
          },
        });
      }

      // Log admin action
      await auditLog(userId, "VOTE_UPDATE", "Vote", vote.id, {
        candidateId,
        regionId,
        position,
        voteCount,
        source,
        reason,
      });

      // Invalidate cache
      await redis.del(`results:${position}:${regionId}`);

      res.status(200).json({
        message: "Vote record updated successfully",
        vote: {
          id: vote.id,
          candidateId: vote.candidateId,
          regionId: vote.regionId,
          position: vote.position,
          voteCount: vote.voteCount,
          source: vote.source,
          timestamp: vote.timestamp,
        },
      });
    } catch (error) {
      logger.error("Error updating vote:", error);
      res.status(500).json({
        error: "Unable to update vote record",
      });
    }
  }
);

// Data verification
router.post(
  "/verify/:regionId",
  [
    param("regionId").isString().notEmpty(),
    body("position").isIn([
      "PRESIDENT",
      "GOVERNOR",
      "SENATOR",
      "MP",
      "WOMAN_REPRESENTATIVE",
      "COUNTY_ASSEMBLY_MEMBER",
    ]),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { regionId } = req.params;
      const { position } = req.body;
      const userId = req.user.id;

      // Get all votes for the region and position
      const votes = await prisma.vote.findMany({
        where: {
          regionId,
          position,
          candidate: {
            isActive: true,
          },
        },
        include: {
          candidate: true,
        },
      });

      // Calculate totals
      const totalVotes = votes.reduce((sum, vote) => sum + vote.voteCount, 0);
      const region = await prisma.region.findUnique({
        where: { id: regionId },
      });

      // Check for discrepancies
      const discrepancies = [];
      votes.forEach((vote) => {
        const percentage =
          totalVotes > 0 ? (vote.voteCount / totalVotes) * 100 : 0;
        if (percentage > 100) {
          discrepancies.push({
            candidateId: vote.candidateId,
            candidateName: vote.candidate.name,
            issue: "Vote count exceeds 100%",
            voteCount: vote.voteCount,
            percentage: percentage.toFixed(2),
          });
        }
      });

      // Log verification action
      await auditLog(userId, "VERIFY_DATA", "Region", regionId, {
        position,
        totalVotes,
        registeredVoters: region?.registeredVoters,
        discrepancies: discrepancies.length,
      });

      res.json({
        regionId,
        position,
        totalVotes,
        registeredVoters: region?.registeredVoters || 0,
        turnoutPercentage: region?.registeredVoters
          ? ((totalVotes / region.registeredVoters) * 100).toFixed(2)
          : "0.00",
        discrepancies,
        verificationStatus: discrepancies.length === 0 ? "PASSED" : "FAILED",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error verifying data:", error);
      res.status(500).json({
        error: "Unable to verify data",
      });
    }
  }
);

// Result certification
router.post(
  "/certify/:regionId",
  [
    param("regionId").isString().notEmpty(),
    body("position").isIn([
      "PRESIDENT",
      "GOVERNOR",
      "SENATOR",
      "MP",
      "WOMAN_REPRESENTATIVE",
      "COUNTY_ASSEMBLY_MEMBER",
    ]),
    body("status").isIn(["CERTIFIED", "DISPUTED"]),
    body("notes").optional().isString(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { regionId } = req.params;
      const { position, status, notes } = req.body;
      const userId = req.user.id;

      // Update or create certification record
      const certification = await prisma.certification.upsert({
        where: {
          regionId_position: {
            regionId,
            position,
          },
        },
        update: {
          status,
          certifiedBy: userId,
          certifiedAt: new Date(),
          notes,
        },
        create: {
          regionId,
          position,
          status,
          certifiedBy: userId,
          certifiedAt: new Date(),
          notes,
        },
      });

      // Log certification action
      await auditLog(
        userId,
        "CERTIFY_RESULTS",
        "Certification",
        certification.id,
        {
          regionId,
          position,
          status,
          notes,
        }
      );

      res.json({
        message: "Results certified successfully",
        certification: {
          id: certification.id,
          regionId: certification.regionId,
          position: certification.position,
          status: certification.status,
          certifiedAt: certification.certifiedAt,
          notes: certification.notes,
        },
      });
    } catch (error) {
      logger.error("Error certifying results:", error);
      res.status(500).json({
        error: "Unable to certify results",
      });
    }
  }
);

// Candidate management
router.post(
  "/candidates",
  [
    body("name").isString().notEmpty(),
    body("party").isString().notEmpty(),
    body("position").isIn([
      "PRESIDENT",
      "GOVERNOR",
      "SENATOR",
      "MP",
      "WOMAN_REPRESENTATIVE",
      "COUNTY_ASSEMBLY_MEMBER",
    ]),
    body("regionId").isString().notEmpty(),
    body("regionType").isIn([
      "NATIONAL",
      "COUNTY",
      "CONSTITUENCY",
      "WARD",
      "POLLING_STATION",
    ]),
    body("bio").optional().isString(),
    body("photoUrl").optional().isURL(),
    body("translations").optional().isArray(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        name,
        party,
        position,
        regionId,
        regionType,
        bio,
        photoUrl,
        translations,
      } = req.body;
      const userId = req.user.id;

      // Create candidate
      const candidate = await prisma.candidate.create({
        data: {
          name,
          party,
          position,
          regionId,
          regionType,
          bio,
          photoUrl,
        },
      });

      // Add translations if provided
      if (translations && translations.length > 0) {
        await prisma.candidateTranslation.createMany({
          data: translations.map((trans) => ({
            candidateId: candidate.id,
            language: trans.language,
            bio: trans.bio,
          })),
        });
      }

      // Log candidate creation
      await auditLog(userId, "CREATE_CANDIDATE", "Candidate", candidate.id, {
        name,
        party,
        position,
        regionId,
      });

      res.status(201).json({
        message: "Candidate created successfully",
        candidate: {
          id: candidate.id,
          name: candidate.name,
          party: candidate.party,
          position: candidate.position,
          regionId: candidate.regionId,
          regionType: candidate.regionType,
        },
      });
    } catch (error) {
      logger.error("Error creating candidate:", error);
      res.status(500).json({
        error: "Unable to create candidate",
      });
    }
  }
);

// Audit log retrieval
router.get(
  "/logs",
  [
    query("userId").optional().isString(),
    query("action").optional().isString(),
    query("startDate").optional().isISO8601(),
    query("endDate").optional().isISO8601(),
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        userId,
        action,
        startDate,
        endDate,
        page = 1,
        limit = 50,
      } = req.query;

      const whereClause = {};
      if (userId) whereClause.userId = userId;
      if (action) whereClause.action = action;
      if (startDate || endDate) {
        whereClause.timestamp = {};
        if (startDate) whereClause.timestamp.gte = new Date(startDate);
        if (endDate) whereClause.timestamp.lte = new Date(endDate);
      }

      const logs = await prisma.auditLog.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          timestamp: "desc",
        },
        skip: (page - 1) * limit,
        take: limit,
      });

      const total = await prisma.auditLog.count({ where: whereClause });

      res.json({
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      logger.error("Error fetching audit logs:", error);
      res.status(500).json({
        error: "Unable to fetch audit logs",
      });
    }
  }
);

// Data export
router.get(
  "/export/:position/:regionType/:regionId",
  [
    param("position").isIn([
      "PRESIDENT",
      "GOVERNOR",
      "SENATOR",
      "MP",
      "WOMAN_REPRESENTATIVE",
      "COUNTY_ASSEMBLY_MEMBER",
    ]),
    param("regionType").isIn([
      "NATIONAL",
      "COUNTY",
      "CONSTITUENCY",
      "WARD",
      "POLLING_STATION",
    ]),
    param("regionId").isString().notEmpty(),
    query("format").optional().isIn(["csv", "json"]),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { position, regionType, regionId } = req.params;
      const { format = "csv" } = req.query;
      const userId = req.user.id;

      // Get vote data
      const votes = await prisma.vote.findMany({
        where: {
          position,
          regionId,
          candidate: {
            isActive: true,
          },
        },
        include: {
          candidate: true,
          region: true,
        },
        orderBy: {
          voteCount: "desc",
        },
      });

      if (format === "json") {
        res.json({
          position,
          regionType,
          regionId,
          regionName: votes[0]?.region.name,
          totalVotes: votes.reduce((sum, vote) => sum + vote.voteCount, 0),
          results: votes.map((vote) => ({
            candidateName: vote.candidate.name,
            party: vote.candidate.party,
            voteCount: vote.voteCount,
            source: vote.source,
            timestamp: vote.timestamp,
          })),
          exportedAt: new Date().toISOString(),
        });
      } else {
        // CSV export
        const csvWriter = createObjectCsvWriter({
          path: `export_${position}_${regionId}_${Date.now()}.csv`,
          header: [
            { id: "candidateName", title: "Candidate Name" },
            { id: "party", title: "Party" },
            { id: "voteCount", title: "Vote Count" },
            { id: "source", title: "Source" },
            { id: "timestamp", title: "Timestamp" },
          ],
        });

        const records = votes.map((vote) => ({
          candidateName: vote.candidate.name,
          party: vote.candidate.party,
          voteCount: vote.voteCount,
          source: vote.source,
          timestamp: vote.timestamp.toISOString(),
        }));

        await csvWriter.writeRecords(records);

        // Log export action
        await auditLog(userId, "EXPORT_DATA", "Export", null, {
          position,
          regionType,
          regionId,
          format,
          recordCount: records.length,
        });

        res.download(
          csvWriter.path,
          `election_results_${position}_${regionId}.csv`
        );
      }
    } catch (error) {
      logger.error("Error exporting data:", error);
      res.status(500).json({
        error: "Unable to export data",
      });
    }
  }
);

// System health monitoring
router.get("/health", async (req, res) => {
  try {
    const healthChecks = {
      database: "unknown",
      redis: "unknown",
      timestamp: new Date().toISOString(),
    };

    // Check database
    try {
      await prisma.$queryRaw`SELECT 1`;
      healthChecks.database = "healthy";
    } catch (error) {
      healthChecks.database = "unhealthy";
      logger.error("Database health check failed:", error);
    }

    // Check Redis
    try {
      await redis.ping();
      healthChecks.redis = "healthy";
    } catch (error) {
      healthChecks.redis = "unhealthy";
      logger.error("Redis health check failed:", error);
    }

    const overallStatus =
      healthChecks.database === "healthy" && healthChecks.redis === "healthy"
        ? "healthy"
        : "degraded";

    res.json({
      status: overallStatus,
      checks: healthChecks,
    });
  } catch (error) {
    logger.error("Health check failed:", error);
    res.status(500).json({
      status: "unhealthy",
      error: "Health check failed",
    });
  }
});

export default router;
