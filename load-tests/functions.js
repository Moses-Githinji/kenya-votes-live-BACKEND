// Artillery load testing helper functions

// Kenya county codes for random selection
const countyCodes = [
  "001",
  "002",
  "003",
  "004",
  "005",
  "006",
  "007",
  "008",
  "009",
  "010",
  "011",
  "012",
  "013",
  "014",
  "015",
  "016",
  "017",
  "018",
  "019",
  "020",
  "021",
  "022",
  "023",
  "024",
  "025",
  "026",
  "027",
  "028",
  "029",
  "030",
  "031",
  "032",
  "033",
  "034",
  "035",
  "036",
  "037",
  "038",
  "039",
  "040",
  "041",
  "042",
  "043",
  "044",
  "045",
  "046",
  "047",
];

// Candidate names for search testing
const searchTerms = [
  "Ruto",
  "Odinga",
  "Karua",
  "Wajackoyah",
  "Kenyatta",
  "Musyoka",
  "Wetangula",
  "Mudavadi",
  "Kingi",
  "Moi",
  "Kiprop",
  "Ochieng",
  "Kamau",
  "Wanjiku",
];

// Metrics tracking for endpoints
const endpointMetrics = new Map();

// Set random county code for region-based requests
function setRandomCounty(requestParams, context, ee, next) {
  const randomCounty =
    countyCodes[Math.floor(Math.random() * countyCodes.length)];
  context.vars.countyCode = randomCounty;
  return next();
}

// Set random search term for candidate search
function setRandomSearchTerm(requestParams, context, ee, next) {
  const randomTerm =
    searchTerms[Math.floor(Math.random() * searchTerms.length)];
  context.vars.searchTerm = randomTerm;
  return next();
}

// Add random delay to simulate real user behavior
function addRandomDelay(requestParams, context, ee, next) {
  const delay = Math.random() * 2000; // 0-2 seconds
  setTimeout(() => {
    return next();
  }, delay);
}

// Validate response structure
function validateResponse(requestParams, response, context, ee, next) {
  try {
    const data = JSON.parse(response.body);

    // Basic validation for results endpoint
    if (response.request.url.includes("/results/")) {
      if (!data.hasOwnProperty("position") || !data.hasOwnProperty("results")) {
        console.error("Invalid response structure:", data);
      }
    }

    // Basic validation for status endpoint
    if (response.request.url.includes("/status")) {
      if (
        !data.hasOwnProperty("positions") ||
        !data.hasOwnProperty("overallStatus")
      ) {
        console.error("Invalid status response structure:", data);
      }
    }
  } catch (error) {
    console.error("Error parsing response:", error);
  }

  return next();
}

// Set random election data for extreme stress test
function setRandomElectionData(requestParams, context, ee, next) {
  const positions = [
    "president",
    "governor",
    "senator",
    "mp",
    "woman_representative",
    "county_assembly",
  ];
  const regionTypes = ["county", "constituency", "ward"];
  const regionCodes = [
    "001",
    "002",
    "003",
    "004",
    "005",
    "006",
    "007",
    "008",
    "009",
    "010",
    "011",
    "012",
    "013",
    "014",
    "015",
    "016",
    "017",
    "018",
    "019",
    "020",
    "021",
    "022",
    "023",
    "024",
    "025",
    "026",
    "027",
    "028",
    "029",
    "030",
    "031",
    "032",
    "033",
    "034",
    "035",
    "036",
    "037",
    "038",
    "039",
    "040",
    "041",
    "042",
    "043",
    "044",
    "045",
    "046",
    "047",
  ];

  context.vars.position =
    positions[Math.floor(Math.random() * positions.length)];
  context.vars.regionType =
    regionTypes[Math.floor(Math.random() * regionTypes.length)];
  context.vars.regionCode =
    regionCodes[Math.floor(Math.random() * regionCodes.length)];

  return next();
}

// Set random candidate data for extreme stress test
function setRandomCandidateData(requestParams, context, ee, next) {
  const candidateIds = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  ];
  const searchTerms = [
    "Ruto",
    "Odinga",
    "Karua",
    "Wajackoyah",
    "Kenyatta",
    "Musyoka",
    "Wetangula",
    "Mudavadi",
    "Kingi",
    "Moi",
  ];

  context.vars.candidateId =
    candidateIds[Math.floor(Math.random() * candidateIds.length)];
  context.vars.searchTerm =
    searchTerms[Math.floor(Math.random() * searchTerms.length)];

  return next();
}

