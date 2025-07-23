import pkg from "@elastic/elasticsearch";
const { Client } = pkg;
import logger from "../utils/logger.js";

// Create Elasticsearch client
const client = new Client({
  node: process.env.ELASTICSEARCH_URL || "http://localhost:9200",
  auth: {
    username: process.env.ELASTICSEARCH_USERNAME,
    password: process.env.ELASTICSEARCH_PASSWORD,
  },
  ssl: {
    rejectUnauthorized: false,
  },
  maxRetries: 3,
  requestTimeout: 10000,
  sniffOnStart: true,
});

// Initialize Elasticsearch
export const initializeElasticsearch = () => {
  return client;
};

// Health check
export const healthCheck = async () => {
  try {
    const health = await client.cluster.health();
    return {
      status: health.body.status,
      message: "Elasticsearch is operational",
      details: health.body,
    };
  } catch (error) {
    logger.error("Elasticsearch health check failed:", error);
    return { status: "unhealthy", message: "Elasticsearch is down" };
  }
};

// Create index
export const createIndex = async (indexName, mappings = {}) => {
  try {
    const exists = await client.indices.exists({ index: indexName });

    if (!exists.body) {
      await client.indices.create({
        index: indexName,
        body: {
          mappings,
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
          },
        },
      });

      logger.info(`Index ${indexName} created successfully`);
    }

    return true;
  } catch (error) {
    logger.error(`Failed to create index ${indexName}:`, error);
    return false;
  }
};

// Index document
export const indexDocument = async (indexName, document, id = null) => {
  try {
    const params = {
      index: indexName,
      body: document,
    };

    if (id) {
      params.id = id;
    }

    const response = await client.index(params);
    return response.body._id;
  } catch (error) {
    logger.error(`Failed to index document in ${indexName}:`, error);
    throw error;
  }
};

// Search documents
export const searchDocuments = async (indexName, query, options = {}) => {
  try {
    const { from = 0, size = 10, sort = [], aggs = {} } = options;

    const searchBody = {
      query,
      from,
      size,
      sort,
      aggs,
    };

    const response = await client.search({
      index: indexName,
      body: searchBody,
    });

    return {
      hits: response.body.hits.hits.map((hit) => ({
        id: hit._id,
        score: hit._score,
        source: hit._source,
      })),
      total: response.body.hits.total.value,
      aggregations: response.body.aggregations,
    };
  } catch (error) {
    logger.error(`Failed to search in ${indexName}:`, error);
    throw error;
  }
};

// Update document
export const updateDocument = async (indexName, id, updates) => {
  try {
    const response = await client.update({
      index: indexName,
      id,
      body: {
        doc: updates,
      },
    });

    return response.body._id;
  } catch (error) {
    logger.error(`Failed to update document ${id} in ${indexName}:`, error);
    throw error;
  }
};

// Delete document
export const deleteDocument = async (indexName, id) => {
  try {
    await client.delete({
      index: indexName,
      id,
    });

    return true;
  } catch (error) {
    logger.error(`Failed to delete document ${id} from ${indexName}:`, error);
    return false;
  }
};

// Bulk operations
export const bulkIndex = async (indexName, documents) => {
  try {
    const body = documents.flatMap((doc) => [
      { index: { _index: indexName, _id: doc.id } },
      doc.source,
    ]);

    const response = await client.bulk({ body });

    const errors = response.body.items
      .filter((item) => item.index.error)
      .map((item) => item.index.error);

    if (errors.length > 0) {
      logger.error("Bulk index errors:", errors);
    }

    return {
      success: response.body.items.length - errors.length,
      errors: errors.length,
    };
  } catch (error) {
    logger.error(`Failed to bulk index in ${indexName}:`, error);
    throw error;
  }
};

// Search audit logs
export const searchAuditLogs = async (filters = {}) => {
  try {
    const {
      userId,
      action,
      resource,
      startDate,
      endDate,
      from = 0,
      size = 50,
    } = filters;

    const must = [];

    if (userId) {
      must.push({ match: { userId } });
    }

    if (action) {
      must.push({ match: { action } });
    }

    if (resource) {
      must.push({ match: { resource } });
    }

    if (startDate || endDate) {
      const range = {};
      if (startDate) range.gte = startDate;
      if (endDate) range.lte = endDate;
      must.push({ range: { timestamp: range } });
    }

    const query = must.length > 0 ? { bool: { must } } : { match_all: {} };

    return await searchDocuments("audit-logs", query, {
      from,
      size,
      sort: [{ timestamp: { order: "desc" } }],
    });
  } catch (error) {
    logger.error("Failed to search audit logs:", error);
    throw error;
  }
};

