import { PrismaClient } from "@prisma/client";
import { performance } from "perf_hooks";

const prisma = new PrismaClient();

// Database stress testing functions
class DatabaseStressTest {
  constructor() {
    this.results = [];
    this.startTime = null;
  }

  async testConcurrentReads(numConcurrent = 100) {
    console.log(`🧪 Testing ${numConcurrent} concurrent database reads...`);

    const promises = [];
    const startTime = performance.now();

    for (let i = 0; i < numConcurrent; i++) {
      const promise = this.singleReadTest(i);
      promises.push(promise);
    }

    const results = await Promise.all(promises);
    const endTime = performance.now();

    const avgResponseTime =
      results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
    const successRate =
      (results.filter((r) => r.success).length / results.length) * 100;

    console.log(`✅ Concurrent Reads Test Results:`);
    console.log(`   - Total Time: ${(endTime - startTime).toFixed(2)}ms`);
    console.log(`   - Average Response Time: ${avgResponseTime.toFixed(2)}ms`);
    console.log(`   - Success Rate: ${successRate.toFixed(2)}%`);
    console.log(`   - Total Requests: ${results.length}`);

    return { avgResponseTime, successRate, totalTime: endTime - startTime };
  }

  async singleReadTest(index) {
    const startTime = performance.now();

    try {
      // Random county code
      const countyCodes = ["001", "032", "047", "042", "022"];
      const randomCounty = countyCodes[index % countyCodes.length];

      // Test different query types
      const queryType = index % 4;
      let result;

      switch (queryType) {
        case 0:
          // Presidential results
          result = await prisma.vote.findMany({
            where: {
              position: "PRESIDENT",
              region: { code: randomCounty },
            },
            include: {
              candidate: true,
              region: true,
            },
          });
          break;

        case 1:
          // Governor results
          result = await prisma.vote.findMany({
            where: {
              position: "GOVERNOR",
              region: { code: randomCounty },
            },
            include: {
              candidate: true,
            },
          });
          break;

        case 2:
          // Candidate search
          result = await prisma.candidate.findMany({
            where: {
              name: { contains: "Ruto" },
              isActive: true,
            },
            include: {
              votes: true,
            },
          });
          break;

        case 3:
          // Election status
          result = await prisma.electionStatus.findMany();
          break;
      }

      const endTime = performance.now();
      return {
        success: true,
        responseTime: endTime - startTime,
        resultCount: Array.isArray(result) ? result.length : 1,
      };
    } catch (error) {
      const endTime = performance.now();
      return {
        success: false,
        responseTime: endTime - startTime,
        error: error.message,
      };
    }
  }

  async testWriteOperations(numOperations = 50) {
    console.log(`🧪 Testing ${numOperations} write operations...`);

    const startTime = performance.now();
    const results = [];

    for (let i = 0; i < numOperations; i++) {
      const result = await this.singleWriteTest(i);
      results.push(result);
    }

    const endTime = performance.now();
    const avgResponseTime =
      results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
    const successRate =
      (results.filter((r) => r.success).length / results.length) * 100;

    console.log(`✅ Write Operations Test Results:`);
    console.log(`   - Total Time: ${(endTime - startTime).toFixed(2)}ms`);
    console.log(`   - Average Response Time: ${avgResponseTime.toFixed(2)}ms`);
    console.log(`   - Success Rate: ${successRate.toFixed(2)}%`);

    return { avgResponseTime, successRate, totalTime: endTime - startTime };
  }

  async singleWriteTest(index) {
    const startTime = performance.now();

    try {
      // Create test feedback
      const feedback = await prisma.feedback.create({
        data: {
          type: "test",
          message: `Load test feedback ${index}`,
          email: `test${index}@loadtest.com`,
        },
      });

      // Clean up the test data
      await prisma.feedback.delete({
        where: { id: feedback.id },
      });

      const endTime = performance.now();
      return {
        success: true,
        responseTime: endTime - startTime,
      };
    } catch (error) {
      const endTime = performance.now();
      return {
        success: false,
        responseTime: endTime - startTime,
        error: error.message,
      };
    }
  }

