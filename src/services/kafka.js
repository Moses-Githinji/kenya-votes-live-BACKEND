import { Kafka } from "kafkajs";
import logger from "../utils/logger.js";

// Create Kafka client
const kafka = new Kafka({
  clientId: "kenya-votes-backend",
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
  retry: {
    initialRetryTime: 100,
    retries: 8,
  },
});

// Create producer
const producer = kafka.producer({
  allowAutoTopicCreation: true,
  transactionTimeout: 30000,
});

// Create consumer
const consumer = kafka.consumer({
  groupId: "kenya-votes-consumer-group",
  retry: {
    initialRetryTime: 100,
    retries: 8,
  },
});

// Initialize Kafka
export const initializeKafka = () => {
  return kafka;
};

// Connect producer
export const connectProducer = async () => {
  try {
    await producer.connect();
    logger.info("Kafka producer connected successfully");
    return producer;
  } catch (error) {
    logger.error("Kafka producer connection failed:", error);
    throw error;
  }
};

// Connect consumer
export const connectConsumer = async () => {
  try {
    await consumer.connect();
    logger.info("Kafka consumer connected successfully");
    return consumer;
  } catch (error) {
    logger.error("Kafka consumer connection failed:", error);
    throw error;
  }
};

// Send message to topic
export const sendMessage = async (topic, message, key = null) => {
  try {
    const messages = [
      {
        key: key || "default",
        value: JSON.stringify(message),
        timestamp: Date.now(),
      },
    ];

    await producer.send({
      topic,
      messages,
    });

    logger.info(`Message sent to topic ${topic}:`, {
      key,
      messageId: message.id,
    });
    return true;
  } catch (error) {
    logger.error(`Failed to send message to topic ${topic}:`, error);
    return false;
  }
};

// Send vote update
export const sendVoteUpdate = async (voteData) => {
  const message = {
    id: `vote_${Date.now()}`,
    type: "VOTE_UPDATE",
    data: voteData,
    timestamp: new Date().toISOString(),
    source: "KIEMS",
  };

  return await sendMessage("vote-updates", message, voteData.regionCode);
};

// Send election status update
export const sendElectionStatusUpdate = async (statusData) => {
  const message = {
    id: `status_${Date.now()}`,
    type: "ELECTION_STATUS_UPDATE",
    data: statusData,
    timestamp: new Date().toISOString(),
  };

  return await sendMessage("election-status", message);
};

// Send candidate update
export const sendCandidateUpdate = async (candidateData) => {
  const message = {
    id: `candidate_${Date.now()}`,
    type: "CANDIDATE_UPDATE",
    data: candidateData,
    timestamp: new Date().toISOString(),
  };

  return await sendMessage("candidate-updates", message, candidateData.id);
};

// Send certification update
export const sendCertificationUpdate = async (certificationData) => {
  const message = {
    id: `certification_${Date.now()}`,
    type: "CERTIFICATION_UPDATE",
    data: certificationData,
    timestamp: new Date().toISOString(),
  };

  return await sendMessage(
    "certification-updates",
    message,
    certificationData.regionCode
  );
};

// Send system alert
export const sendSystemAlert = async (alertData) => {
  const message = {
    id: `alert_${Date.now()}`,
    type: "SYSTEM_ALERT",
    data: alertData,
    timestamp: new Date().toISOString(),
    severity: alertData.severity || "INFO",
  };

  return await sendMessage("system-alerts", message);
};

// Subscribe to topic
export const subscribeToTopic = async (topic, handler) => {
  try {
    await consumer.subscribe({ topic, fromBeginning: false });

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const value = JSON.parse(message.value.toString());
          await handler(value, topic, partition);
        } catch (error) {
          logger.error(`Error processing message from topic ${topic}:`, error);
        }
      },
    });

    logger.info(`Subscribed to topic: ${topic}`);
  } catch (error) {
    logger.error(`Failed to subscribe to topic ${topic}:`, error);
    throw error;
  }
};

// Subscribe to vote updates
export const subscribeToVoteUpdates = async (handler) => {
  return await subscribeToTopic("vote-updates", handler);
};

// Subscribe to election status
export const subscribeToElectionStatus = async (handler) => {
  return await subscribeToTopic("election-status", handler);
};

// Subscribe to candidate updates
export const subscribeToCandidateUpdates = async (handler) => {
  return await subscribeToTopic("candidate-updates", handler);
};

// Subscribe to certification updates
export const subscribeToCertificationUpdates = async (handler) => {
  return await subscribeToTopic("certification-updates", handler);
};

// Subscribe to system alerts
export const subscribeToSystemAlerts = async (handler) => {
  return await subscribeToTopic("system-alerts", handler);
};

// Create topic
export const createTopic = async (
  topic,
  partitions = 3,
  replicationFactor = 1
) => {
  try {
    const admin = kafka.admin();
    await admin.connect();

    await admin.createTopics({
      topics: [
        {
          topic,
          numPartitions: partitions,
          replicationFactor,
        },
      ],
    });

    await admin.disconnect();
    logger.info(`Topic ${topic} created successfully`);
    return true;
  } catch (error) {
    logger.error(`Failed to create topic ${topic}:`, error);
    return false;
  }
};

// List topics
export const listTopics = async () => {
  try {
    const admin = kafka.admin();
    await admin.connect();

    const topics = await admin.listTopics();
    await admin.disconnect();

    return topics;
  } catch (error) {
    logger.error("Failed to list topics:", error);
    return [];
  }
};

// Get topic metadata
export const getTopicMetadata = async (topic) => {
  try {
    const admin = kafka.admin();
    await admin.connect();

    const metadata = await admin.fetchTopicMetadata({
      topics: [topic],
    });

    await admin.disconnect();
    return metadata.topics[0];
  } catch (error) {
    logger.error(`Failed to get metadata for topic ${topic}:`, error);
    return null;
  }
};

// Health check
export const healthCheck = async () => {
  try {
    // Check producer connection
    await producer.send({
      topic: "health-check",
      messages: [{ value: "ping" }],
    });

    return { status: "healthy", message: "Kafka is operational" };
  } catch (error) {
    logger.error("Kafka health check failed:", error);
    return { status: "unhealthy", message: "Kafka is down" };
  }
};

// Disconnect
export const disconnect = async () => {
  try {
    await producer.disconnect();
    await consumer.disconnect();
    logger.info("Kafka connections closed");
  } catch (error) {
    logger.error("Error disconnecting from Kafka:", error);
  }
};

export default kafka;
