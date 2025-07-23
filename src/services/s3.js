import pkg from "@aws-sdk/client-s3";
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  CopyObjectCommand,
} = pkg;
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import logger from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check if AWS credentials are available
const isAwsConfigured = () => {
  return process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;
};

// Configure AWS S3 client only if credentials are available
let s3Client = null;
if (isAwsConfigured()) {
  s3Client = new S3Client({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    maxAttempts: 3,
    requestHandler: undefined, // Use default
  });
} else {
  logger.warn("AWS credentials not found, using local file storage");
}

// Local storage configuration
const LOCAL_STORAGE_BASE = path.join(__dirname, "../../uploads");
const LOCAL_BUCKETS = {
  backup: path.join(LOCAL_STORAGE_BASE, "backups"),
  media: path.join(LOCAL_STORAGE_BASE, "media"),
  data: path.join(LOCAL_STORAGE_BASE, "data"),
  export: path.join(LOCAL_STORAGE_BASE, "exports"),
  archive: path.join(LOCAL_STORAGE_BASE, "archives"),
};

// Ensure local directories exist
const ensureLocalDirectories = async () => {
  try {
    await fs.mkdir(LOCAL_STORAGE_BASE, { recursive: true });
    for (const bucketPath of Object.values(LOCAL_BUCKETS)) {
      await fs.mkdir(bucketPath, { recursive: true });
    }
    logger.info("Local storage directories created");
  } catch (error) {
    logger.error("Failed to create local storage directories:", error);
  }
};

// Initialize storage
export const initializeS3 = async () => {
  if (isAwsConfigured()) {
    logger.info("Initializing AWS S3 storage");
    return s3Client;
  } else {
    logger.info("Initializing local file storage");
    await ensureLocalDirectories();
    return null;
  }
};

// Upload file (works with both S3 and local storage)
export const uploadFile = async (
  bucket,
  key,
  data,
  contentType = "application/octet-stream"
) => {
  try {
    if (isAwsConfigured()) {
      // AWS S3 upload (v3)
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
        Metadata: {
          uploadedAt: new Date().toISOString(),
          uploadedBy: "kenya-votes-backend",
        },
      });
      await s3Client.send(command);
      // S3 v3 does not return Location, so construct it
      const location = `https://${bucket}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${key}`;
      logger.info(`File uploaded to S3: ${location}`);
      return {
        location,
        key,
        etag: undefined, // ETag not returned by default
        bucket,
      };
    } else {
      // Local file upload
      const bucketPath = LOCAL_BUCKETS[bucket] || LOCAL_BUCKETS.data;
      const filePath = path.join(bucketPath, key);
      const dirPath = path.dirname(filePath);

      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(filePath, data);

      logger.info(`File uploaded locally: ${filePath}`);
      return {
        location: `/uploads/${bucket}/${key}`,
        key: key,
        etag: "local-etag",
        bucket: bucket,
        localPath: filePath,
      };
    }
  } catch (error) {
    logger.error(`Failed to upload file: ${error.message}`);
    throw error;
  }
};

// Download file (works with both S3 and local storage)
export const downloadFile = async (bucket, key) => {
  try {
    if (isAwsConfigured()) {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      const result = await s3Client.send(command);
      // result.Body is a stream, convert to Buffer
      const chunks = [];
      for await (const chunk of result.Body) {
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks);
      logger.info(`File downloaded from S3: ${key}`);
      return {
        data,
        contentType: result.ContentType,
        metadata: result.Metadata,
        lastModified: result.LastModified,
      };
    } else {
      // Local file download
      const bucketPath = LOCAL_BUCKETS[bucket] || LOCAL_BUCKETS.data;
      const filePath = path.join(bucketPath, key);

      const data = await fs.readFile(filePath);
      const stats = await fs.stat(filePath);

      logger.info(`File downloaded locally: ${key}`);
      return {
        data: data,
        contentType: "application/octet-stream",
        metadata: {},
        lastModified: stats.mtime,
      };
    }
  } catch (error) {
    logger.error(`Failed to download file: ${error.message}`);
    throw error;
  }
};

// Delete file (works with both S3 and local storage)
export const deleteFile = async (bucket, key) => {
  try {
    if (isAwsConfigured()) {
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      await s3Client.send(command);
      logger.info(`File deleted from S3: ${key}`);
    } else {
      // Local file delete
      const bucketPath = LOCAL_BUCKETS[bucket] || LOCAL_BUCKETS.data;
      const filePath = path.join(bucketPath, key);

      await fs.unlink(filePath);
      logger.info(`File deleted locally: ${key}`);
    }
    return true;
  } catch (error) {
    logger.error(`Failed to delete file: ${error.message}`);
    return false;
  }
};

