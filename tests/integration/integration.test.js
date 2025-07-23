import request from "supertest";
import express from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

// Import the main application
import { app } from "../../src/server.js";

describe("System Integration Tests", () => {
  let prisma;
  let commissionerToken;
  let returningOfficerToken;
  let presidingOfficerToken;
  let electionClerkToken;
  let sysAdminToken;
  let testRegions;
  let testCandidates;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up test data
    await global.testUtils.cleanupTestData();

    // Create test data
    testRegions = await global.testUtils.createTestRegions();
    testCandidates = await global.testUtils.createTestCandidates(
      testRegions[0].id
    );

    // Generate tokens for different roles
    commissionerToken = global.testUtils.generateTestToken("IEBC_COMMISSIONER");
    returningOfficerToken =
      global.testUtils.generateTestToken("RETURNING_OFFICER");
    presidingOfficerToken =
      global.testUtils.generateTestToken("PRESIDING_OFFICER");
    electionClerkToken = global.testUtils.generateTestToken("ELECTION_CLERK");
    sysAdminToken = global.testUtils.generateTestToken("SYSTEM_ADMINISTRATOR");
  });

  describe("Complete Election Workflow", () => {
    it("should handle complete election workflow from vote entry to certification", async () => {
      // 1. System Admin sets up election
      const electionSetup = await request(app)
        .put("/api/system-admin/election-status")
        .set("Authorization", `Bearer ${sysAdminToken}`)
        .send({
          status: "IN_PROGRESS",
          notes: "Election officially started",
        })
        .expect(200);

      expect(electionSetup.body.status).toBe("IN_PROGRESS");

      // 2. Presiding Officer enters vote counts
      const voteUpdate = await request(app)
        .post("/api/presiding-officer/vote-updates")
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .send({
          candidateId: testCandidates[0].id,
          regionCode: testRegions[0].code,
          count: 100,
          source: "MANUAL",
          notes: "Initial vote count",
        })
        .expect(201);

      expect(voteUpdate.body.candidateId).toBe(testCandidates[0].id);
      expect(voteUpdate.body.count).toBe(100);

      // 3. Election Clerk validates data
      const dataValidation = await request(app)
        .post("/api/election-clerk/data-validation")
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .send({
          entryId: voteUpdate.body.id,
          isValid: true,
          notes: "Data validated successfully",
        })
        .expect(201);

      expect(dataValidation.body.isValid).toBe(true);

      // 4. Returning Officer reviews constituency data
      const constituencyOverview = await request(app)
        .get("/api/returning-officer/constituency-overview")
        .set("Authorization", `Bearer ${returningOfficerToken}`)
        .expect(200);

      expect(constituencyOverview.body).toHaveProperty("voteSummary");
      expect(constituencyOverview.body).toHaveProperty("candidates");

      // 5. Returning Officer certifies constituency results
      const constituencyCertification = await request(app)
        .post("/api/returning-officer/certifications")
        .set("Authorization", `Bearer ${returningOfficerToken}`)
        .send({
          status: "CERTIFIED",
          notes: "Constituency results verified and certified",
        })
        .expect(201);

      expect(constituencyCertification.body.status).toBe("CERTIFIED");

      // 6. IEBC Commissioner reviews overall results
      const commissionerDashboard = await request(app)
        .get("/api/commissioner/dashboard")
        .set("Authorization", `Bearer ${commissionerToken}`)
        .expect(200);

      expect(commissionerDashboard.body).toHaveProperty("totalVotes");
      expect(commissionerDashboard.body).toHaveProperty("certificationStatus");

      // 7. IEBC Commissioner certifies national results
      const nationalCertification = await request(app)
        .post(`/api/commissioner/certifications/${testRegions[0].code}`)
        .set("Authorization", `Bearer ${commissionerToken}`)
        .send({
          status: "CERTIFIED",
          notes: "National results certified by IEBC Commissioner",
        })
        .expect(201);

      expect(nationalCertification.body.status).toBe("CERTIFIED");

      // 8. Verify public can access final results
      const publicResults = await request(app)
        .get("/api/votes/summary")
        .expect(200);

      expect(publicResults.body).toHaveProperty("totalVotes");
      expect(publicResults.body.totalVotes).toBeGreaterThan(0);
    }, 30000);

    it("should maintain data integrity throughout the workflow", async () => {
      // Create initial vote
      const initialVote = await request(app)
        .post("/api/presiding-officer/vote-updates")
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .send({
          candidateId: testCandidates[0].id,
          regionCode: testRegions[0].code,
          count: 50,
          source: "MANUAL",
          notes: "Initial count",
        })
        .expect(201);

      const voteId = initialVote.body.id;

      // Update the vote
      const updatedVote = await request(app)
        .put(`/api/presiding-officer/vote-updates/${voteId}`)
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .send({
          count: 75,
          notes: "Updated count",
        })
        .expect(200);

      expect(updatedVote.body.count).toBe(75);

      // Verify vote count in public API
      const publicVotes = await request(app)
        .get("/api/votes")
        .query({ regionCode: testRegions[0].code })
        .expect(200);

      expect(publicVotes.body.votes).toBeInstanceOf(Array);
      expect(publicVotes.body.votes.length).toBeGreaterThan(0);

      // Verify audit trail
      const auditLogs = await request(app)
        .get("/api/commissioner/audit-logs")
        .set("Authorization", `Bearer ${commissionerToken}`)
        .expect(200);

      expect(auditLogs.body.logs).toBeInstanceOf(Array);
      expect(auditLogs.body.logs.length).toBeGreaterThan(0);
    });
  });

  describe("Role-based Data Access and Isolation", () => {
    it("should enforce role-based data access correctly", async () => {
      // Create votes in different regions
      const region1 = testRegions[0];
      const region2 = await prisma.region.create({
        data: {
          name: "Test Region 2",
          code: "TEST002",
          type: "COUNTY",
          parentId: null,
        },
      });

      await prisma.vote.createMany({
        data: [
          {
            candidateId: testCandidates[0].id,
            regionId: region1.id,
            count: 100,
            source: "KIEMS",
            timestamp: new Date(),
          },
          {
            candidateId: testCandidates[0].id,
            regionId: region2.id,
            count: 200,
            source: "KIEMS",
            timestamp: new Date(),
          },
        ],
      });

      // Commissioner should see all data
      const commissionerData = await request(app)
        .get("/api/commissioner/dashboard")
        .set("Authorization", `Bearer ${commissionerToken}`)
        .expect(200);

      expect(commissionerData.body.totalVotes).toBeGreaterThan(0);

      // Returning Officer should only see constituency data
      const returningOfficerData = await request(app)
        .get("/api/returning-officer/constituency-overview")
        .set("Authorization", `Bearer ${returningOfficerToken}`)
        .expect(200);

      expect(returningOfficerData.body).toHaveProperty("constituency");

      // Presiding Officer should only see polling station data
      const presidingOfficerData = await request(app)
        .get("/api/presiding-officer/polling-station-overview")
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .expect(200);

      expect(presidingOfficerData.body).toHaveProperty("pollingStation");
    });

    it("should prevent unauthorized access to role-specific endpoints", async () => {
      // Public user should not access commissioner endpoints
      const publicToken = global.testUtils.generateTestToken("PUBLIC");

      await request(app)
        .get("/api/commissioner/dashboard")
        .set("Authorization", `Bearer ${publicToken}`)
        .expect(403);

      // Election Clerk should not access commissioner endpoints
      await request(app)
        .get("/api/commissioner/dashboard")
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .expect(403);

      // Presiding Officer should not access returning officer endpoints
      await request(app)
        .get("/api/returning-officer/constituency-overview")
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .expect(403);
    });
  });

  describe("Data Validation and Quality Assurance", () => {
    it("should validate data at each step of the workflow", async () => {
      // Try to create invalid vote update
      const invalidVoteUpdate = await request(app)
        .post("/api/presiding-officer/vote-updates")
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .send({
          candidateId: "invalid-id",
          regionCode: testRegions[0].code,
          count: -10, // Invalid count
          source: "MANUAL",
        })
        .expect(400);

      expect(invalidVoteUpdate.body).toHaveProperty("error");

      // Try to create valid vote update
      const validVoteUpdate = await request(app)
        .post("/api/presiding-officer/vote-updates")
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .send({
          candidateId: testCandidates[0].id,
          regionCode: testRegions[0].code,
          count: 50,
          source: "MANUAL",
          notes: "Valid vote count",
        })
        .expect(201);

      expect(validVoteUpdate.body).toHaveProperty("id");
      expect(validVoteUpdate.body.count).toBe(50);

      // Validate the data entry
      const validation = await request(app)
        .post("/api/election-clerk/data-validation")
        .set("Authorization", `Bearer ${electionClerkToken}`)
        .send({
          entryId: validVoteUpdate.body.id,
          isValid: true,
          notes: "Data validated",
        })
        .expect(201);

      expect(validation.body.isValid).toBe(true);
    });

    it("should maintain audit trail for all data changes", async () => {
      // Create a vote update
      const voteUpdate = await request(app)
        .post("/api/presiding-officer/vote-updates")
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .send({
          candidateId: testCandidates[0].id,
          regionCode: testRegions[0].code,
          count: 25,
          source: "MANUAL",
          notes: "Test vote update",
        })
        .expect(201);

      // Check audit logs
      const auditLogs = await request(app)
        .get("/api/commissioner/audit-logs")
        .set("Authorization", `Bearer ${commissionerToken}`)
        .expect(200);

      expect(auditLogs.body.logs).toBeInstanceOf(Array);
      expect(auditLogs.body.logs.length).toBeGreaterThan(0);

      // Verify audit log contains the vote update action
      const voteUpdateLog = auditLogs.body.logs.find(
        (log) => log.action === "VOTE_UPDATE" || log.details.includes("vote")
      );
      expect(voteUpdateLog).toBeDefined();
    });
  });

  describe("System Performance and Scalability", () => {
    it("should handle multiple concurrent requests", async () => {
      const concurrentRequests = 10;
      const promises = [];

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(request(app).get("/api/votes/summary").expect(200));
      }

      const results = await Promise.all(promises);

      results.forEach((result) => {
        expect(result.status).toBe(200);
        expect(result.body).toHaveProperty("totalVotes");
      });
    });

    it("should handle large datasets efficiently", async () => {
      // Create multiple test votes
      const voteData = [];
      for (let i = 0; i < 50; i++) {
        voteData.push({
          candidateId: testCandidates[0].id,
          regionId: testRegions[0].id,
          count: Math.floor(Math.random() * 100) + 1,
          source: "KIEMS",
          timestamp: new Date(),
        });
      }

      await prisma.vote.createMany({ data: voteData });

      // Test pagination
      const response = await request(app)
        .get("/api/votes")
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body.votes).toHaveLength(10);
      expect(response.body.pagination).toHaveProperty("total");
      expect(response.body.pagination.total).toBeGreaterThan(0);
    });
  });

  describe("Error Handling and Recovery", () => {
    it("should handle database connection errors gracefully", async () => {
      // This test would require mocking database failures
      // For now, test that validation errors are handled properly
      const response = await request(app)
        .post("/api/presiding-officer/vote-updates")
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });

    it("should handle malformed requests", async () => {
      const response = await request(app)
        .get("/api/votes")
        .query({ page: "invalid", limit: "invalid" })
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });

    it("should handle missing authentication", async () => {
      const response = await request(app)
        .get("/api/commissioner/dashboard")
        .expect(401);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("API Consistency and Standards", () => {
    it("should maintain consistent API response formats", async () => {
      // Test public API response format
      const publicResponse = await request(app).get("/api/votes").expect(200);

      expect(publicResponse.body).toHaveProperty("votes");
      expect(publicResponse.body).toHaveProperty("pagination");
      expect(publicResponse.body.votes).toBeInstanceOf(Array);

      // Test role-specific API response format
      const commissionerResponse = await request(app)
        .get("/api/commissioner/dashboard")
        .set("Authorization", `Bearer ${commissionerToken}`)
        .expect(200);

      expect(commissionerResponse.body).toHaveProperty("totalVotes");
      expect(commissionerResponse.body).toHaveProperty("totalRegions");
      expect(commissionerResponse.body).toHaveProperty("totalCandidates");
    });

    it("should handle pagination consistently across endpoints", async () => {
      const endpoints = ["/api/votes", "/api/candidates", "/api/regions"];

      for (const endpoint of endpoints) {
        const response = await request(app)
          .get(endpoint)
          .query({ page: 1, limit: 5 })
          .expect(200);

        expect(response.body).toHaveProperty("pagination");
        expect(response.body.pagination).toHaveProperty("page");
        expect(response.body.pagination).toHaveProperty("limit");
        expect(response.body.pagination).toHaveProperty("total");
      }
    });
  });

  describe("Security and Compliance", () => {
    it("should enforce proper authentication and authorization", async () => {
      // Test without token
      await request(app).get("/api/commissioner/dashboard").expect(401);

      // Test with invalid token
      await request(app)
        .get("/api/commissioner/dashboard")
        .set("Authorization", "Bearer invalid-token")
        .expect(401);

      // Test with expired token
      const expiredToken = jwt.sign(
        { sub: "test-user", role: "IEBC_COMMISSIONER" },
        process.env.JWT_SECRET || "test-secret",
        { expiresIn: "-1h" }
      );

      await request(app)
        .get("/api/commissioner/dashboard")
        .set("Authorization", `Bearer ${expiredToken}`)
        .expect(401);
    });

    it("should prevent data leakage between roles", async () => {
      // Create sensitive data
      const sensitiveVote = await request(app)
        .post("/api/presiding-officer/vote-updates")
        .set("Authorization", `Bearer ${presidingOfficerToken}`)
        .send({
          candidateId: testCandidates[0].id,
          regionCode: testRegions[0].code,
          count: 100,
          source: "MANUAL",
          notes: "Sensitive vote data",
        })
        .expect(201);

      // Public API should not expose sensitive information
      const publicVotes = await request(app).get("/api/votes").expect(200);

      publicVotes.body.votes.forEach((vote) => {
        expect(vote).not.toHaveProperty("notes"); // Sensitive field should not be exposed
        expect(vote).toHaveProperty("candidateId");
        expect(vote).toHaveProperty("count");
      });
    });
  });
});
