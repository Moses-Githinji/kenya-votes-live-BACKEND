import { PrismaClient } from "@prisma/client";
import { performance } from "perf_hooks";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";

const prisma = new PrismaClient();
const results = [];
const startTime = performance.now();

// Create log file for detailed results
const logStream = createWriteStream("./load-tests/million-user-db-results.log");

console.log("🚀 Starting Million User Database Stress Test...");
console.log("📊 Simulating 1,000,000+ concurrent database operations");
console.log("⏱️  Test duration: 10 minutes");
console.log("");

// Test configuration
const CONFIG = {
  totalOperations: 1000000,
  concurrentBatches: 50,
  batchSize: 20000,
  testDuration: 600000, // 10 minutes
  operationsPerSecond: 1667, // 1M operations / 10 minutes
  delayBetweenBatches: 1000, // 1 second
};

// Performance tracking
let completedOperations = 0;
let failedOperations = 0;
let totalResponseTime = 0;
let minResponseTime = Infinity;
let maxResponseTime = 0;

// Operation types and their weights
const OPERATIONS = [
  { name: "read_votes", weight: 40, fn: readVotesOperation },
  { name: "read_candidates", weight: 25, fn: readCandidatesOperation },
  { name: "read_regions", weight: 15, fn: readRegionsOperation },
  { name: "complex_queries", weight: 15, fn: complexQueriesOperation },
  { name: "write_feedback", weight: 5, fn: writeFeedbackOperation },
];

// Database operation functions
async function readVotesOperation() {
  const start = performance.now();
  try {
    const position = [
      "president",
      "governor",
      "senator",
      "mp",
      "woman_representative",
      "county_assembly",
    ][Math.floor(Math.random() * 6)];
    const regionId = Math.floor(Math.random() * 47) + 1;

    const votes = await prisma.vote.findMany({
      where: {
        position: position,
        regionId: regionId,
      },
      include: {
        candidate: true,
        region: true,
      },
      take: 100,
    });

    const end = performance.now();
    return { success: true, duration: end - start, count: votes.length };
  } catch (error) {
    const end = performance.now();
    return { success: false, duration: end - start, error: error.message };
  }
}

async function readCandidatesOperation() {
  const start = performance.now();
  try {
    const position = [
      "president",
      "governor",
      "senator",
      "mp",
      "woman_representative",
      "county_assembly",
    ][Math.floor(Math.random() * 6)];

    const candidates = await prisma.candidate.findMany({
      where: { position: position },
      include: {
        region: true,
        votes: {
          take: 10,
        },
      },
      take: 50,
    });

    const end = performance.now();
    return { success: true, duration: end - start, count: candidates.length };
  } catch (error) {
    const end = performance.now();
    return { success: false, duration: end - start, error: error.message };
  }
}

async function readRegionsOperation() {
  const start = performance.now();
  try {
    const regionType = ["county", "constituency", "ward"][
      Math.floor(Math.random() * 3)
    ];

    const regions = await prisma.region.findMany({
      where: { type: regionType },
      include: {
        candidates: {
          take: 5,
        },
        votes: {
          take: 10,
        },
      },
      take: 20,
    });

    const end = performance.now();
    return { success: true, duration: end - start, count: regions.length };
  } catch (error) {
    const end = performance.now();
    return { success: false, duration: end - start, error: error.message };
  }
}

async function complexQueriesOperation() {
  const start = performance.now();
  try {
    const position = [
      "president",
      "governor",
      "senator",
      "mp",
      "woman_representative",
      "county_assembly",
    ][Math.floor(Math.random() * 6)];

    // Complex aggregation query
    const results = await prisma.vote.groupBy({
      by: ["regionId"],
      where: { position: position },
      _sum: { count: true },
      _count: { id: true },
      orderBy: { _sum: { count: "desc" } },
      take: 10,
    });

    const end = performance.now();
    return { success: true, duration: end - start, count: results.length };
  } catch (error) {
    const end = performance.now();
    return { success: false, duration: end - start, error: error.message };
  }
}

async function writeFeedbackOperation() {
  const start = performance.now();
  try {
    const feedbackTypes = [
      "bug_report",
      "feature_request",
      "data_correction",
      "general",
    ];
    const feedbackType =
      feedbackTypes[Math.floor(Math.random() * feedbackTypes.length)];

    const feedback = await prisma.feedback.create({
      data: {
        type: feedbackType,
        message: `Stress test feedback - ${Date.now()}`,
        regionId: Math.floor(Math.random() * 47) + 1,
        contact: `test-${Date.now()}@example.com`,
        status: "PENDING",
      },
    });

    const end = performance.now();
    return { success: true, duration: end - start, count: 1 };
  } catch (error) {
    const end = performance.now();
    return { success: false, duration: end - start, error: error.message };
  }
}

