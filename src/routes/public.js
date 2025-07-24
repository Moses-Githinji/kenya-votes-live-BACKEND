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

// Utility function to deduplicate candidates by id
function deduplicateCandidates(candidates) {
  const seen = new Set();
  const deduped = [];
  for (const c of candidates) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      deduped.push(c);
    } else {
      logger.warn &&
        logger.warn(`Duplicate candidate id detected in API response: ${c.id}`);
    }
  }
  return deduped;
}

// Real-time vote data retrieval
router.get(
  "/results/:position/:regionType/:regionCode",
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
    param("regionCode").isString().notEmpty(),
    query("language").optional().isIn(["en", "sw", "kk", "lu", "km", "kl"]),
    query("page").optional().isInt({ min: 1 }),
    query("pageSize").optional().isInt({ min: 1, max: 100 }),
  ],
  cacheMiddleware(60),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { position, regionType, regionCode } = req.params;
      const { language = "en" } = req.query;
      const page = parseInt(req.query.page) || 1;
      const pageSize = parseInt(req.query.pageSize) || 50;
      const skip = (page - 1) * pageSize;

      // Find the region by its code
      const region = await prisma.region.findUnique({
        where: { code: regionCode },
      });

      if (!region) {
        return res.status(404).json({
          error: "Region not found",
          message: "The requested region does not exist",
        });
      }

      // Get total count for pagination
      const totalCount = await prisma.vote.count({
        where: {
          position: position,
          regionId: region.id,
          candidate: {
            isActive: true,
          },
        },
      });

      // Get vote results with candidate information (paginated)
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
        skip,
        take: pageSize,
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
        regionCode,
        regionName: region.name, // Add the county/region name
        totalVotes,
        results: resultsWithPercentages,
        totalCount,
        page,
        pageSize,
        source: "IEBC KIEMS",
        lastUpdated: new Date().toISOString(),
        checksum: generateChecksum(resultsWithPercentages),
        verificationUrl: `https://www.iebc.or.ke/results/${regionCode}`,
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

// List all candidates endpoint (no filters, with pagination, aggregated)
router.get("/candidates/all", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize) || 20, 100);
    const skip = (page - 1) * pageSize;

    // Aggregate votes by candidateId for all candidates
    const voteGroups = await prisma.vote.groupBy({
      by: ["candidateId"],
      _sum: { voteCount: true },
      orderBy: { _sum: { voteCount: "desc" } },
      skip,
      take: pageSize,
    });
    const totalCount = await prisma.candidate.count();
    const candidateIds = voteGroups.map((v) => v.candidateId);
    if (candidateIds.length === 0)
      return res.json({ candidates: [], totalCount, page, pageSize });
    const candidateDetails = await prisma.candidate.findMany({
      where: { id: { in: candidateIds } },
      include: { region: true },
    });
    const candidateMap = Object.fromEntries(
      candidateDetails.map((c) => [c.id, c])
    );
    const totalVotes =
      voteGroups.reduce((sum, v) => sum + (v._sum.voteCount || 0), 0) || 1;
    const allCandidates = voteGroups.map((vote) => {
      const c = candidateMap[vote.candidateId];
      const registeredVoters = c?.region?.registeredVoters || null;
      const voteCount = vote._sum.voteCount || 0;
      return {
        id: vote.candidateId,
        name: c?.name || "",
        party: c?.party || "",
        position: c?.position || "",
        region: c?.region ? { code: c.region.code, name: c.region.name } : null,
        countyCode: c?.region?.type === "COUNTY" ? c.region.code : null,
        constituencyCode:
          c?.region?.type === "CONSTITUENCY" ? c.region.code : null,
        wardCode: c?.region?.type === "WARD" ? c.region.code : null,
        voteCount: voteCount,
        percentage: Number(((voteCount / totalVotes) * 100).toFixed(1)),
        registeredVoters: registeredVoters,
        turnoutPercentage:
          registeredVoters && registeredVoters > 0
            ? Number(((voteCount / registeredVoters) * 100).toFixed(1))
            : null,
      };
    });
    res.json({
      candidates: allCandidates,
      totalCount,
      page,
      pageSize,
    });
  } catch (error) {
    logger.error("Error listing all candidates:", error);
    res.status(500).json({ error: "Unable to list all candidates" });
  }
});

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
          region: true,
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
        region: candidate.region
          ? { code: candidate.region.code, name: candidate.region.name }
          : null,
        status: null, // placeholder, will be set below
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

      // Fetch status from electionStatus table for this candidate's position and regionId
      try {
        const electionStatus = await prisma.electionStatus.findFirst({
          where: {
            position: candidate.position,
            regionId: candidate.regionId,
          },
        });
        if (electionStatus) {
          response.status = electionStatus.status;
        }
      } catch (err) {
        logger.error("Error fetching candidate status:", err);
      }

      res.json(response);
    } catch (error) {
      logger.error("Error fetching candidate:", error);
      res.status(500).json({
        error: "Candidate information temporarily unavailable",
      });
    }
  }
);

