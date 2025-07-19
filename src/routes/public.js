import express from "express";
import { body, param, query, validationResult } from "express-validator";
import pkg from "@prisma/client";
const { PrismaClient } = pkg;
import Redis from "ioredis";
import { cacheMiddleware } from "../middleware/cache.js";
import { generateChecksum } from "../utils/checksum.js";
import logger from "../utils/logger.js";

const router = express.Router();
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL);

// Real-time vote data retrieval
router.get(
  "/results/:position/:regionType/:regionId",
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
    query("language").optional().isIn(["en", "sw", "kk", "lu", "km", "kl"]),
  ],
  cacheMiddleware(60), // Cache for 60 seconds
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { position, regionType, regionId } = req.params;
      const { language = "en" } = req.query;

      // First find the region by its code
      const region = await prisma.region.findUnique({
        where: { code: regionId },
      });

      if (!region) {
        return res.status(404).json({
          error: "Region not found",
          message: "The requested region does not exist",
        });
      }

      // Get vote results with candidate information
      const results = await prisma.vote.findMany({
        where: {
          position: position,
          regionId: region.id,
          candidate: {
            isActive: true,
          },
        },
        include: {
          candidate: {
            include: {
              translations: {
                where: { language },
              },
            },
          },
        },
        orderBy: {
          voteCount: "desc",
        },
      });

      // Calculate totals and percentages
      const totalVotes = results.reduce((sum, vote) => sum + vote.voteCount, 0);
      const resultsWithPercentages = results.map((vote) => ({
        candidateId: vote.candidateId,
        name: vote.candidate.name,
        party: vote.candidate.party,
        voteCount: vote.voteCount,
        percentage:
          totalVotes > 0
            ? ((vote.voteCount / totalVotes) * 100).toFixed(2)
            : "0.00",
        bio: vote.candidate.translations[0]?.bio || vote.candidate.bio,
        photoUrl: vote.candidate.photoUrl,
      }));

      const response = {
        position,
        regionType,
        regionId,
        totalVotes,
        results: resultsWithPercentages,
        source: "IEBC KIEMS",
        lastUpdated: new Date().toISOString(),
        checksum: generateChecksum(resultsWithPercentages),
        verificationUrl: `https://www.iebc.or.ke/results/${regionId}`,
      };

      res.json(response);
    } catch (error) {
      logger.error("Error fetching results:", error);
      res.status(500).json({
        error: "Results temporarily unavailable",
        message: "Please try again in a few moments",
      });
    }
  }
);

// Candidate profile retrieval
router.get(
  "/candidates/:id",
  [
    param("id").isString().notEmpty(),
    query("language").optional().isIn(["en", "sw", "kk", "lu", "km", "kl"]),
  ],
  cacheMiddleware(300), // Cache for 5 minutes
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const { language = "en" } = req.query;

      const candidate = await prisma.candidate.findUnique({
        where: { id },
        include: {
          translations: {
            where: { language },
          },
          votes: {
            include: {
              region: true,
            },
            orderBy: {
              voteCount: "desc",
            },
          },
        },
      });

      if (!candidate) {
        return res.status(404).json({
          error: "Candidate not found",
          message: "The requested candidate does not exist",
        });
      }

      const response = {
        id: candidate.id,
        name: candidate.name,
        party: candidate.party,
        position: candidate.position,
        bio: candidate.translations[0]?.bio || candidate.bio,
        photoUrl: candidate.photoUrl,
        regionId: candidate.regionId,
        regionType: candidate.regionType,
        totalVotes: candidate.votes.reduce(
          (sum, vote) => sum + vote.voteCount,
          0
        ),
        performance: candidate.votes.map((vote) => ({
          regionName: vote.region.name,
          voteCount: vote.voteCount,
          timestamp: vote.timestamp,
        })),
      };

      res.json(response);
    } catch (error) {
      logger.error("Error fetching candidate:", error);
      res.status(500).json({
        error: "Candidate information temporarily unavailable",
      });
    }
  }
);

// Candidate search
router.get(
  "/candidates/search",
  [
    query("q").isString().notEmpty(),
    query("position")
      .optional()
      .isIn([
        "PRESIDENT",
        "GOVERNOR",
        "SENATOR",
        "MP",
        "WOMAN_REPRESENTATIVE",
        "COUNTY_ASSEMBLY_MEMBER",
      ]),
    query("regionId").optional().isString(),
    query("language").optional().isIn(["en", "sw", "kk", "lu", "km", "kl"]),
  ],
  cacheMiddleware(120), // Cache for 2 minutes
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { q, position, regionId, language = "en" } = req.query;

      const whereClause = {
        isActive: true,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { party: { contains: q, mode: "insensitive" } },
        ],
      };

      if (position) whereClause.position = position;
      if (regionId) whereClause.regionId = regionId;

      const candidates = await prisma.candidate.findMany({
        where: whereClause,
        include: {
          translations: {
            where: { language },
          },
          votes: {
            select: {
              voteCount: true,
            },
          },
        },
        take: 20,
      });

      const results = candidates.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        party: candidate.party,
        position: candidate.position,
        bio: candidate.translations[0]?.bio || candidate.bio,
        photoUrl: candidate.photoUrl,
        totalVotes: candidate.votes.reduce(
          (sum, vote) => sum + vote.voteCount,
          0
        ),
      }));

      res.json({
        query: q,
        results,
        total: results.length,
      });
    } catch (error) {
      logger.error("Error searching candidates:", error);
      res.status(500).json({
        error: "Search temporarily unavailable",
      });
    }
  }
);

