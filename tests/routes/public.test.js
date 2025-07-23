import request from "supertest";
import express from "express";
import publicRoutes from "../../src/routes/public.js";

const app = express();
app.use(express.json());
app.use("/api", publicRoutes);

describe("Public Routes", () => {
  beforeEach(async () => {
    // Create test data
    const regions = await global.testUtils.createTestRegions();
    const candidates = await global.testUtils.createTestCandidates(
      regions[0].id
    );

    // Create test votes
    await global.prisma.vote.createMany({
      data: [
        {
          candidateId: candidates[0].id,
          regionId: regions[0].id,
          voteCount: 100,
          source: "KIEMS",
          timestamp: new Date(),
          position: "PRESIDENT",
        },
        {
          candidateId: candidates[1].id,
          regionId: regions[0].id,
          voteCount: 150,
          source: "KIEMS",
          timestamp: new Date(),
          position: "PRESIDENT",
        },
      ],
    });
  });

  describe("GET /api/votes", () => {
    it("should return all votes with pagination", async () => {
      const response = await request(app)
        .get("/api/votes")
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body).toHaveProperty("votes");
      expect(response.body).toHaveProperty("pagination");
      expect(response.body.votes).toBeInstanceOf(Array);
      expect(response.body.pagination).toHaveProperty("total");
      expect(response.body.pagination).toHaveProperty("page");
      expect(response.body.pagination).toHaveProperty("limit");
    });

    it("should filter votes by regionCode", async () => {
      const response = await request(app)
        .get("/api/votes")
        .query({ regionCode: "TEST001" })
        .expect(200);

      expect(response.body.votes).toBeInstanceOf(Array);
      expect(response.body.votes.length).toBeGreaterThan(0);
    });

    it("should filter votes by position", async () => {
      const response = await request(app)
        .get("/api/votes")
        .query({ position: "PRESIDENT" })
        .expect(200);

      expect(response.body.votes).toBeInstanceOf(Array);
      expect(response.body.votes.length).toBeGreaterThan(0);
    });

    it("should return 400 for invalid regionCode", async () => {
      const response = await request(app)
        .get("/api/votes")
        .query({ regionCode: "INVALID" })
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("GET /api/votes/summary", () => {
    it("should return vote summary", async () => {
      const response = await request(app).get("/api/votes/summary").expect(200);

      expect(response.body).toHaveProperty("totalVotes");
      expect(response.body).toHaveProperty("totalCandidates");
      expect(response.body).toHaveProperty("totalRegions");
      expect(response.body).toHaveProperty("lastUpdated");
    });

    it("should filter summary by regionCode", async () => {
      const response = await request(app)
        .get("/api/votes/summary")
        .query({ regionCode: "TEST001" })
        .expect(200);

      expect(response.body).toHaveProperty("totalVotes");
      expect(response.body).toHaveProperty("regionCode");
      expect(response.body.regionCode).toBe("TEST001");
    });
  });

  describe("GET /api/candidates", () => {
    it("should return all candidates", async () => {
      const response = await request(app).get("/api/candidates").expect(200);

      expect(response.body).toHaveProperty("candidates");
      expect(response.body.candidates).toBeInstanceOf(Array);
      expect(response.body.candidates.length).toBeGreaterThan(0);
    });

    it("should filter candidates by position", async () => {
      const response = await request(app)
        .get("/api/candidates")
        .query({ position: "PRESIDENT" })
        .expect(200);

      expect(response.body.candidates).toBeInstanceOf(Array);
      expect(response.body.candidates.length).toBeGreaterThan(0);
      response.body.candidates.forEach((candidate) => {
        expect(candidate.position).toBe("PRESIDENT");
      });
    });

    it("should filter candidates by regionCode", async () => {
      const response = await request(app)
        .get("/api/candidates")
        .query({ regionCode: "TEST001" })
        .expect(200);

      expect(response.body.candidates).toBeInstanceOf(Array);
      expect(response.body.candidates.length).toBeGreaterThan(0);
    });

    it("should return candidate details with votes", async () => {
      const response = await request(app)
        .get("/api/candidates")
        .query({ includeVotes: "true" })
        .expect(200);

      expect(response.body.candidates).toBeInstanceOf(Array);
      expect(response.body.candidates.length).toBeGreaterThan(0);
      expect(response.body.candidates[0]).toHaveProperty("votes");
    });
  });

  describe("GET /api/candidates/:id", () => {
    it("should return candidate details", async () => {
      const candidates = await global.prisma.candidate.findMany();
      const candidateId = candidates[0].id;

      const response = await request(app)
        .get(`/api/candidates/${candidateId}`)
        .expect(200);

      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("name");
      expect(response.body).toHaveProperty("party");
      expect(response.body).toHaveProperty("position");
      expect(response.body.id).toBe(candidateId);
    });

    it("should return 404 for non-existent candidate", async () => {
      const response = await request(app)
        .get("/api/candidates/non-existent-id")
        .expect(404);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("GET /api/regions", () => {
    it("should return all regions", async () => {
      const response = await request(app).get("/api/regions").expect(200);

      expect(response.body).toHaveProperty("regions");
      expect(response.body.regions).toBeInstanceOf(Array);
      expect(response.body.regions.length).toBeGreaterThan(0);
    });

    it("should filter regions by type", async () => {
      const response = await request(app)
        .get("/api/regions")
        .query({ type: "COUNTY" })
        .expect(200);

      expect(response.body.regions).toBeInstanceOf(Array);
      expect(response.body.regions.length).toBeGreaterThan(0);
      response.body.regions.forEach((region) => {
        expect(region.type).toBe("COUNTY");
      });
    });

    it("should return regions with vote counts", async () => {
      const response = await request(app)
        .get("/api/regions")
        .query({ includeVotes: "true" })
        .expect(200);

      expect(response.body.regions).toBeInstanceOf(Array);
      expect(response.body.regions.length).toBeGreaterThan(0);
      expect(response.body.regions[0]).toHaveProperty("voteCount");
    });
  });

  describe("GET /api/regions/:regionCode", () => {
    it("should return region details", async () => {
      const response = await request(app)
        .get("/api/regions/TEST001")
        .expect(200);

      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("name");
      expect(response.body).toHaveProperty("code");
      expect(response.body).toHaveProperty("type");
      expect(response.body.code).toBe("TEST001");
    });

    it("should return 404 for non-existent region", async () => {
      const response = await request(app)
        .get("/api/regions/NONEXISTENT")
        .expect(404);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("GET /api/regions/:regionCode/votes", () => {
    it("should return votes for specific region", async () => {
      const response = await request(app)
        .get("/api/regions/TEST001/votes")
        .expect(200);

      expect(response.body).toHaveProperty("votes");
      expect(response.body).toHaveProperty("region");
      expect(response.body.votes).toBeInstanceOf(Array);
      expect(response.body.region.code).toBe("TEST001");
    });

    it("should return 404 for non-existent region", async () => {
      const response = await request(app)
        .get("/api/regions/NONEXISTENT/votes")
        .expect(404);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("GET /api/regions/:regionCode/candidates", () => {
    it("should return candidates for specific region", async () => {
      const response = await request(app)
        .get("/api/regions/TEST001/candidates")
        .expect(200);

      expect(response.body).toHaveProperty("candidates");
      expect(response.body).toHaveProperty("region");
      expect(response.body.candidates).toBeInstanceOf(Array);
      expect(response.body.region.code).toBe("TEST001");
    });

    it("should return 404 for non-existent region", async () => {
      const response = await request(app)
        .get("/api/regions/NONEXISTENT/candidates")
        .expect(404);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("GET /api/positions", () => {
    it("should return all positions", async () => {
      const response = await request(app).get("/api/positions").expect(200);

      expect(response.body).toHaveProperty("positions");
      expect(response.body.positions).toBeInstanceOf(Array);
      expect(response.body.positions).toContain("PRESIDENT");
      expect(response.body.positions).toContain("GOVERNOR");
      expect(response.body.positions).toContain("SENATOR");
      expect(response.body.positions).toContain("MP");
      expect(response.body.positions).toContain("WOMAN_REPRESENTATIVE");
      expect(response.body.positions).toContain("COUNTY_ASSEMBLY_MEMBER");
    });
  });

  describe("GET /api/positions/:position/votes", () => {
    it("should return votes for specific position", async () => {
      const response = await request(app)
        .get("/api/positions/PRESIDENT/votes")
        .expect(200);

      expect(response.body).toHaveProperty("votes");
      expect(response.body).toHaveProperty("position");
      expect(response.body.votes).toBeInstanceOf(Array);
      expect(response.body.position).toBe("PRESIDENT");
    });

    it("should return 400 for invalid position", async () => {
      const response = await request(app)
        .get("/api/positions/INVALID/votes")
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("GET /api/health", () => {
    it("should return health status", async () => {
      const response = await request(app).get("/api/health").expect(200);

      expect(response.body).toHaveProperty("status");
      expect(response.body).toHaveProperty("timestamp");
      expect(response.body).toHaveProperty("uptime");
      expect(response.body.status).toBe("healthy");
    });
  });

  describe("Error handling", () => {
    it("should handle database connection errors gracefully", async () => {
      // This test would require mocking the database connection
      // For now, we'll test that the routes handle errors properly
      const response = await request(app)
        .get("/api/votes")
        .query({ page: "invalid" })
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });

    it("should validate query parameters", async () => {
      const response = await request(app)
        .get("/api/votes")
        .query({ limit: "invalid" })
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });
  });
});
