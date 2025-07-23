#!/usr/bin/env node

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("🚀 Starting Kenya Votes Live Backend Test Suite...\n");

// Test categories
const testCategories = [
  {
    name: "Authentication & Authorization",
    pattern: "tests/middleware/auth.test.js",
    description:
      "Testing JWT validation, role-based access control, and permission enforcement",
  },
  {
    name: "Public API Routes",
    pattern: "tests/routes/public.test.js",
    description:
      "Testing public vote counting, candidate information, and region-based data access",
  },
  {
    name: "IEBC Commissioner Routes",
    pattern: "tests/routes/commissioner.test.js",
    description:
      "Testing election management, certification, and oversight capabilities",
  },
  {
    name: "Returning Officer Routes",
    pattern: "tests/routes/returningOfficer.test.js",
    description: "Testing constituency-level vote management and certification",
  },
  {
    name: "Presiding Officer Routes",
    pattern: "tests/routes/presidingOfficer.test.js",
    description:
      "Testing polling station-level vote management and real-time updates",
  },
  {
    name: "Election Clerk Routes",
    pattern: "tests/routes/electionClerk.test.js",
    description: "Testing data entry, validation, and administrative support",
  },
  {
    name: "System Administrator Routes",
    pattern: "tests/routes/systemAdmin.test.js",
    description:
      "Testing system management, user administration, and technical oversight",
  },
  {
    name: "WebSocket Functionality",
    pattern: "tests/websocket/websocket.test.js",
    description:
      "Testing real-time notifications, role-based channels, and connection management",
  },
  {
    name: "Integration Tests",
    pattern: "tests/integration/integration.test.js",
    description:
      "Testing complete system workflow, data flow, and end-to-end functionality",
  },
];

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runTest(category) {
  return new Promise((resolve, reject) => {
    log(`\n${colors.cyan}📋 Running: ${category.name}${colors.reset}`);
    log(`${colors.yellow}${category.description}${colors.reset}\n`);

    const jest = spawn(
      "npx",
      ["jest", category.pattern, "--verbose", "--detectOpenHandles"],
      {
        stdio: "pipe",
        shell: true,
      }
    );

    let output = "";
    let errorOutput = "";

    jest.stdout.on("data", (data) => {
      const message = data.toString();
      output += message;
      process.stdout.write(message);
    });

    jest.stderr.on("data", (data) => {
      const message = data.toString();
      errorOutput += message;
      process.stderr.write(message);
    });

    jest.on("close", (code) => {
      if (code === 0) {
        log(`\n${colors.green}✅ ${category.name} - PASSED${colors.reset}`);
        resolve({
          category: category.name,
          status: "PASSED",
          output,
          errorOutput,
        });
      } else {
        log(`\n${colors.red}❌ ${category.name} - FAILED${colors.reset}`);
        reject({
          category: category.name,
          status: "FAILED",
          output,
          errorOutput,
          code,
        });
      }
    });

    jest.on("error", (error) => {
      log(`\n${colors.red}💥 ${category.name} - ERROR${colors.reset}`);
      reject({
        category: category.name,
        status: "ERROR",
        error: error.message,
      });
    });
  });
}

async function runAllTests() {
  const results = [];
  const startTime = Date.now();

  log(
    `${colors.bright}🧪 Running ${testCategories.length} test categories...${colors.reset}\n`
  );

  for (const category of testCategories) {
    try {
      const result = await runTest(category);
      results.push(result);
    } catch (error) {
      results.push(error);
    }
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  // Generate summary report
  log(`\n${colors.bright}📊 Test Summary Report${colors.reset}`);
  log(
    `${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}\n`
  );

  const passed = results.filter((r) => r.status === "PASSED").length;
  const failed = results.filter((r) => r.status === "FAILED").length;
  const errors = results.filter((r) => r.status === "ERROR").length;

  log(`${colors.green}✅ Passed: ${passed}${colors.reset}`);
  log(`${colors.red}❌ Failed: ${failed}${colors.reset}`);
  log(`${colors.yellow}💥 Errors: ${errors}${colors.reset}`);
  log(`${colors.blue}⏱️  Duration: ${duration}s${colors.reset}\n`);

  // Detailed results
  log(`${colors.bright}📋 Detailed Results:${colors.reset}\n`);

  results.forEach((result) => {
    const statusIcon =
      result.status === "PASSED"
        ? "✅"
        : result.status === "FAILED"
          ? "❌"
          : "💥";
    const statusColor =
      result.status === "PASSED"
        ? "green"
        : result.status === "FAILED"
          ? "red"
          : "yellow";

    log(`${statusIcon} ${result.category} - ${result.status}`, statusColor);

    if (result.status !== "PASSED" && result.errorOutput) {
      log(`   Error: ${result.errorOutput.substring(0, 200)}...`, "red");
    }
  });

  // Final status
  log(
    `\n${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`
  );

  if (failed === 0 && errors === 0) {
    log(
      `${colors.bright}${colors.green}🎉 All tests passed successfully!${colors.reset}`
    );
    process.exit(0);
  } else {
    log(
      `${colors.bright}${colors.red}⚠️  Some tests failed. Please review the results above.${colors.reset}`
    );
    process.exit(1);
  }
}

// Handle process termination
process.on("SIGINT", () => {
  log(
    `\n${colors.yellow}⚠️  Test execution interrupted by user${colors.reset}`
  );
  process.exit(1);
});

process.on("SIGTERM", () => {
  log(`\n${colors.yellow}⚠️  Test execution terminated${colors.reset}`);
  process.exit(1);
});

// Run the tests
runAllTests().catch((error) => {
  log(`\n${colors.red}💥 Fatal error during test execution:${colors.reset}`);
  log(error.message, "red");
  process.exit(1);
});
