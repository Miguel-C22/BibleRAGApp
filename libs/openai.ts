import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
});

// Creates a vector embedding for a single text string using OpenAI's text-embedding-3-small model
// Use this when: Processing one piece of text at a time, real-time user queries, or when you need immediate results
export async function createEmbedding(
  text: string,
  dimensions: number = 1536
): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
      dimensions: dimensions,
    });

    return response.data[0].embedding as number[];
  } catch (error) {
    console.error("Error creating embedding:", error);
    throw error;
  }
}

// Creates vector embeddings for multiple text strings in a single API call using OpenAI's text-embedding-3-small model
// Use this when: Batch processing documents, initial data loading, or when you have many texts to embed at once (more efficient and cost-effective)
export async function createEmbeddings(
  texts: string[],
  dimensions: number = 1536
): Promise<number[][]> {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: texts,
      dimensions: dimensions,
    });

    return response.data.map((item) => item.embedding as number[]);
  } catch (error) {
    console.error("Error creating embeddings:", error);
    throw error;
  }
}
