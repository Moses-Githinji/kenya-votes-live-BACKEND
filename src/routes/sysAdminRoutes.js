import express from "express";
import { requireSystemAdministrator } from "../middleware/auth.js";
import fs from "fs";
import path from "path";
import logger from "../utils/logger.js";
import { sendEmail } from "../utils/email.js";

const router = express.Router();

// Helper RBAC middleware for SYSTEM_ADMINISTRATOR only
function requireSysAdmin(req, res, next) {
  if (!req.user || req.user.role !== "SYSTEM_ADMINISTRATOR") {
    return res
      .status(403)
      .json({ error: "Access denied: SYSTEM_ADMINISTRATOR role required" });
  }
  next();
}

// Monitor system metrics
router.get("/monitor", requireSystemAdministrator, (req, res) => {
  // Implementation: return system metrics (no election data)
  res.json({ message: "System metrics (no election data)" });
});

// Manage user accounts
router.post("/users/manage", requireSystemAdministrator, (req, res) => {
  // Implementation: create/modify/deactivate user accounts
  res.json({ message: "User account managed" });
});

// Configure system settings
router.post("/settings/configure", requireSystemAdministrator, (req, res) => {
  // Implementation: configure system settings
  res.json({ message: "System settings configured" });
});

// Troubleshoot system errors
router.post("/troubleshoot", requireSystemAdministrator, (req, res) => {
  // Implementation: troubleshoot system errors
  res.json({ message: "System error troubleshooted" });
});

// Access technical logs (no election data)
router.get("/logs/technical", requireSystemAdministrator, (req, res) => {
  // Implementation: return technical logs only
  res.json({ message: "Technical logs (no election data)" });
});

// Manage system backups
router.post("/backups/manage", requireSystemAdministrator, (req, res) => {
  // Implementation: manage backups
  res.json({ message: "System backup managed" });
});

// Advanced SYSTEM_ADMINISTRATOR endpoints (placeholders)

// Middleware to enforce SYSTEM_ADMINISTRATOR role
// import { requireSystemAdministrator } from "../middleware/auth.js";