// Candidate search (aggregated)
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
    query("regionCode").optional().isString(),
    query("language").optional().isIn(["en", "sw", "kk", "lu", "km", "kl"]),
    query("page").optional().isInt({ min: 1 }),
    query("pageSize").optional().isInt({ min: 1, max: 100 }),
  ],
  cacheMiddleware(120), // Cache for 2 minutes
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { q, position, regionCode, language = "en" } = req.query;
      const page = parseInt(req.query.page) || 1;
      const pageSize = parseInt(req.query.pageSize) || 20;
      const skip = (page - 1) * pageSize;

      // Find candidate IDs matching the search
      const candidateWhere = {
        isActive: true,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { party: { contains: q, mode: "insensitive" } },
        ],
      };
      if (position) candidateWhere.position = position;
      if (regionCode) {
        const region = await prisma.region.findUnique({
          where: { code: regionCode },
        });
        if (region) candidateWhere.regionId = region.id;
        else candidateWhere.regionId = "";
      }
      const totalCount = await prisma.candidate.count({
        where: candidateWhere,
      });
      const candidatesFound = await prisma.candidate.findMany({
        where: candidateWhere,
        select: { id: true },
      });
      const candidateIds = candidatesFound.map((c) => c.id);
      if (candidateIds.length === 0)
        return res.json({
          query: q,
          results: [],
          total: 0,
          totalCount,
          page,
          pageSize,
        });
      // Aggregate votes by candidateId for these candidates
      const voteGroups = await prisma.vote.groupBy({
        by: ["candidateId"],
        where: { candidateId: { in: candidateIds } },
        _sum: { voteCount: true },
        orderBy: { _sum: { voteCount: "desc" } },
        skip,
        take: pageSize,
      });
      const candidateDetails = await prisma.candidate.findMany({
        where: { id: { in: voteGroups.map((v) => v.candidateId) } },
        include: {
          translations: { where: { language } },
        },
      });
      const candidateMap = Object.fromEntries(
        candidateDetails.map((c) => [c.id, c])
      );
      // Calculate total votes for the filtered candidates (from voteGroups)
      const totalVotes =
        voteGroups.reduce((sum, v) => sum + (v._sum.voteCount || 0), 0) || 1;
      const results = voteGroups.map((vote) => {
        const c = candidateMap[vote.candidateId];
        return {
          id: vote.candidateId,
          name: c?.name || "",
          party: c?.party || "",
          position: c?.position || "",
          bio: c?.translations[0]?.bio || c?.bio,
          photoUrl: c?.photoUrl,
          totalVotes: vote._sum.voteCount || 0,
          percentage: Number(
            (((vote._sum.voteCount || 0) / totalVotes) * 100).toFixed(1)
          ),
        };
      });
      res.json({
        query: q,
        results,
        total: results.length,
        totalCount,
        page,
        pageSize,
      });
    } catch (error) {
      logger.error("Error searching candidates:", error);
      res.status(500).json({
        error: "Candidate search temporarily unavailable",
      });
    }
  }
);