// Batch processing function
async function processBatch(batchId, batchSize) {
  const batchStart = performance.now();
  const batchResults = [];

  console.log(
    `🔄 Processing batch ${batchId}/${CONFIG.concurrentBatches} (${batchSize} operations)`
  );

  for (let i = 0; i < batchSize; i++) {
    // Select operation based on weights
    const random = Math.random() * 100;
    let cumulativeWeight = 0;
    let selectedOperation = OPERATIONS[0];

    for (const operation of OPERATIONS) {
      cumulativeWeight += operation.weight;
      if (random <= cumulativeWeight) {
        selectedOperation = operation;
        break;
      }
    }

    // Execute operation
    const result = await selectedOperation.fn();

    // Track metrics
    completedOperations++;
    totalResponseTime += result.duration;
    minResponseTime = Math.min(minResponseTime, result.duration);
    maxResponseTime = Math.max(maxResponseTime, result.duration);

    if (!result.success) {
      failedOperations++;
    }

    batchResults.push({
      operation: selectedOperation.name,
      success: result.success,
      duration: result.duration,
      count: result.count,
      error: result.error,
    });

    // Add small delay to prevent overwhelming the database
    if (i % 1000 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  const batchEnd = performance.now();
  const batchDuration = batchEnd - batchStart;
  const batchRate = batchSize / (batchDuration / 1000);

  console.log(
    `✅ Batch ${batchId} completed: ${batchSize} operations in ${(batchDuration / 1000).toFixed(2)}s (${batchRate.toFixed(0)} ops/sec)`
  );

  return {
    batchId,
    batchSize,
    duration: batchDuration,
    rate: batchRate,
    results: batchResults,
  };
}

// Main test execution
async function runMillionUserTest() {
  console.log("🎯 Starting Million User Database Stress Test...\n");

  const testStart = performance.now();
  const batches = [];

  // Create batches
  for (let i = 0; i < CONFIG.concurrentBatches; i++) {
    const batchSize = Math.floor(
      CONFIG.totalOperations / CONFIG.concurrentBatches
    );
    batches.push(batchSize);
  }

  // Process batches with controlled concurrency
  const batchPromises = batches.map(
    (batchSize, index) =>
      new Promise((resolve) => {
        setTimeout(async () => {
          const result = await processBatch(index + 1, batchSize);
          resolve(result);
        }, index * CONFIG.delayBetweenBatches);
      })
  );

  // Wait for all batches to complete
  const batchResults = await Promise.all(batchPromises);

  const testEnd = performance.now();
  const totalDuration = testEnd - testStart;

  // Calculate final metrics
  const avgResponseTime = totalResponseTime / completedOperations;
  const successRate =
    ((completedOperations - failedOperations) / completedOperations) * 100;
  const overallRate = completedOperations / (totalDuration / 1000);

  // Generate comprehensive report
  const report = {
    testConfiguration: CONFIG,
    summary: {
      totalOperations: completedOperations,
      successfulOperations: completedOperations - failedOperations,
      failedOperations: failedOperations,
      successRate: successRate.toFixed(2) + "%",
      totalDuration: (totalDuration / 1000).toFixed(2) + "s",
      averageResponseTime: avgResponseTime.toFixed(2) + "ms",
      minResponseTime: minResponseTime.toFixed(2) + "ms",
      maxResponseTime: maxResponseTime.toFixed(2) + "ms",
      operationsPerSecond: overallRate.toFixed(0),
      concurrentBatches: CONFIG.concurrentBatches,
    },
    batchResults: batchResults,
    performanceScore: calculatePerformanceScore(
      successRate,
      avgResponseTime,
      overallRate
    ),
  };

  // Log results
  console.log("\n" + "=".repeat(80));
  console.log("📊 MILLION USER DATABASE STRESS TEST RESULTS");
  console.log("=".repeat(80));
  console.log(
    `Total Operations: ${report.summary.totalOperations.toLocaleString()}`
  );
  console.log(`Success Rate: ${report.summary.successRate}`);
  console.log(`Average Response Time: ${report.summary.averageResponseTime}`);
  console.log(`Operations/Second: ${report.summary.operationsPerSecond}`);
  console.log(`Total Duration: ${report.summary.totalDuration}`);
  console.log(`Performance Score: ${report.performanceScore}/10`);
  console.log("=".repeat(80));

  // Save detailed results
  await logStream.write(JSON.stringify(report, null, 2));
  await logStream.end();

  // Cleanup
  await prisma.$disconnect();

  return report;
}

function calculatePerformanceScore(successRate, avgResponseTime, opsPerSecond) {
  let score = 0;

  // Success rate weight: 40%
  if (successRate >= 99) score += 4;
  else if (successRate >= 95) score += 3;
  else if (successRate >= 90) score += 2;
  else if (successRate >= 80) score += 1;

  // Response time weight: 30%
  if (avgResponseTime <= 50) score += 3;
  else if (avgResponseTime <= 100) score += 2.5;
  else if (avgResponseTime <= 200) score += 2;
  else if (avgResponseTime <= 500) score += 1.5;
  else if (avgResponseTime <= 1000) score += 1;

  // Throughput weight: 30%
  if (opsPerSecond >= 2000) score += 3;
  else if (opsPerSecond >= 1500) score += 2.5;
  else if (opsPerSecond >= 1000) score += 2;
  else if (opsPerSecond >= 500) score += 1.5;
  else if (opsPerSecond >= 100) score += 1;

  return Math.min(10, score);
}

// Run the test
runMillionUserTest()
  .then((report) => {
    console.log(
      "\n✅ Million User Database Stress Test completed successfully!"
    );
    console.log(
      `📁 Detailed results saved to: ./load-tests/million-user-db-results.log`
    );
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Test failed:", error);
    process.exit(1);
  });
