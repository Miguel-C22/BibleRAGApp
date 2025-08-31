import { createEmbeddings } from "../libs/openai";
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

async function main(): Promise<void> {
  try {
    console.log("Processing JSON file...");
    const jsonPath = "./data/en_kjv.json";
    const fileContent = fs
      .readFileSync(jsonPath, "utf-8")
      .replace(/^\uFEFF/, "");
    const books: BibleBook[] = JSON.parse(fileContent);

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

    console.log(`Found ${verses.length} verses`);

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

      const batchEmbeddings = await createEmbeddings(batch, 1536);
      embeddings.push(...batchEmbeddings);
    }

    console.log("Preparing vectors for Pinecone...");
    const vectors: Vector[] = verses.map((verse, index) => ({
      id: `${verse.book}-${verse.chapter}-${verse.verse}`,
      values: embeddings[index],
      metadata: {
        abbrev: verse.abbrev,
        book: verse.book,
        chapter: verse.chapter,
        verse: verse.verse,
        text: verse.text,
      },
    }));

    const outputDir = path.join(process.cwd(), "output");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, "en_kjv_vectors.json");

    console.log("Saving vectors in batches...");

    // Save in smaller files that can be processed individually
    const saveBatchSize = 1000;
    const filePaths: string[] = [];

    for (let i = 0; i < vectors.length; i += saveBatchSize) {
      const batch = vectors.slice(i, i + saveBatchSize);
      const batchNumber = Math.floor(i / saveBatchSize) + 1;
      const batchPath = path.join(
        outputDir,
        `en_kjv_vectors_batch_${batchNumber}.json`
      );

      fs.writeFileSync(batchPath, JSON.stringify(batch, null, 2));
      filePaths.push(batchPath);

      console.log(
        `Saved batch ${batchNumber}/${Math.ceil(
          vectors.length / saveBatchSize
        )} to ${batchPath}`
      );
    }

    // Save batch info
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
