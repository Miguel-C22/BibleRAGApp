import { upsertVectors, VectorRecord } from "../../libs/pinecone";
import { Pinecone } from "@pinecone-database/pinecone";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

// Create Pinecone index if it doesn't exist, check if dimensions match
async function createIndexIfNeeded(
  indexName: string,
  dimension: number
): Promise<boolean> {
  try {
    // Check if index already exists
    const indexList = await pc.listIndexes();
    const existingIndex = indexList.indexes?.find(
      (idx) => idx.name === indexName
    );

    if (existingIndex) {
      console.log(`Index '${indexName}' already exists`);
      if (existingIndex.dimension !== dimension) {
        console.warn(
          `⚠️  Index dimension mismatch: expected ${dimension}, got ${existingIndex.dimension}`
        );
        console.log(
          `You may need to delete the existing index or use a different name`
        );
        return false;
      }
      return true;
    }

    // Create new index with specified settings
    console.log(`Creating index '${indexName}' with dimension ${dimension}...`);
    await pc.createIndex({
      name: indexName,
      dimension: dimension,
      metric: "cosine",
      spec: {
        serverless: {
          cloud: "aws",
          region: "us-east-1",
        },
      },
    });

    console.log(`✅ Index '${indexName}' created successfully`);
    return true;
  } catch (error) {
    console.error("Error managing index:", error);
    return false;
  }
}

// Main function: Load vector batches and upload to Pinecone
async function uploadVectorsToPinecone(): Promise<void> {
  try {
    const batchInfoPath = path.join(process.cwd(), "output", "batch_info.json");

    if (!fs.existsSync(batchInfoPath)) {
      throw new Error(`Batch info file not found at: ${batchInfoPath}`);
    }

    console.log("Loading batch information...");
    const batchInfo = JSON.parse(fs.readFileSync(batchInfoPath, "utf8"));

    console.log(
      `Found ${batchInfo.totalVectors} vectors in ${batchInfo.totalBatches} batches`
    );

    const indexName = process.env.PINECONE_INDEX_NAME;
    if (!indexName) {
      throw new Error("PINECONE_INDEX_NAME environment variable is required");
    }

    // Check vector dimensions from first batch
    const firstBatchPath = path.join(
      process.cwd(),
      "output",
      batchInfo.batchFiles[0]
    );
    const firstBatch: VectorRecord[] = JSON.parse(
      fs.readFileSync(firstBatchPath, "utf8")
    );
    const dimension = firstBatch[0].values.length;

    console.log(`Vector dimension: ${dimension}`);

    const indexReady = await createIndexIfNeeded(indexName, dimension);
    if (!indexReady) {
      throw new Error("Index is not ready for upload");
    }

    console.log(`Uploading to Pinecone index: ${indexName}`);

    // Upload each batch file to Pinecone
    let totalUploaded = 0;
    for (let i = 0; i < batchInfo.batchFiles.length; i++) {
      const batchFile = batchInfo.batchFiles[i];
      const batchPath = path.join(process.cwd(), "output", batchFile);

      console.log(
        `Processing batch ${i + 1}/${batchInfo.totalBatches}: ${batchFile}`
      );

      // Load and upload this batch
      const batchVectors: VectorRecord[] = JSON.parse(
        fs.readFileSync(batchPath, "utf8")
      );
      await upsertVectors(indexName, batchVectors);

      totalUploaded += batchVectors.length;
      console.log(
        `✅ Uploaded batch ${i + 1}/${batchInfo.totalBatches} (${
          batchVectors.length
        } vectors)`
      );
    }

    console.log("✅ Successfully uploaded all vectors to Pinecone!");
    console.log(
      `📊 Total uploaded: ${totalUploaded} vectors to index '${indexName}'`
    );
  } catch (error) {
    console.error("❌ Error uploading vectors:", error);
    process.exit(1);
  }
}

uploadVectorsToPinecone();