// Filtered candidates endpoint for leaderboard
router.get(
  "/candidates",
  [
    query("position").isString().notEmpty(),
    query("region").optional().isString(),
    query("countyCode").optional().isString(),
    query("constituencyCode").optional().isString(),
    query("wardCode").optional().isString(),
  ],
  async (req, res) => {
    try {
      logger.info("/api/candidates called", { query: req.query });
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn("Validation errors in /api/candidates", {
          errors: errors.array(),
        });
        return res.status(400).json({ errors: errors.array() });
      }
      const { position, region, countyCode, constituencyCode, wardCode } =
        req.query;
      let regionId = null;
      // Most specific: wardCode > constituencyCode > countyCode > region
      if (wardCode) {
        const ward = await prisma.region.findFirst({
          where: { code: wardCode, type: "WARD" },
        });
        if (!ward) {
          logger.warn("No ward found for code", { wardCode });
          return res.json({ candidates: [] });
        }
        regionId = ward.id;
      } else if (constituencyCode) {
        const constituency = await prisma.region.findFirst({
          where: { code: constituencyCode, type: "CONSTITUENCY" },
        });
        if (!constituency) {
          logger.warn("No constituency found for code", { constituencyCode });
          return res.json({ candidates: [] });
        }
        regionId = constituency.id;
      } else if (countyCode) {
        const county = await prisma.region.findFirst({
          where: { code: countyCode, type: "COUNTY" },
        });
        if (!county) {
          logger.warn("No county found for code", { countyCode });
          return res.json({ candidates: [] });
        }
        regionId = county.id;
      } else if (region && region !== "ALL") {
        const regionObj = await prisma.region.findFirst({
          where: {
            OR: [
              { code: region },
              { name: { contains: region, mode: "insensitive" } },
            ],
          },
        });
        if (!regionObj) {
          logger.warn("No region found for code or name", { region });
          return res.json({ candidates: [] });
        }
        regionId = regionObj.id;
      }
      // Aggregate votes by candidateId
      const groupByArgs = {
        by: ["candidateId"],
        where: { position },
        _sum: { voteCount: true },
        orderBy: { _sum: { voteCount: "desc" } },
      };
      if (regionId) groupByArgs.where.regionId = regionId;
      let voteGroups;
      try {
        voteGroups = await prisma.vote.groupBy(groupByArgs);
        logger.info("Vote groups fetched", { count: voteGroups.length });
      } catch (err) {
        logger.error("Error in prisma.vote.groupBy", {
          error: err,
          groupByArgs,
        });
        throw err;
      }
      const candidateIds = voteGroups.map((v) => v.candidateId);
      if (candidateIds.length === 0) {
        logger.info("No candidates found after vote groupBy", {
          position,
          regionId,
        });
        return res.json({ candidates: [] });
      }
      let candidateDetails;
      try {
        candidateDetails = await prisma.candidate.findMany({
          where: { id: { in: candidateIds } },
          include: { region: true },
        });
        logger.info("Candidate details fetched", {
          count: candidateDetails.length,
        });
      } catch (err) {
        logger.error("Error in prisma.candidate.findMany", {
          error: err,
          candidateIds,
        });
        throw err;
      }
      const candidateMap = Object.fromEntries(
        candidateDetails.map((c) => [c.id, c])
      );
      const totalVotes =
        voteGroups.reduce((sum, v) => sum + (v._sum.voteCount || 0), 0) || 1;
      let candidates;
      try {
        candidates = await Promise.all(
          voteGroups.map(async (vote) => {
            const c = candidateMap[vote.candidateId];
            const registeredVoters = c?.region?.registeredVoters || null;
            const voteCount = vote._sum.voteCount || 0;
            let status = null;
            if (c?.region?.id && c?.position) {
              try {
                const electionStatus = await prisma.electionStatus.findFirst({
                  where: {
                    position: c.position,
                    region: { id: c.region.id },
                  },
                });
                if (electionStatus) status = electionStatus.status;
              } catch (err) {
                logger.error("Error fetching electionStatus for candidate", {
                  candidateId: c.id,
                  regionId: c.region.id,
                  error: err,
                });
              }
            }
            return {
              id: vote.candidateId,
              name: c?.name || "",
              party: c?.party || "",
              position,
              region: c?.region
                ? { code: c.region.code, name: c.region.name }
                : null,
              voteCount: voteCount,
              percentage: Number(((voteCount / totalVotes) * 100).toFixed(1)),
              registeredVoters: registeredVoters,
              turnoutPercentage:
                registeredVoters && registeredVoters > 0
                  ? Number(((voteCount / registeredVoters) * 100).toFixed(1))
                  : null,
              status: status,
            };
          })
        );
        logger.info("Candidates array built", { count: candidates.length });
      } catch (err) {
        logger.error("Error building candidates array", { error: err });
        throw err;
      }
      res.json({ candidates });
    } catch (error) {
      logger.error("Error fetching filtered candidates (outer catch)", {
        error: error,
        stack: error?.stack,
      });
      res.status(500).json({ error: "Unable to fetch candidates" });
    }
  }
);