  async testConnectionPool(numConnections = 50) {
    console.log(
      `🧪 Testing connection pool with ${numConnections} connections...`
    );

    const startTime = performance.now();
    const promises = [];

    for (let i = 0; i < numConnections; i++) {
      const promise = this.testConnection(i);
      promises.push(promise);
    }

    const results = await Promise.all(promises);
    const endTime = performance.now();

    const successRate =
      (results.filter((r) => r.success).length / results.length) * 100;

    console.log(`✅ Connection Pool Test Results:`);
    console.log(`   - Total Time: ${(endTime - startTime).toFixed(2)}ms`);
    console.log(`   - Success Rate: ${successRate.toFixed(2)}%`);
    console.log(
      `   - Active Connections: ${results.filter((r) => r.success).length}`
    );

    return { successRate, totalTime: endTime - startTime };
  }

  async testConnection(index) {
    try {
      // Simple query to test connection
      const result = await prisma.region.findFirst({
        where: { code: "001" },
      });

      return { success: true, index };
    } catch (error) {
      return { success: false, index, error: error.message };
    }
  }

  async runFullTest() {
    console.log("🚀 Starting comprehensive database stress test...\n");

    this.startTime = performance.now();

    // Test 1: Concurrent reads
    const readResults = await this.testConcurrentReads(100);

    // Test 2: Write operations
    const writeResults = await this.testWriteOperations(20);

    // Test 3: Connection pool
    const connectionResults = await this.testConnectionPool(50);

    // Test 4: Mixed operations
    console.log("\n🧪 Testing mixed read/write operations...");
    const mixedResults = await this.testMixedOperations(30);

    const totalTime = performance.now() - this.startTime;

    console.log("\n📊 COMPREHENSIVE TEST SUMMARY:");
    console.log("================================");
    console.log(`Total Test Duration: ${(totalTime / 1000).toFixed(2)}s`);
    console.log(
      `Read Operations: ${readResults.successRate.toFixed(2)}% success rate`
    );
    console.log(
      `Write Operations: ${writeResults.successRate.toFixed(2)}% success rate`
    );
    console.log(
      `Connection Pool: ${connectionResults.successRate.toFixed(2)}% success rate`
    );
    console.log(
      `Mixed Operations: ${mixedResults.successRate.toFixed(2)}% success rate`
    );

    // Performance recommendations
    console.log("\n💡 PERFORMANCE RECOMMENDATIONS:");
    if (readResults.avgResponseTime > 100) {
      console.log(
        "⚠️  Read response times are high - consider adding database indexes"
      );
    }
    if (writeResults.avgResponseTime > 200) {
      console.log(
        "⚠️  Write response times are high - consider optimizing queries"
      );
    }
    if (connectionResults.successRate < 95) {
      console.log("⚠️  Connection pool issues - consider increasing pool size");
    }

    return {
      readResults,
      writeResults,
      connectionResults,
      mixedResults,
      totalTime,
    };
  }

  async testMixedOperations(numOperations = 30) {
    const startTime = performance.now();
    const results = [];

    for (let i = 0; i < numOperations; i++) {
      const result = await this.mixedOperation(i);
      results.push(result);
    }

    const endTime = performance.now();
    const avgResponseTime =
      results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
    const successRate =
      (results.filter((r) => r.success).length / results.length) * 100;

    console.log(`✅ Mixed Operations Test Results:`);
    console.log(`   - Average Response Time: ${avgResponseTime.toFixed(2)}ms`);
    console.log(`   - Success Rate: ${successRate.toFixed(2)}%`);

    return { avgResponseTime, successRate };
  }

  async mixedOperation(index) {
    const startTime = performance.now();

    try {
      // Read operation
      const votes = await prisma.vote.findMany({
        where: { position: "PRESIDENT" },
        take: 10,
      });

      // Write operation (test feedback)
      const feedback = await prisma.feedback.create({
        data: {
          type: "mixed-test",
          message: `Mixed operation test ${index}`,
          email: `mixed${index}@test.com`,
        },
      });

      // Clean up
      await prisma.feedback.delete({
        where: { id: feedback.id },
      });

      const endTime = performance.now();
      return {
        success: true,
        responseTime: endTime - startTime,
      };
    } catch (error) {
      const endTime = performance.now();
      return {
        success: false,
        responseTime: endTime - startTime,
        error: error.message,
      };
    }
  }
}

// Run the tests
async function runDatabaseStressTest() {
  const tester = new DatabaseStressTest();

  try {
    await tester.runFullTest();
  } catch (error) {
    console.error("❌ Database stress test failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Export for use in other tests
export { DatabaseStressTest };

// Run if this file is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  runDatabaseStressTest();
}