// List files (works with both S3 and local storage)
export const listFiles = async (bucket, prefix = "", maxKeys = 1000) => {
  try {
    if (isAwsConfigured()) {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: maxKeys,
      });
      const result = await s3Client.send(command);
      return (result.Contents || []).map((item) => ({
        key: item.Key,
        size: item.Size,
        lastModified: item.LastModified,
        etag: item.ETag,
      }));
    } else {
      // Local file list
      const bucketPath = LOCAL_BUCKETS[bucket] || LOCAL_BUCKETS.data;
      const searchPath = path.join(bucketPath, prefix);

      const files = [];
      const listFilesRecursive = async (dirPath, basePath = "") => {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          const relativePath = path.join(basePath, entry.name);

          if (entry.isDirectory()) {
            await listFilesRecursive(fullPath, relativePath);
          } else {
            const stats = await fs.stat(fullPath);
            files.push({
              key: relativePath.replace(/\\/g, "/"),
              size: stats.size,
              lastModified: stats.mtime,
              etag: "local-etag",
            });
          }
        }
      };

      await listFilesRecursive(searchPath);
      return files.slice(0, maxKeys);
    }
  } catch (error) {
    logger.error(`Failed to list files: ${error.message}`);
    throw error;
  }
};

// Generate upload URL (S3 only, returns local path for local storage)
export const generateUploadUrl = async (
  bucket,
  key,
  contentType,
  expiresIn = 3600
) => {
  try {
    if (isAwsConfigured()) {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      });
      const url = await getSignedUrl(s3Client, command, { expiresIn });
      logger.info(`Generated S3 upload URL for: ${key}`);
      return url;
    } else {
      // Local storage - return local path
      const localPath = `/uploads/${bucket}/${key}`;
      logger.info(`Generated local upload path for: ${key}`);
      return localPath;
    }
  } catch (error) {
    logger.error(`Failed to generate upload URL: ${error.message}`);
    throw error;
  }
};

// Generate download URL (S3 only, returns local path for local storage)
export const generateDownloadUrl = async (bucket, key, expiresIn = 3600) => {
  try {
    if (isAwsConfigured()) {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      const url = await getSignedUrl(s3Client, command, { expiresIn });
      logger.info(`Generated S3 download URL for: ${key}`);
      return url;
    } else {
      // Local storage - return local path
      const localPath = `/uploads/${bucket}/${key}`;
      logger.info(`Generated local download path for: ${key}`);
      return localPath;
    }
  } catch (error) {
    logger.error(`Failed to generate download URL: ${error.message}`);
    throw error;
  }
};

// Create backup
export const createBackup = async (data, filename, bucket = "backup") => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const key = `backups/${timestamp}/${filename}`;

    const result = await uploadFile(
      bucket,
      key,
      JSON.stringify(data),
      "application/json"
    );

    logger.info(`Backup created: ${key}`);
    return {
      ...result,
      filename,
      timestamp,
    };
  } catch (error) {
    logger.error(`Failed to create backup: ${error.message}`);
    throw error;
  }
};

// Restore backup
export const restoreBackup = async (key, bucket = "backup") => {
  try {
    const result = await downloadFile(bucket, key);
    const data = JSON.parse(result.data.toString());

    logger.info(`Backup restored: ${key}`);
    return data;
  } catch (error) {
    logger.error(`Failed to restore backup: ${error.message}`);
    throw error;
  }
};

// Upload candidate photo
export const uploadCandidatePhoto = async (
  candidateId,
  photoBuffer,
  contentType
) => {
  try {
    const key = `candidates/${candidateId}/photo.${contentType.split("/")[1]}`;
    const bucket = "media";

    const result = await uploadFile(bucket, key, photoBuffer, contentType);

    logger.info(`Candidate photo uploaded: ${key}`);
    return result;
  } catch (error) {
    logger.error(`Failed to upload candidate photo: ${error.message}`);
    throw error;
  }
};

// Upload region GeoJSON
export const uploadRegionGeoJSON = async (regionCode, geojsonData) => {
  try {
    const key = `regions/${regionCode}/geojson.json`;
    const bucket = "data";

    const result = await uploadFile(
      bucket,
      key,
      JSON.stringify(geojsonData),
      "application/json"
    );

    logger.info(`Region GeoJSON uploaded: ${key}`);
    return result;
  } catch (error) {
    logger.error(`Failed to upload region GeoJSON: ${error.message}`);
    throw error;
  }
};