// Map data endpoint
router.get(
  "/map/:regionType/:regionCode?",
  [
    param("regionType").isIn([
      "NATIONAL",
      "COUNTY",
      "CONSTITUENCY",
      "WARD",
      "POLLING_STATION",
    ]),
    param("regionCode").optional().isString(),
    query("includeResults").optional().isBoolean(),
  ],
  cacheMiddleware(600), // Cache for 10 minutes
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { regionType, regionCode } = req.params;
      const { includeResults = false } = req.query;

      const whereClause = {
        type: regionType.toUpperCase(),
        isActive: true,
      };

      // If regionCode is provided, get subregions
      if (regionCode) {
        const parentRegion = await prisma.region.findUnique({
          where: { code: regionCode },
        });
        if (parentRegion) whereClause.parentId = parentRegion.id;
        else whereClause.parentId = ""; // No match
      }

      // Map regionType to position
      const positionMap = {
        NATIONAL: "PRESIDENT",
        COUNTY: "PRESIDENT",
        CONSTITUENCY: "MP",
        WARD: "COUNTY_ASSEMBLY_MEMBER",
        POLLING_STATION: "PRESIDENT",
      };
      const position = positionMap[regionType.toUpperCase()];

      const regions = await prisma.region.findMany({
        where: whereClause,
        include:
          includeResults === "true" || includeResults === true
            ? {
                votes: {
                  where: position ? { position } : undefined,
                  include: {
                    candidate: true,
                  },
                },
              }
            : undefined,
      });

      const features = regions.map((region) => {
        // Format results as array of { candidateName, party, voteCount } for the mapped position
        let results = [];
        if (includeResults === "true" || includeResults === true) {
          results = (region.votes || []).map((vote) => ({
            candidateName: vote.candidate?.name || "",
            party: vote.candidate?.party || "",
            voteCount: vote.voteCount,
          }));
        }
        return {
          type: "Feature",
          geometry: region.geojson || {
            type: "Polygon",
            coordinates: [
              [
                [36.8, -1.3],
                [36.9, -1.3],
                [36.9, -1.2],
                [36.8, -1.2],
                [36.8, -1.3],
              ],
            ],
          },
          properties: {
            id: region.id,
            name: region.name,
            code: region.code,
            type: region.type,
            registeredVoters: region.registeredVoters,
            ...(results.length > 0 ? { results } : {}),
          },
        };
      });

      const geojson = {
        type: "FeatureCollection",
        features,
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
  "/historical/:year/:regionCode",
  [
    param("year").isInt({ min: 2002, max: 2027 }),
    param("regionCode").isString().notEmpty(),
  ],
  cacheMiddleware(3600), // Cache for 1 hour
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { year, regionCode } = req.params;

      // For now, return mock historical data
      // In production, this would query a historical database
      const historicalData = {
        year: parseInt(year),
        regionCode,
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
      // Fetch all election status records
      const status = await prisma.electionStatus.findMany();

      // Fetch total registered voters for the nation (sum of all constituencies)
      const totalRegisteredVoters = await prisma.region
        .aggregate({
          where: { type: "CONSTITUENCY" },
          _sum: { registeredVoters: true },
        })
        .then((r) => r._sum.registeredVoters || 0);

      // Fetch all constituencies
      const constituencies = await prisma.region.findMany({
        where: { type: "CONSTITUENCY" },
      });

      // Build positions array
      const positions = [
        // National-level PRESIDENT stats
        {
          position: "PRESIDENT",
          registeredVoters: totalRegisteredVoters,
          totalStations:
            status.find((pos) => pos.position === "PRESIDENT")?.totalStations ||
            0,
          regionCode: "NATIONAL",
          regionName: "Kenya",
        },
        // Constituency-level stats
        ...constituencies.map((constituency) => ({
          position: "CONSTITUENCY",
          regionCode: constituency.code || "",
          regionName: constituency.name || "",
          registeredVoters: constituency.registeredVoters || 0,
        })),
      ];

      // Fetch recent updates (combine from votes and electionStatus, or mock if none)
      let recentUpdates = [];
      try {
        // Get 3 most recent vote updates
        const recentVotes = await prisma.vote.findMany({
          orderBy: { updatedAt: "desc" },
          take: 3,
          include: {
            candidate: true,
            region: true,
          },
        });
        recentUpdates = recentVotes.map((vote) => ({
          id: `vote-${vote.id}`,
          region:
            vote.position === "PRESIDENT"
              ? "Kenya"
              : vote.region?.name || "Unknown Region",
          position: vote.position,
          updateType: "RESULT",
          details: `${vote.candidate?.name || "Candidate"} (${vote.candidate?.party || "Party"}) now at ${vote.voteCount} votes`,
          timestamp: vote.updatedAt
            ? vote.updatedAt.toISOString()
            : new Date().toISOString(),
        }));
        // Get 2 most recent election status updates
        const recentStatuses = await prisma.electionStatus.findMany({
          orderBy: { updatedAt: "desc" },
          take: 2,
        });
        // Fetch all regions for mapping
        const regionIds = recentStatuses
          .map((status) => status.regionId)
          .filter(Boolean);
        let regionMap = {};
        if (regionIds.length > 0) {
          const regions = await prisma.region.findMany({
            where: { id: { in: regionIds } },
          });
          regionMap = Object.fromEntries(regions.map((r) => [r.id, r]));
        }
        recentUpdates.push(
          ...recentStatuses.map((status) => ({
            id: `status-${status.id}`,
            region:
              regionMap[status.regionId]?.name ||
              regionMap[status.regionId]?.code ||
              (status.position === "PRESIDENT" ? "Kenya" : "Unknown Region"),
            position: status.position,
            updateType: "STATUS",
            details: `Status: ${status.status}, Reporting: ${status.reportingStations}/${status.totalStations}`,
            timestamp: status.updatedAt
              ? status.updatedAt.toISOString()
              : new Date().toISOString(),
          }))
        );
      } catch (e) {
        // fallback to mock updates if DB fails
        recentUpdates = [
          {
            id: "1",
            region: "Nairobi County",
            position: "Governor",
            updateType: "RESULT",
            details: "John Doe (Party A) leads with 12,345 votes",
            timestamp: "2024-07-01T12:34:56Z",
          },
          {
            id: "2",
            region: "Mombasa County",
            position: "Senator",
            updateType: "STATUS",
            details: "Polling station at Coast High School closed",
            timestamp: "2024-07-01T12:14:56Z",
          },
          {
            id: "3",
            region: "Kisumu County",
            position: "MP",
            updateType: "TURNOUT",
            details: "Voter turnout reached 65% at Kisumu Central",
            timestamp: "2024-07-01T11:34:56Z",
          },
        ];
      }

      // Fetch all counties, constituencies, and wards for region filters
      const countiesList = await prisma.region.findMany({
        where: { type: "COUNTY" },
        select: { code: true, name: true },
      });
      const constituenciesList = await prisma.region.findMany({
        where: { type: "CONSTITUENCY" },
        select: { code: true, name: true, parentId: true },
      });
      const wardsList = await prisma.region.findMany({
        where: { type: "WARD" },
        select: { code: true, name: true, parentId: true },
      });

      // Map parentId to countyCode/constituencyCode for constituencies/wards
      const countyIdToCode = Object.fromEntries(
        countiesList.map((c) => [c.id, c.code])
      );
      const constituencyIdToCode = Object.fromEntries(
        constituenciesList.map((c) => [c.id, c.code])
      );
      const constituenciesArr = constituenciesList.map((c) => ({
        code: c.code,
        name: c.name,
        countyCode: countyIdToCode[c.parentId] || null,
      }));
      const wards = wardsList.map((w) => ({
        code: w.code,
        name: w.name,
        constituencyCode: constituencyIdToCode[w.parentId] || null,
      }));
      const counties = countiesList.map((c) => ({
        code: c.code,
        name: c.name,
      }));

      // Enhanced candidates array with advanced region fields
      let candidates = [];
      try {
        // PRESIDENT (national)
        const presidentVotes = await prisma.vote.findMany({
          where: { position: "PRESIDENT" },
          orderBy: { voteCount: "desc" },
          take: 5,
          include: { candidate: true, region: true },
        });
        const totalPresidentVotes =
          presidentVotes.reduce((sum, v) => sum + v.voteCount, 0) || 1;
        candidates = presidentVotes.map((vote) => ({
          id: vote.candidateId,
          name: vote.candidate?.name || "",
          party: vote.candidate?.party || "",
          position: "PRESIDENT",
          voteCount: vote.voteCount,
          percentage: Number(
            ((vote.voteCount / totalPresidentVotes) * 100).toFixed(1)
          ),
          region: "ALL",
        }));
        // GOVERNOR (by county)
        for (const county of countiesList) {
          const governorVotes = await prisma.vote.findMany({
            where: { position: "GOVERNOR", regionId: county.id },
            orderBy: { voteCount: "desc" },
            take: 3,
            include: { candidate: true, region: true },
          });
          const totalGovernorVotes =
            governorVotes.reduce((sum, v) => sum + v.voteCount, 0) || 1;
          candidates.push(
            ...governorVotes.map((vote) => ({
              id: vote.candidateId,
              name: vote.candidate?.name || "",
              party: vote.candidate?.party || "",
              position: "GOVERNOR",
              voteCount: vote.voteCount,
              percentage: Number(
                ((vote.voteCount / totalGovernorVotes) * 100).toFixed(1)
              ),
              countyCode: county.code,
              region: county.name,
            }))
          );
        }
        // SENATOR (by county)
        for (const county of countiesList) {
          const senatorVotes = await prisma.vote.findMany({
            where: { position: "SENATOR", regionId: county.id },
            orderBy: { voteCount: "desc" },
            take: 3,
            include: { candidate: true, region: true },
          });
          const totalSenatorVotes =
            senatorVotes.reduce((sum, v) => sum + v.voteCount, 0) || 1;
          candidates.push(
            ...senatorVotes.map((vote) => ({
              id: vote.candidateId,
              name: vote.candidate?.name || "",
              party: vote.candidate?.party || "",
              position: "SENATOR",
              voteCount: vote.voteCount,
              percentage: Number(
                ((vote.voteCount / totalSenatorVotes) * 100).toFixed(1)
              ),
              countyCode: county.code,
              region: county.name,
            }))
          );
        }
        // MP (by constituency)
        for (const constituency of constituenciesList) {
          const mpVotes = await prisma.vote.findMany({
            where: { position: "MP", regionId: constituency.id },
            orderBy: { voteCount: "desc" },
            take: 3,
            include: { candidate: true, region: true },
          });
          const totalMPVotes =
            mpVotes.reduce((sum, v) => sum + v.voteCount, 0) || 1;
          candidates.push(
            ...mpVotes.map((vote) => ({
              id: vote.candidateId,
              name: vote.candidate?.name || "",
              party: vote.candidate?.party || "",
              position: "MP",
              voteCount: vote.voteCount,
              percentage: Number(
                ((vote.voteCount / totalMPVotes) * 100).toFixed(1)
              ),
              constituencyCode: constituency.code,
              countyCode: countyIdToCode[constituency.parentId] || null,
              region: constituency.name,
            }))
          );
        }
        // COUNTY_ASSEMBLY_MEMBER (by ward)
        for (const ward of wardsList) {
          const camVotes = await prisma.vote.findMany({
            where: { position: "COUNTY_ASSEMBLY_MEMBER", regionId: ward.id },
            orderBy: { voteCount: "desc" },
            take: 3,
            include: { candidate: true, region: true },
          });
          const totalCAMVotes =
            camVotes.reduce((sum, v) => sum + v.voteCount, 0) || 1;
          candidates.push(
            ...camVotes.map((vote) => ({
              id: vote.candidateId,
              name: vote.candidate?.name || "",
              party: vote.candidate?.party || "",
              position: "COUNTY_ASSEMBLY_MEMBER",
              voteCount: vote.voteCount,
              percentage: Number(
                ((vote.voteCount / totalCAMVotes) * 100).toFixed(1)
              ),
              wardCode: ward.code,
              constituencyCode: constituencyIdToCode[ward.parentId] || null,
              countyCode:
                countyIdToCode[
                  constituenciesList.find(
                    (c) =>
                      c.code === (constituencyIdToCode[ward.parentId] || "")
                  ).parentId
                ] || null,
              region: ward.name,
            }))
          );
        }
      } catch (e) {
        // fallback to mock candidates if DB fails
        candidates = [
          {
            id: "1",
            name: "Jane Doe",
            party: "Party X",
            position: "GOVERNOR",
            voteCount: 12345,
            percentage: 55.2,
            countyCode: "047",
            region: "NAIROBI",
          },
          {
            id: "2",
            name: "John Smith",
            party: "Party Y",
            position: "MP",
            voteCount: 6789,
            percentage: 51.0,
            constituencyCode: "C001",
            countyCode: "047",
            region: "NAIROBI",
          },
          {
            id: "3",
            name: "Mary Wambui",
            party: "Party Z",
            position: "COUNTY_ASSEMBLY_MEMBER",
            voteCount: 2345,
            percentage: 60.0,
            wardCode: "W001",
            constituencyCode: "C001",
            countyCode: "047",
            region: "NAIROBI",
          },
        ];
      }

      const response = {
        timestamp: new Date().toISOString(),
        positions,
        overallStatus: status.every((pos) => pos.status === "COMPLETED")
          ? "COMPLETED"
          : "IN_PROGRESS",
        isLive: status.some((pos) => pos.status !== "COMPLETED"),
        recentUpdates,
        candidates,
        regions: {
          counties,
          constituencies: constituenciesArr,
          wards,
        },
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
  "/turnout/:regionType/:regionCode",
  [
    param("regionType").isIn([
      "NATIONAL",
      "COUNTY",
      "CONSTITUENCY",
      "WARD",
      "POLLING_STATION",
    ]),
    param("regionCode").isString().notEmpty(),
  ],
  cacheMiddleware(60), // Cache for 1 minute
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { regionType, regionCode } = req.params;

      // Find region by code
      const region = await prisma.region.findUnique({
        where: { code: regionCode },
      });

      if (!region) {
        return res.status(404).json({
          error: "Region not found",
        });
      }

      // Only use PRESIDENT votes for turnout calculation
      let totalVotes = 0;
      if (regionType === "NATIONAL") {
        // National region: sum PRESIDENT votes for the national region
        totalVotes = await prisma.vote
          .aggregate({
            where: { regionId: region.id, position: "PRESIDENT" },
            _sum: { voteCount: true },
          })
          .then((r) => r._sum.voteCount || 0);
      } else {
        // For counties and other regions: sum PRESIDENT votes for this region
        totalVotes = await prisma.vote
          .aggregate({
            where: { regionId: region.id, position: "PRESIDENT" },
            _sum: { voteCount: true },
          })
          .then((r) => r._sum.voteCount || 0);
      }

      const turnoutPercentage =
        region.registeredVoters > 0
          ? ((totalVotes / region.registeredVoters) * 100).toFixed(1)
          : "0.0";

      const response = {
        regionCode,
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

// Voter turnout summary endpoint
router.get("/turnout/summary", async (req, res) => {
  try {
    const { countyCode, limit } = req.query;
    const target = 60;
    let results = [];

    if (!countyCode) {
      // National turnout (single result)
      const counties = await prisma.region.findMany({
        where: { type: "COUNTY" },
      });
      const registered = counties.reduce(
        (sum, c) => sum + (c.registeredVoters || 0),
        0
      );
      const presidentVotes = await prisma.vote.aggregate({
        where: { position: "PRESIDENT" },
        _sum: { voteCount: true },
      });
      const voted = presidentVotes._sum.voteCount || 0;
      const pollingStations = counties.reduce(
        (sum, c) => sum + (c.totalStations || 0),
        0
      );
      const turnout = registered > 0 ? (voted / registered) * 100 : 0;
      const current = Number(turnout.toFixed(2));
      const difference = registered - voted;
      results.push({
        region: "National",
        turnout: current,
        target,
        registered,
        voted,
        difference,
        pollingStations,
      });
    } else {
      // County turnout (with pagination)
      const pageSize = parseInt(limit) || 7;
      const region = await prisma.region.findFirst({
        where: { code: countyCode, type: "COUNTY" },
      });
      if (!region) {
        return res.status(404).json({
          error: "County not found",
          message: "No county with the provided code.",
        });
      }
      // For future: get constituencies/wards in this county and paginate
      // For now: just return the county itself, paginated (will always be 1 result)
      const registered = region.registeredVoters || 0;
      const presidentVotes = await prisma.vote.aggregate({
        where: { position: "PRESIDENT", regionId: region.id },
        _sum: { voteCount: true },
      });
      const voted = presidentVotes._sum.voteCount || 0;
      const pollingStations = region.totalStations || 0;
      const turnout = registered > 0 ? (voted / registered) * 100 : 0;
      const current = Number(turnout.toFixed(2));
      const difference = registered - voted;
      results.push({
        region: region.name,
        turnout: current,
        target,
        registered,
        voted,
        difference,
        pollingStations,
      });
      // If you expand to more granular regions, slice here:
      results = results.slice(0, pageSize);
    }

    res.json(results);
  } catch (error) {
    logger.error("Error in /api/turnout/summary", error);
    res.status(500).json({ error: "Unable to fetch turnout summary" });
  }
});

export default router;