// Search performance metrics
export const searchPerformanceMetrics = async (filters = {}) => {
  try {
    const {
      operation,
      minDuration,
      maxDuration,
      startDate,
      endDate,
      from = 0,
      size = 50,
    } = filters;

    const must = [];

    if (operation) {
      must.push({ match: { operation } });
    }

    if (minDuration || maxDuration) {
      const range = {};
      if (minDuration) range.gte = minDuration;
      if (maxDuration) range.lte = maxDuration;
      must.push({ range: { duration: range } });
    }

    if (startDate || endDate) {
      const range = {};
      if (startDate) range.gte = startDate;
      if (endDate) range.lte = endDate;
      must.push({ range: { timestamp: range } });
    }

    const query = must.length > 0 ? { bool: { must } } : { match_all: {} };

    return await searchDocuments("performance-metrics", query, {
      from,
      size,
      sort: [{ timestamp: { order: "desc" } }],
      aggs: {
        avg_duration: {
          avg: { field: "duration" },
        },
        max_duration: {
          max: { field: "duration" },
        },
        min_duration: {
          min: { field: "duration" },
        },
      },
    });
  } catch (error) {
    logger.error("Failed to search performance metrics:", error);
    throw error;
  }
};

// Search API usage
export const searchApiUsage = async (filters = {}) => {
  try {
    const {
      apiKeyId,
      endpoint,
      method,
      statusCode,
      startDate,
      endDate,
      from = 0,
      size = 50,
    } = filters;

    const must = [];

    if (apiKeyId) {
      must.push({ match: { apiKeyId } });
    }

    if (endpoint) {
      must.push({ match: { endpoint } });
    }

    if (method) {
      must.push({ match: { method } });
    }

    if (statusCode) {
      must.push({ match: { statusCode } });
    }

    if (startDate || endDate) {
      const range = {};
      if (startDate) range.gte = startDate;
      if (endDate) range.lte = endDate;
      must.push({ range: { timestamp: range } });
    }

    const query = must.length > 0 ? { bool: { must } } : { match_all: {} };

    return await searchDocuments("api-usage", query, {
      from,
      size,
      sort: [{ timestamp: { order: "desc" } }],
      aggs: {
        endpoint_stats: {
          terms: { field: "endpoint" },
          aggs: {
            avg_response_time: {
              avg: { field: "responseTime" },
            },
            total_requests: {
              value_count: { field: "endpoint" },
            },
          },
        },
        status_code_stats: {
          terms: { field: "statusCode" },
        },
      },
    });
  } catch (error) {
    logger.error("Failed to search API usage:", error);
    throw error;
  }
};

// Get analytics
export const getAnalytics = async (indexName, timeRange = "24h") => {
  try {
    const query = {
      range: {
        timestamp: {
          gte: `now-${timeRange}`,
        },
      },
    };

    const aggs = {
      hourly_stats: {
        date_histogram: {
          field: "timestamp",
          calendar_interval: "hour",
        },
      },
      daily_stats: {
        date_histogram: {
          field: "timestamp",
          calendar_interval: "day",
        },
      },
    };

    return await searchDocuments(indexName, query, {
      size: 0,
      aggs,
    });
  } catch (error) {
    logger.error(`Failed to get analytics for ${indexName}:`, error);
    throw error;
  }
};

// Create index templates
export const createIndexTemplate = async (
  templateName,
  indexPattern,
  mappings
) => {
  try {
    await client.indices.putTemplate({
      name: templateName,
      body: {
        index_patterns: [indexPattern],
        mappings,
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
        },
      },
    });

    logger.info(`Index template ${templateName} created successfully`);
    return true;
  } catch (error) {
    logger.error(`Failed to create index template ${templateName}:`, error);
    return false;
  }
};

// Delete index
export const deleteIndex = async (indexName) => {
  try {
    await client.indices.delete({ index: indexName });
    logger.info(`Index ${indexName} deleted successfully`);
    return true;
  } catch (error) {
    logger.error(`Failed to delete index ${indexName}:`, error);
    return false;
  }
};

// Get index stats
export const getIndexStats = async (indexName) => {
  try {
    const stats = await client.indices.stats({ index: indexName });
    return stats.body.indices[indexName];
  } catch (error) {
    logger.error(`Failed to get stats for index ${indexName}:`, error);
    return null;
  }
};

export default client;
