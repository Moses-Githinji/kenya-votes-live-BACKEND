import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import authenticateToken from "../../src/middleware/auth.js";
import requireRole from "../../src/middleware/auth.js";
import electionClerkRoutes from "../../src/routes/electionClerkRoutes.js";

const app = express();
app.use(express.json());
app.use(
  "/api/election-clerk",
  authenticateToken,
  requireRole("ELECTION_CLERK"),
  electionClerkRoutes
);

describe("Election Clerk Routes", () => {
  let electionClerkToken;
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
    electionClerkToken = global.testUtils.generateTestToken("ELECTION_CLERK");
    otherRoleToken = global.testUtils.generateTestToken("SYSTEM_ADMINISTRATOR");
  });

  describe("GET /api/election-clerk/dashboard", () => {
    it("should return election clerk dashboard", async () => {
      const response = await request(app)
        .get("/api/election-clerk/dashboard")
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("pendingTasks");
      expect(response.body).toHaveProperty("recentUpdates");
      expect(response.body).toHaveProperty("dataQualityMetrics");
      expect(response.body).toHaveProperty("assignedRegions");
    });

    it("should deny access to non-election clerk users", async () => {
      const response = await request(app)
        .get("/api/election-clerk/dashboard")
        .set("Authorization", `Bearer ${otherRoleToken}`)
        .expect(403);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("POST /api/election-clerk/data-entry", () => {
    it("should create data entry record", async () => {
      const dataEntry = {
        type: "VOTE_COUNT",
        regionCode: testRegions[0].code,
        candidateId: testCandidates[0].id,
        value: 25,
        source: "MANUAL",
        notes: "Manual data entry by election clerk",
      };

      const response = await request(app)
        .post("/api/election-clerk/data-entry")
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .send(dataEntry)
        .expect(201);

      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("type");
      expect(response.body).toHaveProperty("regionCode");
      expect(response.body).toHaveProperty("value");
      expect(response.body).toHaveProperty("status");
      expect(response.body.type).toBe("VOTE_COUNT");
      expect(response.body.value).toBe(25);
    });

    it("should validate data entry", async () => {
      const invalidEntry = {
        type: "INVALID_TYPE",
        regionCode: testRegions[0].code,
        value: -10, // Invalid value
        source: "MANUAL",
      };

      const response = await request(app)
        .post("/api/election-clerk/data-entry")
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .send(invalidEntry)
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("GET /api/election-clerk/data-entry", () => {
    it("should return data entry records", async () => {
      // Create test data entry
      await global.prisma.voteUpdate.create({
        data: {
          candidateId: testCandidates[0].id,
          regionId: testRegions[0].id,
          count: 25,
          source: "MANUAL",
          notes: "Data entry by election clerk",
          updatedBy: "test-election-clerk",
        },
      });

      const response = await request(app)
        .get("/api/election-clerk/data-entry")
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("entries");
      expect(response.body).toHaveProperty("pagination");
      expect(response.body.entries).toBeInstanceOf(Array);
    });

    it("should filter data entries by type", async () => {
      const response = await request(app)
        .get("/api/election-clerk/data-entry")
        .query({ type: "VOTE_COUNT" })
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("entries");
      expect(response.body.entries).toBeInstanceOf(Array);
    });
  });

  describe("PUT /api/election-clerk/data-entry/:id", () => {
    it("should update data entry record", async () => {
      // Create a data entry first
      const voteUpdate = await global.prisma.voteUpdate.create({
        data: {
          candidateId: testCandidates[0].id,
          regionId: testRegions[0].id,
          count: 25,
          source: "MANUAL",
          notes: "Initial data entry",
          updatedBy: "test-election-clerk",
        },
      });

      const updateData = {
        count: 30,
        notes: "Updated data entry",
      };

      const response = await request(app)
        .put(`/api/election-clerk/data-entry/${voteUpdate.id}`)
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("count");
      expect(response.body).toHaveProperty("notes");
      expect(response.body.count).toBe(30);
      expect(response.body.notes).toBe("Updated data entry");
    });

    it("should return 404 for non-existent data entry", async () => {
      const updateData = {
        count: 30,
        notes: "Updated data entry",
      };

      const response = await request(app)
        .put("/api/election-clerk/data-entry/non-existent-id")
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .send(updateData)
        .expect(404);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("POST /api/election-clerk/data-validation", () => {
    it("should validate data entry", async () => {
      const validationData = {
        entryId: "test-entry-id",
        isValid: true,
        notes: "Data validated successfully",
        validatedAt: new Date().toISOString(),
      };

      const response = await request(app)
        .post("/api/election-clerk/data-validation")
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .send(validationData)
        .expect(201);

      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("entryId");
      expect(response.body).toHaveProperty("isValid");
      expect(response.body).toHaveProperty("notes");
      expect(response.body.isValid).toBe(true);
    });

    it("should handle invalid data validation", async () => {
      const validationData = {
        entryId: "test-entry-id",
        isValid: false,
        notes: "Data validation failed",
        errors: ["Invalid count value", "Missing required field"],
      };

      const response = await request(app)
        .post("/api/election-clerk/data-validation")
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .send(validationData)
        .expect(201);

      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("isValid");
      expect(response.body).toHaveProperty("errors");
      expect(response.body.isValid).toBe(false);
      expect(response.body.errors).toBeInstanceOf(Array);
    });
  });

  describe("GET /api/election-clerk/data-quality", () => {
    it("should return data quality metrics", async () => {
      const response = await request(app)
        .get("/api/election-clerk/data-quality")
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("totalEntries");
      expect(response.body).toHaveProperty("validatedEntries");
      expect(response.body).toHaveProperty("errorRate");
      expect(response.body).toHaveProperty("completionRate");
      expect(response.body).toHaveProperty("qualityScore");
    });

    it("should filter quality metrics by region", async () => {
      const response = await request(app)
        .get("/api/election-clerk/data-quality")
        .query({ regionCode: testRegions[0].code })
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("totalEntries");
      expect(response.body).toHaveProperty("regionCode");
      expect(response.body.regionCode).toBe(testRegions[0].code);
    });
  });

  describe("GET /api/election-clerk/pending-tasks", () => {
    it("should return pending tasks", async () => {
      const response = await request(app)
        .get("/api/election-clerk/pending-tasks")
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("tasks");
      expect(response.body.tasks).toBeInstanceOf(Array);
    });

    it("should filter tasks by priority", async () => {
      const response = await request(app)
        .get("/api/election-clerk/pending-tasks")
        .query({ priority: "HIGH" })
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("tasks");
      expect(response.body.tasks).toBeInstanceOf(Array);
    });
  });

  describe("POST /api/election-clerk/task-completion", () => {
    it("should mark task as completed", async () => {
      const taskCompletion = {
        taskId: "test-task-id",
        completedAt: new Date().toISOString(),
        notes: "Task completed successfully",
        timeSpent: 30, // minutes
      };

      const response = await request(app)
        .post("/api/election-clerk/task-completion")
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .send(taskCompletion)
        .expect(201);

      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("taskId");
      expect(response.body).toHaveProperty("completedAt");
      expect(response.body).toHaveProperty("timeSpent");
      expect(response.body.taskId).toBe("test-task-id");
    });
  });

  describe("GET /api/election-clerk/reports", () => {
    it("should return data entry reports", async () => {
      const response = await request(app)
        .get("/api/election-clerk/reports")
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("reports");
      expect(response.body.reports).toBeInstanceOf(Array);
    });

    it("should generate specific report types", async () => {
      const response = await request(app)
        .get("/api/election-clerk/reports")
        .query({ type: "DATA_ENTRY_SUMMARY" })
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("reports");
      expect(response.body.reports).toBeInstanceOf(Array);
    });
  });

  describe("POST /api/election-clerk/reports/generate", () => {
    it("should generate data entry report", async () => {
      const reportRequest = {
        type: "DATA_ENTRY_SUMMARY",
        format: "PDF",
        dateRange: {
          startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString(),
        },
      };

      const response = await request(app)
        .post("/api/election-clerk/reports/generate")
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .send(reportRequest)
        .expect(201);

      expect(response.body).toHaveProperty("reportId");
      expect(response.body).toHaveProperty("status");
      expect(response.body).toHaveProperty("estimatedCompletion");
    });
  });

  describe("GET /api/election-clerk/audit-logs", () => {
    it("should return election clerk audit logs", async () => {
      // Create test audit log
      await global.prisma.auditLog.create({
        data: {
          userId: "test-election-clerk",
          action: "DATA_ENTRY",
          details: "Test audit log for election clerk",
          ipAddress: "127.0.0.1",
          userAgent: "Test Agent",
        },
      });

      const response = await request(app)
        .get("/api/election-clerk/audit-logs")
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("logs");
      expect(response.body).toHaveProperty("pagination");
      expect(response.body.logs).toBeInstanceOf(Array);
    });
  });

  describe("POST /api/election-clerk/feedback", () => {
    it("should submit feedback", async () => {
      const feedback = {
        type: "SYSTEM_FEEDBACK",
        subject: "Data Entry Interface",
        message:
          "The interface is working well but could use some improvements",
        priority: "MEDIUM",
        category: "USER_EXPERIENCE",
      };

      const response = await request(app)
        .post("/api/election-clerk/feedback")
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .send(feedback)
        .expect(201);

      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("type");
      expect(response.body).toHaveProperty("subject");
      expect(response.body).toHaveProperty("message");
      expect(response.body.type).toBe("SYSTEM_FEEDBACK");
    });

    it("should validate feedback data", async () => {
      const invalidFeedback = {
        type: "INVALID_TYPE",
        subject: "", // Empty subject
        message: "Test feedback",
      };

      const response = await request(app)
        .post("/api/election-clerk/feedback")
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .send(invalidFeedback)
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("Authentication and Authorization", () => {
    it("should require authentication", async () => {
      const response = await request(app)
        .get("/api/election-clerk/dashboard")
        .expect(401);

      expect(response.body).toHaveProperty("error");
    });

    it("should require ELECTION_CLERK role", async () => {
      const publicToken = global.testUtils.generateTestToken("PUBLIC");

      const response = await request(app)
        .get("/api/election-clerk/dashboard")
        .set("Authorization", `Bearer ${publicToken}`)
        .expect(403);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("Data validation and quality", () => {
    it("should enforce data validation rules", async () => {
      const invalidData = {
        type: "VOTE_COUNT",
        regionCode: testRegions[0].code,
        value: "invalid-value", // Should be number
        source: "MANUAL",
      };

      const response = await request(app)
        .post("/api/election-clerk/data-entry")
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });

    it("should track data quality metrics", async () => {
      // Create some test data entries
      await global.prisma.voteUpdate.createMany({
        data: [
          {
            candidateId: testCandidates[0].id,
            regionId: testRegions[0].id,
            count: 25,
            source: "MANUAL",
            notes: "Valid entry",
            updatedBy: "test-election-clerk",
          },
          {
            candidateId: testCandidates[1].id,
            regionId: testRegions[0].id,
            count: 30,
            source: "MANUAL",
            notes: "Another valid entry",
            updatedBy: "test-election-clerk",
          },
        ],
      });

      const response = await request(app)
        .get("/api/election-clerk/data-quality")
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("totalEntries");
      expect(response.body).toHaveProperty("qualityScore");
      expect(response.body.totalEntries).toBeGreaterThan(0);
    });
  });

  describe("Error handling", () => {
    it("should handle validation errors", async () => {
      const response = await request(app)
        .post("/api/election-clerk/data-entry")
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });

    it("should handle database errors gracefully", async () => {
      const response = await request(app)
        .get("/api/election-clerk/data-entry")
        .query({ limit: "invalid" })
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });
  });
});
