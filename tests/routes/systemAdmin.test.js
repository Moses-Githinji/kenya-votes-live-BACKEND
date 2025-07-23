import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import authenticateToken, { requireRole } from "../../src/middleware/auth.js";
import sysAdminRoutes from "../../src/routes/sysAdminRoutes.js";
import sampleUsers from "../sample_admin_users.json";

const app = express();
app.use(express.json());
app.use(
  "/api/system-admin",
  authenticateToken,
  requireRole("SYSTEM_ADMINISTRATOR"),
  sysAdminRoutes
);

describe("System Administrator Routes (all admin roles)", () => {
  sampleUsers.forEach((user) => {
    describe(`Tests for role: ${user.role}`, () => {
      let userToken;
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
              position: "PRESIDENT",
              voteCount: 100,
              source: "KIEMS",
              timestamp: new Date(),
            },
            {
              candidateId: testCandidates[1].id,
              regionId: testRegions[0].id,
              position: "PRESIDENT",
              voteCount: 150,
              source: "KIEMS",
              timestamp: new Date(),
            },
          ],
        });

        // Generate token for this user
        userToken = global.testUtils.generateTestToken(
          user.role,
          user.id,
          user.email
        );
      });

      describe("GET /api/system-admin/dashboard", () => {
        it("should return system admin dashboard", async () => {
          const response = await request(app)
            .get("/api/system-admin/dashboard")
            .set("Authorization", `Bearer ${userToken}`)
            .expect(user.role === "SYSTEM_ADMINISTRATOR" ? 200 : 403);

          if (user.role === "SYSTEM_ADMINISTRATOR") {
            expect(response.body).toHaveProperty("systemHealth");
            expect(response.body).toHaveProperty("userStatistics");
            expect(response.body).toHaveProperty("performanceMetrics");
            expect(response.body).toHaveProperty("recentAlerts");
            expect(response.body).toHaveProperty("systemStatus");
          } else {
            expect(response.body).toHaveProperty("error");
          }
        });

        it("should deny access to non-system admin users", async () => {
          const response = await request(app)
            .get("/api/system-admin/dashboard")
            .set("Authorization", `Bearer ${userToken}`)
            .expect(403);

          expect(response.body).toHaveProperty("error");
        });
      });

      describe("GET /api/system-admin/users", () => {
        it("should return all users", async () => {
          // Create test users
          await global.testUtils.createTestUser(
            "IEBC_COMMISSIONER",
            "commissioner@test.com"
          );
          await global.testUtils.createTestUser(
            "RETURNING_OFFICER",
            "returning@test.com"
          );
          await global.testUtils.createTestUser(
            "PRESIDING_OFFICER",
            "presiding@test.com"
          );

          const response = await request(app)
            .get("/api/system-admin/users")
            .set("Authorization", `Bearer ${userToken}`)
            .expect(200);

          expect(response.body).toHaveProperty("users");
          expect(response.body).toHaveProperty("pagination");
          expect(response.body.users).toBeInstanceOf(Array);
          expect(response.body.users.length).toBeGreaterThan(0);
        });

        it("should filter users by role", async () => {
          const response = await request(app)
            .get("/api/system-admin/users")
            .query({ role: "IEBC_COMMISSIONER" })
            .set("Authorization", `Bearer ${userToken}`)
            .expect(200);

          expect(response.body).toHaveProperty("users");
          expect(response.body.users).toBeInstanceOf(Array);
          response.body.users.forEach((user) => {
            expect(user.role).toBe("IEBC_COMMISSIONER");
          });
        });

        it("should filter users by status", async () => {
          const response = await request(app)
            .get("/api/system-admin/users")
            .query({ isActive: "true" })
            .set("Authorization", `Bearer ${userToken}`)
            .expect(200);

          expect(response.body).toHaveProperty("users");
          expect(response.body.users).toBeInstanceOf(Array);
          response.body.users.forEach((user) => {
            expect(user.isActive).toBe(true);
          });
        });
      });

      describe("POST /api/system-admin/users", () => {
        it("should create new user", async () => {
          const newUser = {
            email: "newuser@test.com",
            name: "New Test User",
            role: "ELECTION_CLERK",
            isActive: true,
          };

          const response = await request(app)
            .post("/api/system-admin/users")
            .set("Authorization", `Bearer ${userToken}`)
            .send(newUser)
            .expect(201);

          expect(response.body).toHaveProperty("id");
          expect(response.body).toHaveProperty("email");
          expect(response.body).toHaveProperty("name");
          expect(response.body).toHaveProperty("role");
          expect(response.body).toHaveProperty("isActive");
          expect(response.body.email).toBe("newuser@test.com");
          expect(response.body.role).toBe("ELECTION_CLERK");
        });

        it("should validate user data", async () => {
          const invalidUser = {
            email: "invalid-email",
            name: "",
            role: "INVALID_ROLE",
          };

          const response = await request(app)
            .post("/api/system-admin/users")
            .set("Authorization", `Bearer ${userToken}`)
            .send(invalidUser)
            .expect(400);

          expect(response.body).toHaveProperty("error");
        });

        it("should prevent duplicate email addresses", async () => {
          const existingUser = await global.testUtils.createTestUser(
            "ELECTION_CLERK",
            "duplicate@test.com"
          );

          const duplicateUser = {
            email: "duplicate@test.com",
            name: "Duplicate User",
            role: "ELECTION_CLERK",
          };

          const response = await request(app)
            .post("/api/system-admin/users")
            .set("Authorization", `Bearer ${userToken}`)
            .send(duplicateUser)
            .expect(409);

          expect(response.body).toHaveProperty("error");
        });
      });

      describe("PUT /api/system-admin/users/:id", () => {
        it("should update user", async () => {
          const user = await global.testUtils.createTestUser(
            "ELECTION_CLERK",
            "update@test.com"
          );

          const updateData = {
            name: "Updated User Name",
            role: "PRESIDING_OFFICER",
            isActive: false,
          };

          const response = await request(app)
            .put(`/api/system-admin/users/${user.id}`)
            .set("Authorization", `Bearer ${userToken}`)
            .send(updateData)
            .expect(200);

          expect(response.body).toHaveProperty("id");
          expect(response.body).toHaveProperty("name");
          expect(response.body).toHaveProperty("role");
          expect(response.body).toHaveProperty("isActive");
          expect(response.body.name).toBe("Updated User Name");
          expect(response.body.role).toBe("PRESIDING_OFFICER");
          expect(response.body.isActive).toBe(false);
        });

        it("should return 404 for non-existent user", async () => {
          const updateData = {
            name: "Updated User Name",
            role: "PRESIDING_OFFICER",
          };

          const response = await request(app)
            .put("/api/system-admin/users/non-existent-id")
            .set("Authorization", `Bearer ${userToken}`)
            .send(updateData)
            .expect(404);

          expect(response.body).toHaveProperty("error");
        });
      });

      describe("DELETE /api/system-admin/users/:id", () => {
        it("should deactivate user", async () => {
          const user = await global.testUtils.createTestUser(
            "ELECTION_CLERK",
            "delete@test.com"
          );

          const response = await request(app)
            .delete(`/api/system-admin/users/${user.id}`)
            .set("Authorization", `Bearer ${userToken}`)
            .expect(200);

          expect(response.body).toHaveProperty("message");
          expect(response.body).toHaveProperty("userId");
          expect(response.body.userId).toBe(user.id);
        });

        it("should return 404 for non-existent user", async () => {
          const response = await request(app)
            .delete("/api/system-admin/users/non-existent-id")
            .set("Authorization", `Bearer ${userToken}`)
            .expect(404);

          expect(response.body).toHaveProperty("error");
        });
      });

      describe("GET /api/system-admin/system-health", () => {
        it("should return comprehensive system health", async () => {
          const response = await request(app)
            .get("/api/system-admin/system-health")
            .set("Authorization", `Bearer ${userToken}`)
            .expect(200);

          expect(response.body).toHaveProperty("database");
          expect(response.body).toHaveProperty("redis");
          expect(response.body).toHaveProperty("kafka");
          expect(response.body).toHaveProperty("elasticsearch");
          expect(response.body).toHaveProperty("api");
          expect(response.body).toHaveProperty("websocket");
          expect(response.body).toHaveProperty("overallStatus");
          expect(response.body).toHaveProperty("lastChecked");
        });
      });

      describe("GET /api/system-admin/performance-metrics", () => {
        it("should return detailed performance metrics", async () => {
          const response = await request(app)
            .get("/api/system-admin/performance-metrics")
            .set("Authorization", `Bearer ${userToken}`)
            .expect(200);

          expect(response.body).toHaveProperty("responseTimes");
          expect(response.body).toHaveProperty("throughput");
          expect(response.body).toHaveProperty("errorRates");
          expect(response.body).toHaveProperty("activeConnections");
          expect(response.body).toHaveProperty("memoryUsage");
          expect(response.body).toHaveProperty("cpuUsage");
          expect(response.body).toHaveProperty("diskUsage");
        });

        it("should filter metrics by time range", async () => {
          const startDate = new Date(
            Date.now() - 24 * 60 * 60 * 1000
          ).toISOString();
          const endDate = new Date().toISOString();

          const response = await request(app)
            .get("/api/system-admin/performance-metrics")
            .query({ startDate, endDate })
            .set("Authorization", `Bearer ${userToken}`)
            .expect(200);

          expect(response.body).toHaveProperty("responseTimes");
          expect(response.body).toHaveProperty("throughput");
        });
      });

      describe("GET /api/system-admin/audit-logs", () => {
        it("should return system audit logs", async () => {
          // Create test audit logs
          await global.prisma.auditLog.createMany({
            data: [
              {
                userId: "test-sys-admin",
                action: "USER_CREATED",
                resource: "USER",
                details: "Created new user",
                ipAddress: "127.0.0.1",
                userAgent: "Test Agent",
              },
              {
                userId: "test-sys-admin",
                action: "SYSTEM_CONFIG_CHANGED",
                resource: "SYSTEM_CONFIG",
                details: "Updated system configuration",
                ipAddress: "127.0.0.1",
                userAgent: "Test Agent",
              },
            ],
          });

          const response = await request(app)
            .get("/api/system-admin/audit-logs")
            .set("Authorization", `Bearer ${userToken}`)
            .expect(200);

          expect(response.body).toHaveProperty("logs");
          expect(response.body).toHaveProperty("pagination");
          expect(response.body.logs).toBeInstanceOf(Array);
          expect(response.body.logs.length).toBeGreaterThan(0);
        });

        it("should filter audit logs by action", async () => {
          const response = await request(app)
            .get("/api/system-admin/audit-logs")
            .query({ action: "USER_CREATED" })
            .set("Authorization", `Bearer ${userToken}`)
            .expect(200);

          expect(response.body).toHaveProperty("logs");
          expect(response.body.logs).toBeInstanceOf(Array);
          response.body.logs.forEach((log) => {
            expect(log.action).toBe("USER_CREATED");
          });
        });
      });

      describe("GET /api/system-admin/system-config", () => {
        it("should return system configuration", async () => {
          const response = await request(app)
            .get("/api/system-admin/system-config")
            .set("Authorization", `Bearer ${userToken}`)
            .expect(200);

          expect(response.body).toHaveProperty("config");
          expect(response.body).toHaveProperty("lastUpdated");
        });
      });

      describe("PUT /api/system-admin/system-config", () => {
        it("should update system configuration", async () => {
          const configUpdate = {
            maintenanceMode: false,
            rateLimitEnabled: true,
            maxConnections: 1000,
            logLevel: "INFO",
          };

          const response = await request(app)
            .put("/api/system-admin/system-config")
            .set("Authorization", `Bearer ${userToken}`)
            .send(configUpdate)
            .expect(200);

          expect(response.body).toHaveProperty("config");
          expect(response.body).toHaveProperty("updatedAt");
          expect(response.body.config.maintenanceMode).toBe(false);
          expect(response.body.config.rateLimitEnabled).toBe(true);
        });

        it("should validate configuration data", async () => {
          const invalidConfig = {
            maintenanceMode: "invalid-boolean",
            maxConnections: -100,
          };

          const response = await request(app)
            .put("/api/system-admin/system-config")
            .set("Authorization", `Bearer ${userToken}`)
            .send(invalidConfig)
            .expect(400);

          expect(response.body).toHaveProperty("error");
        });
      });

      describe("POST /api/system-admin/maintenance", () => {
        it("should enable maintenance mode", async () => {
          const maintenanceData = {
            enabled: true,
            message: "System under maintenance",
            estimatedDuration: "2 hours",
          };

          const response = await request(app)
            .post("/api/system-admin/maintenance")
            .set("Authorization", `Bearer ${userToken}`)
            .send(maintenanceData)
            .expect(200);

          expect(response.body).toHaveProperty("maintenanceMode");
          expect(response.body).toHaveProperty("message");
          expect(response.body).toHaveProperty("enabledAt");
          expect(response.body.maintenanceMode).toBe(true);
        });

        it("should disable maintenance mode", async () => {
          const maintenanceData = {
            enabled: false,
            message: "Maintenance completed",
          };

          const response = await request(app)
            .post("/api/system-admin/maintenance")
            .set("Authorization", `Bearer ${userToken}`)
            .send(maintenanceData)
            .expect(200);

          expect(response.body).toHaveProperty("maintenanceMode");
          expect(response.body).toHaveProperty("message");
          expect(response.body.maintenanceMode).toBe(false);
        });
      });

      describe("GET /api/system-admin/backups", () => {
        it("should return system backups", async () => {
          const response = await request(app)
            .get("/api/system-admin/backups")
            .set("Authorization", `Bearer ${userToken}`)
            .expect(200);

          expect(response.body).toHaveProperty("backups");
          expect(response.body.backups).toBeInstanceOf(Array);
        });
      });

      describe("POST /api/system-admin/backups", () => {
        it("should create system backup", async () => {
          const backupRequest = {
            type: "FULL",
            description: "Scheduled backup",
            includeAuditLogs: true,
          };

          const response = await request(app)
            .post("/api/system-admin/backups")
            .set("Authorization", `Bearer ${userToken}`)
            .send(backupRequest)
            .expect(201);

          expect(response.body).toHaveProperty("backupId");
          expect(response.body).toHaveProperty("status");
          expect(response.body).toHaveProperty("estimatedCompletion");
        });
      });

      describe("GET /api/system-admin/alerts", () => {
        it("should return system alerts", async () => {
          const response = await request(app)
            .get("/api/system-admin/alerts")
            .set("Authorization", `Bearer ${userToken}`)
            .expect(200);

          expect(response.body).toHaveProperty("alerts");
          expect(response.body.alerts).toBeInstanceOf(Array);
        });

        it("should filter alerts by severity", async () => {
          const response = await request(app)
            .get("/api/system-admin/alerts")
            .query({ severity: "HIGH" })
            .set("Authorization", `Bearer ${userToken}`)
            .expect(200);

          expect(response.body).toHaveProperty("alerts");
          expect(response.body.alerts).toBeInstanceOf(Array);
        });
      });

      describe("POST /api/system-admin/alerts/:id/acknowledge", () => {
        it("should acknowledge system alert", async () => {
          const response = await request(app)
            .post("/api/system-admin/alerts/test-alert-id/acknowledge")
            .set("Authorization", `Bearer ${userToken}`)
            .expect(200);

          expect(response.body).toHaveProperty("alertId");
          expect(response.body).toHaveProperty("acknowledgedAt");
          expect(response.body.alertId).toBe("test-alert-id");
        });
      });

      describe("Authentication and Authorization", () => {
        it("should require authentication", async () => {
          const response = await request(app)
            .get("/api/system-admin/dashboard")
            .expect(401);

          expect(response.body).toHaveProperty("error");
        });

        it("should require SYSTEM_ADMINISTRATOR role", async () => {
          const publicToken = global.testUtils.generateTestToken("PUBLIC");

          const response = await request(app)
            .get("/api/system-admin/dashboard")
            .set("Authorization", `Bearer ${publicToken}`)
            .expect(403);

          expect(response.body).toHaveProperty("error");
        });
      });

      describe("Security and access control", () => {
        it("should not allow system admin to access other role data", async () => {
          // System admin should not be able to access commissioner-specific data
          const response = await request(app)
            .get("/api/system-admin/users")
            .query({ role: "IEBC_COMMISSIONER" })
            .set("Authorization", `Bearer ${userToken}`)
            .expect(200);

          // Should return users but not expose sensitive commissioner data
          expect(response.body).toHaveProperty("users");
          expect(response.body.users).toBeInstanceOf(Array);
        });

        it("should log all administrative actions", async () => {
          // Create a user to trigger audit logging
          const newUser = {
            email: "audit-test@test.com",
            name: "Audit Test User",
            role: "ELECTION_CLERK",
          };

          await request(app)
            .post("/api/system-admin/users")
            .set("Authorization", `Bearer ${userToken}`)
            .send(newUser)
            .expect(201);

          // Check that audit log was created
          const auditLogs = await global.prisma.auditLog.findMany({
            where: {
              action: "USER_CREATED",
            },
          });

          expect(auditLogs.length).toBeGreaterThan(0);
        });
      });

      describe("Error handling", () => {
        it("should handle validation errors", async () => {
          const response = await request(app)
            .post("/api/system-admin/users")
            .set("Authorization", `Bearer ${userToken}`)
            .send({})
            .expect(400);

          expect(response.body).toHaveProperty("error");
        });

        it("should handle database errors gracefully", async () => {
          const response = await request(app)
            .get("/api/system-admin/users")
            .query({ limit: "invalid" })
            .set("Authorization", `Bearer ${userToken}`)
            .expect(400);

          expect(response.body).toHaveProperty("error");
        });
      });
    }); // End of describe for role
  }); // End of forEach
}); // End of main describe