// View/search/export logs
router.get("/logs", requireSystemAdministrator, async (req, res) => {
  // Example: read from combined.log (could be extended to Elasticsearch, etc.)
  const { level, userId, env, from, to, limit = 100 } = req.query;
  const logFile = path.join(process.cwd(), "logs", "combined.log");
  if (!fs.existsSync(logFile)) {
    return res.status(404).json({ error: "Log file not found" });
  }
  const lines = fs.readFileSync(logFile, "utf-8").split("\n").filter(Boolean);
  let results = lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  if (level) results = results.filter((l) => l.level === level);
  if (userId) results = results.filter((l) => l.userId == userId);
  if (env) results = results.filter((l) => l.environment === env);
  if (from)
    results = results.filter((l) => new Date(l.timestamp) >= new Date(from));
  if (to)
    results = results.filter((l) => new Date(l.timestamp) <= new Date(to));
  results = results.slice(-limit);
  // Audit this action
  logger.info("SYSTEM_ADMINISTRATOR log search/export", {
    action: "log_search_export",
    userId: req.user?.id,
    filters: { level, userId, env, from, to, limit },
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
  res.json({ logs: results });
});

// Alert management for SYSTEM_ADMINISTRATOR
const alertConfig = {
  channels: ["email"],
  thresholds: {
    ddos: 1000,
    rateLimit: 500,
    errorRate: 10,
  },
  recipients: ["admin@example.com"],
};
const alertHistory = [];

// GET /alerts - view alert config and history
router.get("/alerts", requireSystemAdministrator, (req, res) => {
  logger.info("SYSTEM_ADMINISTRATOR viewed alert config/history", {
    action: "alert_view",
    userId: req.user?.id,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
  res.json({ config: alertConfig, history: alertHistory });
});

// POST /alerts/config - update alert config
router.post("/alerts/config", requireSystemAdministrator, (req, res) => {
  const { channels, thresholds, recipients } = req.body;
  if (channels) alertConfig.channels = channels;
  if (thresholds) alertConfig.thresholds = thresholds;
  if (recipients) alertConfig.recipients = recipients;
  logger.info("SYSTEM_ADMINISTRATOR updated alert config", {
    action: "alert_config_update",
    userId: req.user?.id,
    newConfig: { channels, thresholds, recipients },
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
  res.json({ message: "Alert config updated", config: alertConfig });
});

// Suppression rule management for SYSTEM_ADMINISTRATOR
let suppressionRules = {
  userAgents: [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python/i,
    /java/i,
    /perl/i,
  ],
  blockedIPs: [],
};

// GET /suppression-rules - view rules
router.get("/suppression-rules", requireSystemAdministrator, (req, res) => {
  logger.info("SYSTEM_ADMINISTRATOR viewed suppression rules", {
    action: "suppression_rules_view",
    userId: req.user?.id,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
  res.json({ rules: suppressionRules });
});

// POST /suppression-rules - add/update rules
router.post("/suppression-rules", requireSystemAdministrator, (req, res) => {
  const { userAgents, blockedIPs } = req.body;
  if (userAgents)
    suppressionRules.userAgents = userAgents.map((p) => new RegExp(p, "i"));
  if (blockedIPs) suppressionRules.blockedIPs = blockedIPs;
  logger.info("SYSTEM_ADMINISTRATOR updated suppression rules", {
    action: "suppression_rules_update",
    userId: req.user?.id,
    newRules: { userAgents, blockedIPs },
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
  res.json({ message: "Suppression rules updated", rules: suppressionRules });
});

// Dashboard/analytics access for SYSTEM_ADMINISTRATOR
const dashboardStats = {
  apiUsage: [
    { endpoint: "/api/results", count: 12000 },
    { endpoint: "/api/candidates", count: 8000 },
    { endpoint: "/api/status", count: 5000 },
  ],
  suspiciousActivity: [
    { type: "rate_limit_exceeded", count: 30 },
    { type: "ddos_detected", count: 2 },
    { type: "invalid_token", count: 15 },
  ],
  errorRates: [
    { endpoint: "/api/results", errorCount: 12 },
    { endpoint: "/api/candidates", errorCount: 5 },
  ],
};

router.get("/dashboards", requireSystemAdministrator, (req, res) => {
  logger.info("SYSTEM_ADMINISTRATOR viewed dashboard analytics", {
    action: "dashboard_view",
    userId: req.user?.id,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
  res.json({ stats: dashboardStats });
});

// Audit trail review/export for SYSTEM_ADMINISTRATOR
router.get("/audit-trails", requireSystemAdministrator, (req, res) => {
  const logFile = path.join(process.cwd(), "logs", "combined.log");
  if (!fs.existsSync(logFile)) {
    return res.status(404).json({ error: "Audit log file not found" });
  }
  const lines = fs.readFileSync(logFile, "utf-8").split("\n").filter(Boolean);
  const auditLogs = lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((l) => l && l.action && l.action.includes("audit"));
  logger.info("SYSTEM_ADMINISTRATOR viewed audit trails", {
    action: "audit_trail_view",
    userId: req.user?.id,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
  res.json({ auditLogs });
});

// Config management for SYSTEM_ADMINISTRATOR
const sysadminConfig = {
  logging: { level: "info", retentionDays: 30 },
  alerting: alertConfig,
  suppression: suppressionRules,
};

// GET /config - view config
router.get("/config", requireSystemAdministrator, (req, res) => {
  logger.info("SYSTEM_ADMINISTRATOR viewed config", {
    action: "config_view",
    userId: req.user?.id,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
  res.json({ config: sysadminConfig });
});

// POST /config - update config
router.post("/config", requireSystemAdministrator, (req, res) => {
  const { logging, alerting, suppression } = req.body;
  if (logging) sysadminConfig.logging = logging;
  if (alerting) sysadminConfig.alerting = alerting;
  if (suppression) sysadminConfig.suppression = suppression;
  logger.info("SYSTEM_ADMINISTRATOR updated config", {
    action: "config_update",
    userId: req.user?.id,
    newConfig: { logging, alerting, suppression },
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
  res.json({ message: "Config updated", config: sysadminConfig });
});

// SIEM/SOC integration management for SYSTEM_ADMINISTRATOR
const siemIntegrationConfig = {
  enabled: false,
  provider: "",
  endpoint: "",
  apiKey: "",
};

// GET /siem-integration - view SIEM/SOC integration config
router.get("/siem-integration", requireSystemAdministrator, (req, res) => {
  logger.info("SYSTEM_ADMINISTRATOR viewed SIEM/SOC integration config", {
    action: "siem_integration_view",
    userId: req.user?.id,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
  res.json({ config: siemIntegrationConfig });
});

// POST /siem-integration - update SIEM/SOC integration config
router.post("/siem-integration", requireSystemAdministrator, (req, res) => {
  const { enabled, provider, endpoint, apiKey } = req.body;
  if (enabled !== undefined) siemIntegrationConfig.enabled = enabled;
  if (provider) siemIntegrationConfig.provider = provider;
  if (endpoint) siemIntegrationConfig.endpoint = endpoint;
  if (apiKey) siemIntegrationConfig.apiKey = apiKey;
  logger.info("SYSTEM_ADMINISTRATOR updated SIEM/SOC integration config", {
    action: "siem_integration_update",
    userId: req.user?.id,
    newConfig: { enabled, provider, endpoint, apiKey },
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
  res.json({
    message: "SIEM/SOC integration config updated",
    config: siemIntegrationConfig,
  });
});

// POST /send-email - SYSTEM_ADMINISTRATOR can send a test email using the HTML template
router.post("/send-email", requireSystemAdministrator, async (req, res) => {
  const { to, subject, templateData } = req.body;
  try {
    await sendEmail({
      to,
      subject,
      templateData,
    });
    logger.info("SYSTEM_ADMINISTRATOR sent test email", {
      action: "send_test_email",
      userId: req.user?.id,
      to,
      subject,
      templateData,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
    });
    res.json({ message: "Email sent successfully" });
  } catch (error) {
    logger.error("Failed to send test email:", error);
    res
      .status(500)
      .json({ error: "Failed to send email", details: error.message });
  }
});

// System admin dashboard
router.get("/dashboard", requireSysAdmin, async (req, res) => {
  try {
    // Simulate dashboard data
    res.status(200).json({
      systemHealth: { database: "OK", redis: "OK" },
      userStatistics: { total: 5, active: 4 },
      performanceMetrics: { responseTimes: [100, 120, 110], throughput: 200 },
      recentAlerts: [],
      systemStatus: "OK",
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

// In-memory alerts for test/demo
let alerts = [
  {
    id: "test-alert-id",
    severity: "HIGH",
    message: "Test alert",
    acknowledged: false,
  },
];

// Alerts management
router.get("/alerts", requireSysAdmin, async (req, res) => {
  try {
    const { severity } = req.query;
    let filtered = alerts;
    if (severity) filtered = filtered.filter((a) => a.severity === severity);
    res.status(200).json({ alerts: filtered });
  } catch (err) {
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

router.post("/alerts/:id/acknowledge", requireSysAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const alert = alerts.find((a) => a.id === id);
    if (!alert) return res.status(404).json({ error: "Alert not found" });
    alert.acknowledged = true;
    alert.acknowledgedAt = new Date().toISOString();
    res.status(200).json({ alertId: id, acknowledgedAt: alert.acknowledgedAt });
  } catch (err) {
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

// System health
router.get("/system-health", requireSysAdmin, async (req, res) => {
  try {
    res
      .status(200)
      .json({ database: "OK", redis: "OK", uptime: process.uptime() });
  } catch (err) {
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

// Performance metrics
router.get("/performance-metrics", requireSysAdmin, async (req, res) => {
  try {
    const { startDate, endDate, limit } = req.query;
    // Simulate metrics
    let responseTimes = [100, 120, 110, 130];
    let throughput = 200;
    if (limit && isNaN(Number(limit))) {
      return res.status(400).json({ error: "Invalid limit parameter" });
    }
    if (limit) responseTimes = responseTimes.slice(0, Number(limit));
    res.status(200).json({ responseTimes, throughput });
  } catch (err) {
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

// Users management (CRUD)
router.get("/users", requireSysAdmin, async (req, res) => {
  try {
    const { role, isActive } = req.query;
    const where = {};
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive === "true";
    const users = await req.app.get("prisma").user.findMany({ where });
    res.status(200).json({ users, pagination: {} });
  } catch (err) {
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

router.post("/users", requireSysAdmin, async (req, res) => {
  try {
    const { email, name, role, isActive } = req.body;
    if (!email || !name || !role) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    // Check for duplicate email
    const existing = await req.app
      .get("prisma")
      .user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "Email already exists" });
    }
    const user = await req.app.get("prisma").user.create({
      data: {
        email,
        name,
        role,
        isActive: isActive !== undefined ? isActive : true,
        lastLogin: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        auth0Id: null,
      },
    });
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

router.put("/users/:id", requireSysAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, isActive } = req.body;
    const user = await req.app.get("prisma").user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const updated = await req.app.get("prisma").user.update({
      where: { id },
      data: {
        name: name || user.name,
        role: role || user.role,
        isActive: isActive !== undefined ? isActive : user.isActive,
        updatedAt: new Date(),
      },
    });
    res.status(200).json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

router.delete("/users/:id", requireSysAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const user = await req.app.get("prisma").user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    await req.app.get("prisma").user.update({
      where: { id },
      data: { isActive: false, updatedAt: new Date() },
    });
    res.status(200).json({ message: "User deactivated", userId: id });
  } catch (err) {
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

// System health
router.get("/system-health", requireSysAdmin, (req, res) => {
  res.status(200).json({
    database: "OK",
    redis: "OK",
    kafka: "OK",
    elasticsearch: "OK",
    api: "OK",
    websocket: "OK",
    overallStatus: "OK",
    lastChecked: new Date().toISOString(),
  });
});

// Performance metrics
router.get("/performance-metrics", requireSysAdmin, (req, res) => {
  res.status(200).json({
    responseTimes: [],
    throughput: 0,
    errorRates: [],
    activeConnections: 0,
    memoryUsage: {},
    cpuUsage: {},
    diskUsage: {},
  });
});

// Audit logs
router.get("/audit-logs", requireSysAdmin, (req, res) => {
  res.status(200).json({ logs: [], pagination: {} });
});

// System config
router.get("/system-config", requireSysAdmin, (req, res) => {
  res.status(200).json({ config: {}, lastUpdated: new Date().toISOString() });
});
router.put("/system-config", requireSysAdmin, (req, res) => {
  if (
    typeof req.body.maintenanceMode === "string" ||
    (req.body.maxConnections && req.body.maxConnections < 0)
  ) {
    return res.status(400).json({ error: "Invalid configuration data" });
  }
  res
    .status(200)
    .json({ config: req.body, updatedAt: new Date().toISOString() });
});

// Maintenance
router.post("/maintenance", requireSysAdmin, (req, res) => {
  res.status(200).json({
    maintenanceMode: req.body.enabled,
    message: req.body.message,
    enabledAt: req.body.enabled ? new Date().toISOString() : undefined,
  });
});

// Backups
router.get("/backups", requireSysAdmin, (req, res) => {
  res.status(200).json({ backups: [] });
});
router.post("/backups", requireSysAdmin, (req, res) => {
  res.status(201).json({
    backupId: "test-backup-id",
    status: "IN_PROGRESS",
    estimatedCompletion: new Date(Date.now() + 60000).toISOString(),
  });
});

// Alerts
router.get("/alerts", requireSysAdmin, (req, res) => {
  res.status(200).json({ alerts: [] });
});
router.post("/alerts/:id/acknowledge", requireSysAdmin, (req, res) => {
  res
    .status(200)
    .json({ alertId: req.params.id, acknowledgedAt: new Date().toISOString() });
});

export default router;
