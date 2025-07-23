import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import authenticateToken from "../../src/middleware/auth.js";
import requireRole from "../../src/middleware/auth.js";
import commissionerRoutes from "../../src/routes/commissionerRoutes.js";

const app = express();
app.use(express.json());
app.use(
  "/api/commissioner",
  authenticateToken,
  requireRole("IEBC_COMMISSIONER"),
  commissionerRoutes
);

describe("IEBC Commissioner Routes", () => {
  let commissionerToken;
  let otherRoleToken;
  let testRegions;
  let testCandidates;

  beforeEach(async () => {
    // Create test data
    testRegions = await global.testUtils.createTestRegions();
    testCandidates = await global.testUtils.createTestCandidates(
      testRegions[0].id
    );

    // Create test votes
    await global.prisma.vote.createMany({
      data: [
        {
          candidateId: testCandidates[0].id,
          regionId: testRegions[0].id,
          count: 100,
          source: "KIEMS",
          timestamp: new Date(),
        },
        {
          candidateId: testCandidates[1].id,
          regionId: testRegions[0].id,
          count: 150,
          source: "KIEMS",
          timestamp: new Date(),
        },
      ],
    });

    // Generate tokens
    commissionerToken = global.testUtils.generateTestToken("IEBC_COMMISSIONER");
    otherRoleToken = global.testUtils.generateTestToken("RETURNING_OFFICER");
  });

  describe("GET /api/commissioner/dashboard", () => {
    it("should return commissioner dashboard data", async () => {
      const response = await request(app)
        .get("/api/commissioner/dashboard")
        .set("Authorization", `Bearer ${commissionerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("totalVotes");
      expect(response.body).toHaveProperty("totalRegions");
      expect(response.body).toHaveProperty("totalCandidates");
      expect(response.body).toHaveProperty("certificationStatus");
      expect(response.body).toHaveProperty("recentUpdates");
      expect(response.body).toHaveProperty("systemHealth");
    });

    it("should deny access to non-commissioner users", async () => {
      const response = await request(app)
        .get("/api/commissioner/dashboard")
        .set("Authorization", `Bearer ${otherRoleToken}`)
        .expect(403);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("GET /api/commissioner/election-status", () => {
    it("should return current election status", async () => {
      const response = await request(app)
        .get("/api/commissioner/election-status")
        .set("Authorization", `Bearer ${commissionerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("status");
      expect(response.body).toHaveProperty("lastUpdated");
      expect(response.body).toHaveProperty("progress");
    });
  });

  describe("PUT /api/commissioner/election-status", () => {
    it("should update election status", async () => {
      const newStatus = {
        status: "IN_PROGRESS",
        notes: "Election officially started",
      };

      const response = await request(app)
        .put("/api/commissioner/election-status")
        .set("Authorization", `Bearer ${commissionerToken}`)
        .send(newStatus)
        .expect(200);

      expect(response.body).toHaveProperty("status");
      expect(response.body).toHaveProperty("updatedAt");
      expect(response.body.status).toBe("IN_PROGRESS");
    });

    it("should validate election status values", async () => {
      const invalidStatus = {
        status: "INVALID_STATUS",
        notes: "Invalid status",
      };

      const response = await request(app)
        .put("/api/commissioner/election-status")
        .set("Authorization", `Bearer ${commissionerToken}`)
        .send(invalidStatus)
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("GET /api/commissioner/certifications", () => {
    it("should return all certifications", async () => {
      // Create test certification
      await global.prisma.certification.create({
        data: {
          regionId: testRegions[0].id,
          status: "PENDING",
          certifiedBy: "test-commissioner",
          certifiedAt: new Date(),
          notes: "Test certification",
        },
      });

      const response = await request(app)
        .get("/api/commissioner/certifications")
        .set("Authorization", `Bearer ${commissionerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("certifications");
      expect(response.body.certifications).toBeInstanceOf(Array);
    });

    it("should filter certifications by status", async () => {
      const response = await request(app)
        .get("/api/commissioner/certifications")
        .query({ status: "PENDING" })
        .set("Authorization", `Bearer ${commissionerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("certifications");
      expect(response.body.certifications).toBeInstanceOf(Array);
    });
  });

  describe("POST /api/commissioner/certifications/:regionCode", () => {
    it("should certify election results for a region", async () => {
      const certificationData = {
        status: "CERTIFIED",
        notes: "Results verified and certified",
        certifiedAt: new Date().toISOString(),
      };

      const response = await request(app)
        .post(`/api/commissioner/certifications/${testRegions[0].code}`)
        .set("Authorization", `Bearer ${commissionerToken}`)
        .send(certificationData)
        .expect(201);

      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("status");
      expect(response.body).toHaveProperty("regionCode");
      expect(response.body.status).toBe("CERTIFIED");
      expect(response.body.regionCode).toBe(testRegions[0].code);
    });

    it("should return 404 for non-existent region", async () => {
      const certificationData = {
        status: "CERTIFIED",
        notes: "Results verified and certified",
      };

      const response = await request(app)
        .post("/api/commissioner/certifications/NONEXISTENT")
        .set("Authorization", `Bearer ${commissionerToken}`)
        .send(certificationData)
        .expect(404);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("GET /api/commissioner/audit-logs", () => {
    it("should return audit logs", async () => {
      // Create test audit log
      await global.prisma.auditLog.create({
        data: {
          userId: "test-user",
          action: "VOTE_UPDATE",
          details: "Test audit log",
          ipAddress: "127.0.0.1",
          userAgent: "Test Agent",
        },
      });

      const response = await request(app)
        .get("/api/commissioner/audit-logs")
        .set("Authorization", `Bearer ${commissionerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("logs");
      expect(response.body).toHaveProperty("pagination");
      expect(response.body.logs).toBeInstanceOf(Array);
    });

    it("should filter audit logs by date range", async () => {
      const startDate = new Date(
        Date.now() - 24 * 60 * 60 * 1000
      ).toISOString();
      const endDate = new Date().toISOString();

      const response = await request(app)
        .get("/api/commissioner/audit-logs")
        .query({ startDate, endDate })
        .set("Authorization", `Bearer ${commissionerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("logs");
      expect(response.body.logs).toBeInstanceOf(Array);
    });
  });

  describe("GET /api/commissioner/regions/:regionCode/overview", () => {
    it("should return detailed region overview", async () => {
      const response = await request(app)
        .get(`/api/commissioner/regions/${testRegions[0].code}/overview`)
        .set("Authorization", `Bearer ${commissionerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("region");
      expect(response.body).toHaveProperty("voteSummary");
      expect(response.body).toHaveProperty("candidates");
      expect(response.body).toHaveProperty("certification");
      expect(response.body).toHaveProperty("recentUpdates");
      expect(response.body.region.code).toBe(testRegions[0].code);
    });

    it("should return 404 for non-existent region", async () => {
      const response = await request(app)
        .get("/api/commissioner/regions/NONEXISTENT/overview")
        .set("Authorization", `Bearer ${commissionerToken}`)
        .expect(404);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("GET /api/commissioner/system-health", () => {
    it("should return system health information", async () => {
      const response = await request(app)
        .get("/api/commissioner/system-health")
        .set("Authorization", `Bearer ${commissionerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("database");
      expect(response.body).toHaveProperty("redis");
      expect(response.body).toHaveProperty("kafka");
      expect(response.body).toHaveProperty("elasticsearch");
      expect(response.body).toHaveProperty("overallStatus");
    });
  });

  describe("GET /api/commissioner/performance-metrics", () => {
    it("should return performance metrics", async () => {
      const response = await request(app)
        .get("/api/commissioner/performance-metrics")
        .set("Authorization", `Bearer ${commissionerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("responseTimes");
      expect(response.body).toHaveProperty("throughput");
      expect(response.body).toHaveProperty("errorRates");
      expect(response.body).toHaveProperty("activeConnections");
    });
  });

  describe("POST /api/commissioner/announcements", () => {
    it("should create system announcement", async () => {
      const announcement = {
        title: "Test Announcement",
        message: "This is a test announcement from the commissioner",
        priority: "HIGH",
        targetAudience: "ALL_USERS",
      };

      const response = await request(app)
        .post("/api/commissioner/announcements")
        .set("Authorization", `Bearer ${commissionerToken}`)
        .send(announcement)
        .expect(201);

      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("title");
      expect(response.body).toHaveProperty("message");
      expect(response.body.title).toBe(announcement.title);
    });

    it("should validate announcement data", async () => {
      const invalidAnnouncement = {
        title: "", // Empty title
        message: "Test message",
      };

      const response = await request(app)
        .post("/api/commissioner/announcements")
        .set("Authorization", `Bearer ${commissionerToken}`)
        .send(invalidAnnouncement)
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("Authentication and Authorization", () => {
    it("should require authentication", async () => {
      const response = await request(app)
        .get("/api/commissioner/dashboard")
        .expect(401);

      expect(response.body).toHaveProperty("error");
    });

    it("should require IEBC_COMMISSIONER role", async () => {
      const publicToken = global.testUtils.generateTestToken("PUBLIC");

      const response = await request(app)
        .get("/api/commissioner/dashboard")
        .set("Authorization", `Bearer ${publicToken}`)
        .expect(403);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("Error handling", () => {
    it("should handle database errors gracefully", async () => {
      // This would require mocking the database
      // For now, test that validation errors are handled
      const response = await request(app)
        .put("/api/commissioner/election-status")
        .set("Authorization", `Bearer ${commissionerToken}`)
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });

    it("should validate request parameters", async () => {
      const response = await request(app)
        .get("/api/commissioner/certifications")
        .query({ status: "INVALID_STATUS" })
        .set("Authorization", `Bearer ${commissionerToken}`)
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });
  });
});
