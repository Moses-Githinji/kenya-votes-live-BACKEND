import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import authenticateToken from "../../src/middleware/auth.js";
import { requireRole, requirePermission } from "../../src/middleware/auth.js";

// Create test app
const app = express();
app.use(express.json());

// Test routes
app.get("/public", (req, res) => res.json({ message: "public" }));
app.get("/protected", authenticateToken, (req, res) =>
  res.json({ user: req.user })
);
app.get(
  "/commissioner-only",
  authenticateToken,
  requireRole("IEBC_COMMISSIONER"),
  (req, res) => res.json({ message: "commissioner" })
);
app.get(
  "/returning-officer-only",
  authenticateToken,
  requireRole("RETURNING_OFFICER"),
  (req, res) => res.json({ message: "returning officer" })
);
app.get(
  "/presiding-officer-only",
  authenticateToken,
  requireRole("PRESIDING_OFFICER"),
  (req, res) => res.json({ message: "presiding officer" })
);
app.get(
  "/election-clerk-only",
  authenticateToken,
  requireRole("ELECTION_CLERK"),
  (req, res) => res.json({ message: "election clerk" })
);
app.get(
  "/system-admin-only",
  authenticateToken,
  requireRole("SYSTEM_ADMINISTRATOR"),
  (req, res) => res.json({ message: "system admin" })
);

describe("Authentication Middleware", () => {
  const secret = process.env.JWT_SECRET || "test-secret";

  describe("authenticateToken", () => {
    it("should allow access to public routes without token", async () => {
      const response = await request(app).get("/public").expect(200);

      expect(response.body.message).toBe("public");
    });

    it("should reject requests without token for protected routes", async () => {
      const response = await request(app).get("/protected").expect(401);

      expect(response.body.error).toBe("Access token required");
    });

    it("should reject requests with invalid token", async () => {
      const response = await request(app)
        .get("/protected")
        .set("Authorization", "Bearer invalid-token")
        .expect(401);

      expect(response.body.error).toBe("Invalid token");
    });

    it("should allow access with valid token", async () => {
      const token = jwt.sign(
        { sub: "test-user", email: "test@example.com", role: "PUBLIC" },
        secret,
        { expiresIn: "1h" }
      );

      const response = await request(app)
        .get("/protected")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(response.body.user.sub).toBe("test-user");
      expect(response.body.user.email).toBe("test@example.com");
      expect(response.body.user.role).toBe("PUBLIC");
    });

    it("should reject expired tokens", async () => {
      const token = jwt.sign(
        { sub: "test-user", email: "test@example.com", role: "PUBLIC" },
        secret,
        { expiresIn: "-1h" }
      );

      const response = await request(app)
        .get("/protected")
        .set("Authorization", `Bearer ${token}`)
        .expect(401);

      expect(response.body.error).toBe("Token expired");
    });
  });

  describe("requireRole", () => {
    it("should allow IEBC Commissioner access to commissioner routes", async () => {
      const token = jwt.sign(
        {
          sub: "test-user",
          email: "test@example.com",
          role: "IEBC_COMMISSIONER",
        },
        secret,
        { expiresIn: "1h" }
      );

      const response = await request(app)
        .get("/commissioner-only")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(response.body.message).toBe("commissioner");
    });

    it("should deny access to commissioner routes for other roles", async () => {
      const roles = [
        "RETURNING_OFFICER",
        "PRESIDING_OFFICER",
        "ELECTION_CLERK",
        "SYSTEM_ADMINISTRATOR",
        "PUBLIC",
      ];

      for (const role of roles) {
        const token = jwt.sign(
          { sub: "test-user", email: "test@example.com", role },
          secret,
          { expiresIn: "1h" }
        );

        const response = await request(app)
          .get("/commissioner-only")
          .set("Authorization", `Bearer ${token}`)
          .expect(403);

        expect(response.body.error).toBe("Insufficient permissions");
      }
    });

    it("should allow Returning Officer access to returning officer routes", async () => {
      const token = jwt.sign(
        {
          sub: "test-user",
          email: "test@example.com",
          role: "RETURNING_OFFICER",
        },
        secret,
        { expiresIn: "1h" }
      );

      const response = await request(app)
        .get("/returning-officer-only")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(response.body.message).toBe("returning officer");
    });

    it("should allow Presiding Officer access to presiding officer routes", async () => {
      const token = jwt.sign(
        {
          sub: "test-user",
          email: "test@example.com",
          role: "PRESIDING_OFFICER",
        },
        secret,
        { expiresIn: "1h" }
      );

      const response = await request(app)
        .get("/presiding-officer-only")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(response.body.message).toBe("presiding officer");
    });

    it("should allow Election Clerk access to election clerk routes", async () => {
      const token = jwt.sign(
        { sub: "test-user", email: "test@example.com", role: "ELECTION_CLERK" },
        secret,
        { expiresIn: "1h" }
      );

      const response = await request(app)
        .get("/election-clerk-only")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(response.body.message).toBe("election clerk");
    });

    it("should allow System Administrator access to system admin routes", async () => {
      const token = jwt.sign(
        {
          sub: "test-user",
          email: "test@example.com",
          role: "SYSTEM_ADMINISTRATOR",
        },
        secret,
        { expiresIn: "1h" }
      );

      const response = await request(app)
        .get("/system-admin-only")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(response.body.message).toBe("system admin");
    });
  });

  describe("Token format validation", () => {
    it("should reject malformed Authorization headers", async () => {
      const response = await request(app)
        .get("/protected")
        .set("Authorization", "InvalidFormat token")
        .expect(401);

      expect(response.body.error).toBe("Invalid token format");
    });

    it("should reject empty Authorization header", async () => {
      const response = await request(app)
        .get("/protected")
        .set("Authorization", "")
        .expect(401);

      expect(response.body.error).toBe("Access token required");
    });
  });

  describe("Role hierarchy and permissions", () => {
    it("should enforce role-specific access correctly", async () => {
      const testCases = [
        {
          role: "IEBC_COMMISSIONER",
          route: "/commissioner-only",
          shouldAllow: true,
        },
        {
          role: "RETURNING_OFFICER",
          route: "/returning-officer-only",
          shouldAllow: true,
        },
        {
          role: "PRESIDING_OFFICER",
          route: "/presiding-officer-only",
          shouldAllow: true,
        },
        {
          role: "ELECTION_CLERK",
          route: "/election-clerk-only",
          shouldAllow: true,
        },
        {
          role: "SYSTEM_ADMINISTRATOR",
          route: "/system-admin-only",
          shouldAllow: true,
        },
        { role: "PUBLIC", route: "/commissioner-only", shouldAllow: false },
        {
          role: "PUBLIC",
          route: "/returning-officer-only",
          shouldAllow: false,
        },
        {
          role: "PUBLIC",
          route: "/presiding-officer-only",
          shouldAllow: false,
        },
        { role: "PUBLIC", route: "/election-clerk-only", shouldAllow: false },
        { role: "PUBLIC", route: "/system-admin-only", shouldAllow: false },
      ];

      for (const testCase of testCases) {
        const token = jwt.sign(
          { sub: "test-user", email: "test@example.com", role: testCase.role },
          secret,
          { expiresIn: "1h" }
        );

        if (testCase.shouldAllow) {
          await request(app)
            .get(testCase.route)
            .set("Authorization", `Bearer ${token}`)
            .expect(200);
        } else {
          await request(app)
            .get(testCase.route)
            .set("Authorization", `Bearer ${token}`)
            .expect(403);
        }
      }
    });
  });
});
