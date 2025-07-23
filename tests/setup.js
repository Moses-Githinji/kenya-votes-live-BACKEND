import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load test environment variables
dotenv.config({ path: ".env.test" });

// Load sample admin users
const sampleUsers = JSON.parse(
  fs.readFileSync(path.join(__dirname, "sample_admin_users.json"), "utf-8")
);

// Global test database client
global.prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
    },
  },
});

// Global test utilities
global.testUtils = {
  // Generate test JWT tokens for different roles
  generateTestToken: (role = "PUBLIC", userId = "test-user-id") => {
    const jwt = require("jsonwebtoken");
    const payload = {
      sub: userId,
      email: "test@example.com",
      role: role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
    };
    return jwt.sign(payload, process.env.JWT_SECRET || "test-secret");
  },

  // Create test user
  createTestUser: async (role = "PUBLIC", email = "test@example.com") => {
    // Use upsert to avoid unique constraint errors
    return await global.prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        id: `test-${role.toLowerCase()}-${Date.now()}`,
        email,
        name: `Test ${role}`,
        role,
        isActive: true,
        lastLogin: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        auth0Id: null,
      },
    });
  },

  // Clean up test data
  cleanupTestData: async () => {
    await global.prisma.voteUpdate.deleteMany();
    await global.prisma.vote.deleteMany();
    await global.prisma.certification.deleteMany();
    await global.prisma.auditLog.deleteMany();
    await global.prisma.candidate.deleteMany();
    await global.prisma.region.deleteMany();
    await global.prisma.user.deleteMany({
      where: {
        email: {
          contains: "test@",
        },
      },
    });
  },

  // Create test regions
  createTestRegions: async () => {
    const regions = [
      {
        name: "Test County",
        code: "TEST001",
        type: "COUNTY",
        parentId: null,
      },
      {
        name: "Test Constituency",
        code: "TEST002",
        type: "CONSTITUENCY",
        parentId: null,
      },
      {
        name: "Test Ward",
        code: "TEST003",
        type: "WARD",
        parentId: null,
      },
      {
        name: "Test Polling Station",
        code: "TEST004",
        type: "POLLING_STATION",
        parentId: null,
      },
    ];

    const createdRegions = [];
    for (const region of regions) {
      const created = await global.prisma.region.create({
        data: region,
      });
      createdRegions.push(created);
    }
    return createdRegions;
  },

  // Create test candidates
  createTestCandidates: async (regionId) => {
    const candidates = [
      {
        name: "Test Candidate 1",
        party: "Test Party A",
        position: "PRESIDENT",
        regionId,
        regionType: "NATIONAL",
        bio: "Test bio 1",
      },
      {
        name: "Test Candidate 2",
        party: "Test Party B",
        position: "PRESIDENT",
        regionId,
        regionType: "NATIONAL",
        bio: "Test bio 2",
      },
    ];

    const createdCandidates = [];
    for (const candidate of candidates) {
      const created = await global.prisma.candidate.create({
        data: candidate,
      });
      createdCandidates.push(created);
    }
    return createdCandidates;
  },
};

// Global setup and teardown
beforeAll(async () => {
  // Clean up users table before inserting sample users
  await global.prisma.user.deleteMany({});
  // Insert sample users into the database
  for (const user of sampleUsers) {
    await global.prisma.user.create({ data: user });
  }
  // Ensure database is ready
  await global.prisma.$connect();
});

afterAll(async () => {
  await global.prisma.$disconnect();
});

beforeEach(async () => {
  // Clean up before each test
  await global.testUtils.cleanupTestData();
});
