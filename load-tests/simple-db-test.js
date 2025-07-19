import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function runSimpleDatabaseTest() {
  console.log("🧪 Starting simple database performance test...\n");

  try {
    // Test 1: Simple read operations
    console.log("📖 Testing read operations...");
    const startTime = Date.now();

    const presidentialVotes = await prisma.vote.findMany({
      where: { position: "PRESIDENT" },
      include: { candidate: true, region: true },
      take: 50,
    });

    const governorVotes = await prisma.vote.findMany({
      where: { position: "GOVERNOR" },
      include: { candidate: true },
      take: 50,
    });

    const candidates = await prisma.candidate.findMany({
      where: { isActive: true },
      take: 20,
    });

    const readTime = Date.now() - startTime;
    console.log(`✅ Read test completed in ${readTime}ms`);
    console.log(`   - Presidential votes: ${presidentialVotes.length}`);
    console.log(`   - Governor votes: ${governorVotes.length}`);
    console.log(`   - Candidates: ${candidates.length}`);

    // Test 2: Concurrent operations simulation
    console.log("\n🔄 Testing concurrent operations...");
    const concurrentStart = Date.now();

    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(
        prisma.vote.findMany({
          where: { position: "PRESIDENT" },
          take: 10,
        })
      );
    }

    const concurrentResults = await Promise.all(promises);
    const concurrentTime = Date.now() - concurrentStart;

    console.log(`✅ Concurrent test completed in ${concurrentTime}ms`);
    console.log(
      `   - Average time per query: ${(concurrentTime / 20).toFixed(2)}ms`
    );

    // Test 3: Write operations
    console.log("\n✍️ Testing write operations...");
    const writeStart = Date.now();

    const testFeedback = await prisma.feedback.create({
      data: {
        type: "performance-test",
        message: "Database performance test feedback",
        email: "test@performance.com",
      },
    });

    // Clean up
    await prisma.feedback.delete({
      where: { id: testFeedback.id },
    });

    const writeTime = Date.now() - writeStart;
    console.log(`✅ Write test completed in ${writeTime}ms`);

    // Test 4: Complex queries
    console.log("\n🔍 Testing complex queries...");
    const complexStart = Date.now();

    const voteSummary = await prisma.vote.groupBy({
      by: ["position"],
      _sum: {
        voteCount: true,
      },
      _count: true,
    });

    const complexTime = Date.now() - complexStart;
    console.log(`✅ Complex query test completed in ${complexTime}ms`);
    console.log(`   - Vote summary: ${voteSummary.length} positions`);

    // Performance summary
    console.log("\n📊 PERFORMANCE SUMMARY:");
    console.log("========================");
    console.log(`Read Operations: ${readTime}ms`);
    console.log(
      `Concurrent Operations: ${concurrentTime}ms (${(concurrentTime / 20).toFixed(2)}ms avg)`
    );
    console.log(`Write Operations: ${writeTime}ms`);
    console.log(`Complex Queries: ${complexTime}ms`);

    // Recommendations
    console.log("\n💡 RECOMMENDATIONS:");
    if (readTime > 1000) {
      console.log(
        "⚠️  Read operations are slow - consider adding database indexes"
      );
    } else {
      console.log("✅ Read operations are performing well");
    }

    if (concurrentTime / 20 > 100) {
      console.log(
        "⚠️  Concurrent operations are slow - check connection pool settings"
      );
    } else {
      console.log("✅ Concurrent operations are performing well");
    }

    if (writeTime > 500) {
      console.log(
        "⚠️  Write operations are slow - consider optimizing queries"
      );
    } else {
      console.log("✅ Write operations are performing well");
    }

    console.log("\n🎉 Database performance test completed successfully!");
  } catch (error) {
    console.error("❌ Database test failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
runSimpleDatabaseTest();
