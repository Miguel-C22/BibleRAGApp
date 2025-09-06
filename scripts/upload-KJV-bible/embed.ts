import { createEmbeddings } from "../../libs/openai";
import fs from "fs";
import path from "path";

interface BibleBook {
  abbrev: string;
  chapters: string[][];
  name: string;
}

interface Vector {
  id: string;
  values: number[];
  metadata: {
    abbrev: string;
    book: string;
    chapter: number;
    verse: number;
    text: string;
  };
}

// This file is for Embedding the entire KJV bible into vectors
async function main(): Promise<void> {
  try {
    console.log("Processing JSON file...");
    const jsonPath = "./data/en_kjv.json"; // Grabs the data
    const fileContent = fs
      .readFileSync(jsonPath, "utf-8")
      .replace(/^\uFEFF/, "");
    const books: BibleBook[] = JSON.parse(fileContent);

    // Take what information you want to vectorize from the data
    // Flatten books into individual verses
    const verses: {
      abbrev: string;
      book: string;
      chapter: number;
      verse: number;
      text: string;
    }[] = [];

    books.forEach((book) => {
      book.chapters.forEach((chapter, chapterIndex) => {
        chapter.forEach((verseText, verseIndex) => {
          verses.push({
            abbrev: book.abbrev,
            book: book.name,
            chapter: chapterIndex + 1,
            verse: verseIndex + 1,
            text: verseText,
          });
        });
      });
    });

    console.log("Creating embeddings...");
    const texts = verses.map((verse) => verse.text);

    // Process in batches to avoid token limits
    const batchSize = 1000;
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      console.log(
        `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
          texts.length / batchSize
        )} (${batch.length} verses)`
      );

      // Convert text batch to numerical embeddings using OpenAI's API
      const batchEmbeddings = await createEmbeddings(batch, 1536);
      // Add all embeddings from this batch to our main embeddings array
      embeddings.push(...batchEmbeddings);
    }

    console.log("Preparing vectors for Pinecone...");
    // Transform verse data + embeddings into Pinecone's vector format
    const vectors: Vector[] = verses.map((verse, index) => ({
      // Create unique ID for each verse (e.g., "Genesis-1-1")
      id: `${verse.book}-${verse.chapter}-${verse.verse}`,
      // The actual embedding vector (1536 numbers representing the verse meaning)
      values: embeddings[index],
      // Store original verse data as searchable metadata
      metadata: {
        abbrev: verse.abbrev,
        book: verse.book,
        chapter: verse.chapter,
        verse: verse.verse,
        text: verse.text,
      },
    }));

    // Create output directory path
    const outputDir = path.join(process.cwd(), "output");
    // Create the directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Define the main output file path (though we'll actually save in batches)
    const outputPath = path.join(outputDir, "en_kjv_vectors.json");

    console.log("Saving vectors in batches...");

    // Split into smaller files (1000 vectors each)
    const saveBatchSize = 1000;
    const filePaths: string[] = [];

    // Save vectors in groups of 1000
    for (let i = 0; i < vectors.length; i += saveBatchSize) {
      // Get next 1000 vectors
      const batch = vectors.slice(i, i + saveBatchSize);
      // Figure out which batch number this is
      const batchNumber = Math.floor(i / saveBatchSize) + 1;
      // Make filename like "en_kjv_vectors_batch_1.json"
      const batchPath = path.join(
        outputDir,
        `en_kjv_vectors_batch_${batchNumber}.json`
      );

      // Save this batch to a file
      fs.writeFileSync(batchPath, JSON.stringify(batch, null, 2));
      // Remember this file path
      filePaths.push(batchPath);

      console.log(
        `Saved batch ${batchNumber}/${Math.ceil(
          vectors.length / saveBatchSize
        )} to ${batchPath}`
      );
    }

    // Create a summary file with info about all batches
    const batchInfoPath = path.join(outputDir, "batch_info.json");
    fs.writeFileSync(
      batchInfoPath,
      JSON.stringify(
        {
          totalVectors: vectors.length,
          batchSize: saveBatchSize,
          batchFiles: filePaths.map((p) => path.basename(p)),
          totalBatches: Math.ceil(vectors.length / saveBatchSize),
        },
        null,
        2
      )
    );

    console.log(`✅ Successfully created ${vectors.length} vectors`);
    console.log(`📁 Saved to: ${outputPath}`);
    console.log("Ready for Pinecone upload!");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();