// Upload export data
export const uploadExportData = async (exportId, data, format = "csv") => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const key = `exports/${timestamp}/${exportId}.${format}`;
    const bucket = "export";

    const contentType = format === "csv" ? "text/csv" : "application/json";
    const result = await uploadFile(bucket, key, data, contentType);

    logger.info(`Export data uploaded: ${key}`);
    return result;
  } catch (error) {
    logger.error(`Failed to upload export data: ${error.message}`);
    throw error;
  }
};

// Archive old data
export const archiveData = async (data, archiveType, timestamp) => {
  try {
    const key = `archives/${archiveType}/${timestamp}.json`;
    const bucket = "archive";

    const result = await uploadFile(
      bucket,
      key,
      JSON.stringify(data),
      "application/json"
    );

    logger.info(`Data archived: ${key}`);
    return result;
  } catch (error) {
    logger.error(`Failed to archive data: ${error.message}`);
    throw error;
  }
};

// Get file metadata
export const getFileMetadata = async (bucket, key) => {
  try {
    if (isAwsConfigured()) {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      const result = await s3Client.send(command);
      return {
        contentType: result.ContentType,
        contentLength: result.ContentLength,
        lastModified: result.LastModified,
        metadata: result.Metadata,
        etag: result.ETag,
      };
    } else {
      // Local file metadata
      const bucketPath = LOCAL_BUCKETS[bucket] || LOCAL_BUCKETS.data;
      const filePath = path.join(bucketPath, key);
      const stats = await fs.stat(filePath);

      return {
        contentType: "application/octet-stream",
        contentLength: stats.size,
        lastModified: stats.mtime,
        metadata: {},
        etag: "local-etag",
      };
    }
  } catch (error) {
    logger.error(`Failed to get file metadata: ${error.message}`);
    throw error;
  }
};

// Copy file
export const copyFile = async (
  sourceBucket,
  sourceKey,
  destBucket,
  destKey
) => {
  try {
    if (isAwsConfigured()) {
      const command = new CopyObjectCommand({
        Bucket: destBucket,
        Key: destKey,
        CopySource: `${sourceBucket}/${sourceKey}`,
      });
      const result = await s3Client.send(command);
      logger.info(`File copied in S3: ${sourceKey} -> ${destKey}`);
      return {
        etag: result.CopyObjectResult?.ETag,
        lastModified: result.CopyObjectResult?.LastModified,
      };
    } else {
      // Local file copy
      const sourcePath = path.join(
        LOCAL_BUCKETS[sourceBucket] || LOCAL_BUCKETS.data,
        sourceKey
      );
      const destPath = path.join(
        LOCAL_BUCKETS[destBucket] || LOCAL_BUCKETS.data,
        destKey
      );
      const destDir = path.dirname(destPath);

      await fs.mkdir(destDir, { recursive: true });
      await fs.copyFile(sourcePath, destPath);

      const stats = await fs.stat(destPath);
      logger.info(`File copied locally: ${sourceKey} -> ${destKey}`);

      return {
        etag: "local-etag",
        lastModified: stats.mtime,
      };
    }
  } catch (error) {
    logger.error(`Failed to copy file: ${error.message}`);
    throw error;
  }
};

// Health check
export const healthCheck = async () => {
  try {
    if (isAwsConfigured()) {
      const bucket = process.env.AWS_BACKUP_BUCKET;
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: undefined,
      });
      await s3Client.send(command);
      return { status: "healthy", message: "S3 is operational" };
    } else {
      // Local storage health check
      await ensureLocalDirectories();
      return { status: "healthy", message: "Local storage is operational" };
    }
  } catch (error) {
    logger.error("Storage health check failed:", error);
    return { status: "unhealthy", message: "Storage is down" };
  }
};

// Get bucket statistics
export const getBucketStats = async (bucket) => {
  try {
    if (isAwsConfigured()) {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
      });
      const result = await s3Client.send(command);
      const totalSize = (result.Contents || []).reduce(
        (sum, item) => sum + item.Size,
        0
      );
      const totalFiles = (result.Contents || []).length;
      return {
        bucket,
        totalFiles,
        totalSize,
        averageFileSize: totalFiles > 0 ? totalSize / totalFiles : 0,
      };
    } else {
      // Local bucket stats
      const bucketPath = LOCAL_BUCKETS[bucket] || LOCAL_BUCKETS.data;
      const files = await listFiles(bucket);

      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      const totalFiles = files.length;

      return {
        bucket,
        totalFiles,
        totalSize,
        averageFileSize: totalFiles > 0 ? totalSize / totalFiles : 0,
      };
    }
  } catch (error) {
    logger.error(`Failed to get bucket stats: ${error.message}`);
    throw error;
  }
};

export default s3Client;