// Map data endpoint
router.get(
  "/map/:regionType/:regionId?",
  [
    param("regionType").isIn([
      "NATIONAL",
      "COUNTY",
      "CONSTITUENCY",
      "WARD",
      "POLLING_STATION",
    ]),
    param("regionId").optional().isString(),
    query("includeResults").optional().isBoolean(),
  ],
  cacheMiddleware(600), // Cache for 10 minutes
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { regionType, regionId } = req.params;
      const { includeResults = false } = req.query;

      const whereClause = {
        type: regionType,
        isActive: true,
      };

      if (regionId) {
        whereClause.parentId = regionId;
      }

      const regions = await prisma.region.findMany({
        where: whereClause,
        include:
          includeResults === "true"
            ? {
                votes: {
                  include: {
                    candidate: true,
                  },
                },
              }
            : undefined,
      });

      const geojson = {
        type: "FeatureCollection",
        features: regions.map((region) => ({
          type: "Feature",
          geometry: region.geojson,
          properties: {
            id: region.id,
            name: region.name,
            code: region.code,
            type: region.type,
            registeredVoters: region.registeredVoters,
            ...(includeResults === "true" && {
              results: region.votes.map((vote) => ({
                candidateName: vote.candidate.name,
                party: vote.candidate.party,
                voteCount: vote.voteCount,
              })),
            }),
          },
        })),
      };

      res.json(geojson);
    } catch (error) {
      logger.error("Error fetching map data:", error);
      res.status(500).json({
        error: "Map data temporarily unavailable",
      });
    }
  }
);

// Historical results
router.get(
  "/historical/:year/:regionId",
  [
    param("year").isInt({ min: 2002, max: 2027 }),
    param("regionId").isString().notEmpty(),
  ],
  cacheMiddleware(3600), // Cache for 1 hour
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { year, regionId } = req.params;

      // For now, return mock historical data
      // In production, this would query a historical database
      const historicalData = {
        year: parseInt(year),
        regionId,
        results: [
          {
            candidateName: "Historical Candidate 1",
            party: "Party A",
            voteCount: 150000,
            percentage: "45.2",
          },
          {
            candidateName: "Historical Candidate 2",
            party: "Party B",
            voteCount: 120000,
            percentage: "36.1",
          },
        ],
        totalVotes: 332000,
        turnout: "65.4",
        source: "IEBC Historical Records",
      };

      res.json(historicalData);
    } catch (error) {
      logger.error("Error fetching historical data:", error);
      res.status(500).json({
        error: "Historical data temporarily unavailable",
      });
    }
  }
);

// Feedback collection
router.post(
  "/feedback",
  [
    body("type").isIn(["issue", "suggestion", "general"]),
    body("message").isString().isLength({ min: 10, max: 1000 }),
    body("email").optional().isEmail(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { type, message, email } = req.body;

      const feedback = await prisma.feedback.create({
        data: {
          type,
          message,
          email,
          userAgent: req.get("User-Agent"),
          ipAddress: req.ip,
        },
      });

      res.status(201).json({
        message: "Feedback submitted successfully",
        id: feedback.id,
      });
    } catch (error) {
      logger.error("Error submitting feedback:", error);
      res.status(500).json({
        error: "Unable to submit feedback at this time",
      });
    }
  }
);

// Election status
router.get(
  "/status",
  cacheMiddleware(30), // Cache for 30 seconds
  async (req, res) => {
    try {
      const status = await prisma.electionStatus.findMany();

      const response = {
        timestamp: new Date().toISOString(),
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
        })),
        overallStatus: status.every((pos) => pos.status === "COMPLETED")
          ? "COMPLETED"
          : "IN_PROGRESS",
      };

      res.json(response);
    } catch (error) {
      logger.error("Error fetching election status:", error);
      res.status(500).json({
        error: "Election status temporarily unavailable",
      });
    }
  }
);

// Voter turnout metrics
router.get(
  "/turnout/:regionType/:regionId",
  [
    param("regionType").isIn([
      "NATIONAL",
      "COUNTY",
      "CONSTITUENCY",
      "WARD",
      "POLLING_STATION",
    ]),
    param("regionId").isString().notEmpty(),
  ],
  cacheMiddleware(60), // Cache for 1 minute
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { regionType, regionId } = req.params;

      const region = await prisma.region.findUnique({
        where: { id: regionId },
        include: {
          votes: {
            select: {
              voteCount: true,
            },
          },
        },
      });

      if (!region) {
        return res.status(404).json({
          error: "Region not found",
        });
      }

      const totalVotes = region.votes.reduce(
        (sum, vote) => sum + vote.voteCount,
        0
      );
      const turnoutPercentage =
        region.registeredVoters > 0
          ? ((totalVotes / region.registeredVoters) * 100).toFixed(1)
          : "0.0";

      const response = {
        regionId,
        regionName: region.name,
        regionType,
        registeredVoters: region.registeredVoters,
        totalVotes,
        turnoutPercentage,
        lastUpdated: new Date().toISOString(),
      };

      res.json(response);
    } catch (error) {
      logger.error("Error fetching turnout data:", error);
      res.status(500).json({
        error: "Turnout data temporarily unavailable",
      });
    }
  }
);

export default router;
