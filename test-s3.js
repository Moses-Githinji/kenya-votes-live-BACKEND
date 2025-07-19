import {
  initializeS3,
  uploadFile,
  downloadFile,
  listFiles,
  healthCheck,
} from "./src/services/s3.js";

async function testS3Service() {
  console.log("Testing S3 service with local storage...");

  try {
    // Initialize S3 service
    const s3 = await initializeS3();
    console.log("S3 service initialized:", s3 ? "AWS S3" : "Local storage");

    // Test health check
    const health = await healthCheck();
    console.log("Health check:", health);

    // Test file upload
    const testData = Buffer.from("Hello, this is a test file!");
    const uploadResult = await uploadFile(
      "data",
      "test/hello.txt",
      testData,
      "text/plain"
    );
    console.log("Upload result:", uploadResult);

    // Test file download
    const downloadResult = await downloadFile("data", "test/hello.txt");
    console.log("Download result:", downloadResult.data.toString());

    // Test list files
    const files = await listFiles("data", "test");
    console.log("Files in test directory:", files);

    console.log("✅ All S3 service tests passed!");
  } catch (error) {
    console.error("❌ S3 service test failed:", error);
  }
}

testS3Service();
