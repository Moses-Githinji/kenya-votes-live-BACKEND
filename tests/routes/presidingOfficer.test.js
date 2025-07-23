import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import authenticateToken from "../../src/middleware/auth.js";
import requireRole from "../../src/middleware/auth.js";
import presidingOfficerRoutes from "../../src/routes/presidingOfficerRoutes.js";

const app = express();
app.use(express.json());
app.use(
  "/api/presiding-officer",
  authenticateToken,
  requireRole("PRESIDING_OFFICER"),
  presidingOfficerRoutes
);

describe("Presiding Officer Routes", () => {
  let presidingOfficerToken;
  let otherRoleToken;
  let testRegions;
  let testCandidates;
  let pollingStation;

  beforeEach(async () => {
    // Create test data
    testRegions = await global.testUtils.createTestRegions();

    // Create a polling station for the presiding officer
    pollingStation = await global.prisma.region.create({
      data: {
        name: "Test Polling Station for PO",
        code: "PO_TEST001",
        type: "POLLING_STATION",
        parentId: testRegions[1].id, // Constituency
      },
    });

    testCandidates = await global.testUtils.createTestCandidates(
      testRegions[0].id
    );

    // Create test votes
    await global.prisma.vote.createMany({
      data: [
        {
          candidateId: testCandidates[0].id,
          regionId: pollingStation.id,
          count: 50,
          source: "KIEMS",
          timestamp: new Date(),
        },
        {
          candidateId: testCandidates[1].id,
          regionId: pollingStation.id,
          count: 75,
          source: "KIEMS",
          timestamp: new Date(),
        },
      ],
    });

    // Generate tokens
    presidingOfficerToken =
      global.testUtils.generateTestToken("PRESIDING_OFFICER");
    otherRoleToken = global.testUtils.generateTestToken("ELECTION_CLERK");
  });

  describe("GET /api/presiding-officer/polling-station-overview", () => {
    it("should return polling station overview", async () => {
      const response = await request(app)
        .get("/api/presiding-officer/polling-station-overview")
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("pollingStation");
      expect(response.body).toHaveProperty("voteSummary");
      expect(response.body).toHaveProperty("candidates");
      expect(response.body).toHaveProperty("recentUpdates");
      expect(response.body).toHaveProperty("voterTurnout");
    });

    it("should deny access to non-presiding officer users", async () => {
      const response = await request(app)
        .get("/api/presiding-officer/polling-station-overview")
        .set("Authorization", `Bearer ${otherRoleToken}`)
        .expect(403);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("POST /api/presiding-officer/vote-updates", () => {
    it("should create vote update for polling station", async () => {
      const voteUpdate = {
        candidateId: testCandidates[0].id,
        regionCode: pollingStation.code,
        count: 25,
        source: "MANUAL",
        notes: "Manual vote count update from presiding officer",
      };

      const response = await request(app)
        .post("/api/presiding-officer/vote-updates")
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .send(voteUpdate)
        .expect(201);

      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("candidateId");
      expect(response.body).toHaveProperty("regionCode");
      expect(response.body).toHaveProperty("count");
      expect(response.body).toHaveProperty("source");
      expect(response.body.count).toBe(25);
      expect(response.body.source).toBe("MANUAL");
    });

    it("should validate vote update data", async () => {
      const invalidUpdate = {
        candidateId: "invalid-id",
        regionCode: pollingStation.code,
        count: -5, // Invalid count
        source: "MANUAL",
      };

      const response = await request(app)
        .post("/api/presiding-officer/vote-updates")
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .send(invalidUpdate)
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });

    it("should only allow updates for assigned polling station", async () => {
      const otherStation = await global.prisma.region.create({
        data: {
          name: "Other Polling Station",
          code: "OTHER_PS001",
          type: "POLLING_STATION",
          parentId: testRegions[1].id,
        },
      });

      const voteUpdate = {
        candidateId: testCandidates[0].id,
        regionCode: otherStation.code,
        count: 25,
        source: "MANUAL",
        notes: "Update for other station",
      };

      const response = await request(app)
        .post("/api/presiding-officer/vote-updates")
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .send(voteUpdate)
        .expect(403);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("GET /api/presiding-officer/vote-updates", () => {
    it("should return vote updates for polling station", async () => {
      // Create test vote update
      await global.prisma.voteUpdate.create({
        data: {
          candidateId: testCandidates[0].id,
          regionId: pollingStation.id,
          count: 10,
          source: "MANUAL",
          notes: "Test vote update from presiding officer",
          updatedBy: "test-presiding-officer",
        },
      });

      const response = await request(app)
        .get("/api/presiding-officer/vote-updates")
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("updates");
      expect(response.body).toHaveProperty("pagination");
      expect(response.body.updates).toBeInstanceOf(Array);
    });

    it("should filter vote updates by source", async () => {
      const response = await request(app)
        .get("/api/presiding-officer/vote-updates")
        .query({ source: "MANUAL" })
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("updates");
      expect(response.body.updates).toBeInstanceOf(Array);
    });
  });

  describe("PUT /api/presiding-officer/vote-updates/:id", () => {
    it("should update existing vote update", async () => {
      // Create a vote update first
      const voteUpdate = await global.prisma.voteUpdate.create({
        data: {
          candidateId: testCandidates[0].id,
          regionId: pollingStation.id,
          count: 10,
          source: "MANUAL",
          notes: "Initial update",
          updatedBy: "test-presiding-officer",
        },
      });

      const updateData = {
        count: 15,
        notes: "Updated vote count",
      };

      const response = await request(app)
        .put(`/api/presiding-officer/vote-updates/${voteUpdate.id}`)
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("count");
      expect(response.body).toHaveProperty("notes");
      expect(response.body.count).toBe(15);
      expect(response.body.notes).toBe("Updated vote count");
    });

    it("should return 404 for non-existent vote update", async () => {
      const updateData = {
        count: 15,
        notes: "Updated vote count",
      };

      const response = await request(app)
        .put("/api/presiding-officer/vote-updates/non-existent-id")
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .send(updateData)
        .expect(404);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("GET /api/presiding-officer/voter-turnout", () => {
    it("should return voter turnout statistics", async () => {
      const response = await request(app)
        .get("/api/presiding-officer/voter-turnout")
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("totalRegistered");
      expect(response.body).toHaveProperty("totalVoted");
      expect(response.body).toHaveProperty("turnoutPercentage");
      expect(response.body).toHaveProperty("hourlyBreakdown");
    });
  });

  describe("POST /api/presiding-officer/voter-turnout", () => {
    it("should update voter turnout data", async () => {
      const turnoutData = {
        totalRegistered: 1000,
        totalVoted: 750,
        notes: "Updated voter turnout",
      };

      const response = await request(app)
        .post("/api/presiding-officer/voter-turnout")
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .send(turnoutData)
        .expect(201);

      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("totalRegistered");
      expect(response.body).toHaveProperty("totalVoted");
      expect(response.body).toHaveProperty("turnoutPercentage");
      expect(response.body.totalRegistered).toBe(1000);
      expect(response.body.totalVoted).toBe(750);
    });

    it("should validate turnout data", async () => {
      const invalidData = {
        totalRegistered: -100, // Invalid
        totalVoted: 750,
      };

      const response = await request(app)
        .post("/api/presiding-officer/voter-turnout")
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("GET /api/presiding-officer/incidents", () => {
    it("should return polling station incidents", async () => {
      const response = await request(app)
        .get("/api/presiding-officer/incidents")
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("incidents");
      expect(response.body.incidents).toBeInstanceOf(Array);
    });
  });

  describe("POST /api/presiding-officer/incidents", () => {
    it("should report polling station incident", async () => {
      const incident = {
        type: "TECHNICAL_ISSUE",
        description: "KIEMS device malfunction",
        severity: "MEDIUM",
        location: "Polling Station Main Hall",
        reportedAt: new Date().toISOString(),
      };

      const response = await request(app)
        .post("/api/presiding-officer/incidents")
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .send(incident)
        .expect(201);

      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("type");
      expect(response.body).toHaveProperty("description");
      expect(response.body).toHaveProperty("severity");
      expect(response.body.type).toBe("TECHNICAL_ISSUE");
    });

    it("should validate incident data", async () => {
      const invalidIncident = {
        type: "INVALID_TYPE",
        description: "Test incident",
      };

      const response = await request(app)
        .post("/api/presiding-officer/incidents")
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .send(invalidIncident)
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("GET /api/presiding-officer/audit-logs", () => {
    it("should return polling station audit logs", async () => {
      // Create test audit log
      await global.prisma.auditLog.create({
        data: {
          userId: "test-presiding-officer",
          action: "VOTE_UPDATE",
          details: "Test audit log for polling station",
          ipAddress: "127.0.0.1",
          userAgent: "Test Agent",
        },
      });

      const response = await request(app)
        .get("/api/presiding-officer/audit-logs")
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("logs");
      expect(response.body).toHaveProperty("pagination");
      expect(response.body.logs).toBeInstanceOf(Array);
    });
  });

  describe("GET /api/presiding-officer/real-time-status", () => {
    it("should return real-time polling station status", async () => {
      const response = await request(app)
        .get("/api/presiding-officer/real-time-status")
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("status");
      expect(response.body).toHaveProperty("lastUpdate");
      expect(response.body).toHaveProperty("activeVoters");
      expect(response.body).toHaveProperty("queueLength");
    });
  });

  describe("POST /api/presiding-officer/status-update", () => {
    it("should update polling station status", async () => {
      const statusUpdate = {
        status: "ACTIVE",
        notes: "Polling station operating normally",
        activeVoters: 25,
        queueLength: 5,
      };

      const response = await request(app)
        .post("/api/presiding-officer/status-update")
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .send(statusUpdate)
        .expect(201);

      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("status");
      expect(response.body).toHaveProperty("activeVoters");
      expect(response.body).toHaveProperty("queueLength");
      expect(response.body.status).toBe("ACTIVE");
    });
  });

  describe("Authentication and Authorization", () => {
    it("should require authentication", async () => {
      const response = await request(app)
        .get("/api/presiding-officer/polling-station-overview")
        .expect(401);

      expect(response.body).toHaveProperty("error");
    });

    it("should require PRESIDING_OFFICER role", async () => {
      const publicToken = global.testUtils.generateTestToken("PUBLIC");

      const response = await request(app)
        .get("/api/presiding-officer/polling-station-overview")
        .set("Authorization", `Bearer ${publicToken}`)
        .expect(403);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("Data isolation", () => {
    it("should only return data for assigned polling station", async () => {
      // Create another polling station
      const otherStation = await global.prisma.region.create({
        data: {
          name: "Other Polling Station",
          code: "OTHER_PS002",
          type: "POLLING_STATION",
          parentId: testRegions[1].id,
        },
      });

      // Create votes for other station
      await global.prisma.vote.create({
        data: {
          candidateId: testCandidates[0].id,
          regionId: otherStation.id,
          count: 100,
          source: "KIEMS",
          timestamp: new Date(),
        },
      });

      const response = await request(app)
        .get("/api/presiding-officer/polling-station-overview")
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .expect(200);

      // Should only show data for assigned polling station
      expect(response.body.pollingStation.code).toBe(pollingStation.code);
    });
  });

  describe("Error handling", () => {
    it("should handle validation errors", async () => {
      const response = await request(app)
        .post("/api/presiding-officer/vote-updates")
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });

    it("should handle database errors gracefully", async () => {
      const response = await request(app)
        .get("/api/presiding-officer/vote-updates")
        .query({ limit: "invalid" })
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });
  });
});
