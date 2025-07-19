import crypto from 'crypto';

// Generate checksum for data integrity
export const generateChecksum = (data) => {
  try {
    const dataString = typeof data === 'string' ? data : JSON.stringify(data);
    return crypto.createHash('sha256').update(dataString).digest('hex');
  } catch (error) {
    console.error('Error generating checksum:', error);
    return null;
  }
};

// Verify checksum
export const verifyChecksum = (data, expectedChecksum) => {
  try {
    const actualChecksum = generateChecksum(data);
    return actualChecksum === expectedChecksum;
  } catch (error) {
    console.error('Error verifying checksum:', error);
    return false;
  }
};

// Generate checksum for vote data
export const generateVoteChecksum = (voteData) => {
  const { candidateId, regionId, position, voteCount, timestamp } = voteData;
  const dataString = `${candidateId}:${regionId}:${position}:${voteCount}:${timestamp}`;
  return crypto.createHash('sha256').update(dataString).digest('hex');
};

// Generate checksum for region results
export const generateRegionChecksum = (results) => {
  const sortedResults = results.sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  const dataString = sortedResults.map(r => `${r.candidateId}:${r.voteCount}`).join('|');
  return crypto.createHash('sha256').update(dataString).digest('hex');
};

// Generate checksum for election status
export const generateStatusChecksum = (status) => {
  const dataString = JSON.stringify(status, Object.keys(status).sort());
  return crypto.createHash('sha256').update(dataString).digest('hex');
};

// Generate HMAC for secure data signing
export const generateHMAC = (data, secret = process.env.HMAC_SECRET) => {
  try {
    const dataString = typeof data === 'string' ? data : JSON.stringify(data);
    return crypto.createHmac('sha256', secret).update(dataString).digest('hex');
  } catch (error) {
    console.error('Error generating HMAC:', error);
    return null;
  }
};

// Verify HMAC
export const verifyHMAC = (data, hmac, secret = process.env.HMAC_SECRET) => {
  try {
    const expectedHMAC = generateHMAC(data, secret);
    return crypto.timingSafeEqual(
      Buffer.from(hmac, 'hex'),
      Buffer.from(expectedHMAC, 'hex')
    );
  } catch (error) {
    console.error('Error verifying HMAC:', error);
    return false;
  }
};

// Generate checksum for audit trail
export const generateAuditChecksum = (auditData) => {
  const { userId, action, resource, resourceId, timestamp } = auditData;
  const dataString = `${userId}:${action}:${resource}:${resourceId}:${timestamp}`;
  return crypto.createHash('sha256').update(dataString).digest('hex');
};

// Generate checksum for backup data
export const generateBackupChecksum = (backupData) => {
  const dataString = JSON.stringify(backupData, Object.keys(backupData).sort());
  return crypto.createHash('sha256').update(dataString).digest('hex');
};

// Generate checksum for configuration data
export const generateConfigChecksum = (config) => {
  const sortedConfig = Object.keys(config).sort().reduce((obj, key) => {
    obj[key] = config[key];
    return obj;
  }, {});
  const dataString = JSON.stringify(sortedConfig);
  return crypto.createHash('sha256').update(dataString).digest('hex');
};

// Generate checksum for API response
export const generateResponseChecksum = (response) => {
  const { data, timestamp, version } = response;
  const dataString = `${JSON.stringify(data)}:${timestamp}:${version}`;
  return crypto.createHash('sha256').update(dataString).digest('hex');
};

// Generate checksum for file content
export const generateFileChecksum = (fileBuffer) => {
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
};

// Generate checksum for database record
export const generateRecordChecksum = (record) => {
  const { id, ...data } = record;
  const dataString = JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHash('sha256').update(dataString).digest('hex');
};

// Generate checksum for batch operations
export const generateBatchChecksum = (operations) => {
  const sortedOperations = operations.sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.id.localeCompare(b.id);
  });
  const dataString = JSON.stringify(sortedOperations);
  return crypto.createHash('sha256').update(dataString).digest('hex');
};

// Generate checksum for user session
export const generateSessionChecksum = (sessionData) => {
  const { userId, role, permissions, timestamp } = sessionData;
  const dataString = `${userId}:${role}:${JSON.stringify(permissions)}:${timestamp}`;
  return crypto.createHash('sha256').update(dataString).digest('hex');
};

// Generate checksum for cache key
export const generateCacheChecksum = (key, data) => {
  const dataString = `${key}:${JSON.stringify(data)}`;
  return crypto.createHash('sha256').update(dataString).digest('hex');
};

// Generate checksum for rate limiting
export const generateRateLimitChecksum = (identifier, window) => {
  const dataString = `${identifier}:${window}`;
  return crypto.createHash('sha256').update(dataString).digest('hex');
};

// Generate checksum for WebSocket message
export const generateWebSocketChecksum = (message) => {
  const { type, data, timestamp } = message;
  const dataString = `${type}:${JSON.stringify(data)}:${timestamp}`;
  return crypto.createHash('sha256').update(dataString).digest('hex');
};

// Generate checksum for notification
export const generateNotificationChecksum = (notification) => {
  const { type, message, recipient, timestamp } = notification;
  const dataString = `${type}:${message}:${recipient}:${timestamp}`;
  return crypto.createHash('sha256').update(dataString).digest('hex');
};

// Generate checksum for export data
export const generateExportChecksum = (exportData) => {
  const { format, data, filters, timestamp } = exportData;
  const dataString = `${format}:${JSON.stringify(data)}:${JSON.stringify(filters)}:${timestamp}`;
  return crypto.createHash('sha256').update(dataString).digest('hex');
}; 