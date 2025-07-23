import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import authenticateToken from "../../src/middleware/auth.js";
import requireRole from "../../src/middleware/auth.js";
import returningOfficerRoutes from "../../src/routes/returningOfficerRoutes.js";

const app = express();
app.use(express.json());
app.use(
  "/api/returning-officer",
  authenticateToken,
  requireRole("RETURNING_OFFICER"),
  returningOfficerRoutes
);

describe("Returning Officer Routes", () => {
  let returningOfficerToken;
  let otherRoleToken;
  let testRegions;
  let testCandidates;
  let constituencyRegion;

  beforeEach(async () => {
    // Create test data
    testRegions = await global.testUtils.createTestRegions();

    // Create a constituency for the returning officer
    constituencyRegion = await global.prisma.region.create({
      data: {
        name: "Test Constituency for RO",
        code: "RO_TEST001",
        type: "CONSTITUENCY",
        parentId: null,
      },
    });

    testCandidates = await global.testUtils.createTestCandidates(
      constituencyRegion.id
    );

    // Create test votes
    await global.prisma.vote.createMany({
      data: [
        {
          candidateId: testCandidates[0].id,
          regionId: constituencyRegion.id,
          count: 100,
          source: "KIEMS",
          timestamp: new Date(),
        },
        {
          candidateId: testCandidates[1].id,
          regionId: constituencyRegion.id,
          count: 150,
          source: "KIEMS",
          timestamp: new Date(),
        },
      ],
    });

    // Generate tokens
    returningOfficerToken =
      global.testUtils.generateTestToken("RETURNING_OFFICER");
    otherRoleToken = global.testUtils.generateTestToken("PRESIDING_OFFICER");
  });

  describe("GET /api/returning-officer/constituency-overview", () => {
    it("should return constituency overview", async () => {
      const response = await request(app)
        .get("/api/returning-officer/constituency-overview")
        .set("Authorization", `Bearer ${returningOfficerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("constituency");
      expect(response.body).toHaveProperty("voteSummary");
      expect(response.body).toHaveProperty("pollingStations");
      expect(response.body).toHaveProperty("candidates");
      expect(response.body).toHaveProperty("certificationStatus");
    });

    it("should deny access to non-returning officer users", async () => {
      const response = await request(app)
        .get("/api/returning-officer/constituency-overview")
        .set("Authorization", `Bearer ${otherRoleToken}`)
        .expect(403);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("GET /api/returning-officer/polling-stations", () => {
    it("should return polling stations in constituency", async () => {
      // Create test polling stations
      await global.prisma.region.createMany({
        data: [
          {
            name: "Polling Station 1",
            code: "PS001",
            type: "POLLING_STATION",
            parentId: constituencyRegion.id,
          },
          {
            name: "Polling Station 2",
            code: "PS002",
            type: "POLLING_STATION",
            parentId: constituencyRegion.id,
          },
        ],
      });

      const response = await request(app)
        .get("/api/returning-officer/polling-stations")
        .set("Authorization", `Bearer ${returningOfficerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("pollingStations");
      expect(response.body.pollingStations).toBeInstanceOf(Array);
      expect(response.body.pollingStations.length).toBeGreaterThan(0);
    });
  });

  describe("GET /api/returning-officer/polling-stations/:stationCode", () => {
    it("should return specific polling station details", async () => {
      const pollingStation = await global.prisma.region.create({
        data: {
          name: "Test Polling Station",
          code: "TEST_PS001",
          type: "POLLING_STATION",
          parentId: constituencyRegion.id,
        },
      });

      const response = await request(app)
        .get(`/api/returning-officer/polling-stations/${pollingStation.code}`)
        .set("Authorization", `Bearer ${returningOfficerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("pollingStation");
      expect(response.body).toHaveProperty("voteSummary");
      expect(response.body).toHaveProperty("recentUpdates");
      expect(response.body.pollingStation.code).toBe(pollingStation.code);
    });

    it("should return 404 for non-existent polling station", async () => {
      const response = await request(app)
        .get("/api/returning-officer/polling-stations/NONEXISTENT")
        .set("Authorization", `Bearer ${returningOfficerToken}`)
        .expect(404);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("POST /api/returning-officer/vote-updates", () => {
    it("should create vote update", async () => {
      const voteUpdate = {
        candidateId: testCandidates[0].id,
        regionCode: constituencyRegion.code,
        count: 50,
        source: "MANUAL",
        notes: "Manual vote count update",
      };

      const response = await request(app)
        .post("/api/returning-officer/vote-updates")
        .set("Authorization", `Bearer ${returningOfficerToken}`)
        .send(voteUpdate)
        .expect(201);

      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("candidateId");
      expect(response.body).toHaveProperty("regionCode");
      expect(response.body).toHaveProperty("count");
      expect(response.body).toHaveProperty("source");
      expect(response.body.count).toBe(50);
      expect(response.body.source).toBe("MANUAL");
    });

    it("should validate vote update data", async () => {
      const invalidUpdate = {
        candidateId: "invalid-id",
        regionCode: constituencyRegion.code,
        count: -10, // Invalid count
        source: "MANUAL",
      };

      const response = await request(app)
        .post("/api/returning-officer/vote-updates")
        .set("Authorization", `Bearer ${returningOfficerToken}`)
        .send(invalidUpdate)
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("GET /api/returning-officer/vote-updates", () => {
    it("should return vote updates for constituency", async () => {
      // Create test vote update
      await global.prisma.voteUpdate.create({
        data: {
          candidateId: testCandidates[0].id,
          regionId: constituencyRegion.id,
          count: 25,
          source: "MANUAL",
          notes: "Test vote update",
          updatedBy: "test-returning-officer",
        },
      });

      const response = await request(app)
        .get("/api/returning-officer/vote-updates")
        .set("Authorization", `Bearer ${returningOfficerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("updates");
      expect(response.body).toHaveProperty("pagination");
      expect(response.body.updates).toBeInstanceOf(Array);
    });

    it("should filter vote updates by date range", async () => {
      const startDate = new Date(
        Date.now() - 24 * 60 * 60 * 1000
      ).toISOString();
      const endDate = new Date().toISOString();

      const response = await request(app)
        .get("/api/returning-officer/vote-updates")
        .query({ startDate, endDate })
        .set("Authorization", `Bearer ${returningOfficerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("updates");
      expect(response.body.updates).toBeInstanceOf(Array);
    });
  });

  describe("POST /api/returning-officer/certifications", () => {
    it("should certify constituency results", async () => {
      const certification = {
        status: "CERTIFIED",
        notes: "Constituency results verified and certified",
        certifiedAt: new Date().toISOString(),
      };

      const response = await request(app)
        .post("/api/returning-officer/certifications")
        .set("Authorization", `Bearer ${returningOfficerToken}`)
        .send(certification)
        .expect(201);

      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("status");
      expect(response.body).toHaveProperty("regionCode");
      expect(response.body.status).toBe("CERTIFIED");
      expect(response.body.regionCode).toBe(constituencyRegion.code);
    });

    it("should validate certification data", async () => {
      const invalidCertification = {
        status: "INVALID_STATUS",
        notes: "Invalid certification",
      };

      const response = await request(app)
        .post("/api/returning-officer/certifications")
        .set("Authorization", `Bearer ${returningOfficerToken}`)
        .send(invalidCertification)
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("GET /api/returning-officer/certifications", () => {
    it("should return constituency certifications", async () => {
      // Create test certification
      await global.prisma.certification.create({
        data: {
          regionId: constituencyRegion.id,
          status: "PENDING",
          certifiedBy: "test-returning-officer",
          certifiedAt: new Date(),
          notes: "Test certification",
        },
      });

      const response = await request(app)
        .get("/api/returning-officer/certifications")
        .set("Authorization", `Bearer ${returningOfficerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("certifications");
      expect(response.body.certifications).toBeInstanceOf(Array);
    });
  });

  describe("GET /api/returning-officer/audit-logs", () => {
    it("should return constituency audit logs", async () => {
      // Create test audit log
      await global.prisma.auditLog.create({
        data: {
          userId: "test-returning-officer",
          action: "VOTE_UPDATE",
          details: "Test audit log for constituency",
          ipAddress: "127.0.0.1",
          userAgent: "Test Agent",
        },
      });

      const response = await request(app)
        .get("/api/returning-officer/audit-logs")
        .set("Authorization", `Bearer ${returningOfficerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("logs");
      expect(response.body).toHaveProperty("pagination");
      expect(response.body.logs).toBeInstanceOf(Array);
    });
  });

  describe("GET /api/returning-officer/reports", () => {
    it("should return constituency reports", async () => {
      const response = await request(app)
        .get("/api/returning-officer/reports")
        .set("Authorization", `Bearer ${returningOfficerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("reports");
      expect(response.body.reports).toBeInstanceOf(Array);
    });

    it("should generate specific report types", async () => {
      const response = await request(app)
        .get("/api/returning-officer/reports")
        .query({ type: "VOTE_SUMMARY" })
        .set("Authorization", `Bearer ${returningOfficerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("reports");
      expect(response.body.reports).toBeInstanceOf(Array);
    });
  });

  describe("POST /api/returning-officer/reports/generate", () => {
    it("should generate constituency report", async () => {
      const reportRequest = {
        type: "VOTE_SUMMARY",
        format: "PDF",
        includeCharts: true,
      };

      const response = await request(app)
        .post("/api/returning-officer/reports/generate")
        .set("Authorization", `Bearer ${returningOfficerToken}`)
        .send(reportRequest)
        .expect(201);

      expect(response.body).toHaveProperty("reportId");
      expect(response.body).toHaveProperty("status");
      expect(response.body).toHaveProperty("estimatedCompletion");
    });

    it("should validate report generation parameters", async () => {
      const invalidRequest = {
        type: "INVALID_TYPE",
        format: "PDF",
      };

      const response = await request(app)
        .post("/api/returning-officer/reports/generate")
        .set("Authorization", `Bearer ${returningOfficerToken}`)
        .send(invalidRequest)
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("Authentication and Authorization", () => {
    it("should require authentication", async () => {
      const response = await request(app)
        .get("/api/returning-officer/constituency-overview")
        .expect(401);

      expect(response.body).toHaveProperty("error");
    });

    it("should require RETURNING_OFFICER role", async () => {
      const publicToken = global.testUtils.generateTestToken("PUBLIC");

      const response = await request(app)
        .get("/api/returning-officer/constituency-overview")
        .set("Authorization", `Bearer ${publicToken}`)
        .expect(403);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("Data isolation", () => {
    it("should only return data for assigned constituency", async () => {
      // Create another constituency
      const otherConstituency = await global.prisma.region.create({
        data: {
          name: "Other Constituency",
          code: "OTHER001",
          type: "CONSTITUENCY",
          parentId: null,
        },
      });

      // Create votes for other constituency
      await global.prisma.vote.create({
        data: {
          candidateId: testCandidates[0].id,
          regionId: otherConstituency.id,
          count: 200,
          source: "KIEMS",
          timestamp: new Date(),
        },
      });

      const response = await request(app)
        .get("/api/returning-officer/constituency-overview")
        .set("Authorization", `Bearer ${returningOfficerToken}`)
        .expect(200);

      // Should not include data from other constituency
      expect(response.body.constituency.code).toBe(constituencyRegion.code);
    });
  });

  describe("Error handling", () => {
    it("should handle validation errors", async () => {
      const response = await request(app)
        .post("/api/returning-officer/vote-updates")
        .set("Authorization", `Bearer ${returningOfficerToken}`)
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });

    it("should handle database errors gracefully", async () => {
      const response = await request(app)
        .get("/api/returning-officer/polling-stations")
        .query({ limit: "invalid" })
        .set("Authorization", `Bearer ${returningOfficerToken}`)
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });
  });
});
