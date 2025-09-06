import {
  Pinecone,
  RecordMetadata,
  RerankResult,
  ScoredPineconeRecord,
} from "@pinecone-database/pinecone";
import dotenv from "dotenv";

dotenv.config();

const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY ?? "",
});

export interface VectorRecord {
  id: string;
  values: number[];
  metadata?: Record<string, unknown>;
}

// Uploads vectors to a Pinecone index in batches of 100
export async function upsertVectors(
  indexName: string,
  vectors: VectorRecord[]
): Promise<void> {
  try {
    const index = pc.index(indexName);

    const batchSize = 100;
    const batches: VectorRecord[][] = [];

    for (let i = 0; i < vectors.length; i += batchSize) {
      batches.push(vectors.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      // The SDK accepts a broader input shape; cast for compatibility.
      await index.upsert(batch as unknown as any);
    }

    console.log(
      `Successfully upserted ${vectors.length} vectors to ${indexName}`
    );
  } catch (error) {
    console.error("Error upserting vectors to Pinecone:", error);
    throw error;
  }
}

// Searches for similar vectors in a Pinecone index and returns the top K matches
export async function queryVectors(
  indexName: string,
  vector: number[],
  topK: number = 10,
  includeMetadata: boolean = true
): Promise<ScoredPineconeRecord<RecordMetadata>[]> {
  try {
    const index = pc.index(indexName);

    const queryResponse = await index.query({
      vector,
      topK,
      includeMetadata,
    });

    return queryResponse.matches ?? [];
  } catch (error) {
    console.error("Error querying vectors from Pinecone:", error);
    throw error;
  }
}

// Retrieves a specific vector from a Pinecone index by its ID
export async function fetchVectorById(
  indexName: string,
  id: string
): Promise<ScoredPineconeRecord<RecordMetadata> | null> {
  try {
    const index = pc.index(indexName);

    const fetchResponse = await index.fetch([id]);
    
    if (fetchResponse.records && fetchResponse.records[id]) {
      const record = fetchResponse.records[id];
      return {
        id: record.id,
        score: 1, // Perfect match
        values: record.values as number[],
        metadata: record.metadata as RecordMetadata,
      };
    }
    
    return null;
  } catch (error) {
    console.error("Error fetching vector by ID from Pinecone:", error);
    throw error;
  }
}

export interface RerankInputDocument {
  id: string;
  text: string;
  [key: string]: unknown;
}

// Re-ranks documents based on their relevance to a query using Pinecone's reranking model
export async function rerank(
  query: string,
  documents: RerankInputDocument[],
  topK: number = 5
): Promise<RerankResult> {
  try {
    const rerankedResponse = await pc.inference.rerank(
      "bge-reranker-v2-m3",
      query,
      // Ensure the object values are strings per Pinecone typings
      documents.map((doc) => ({
        id: String(doc.id),
        text: String(doc.text),
      })),
      {
        returnDocuments: true,
        topN: topK,
      }
    );

    return rerankedResponse;
  } catch (error) {
    console.error("Error reranking with Pinecone:", error);
    throw error;
  }
}
