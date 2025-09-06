import fs from "fs";
import path from "path";
import { DOMParser } from "@xmldom/xmldom";
import dotenv from "dotenv";
import { HEBREW_BOOK_MAPPINGS, hebrewBookOrder } from "@/consts/global";

dotenv.config();

interface HebrewVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

// Parse a single Hebrew XML file and extract verses
function parseHebrewXMLFile(filePath: string): HebrewVerse[] {
  const verses: HebrewVerse[] = [];

  try {
    const xmlContent = fs.readFileSync(filePath, "utf-8");
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, "text/xml");

    // Get book abbreviation from filename
    const fileName = path.basename(filePath, ".xml");
    const bookName = HEBREW_BOOK_MAPPINGS[fileName] || fileName;

    console.log(`📖 Parsing ${bookName} (${fileName})`);

    // Find all verse elements in OSIS format
    const verseElements = doc.getElementsByTagName("verse");

    for (let i = 0; i < verseElements.length; i++) {
      const verseElement = verseElements[i];
      const osisID = verseElement.getAttribute("osisID") || "";

      // Parse OSIS ID (e.g., "Gen.1.1" or "1Sam.1.1")
      const osisMatch = osisID.match(/([^.]+)\.(\d+)\.(\d+)/);
      if (!osisMatch) continue;

      const chapter = parseInt(osisMatch[2]);
      const verse = parseInt(osisMatch[3]);

      // Get all Hebrew words from this verse
      const hebrewWords: string[] = [];

      // Try to find individual word elements first
      const wordElements = verseElement.getElementsByTagName("w");
      for (let j = 0; j < wordElements.length; j++) {
        const wordElement = wordElements[j];
        const wordText = wordElement.textContent?.trim();
        if (wordText) {
          hebrewWords.push(wordText);
        }
      }

      // Fallback: extract all text if no word elements found
      if (hebrewWords.length === 0) {
        const allText = verseElement.textContent?.trim();
        if (allText) {
          // Split by whitespace and filter out empty strings
          hebrewWords.push(
            ...allText.split(/\s+/).filter((word) => word.length > 0)
          );
        }
      }

      if (hebrewWords.length > 0) {
        const verseText = hebrewWords.join(" ").trim();

        // Verify this contains actual Hebrew characters
        if (verseText && /[\u0590-\u05FF]/.test(verseText)) {
          verses.push({
            book: bookName,
            chapter,
            verse,
            text: verseText,
          });
        }
      }
    }

    console.log(`✅ Parsed ${verses.length} verses from ${bookName}`);
    return verses;
  } catch (error) {
    console.error(`❌ Error parsing ${filePath}:`, error);
    return [];
  }
}

// Main function: Parse all Hebrew XML files and save to JSON
async function parseAllHebrewXML(): Promise<void> {
  try {
    console.log("🔄 Starting Hebrew OT XML parsing...");

    const hebrewOTDir = path.join(process.cwd(), "data", "HebrewOT");
    const dataDir = path.join(process.cwd(), "data");

    if (!fs.existsSync(hebrewOTDir)) {
      throw new Error(`HebrewOT directory not found at: ${hebrewOTDir}`);
    }

    // Find all Hebrew XML files (skip the VerseMap file)
    const xmlFiles = fs
      .readdirSync(hebrewOTDir)
      .filter((file) => file.endsWith(".xml") && file !== "VerseMap.xml")
      .sort(); // Sort to maintain consistent order

    console.log(`📚 Found ${xmlFiles.length} Hebrew XML files`);

    let allVerses: HebrewVerse[] = [];

    // Parse each XML file
    for (const xmlFile of xmlFiles) {
      const filePath = path.join(hebrewOTDir, xmlFile);
      const verses = parseHebrewXMLFile(filePath);
      allVerses = allVerses.concat(verses);
    }

    console.log(`📊 Total Hebrew verses parsed: ${allVerses.length}`);

    allVerses.sort((a, b) => {
      const bookA = hebrewBookOrder.indexOf(a.book);
      const bookB = hebrewBookOrder.indexOf(b.book);

      if (bookA !== bookB) return bookA - bookB;
      if (a.chapter !== b.chapter) return a.chapter - b.chapter;
      return a.verse - b.verse;
    });

    // Save to JSON file
    const outputPath = path.join(dataDir, "hebrew_ot.json");
    fs.writeFileSync(outputPath, JSON.stringify(allVerses, null, 2));

    console.log(`💾 Saved complete Hebrew OT to: ${outputPath}`);
    console.log("\n✅ Hebrew OT XML parsing complete!");
    console.log("🚀 You can now run: npm run load-originals");
  } catch (error) {
    console.error("❌ Error parsing Hebrew XML files:", error);
    throw error;
  }
}

async function main() {
  try {
    await parseAllHebrewXML();
  } catch (error) {
    console.error("💥 Script failed:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