// Set random map data for extreme stress test
function setRandomMapData(requestParams, context, ee, next) {
  const regionTypes = ["county", "constituency", "ward"];
  const regionCodes = [
    "001",
    "002",
    "003",
    "004",
    "005",
    "006",
    "007",
    "008",
    "009",
    "010",
    "011",
    "012",
    "013",
    "014",
    "015",
    "016",
    "017",
    "018",
    "019",
    "020",
    "021",
    "022",
    "023",
    "024",
    "025",
    "026",
    "027",
    "028",
    "029",
    "030",
    "031",
    "032",
    "033",
    "034",
    "035",
    "036",
    "037",
    "038",
    "039",
    "040",
    "041",
    "042",
    "043",
    "044",
    "045",
    "046",
    "047",
  ];

  context.vars.regionType =
    regionTypes[Math.floor(Math.random() * regionTypes.length)];
  context.vars.regionCode =
    regionCodes[Math.floor(Math.random() * regionCodes.length)];

  return next();
}

// Set random feedback data for extreme stress test
function setRandomFeedbackData(requestParams, context, ee, next) {
  const feedbackTypes = [
    "bug_report",
    "feature_request",
    "data_correction",
    "general",
  ];
  const feedbackMessages = [
    "Stress test feedback - system performance check",
    "Load testing feedback - user experience validation",
    "Performance test feedback - scalability assessment",
    "Stress test feedback - reliability verification",
  ];
  const regionIds = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
    22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
    41, 42, 43, 44, 45, 46, 47,
  ];

  context.vars.feedbackType =
    feedbackTypes[Math.floor(Math.random() * feedbackTypes.length)];
  context.vars.feedbackMessage =
    feedbackMessages[Math.floor(Math.random() * feedbackMessages.length)];
  context.vars.regionId =
    regionIds[Math.floor(Math.random() * regionIds.length)];
  context.vars.contact = `stress-test-${Date.now()}@example.com`;

  return next();
}

// Metrics tracking functions for Artillery
function metricsByEndpoint_beforeRequest(requestParams, context, ee, next) {
  const endpoint = requestParams.url || context.vars.url || "unknown";
  const startTime = Date.now();

  if (!endpointMetrics.has(endpoint)) {
    endpointMetrics.set(endpoint, {
      count: 0,
      totalTime: 0,
      minTime: Infinity,
      maxTime: 0,
      errors: 0,
    });
  }

  context.vars.requestStartTime = startTime;
  context.vars.endpoint = endpoint;

  return next();
}

function metricsByEndpoint_afterResponse(
  requestParams,
  response,
  context,
  ee,
  next
) {
  const endpoint = context.vars.endpoint || "unknown";
  const startTime = context.vars.requestStartTime || Date.now();
  const endTime = Date.now();
  const duration = endTime - startTime;

  const metrics = endpointMetrics.get(endpoint);
  if (metrics) {
    metrics.count++;
    metrics.totalTime += duration;
    metrics.minTime = Math.min(metrics.minTime, duration);
    metrics.maxTime = Math.max(metrics.maxTime, duration);

    if (response.statusCode >= 400) {
      metrics.errors++;
    }
  }

  return next();
}

// Get metrics summary
function getMetricsSummary() {
  const summary = {};
  for (const [endpoint, metrics] of endpointMetrics.entries()) {
    summary[endpoint] = {
      ...metrics,
      avgTime: metrics.count > 0 ? metrics.totalTime / metrics.count : 0,
      errorRate: metrics.count > 0 ? (metrics.errors / metrics.count) * 100 : 0,
    };
  }
  return summary;
}

// Clear metrics
function clearMetrics() {
  endpointMetrics.clear();
}

export {
  setRandomCounty,
  setRandomSearchTerm,
  addRandomDelay,
  validateResponse,
  setRandomElectionData,
  setRandomCandidateData,
  setRandomMapData,
  setRandomFeedbackData,
  metricsByEndpoint_beforeRequest,
  metricsByEndpoint_afterResponse,
  getMetricsSummary,
  clearMetrics,
};
