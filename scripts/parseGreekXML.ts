import fs from "fs";
import path from "path";
import { DOMParser } from "@xmldom/xmldom";
import dotenv from "dotenv";
import { BOOK_MAPPINGS, greekBookOrder } from "@/consts/global";

dotenv.config();

interface GreekVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

// Parse a single XML file and extract Greek verses
function parseXMLFile(filePath: string): GreekVerse[] {
  const verses: GreekVerse[] = [];

  try {
    const xmlContent = fs.readFileSync(filePath, "utf-8");
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, "text/xml");

    // Get book info
    const bookElement = doc.getElementsByTagName("book")[0];
    const bookId = bookElement?.getAttribute("id") || "";
    const bookName = BOOK_MAPPINGS[bookId] || bookId;

    console.log(`📖 Parsing ${bookName} (${bookId})`);

    // Find all verse-number elements
    const verseElements = doc.getElementsByTagName("verse-number");

    for (let i = 0; i < verseElements.length; i++) {
      const verseElement = verseElements[i];
      const verseId = verseElement.getAttribute("id") || "";

      // Parse verse reference (e.g., "John 1:1")
      const match = verseId.match(/(\w+)\s+(\d+):(\d+)/);
      if (!match) continue;

      const chapter = parseInt(match[2]);
      const verse = parseInt(match[3]);

      // Gather Greek words that belong to this verse
      const words: string[] = [];
      let currentNode = verseElement.nextSibling;

      // Keep reading until we find the next verse
      while (currentNode) {
        if (
          currentNode.nodeType === 1 &&
          currentNode.nodeName === "verse-number"
        ) {
          break;
        }
        if (currentNode.nodeType === 1 && currentNode.nodeName === "w") {
          const word = currentNode.textContent?.trim();
          if (word) {
            words.push(word);
          }
        } else if (
          currentNode.nodeType === 1 &&
          currentNode.nodeName === "suffix"
        ) {
          const suffix = currentNode.textContent?.trim();
          if (suffix && words.length > 0) {
            words[words.length - 1] += suffix;
          }
        }

        currentNode = currentNode.nextSibling;
      }

      if (words.length > 0) {
        const verseText = words
          .join(" ")
          .replace(/\s+([,.;:])/g, "$1")
          .trim();

        verses.push({
          book: bookName,
          chapter,
          verse,
          text: verseText,
        });
      }
    }

    console.log(`✅ Parsed ${verses.length} verses from ${bookName}`);
    return verses;
  } catch (error) {
    console.error(`❌ Error parsing ${filePath}:`, error);
    return [];
  }
}

// Main function: Parse all Greek XML files and save to JSON
async function parseAllGreekXML(): Promise<void> {
  try {
    console.log("🔄 Starting Greek NT XML parsing...");

    const greekNTDir = path.join(process.cwd(), "data", "GreekNT");
    const dataDir = path.join(process.cwd(), "data");

    if (!fs.existsSync(greekNTDir)) {
      throw new Error(`GreekNT directory not found at: ${greekNTDir}`);
    }

    // Get all XML files
    const xmlFiles = fs
      .readdirSync(greekNTDir)
      .filter((file) => file.endsWith(".xml"))
      .sort(); // Sort to maintain consistent order

    console.log(`📚 Found ${xmlFiles.length} XML files`);

    let allVerses: GreekVerse[] = [];

    // Parse each XML file
    for (const xmlFile of xmlFiles) {
      const filePath = path.join(greekNTDir, xmlFile);
      const verses = parseXMLFile(filePath);
      allVerses = allVerses.concat(verses);
    }

    console.log(`📊 Total verses parsed: ${allVerses.length}`);

    allVerses.sort((a, b) => {
      const bookA = greekBookOrder.indexOf(a.book);
      const bookB = greekBookOrder.indexOf(b.book);

      if (bookA !== bookB) return bookA - bookB;
      if (a.chapter !== b.chapter) return a.chapter - b.chapter;
      return a.verse - b.verse;
    });

    // Save to JSON file
    const outputPath = path.join(dataDir, "greek_nt.json");
    fs.writeFileSync(outputPath, JSON.stringify(allVerses, null, 2));

    console.log(`💾 Saved complete Greek NT to: ${outputPath}`);
    console.log("\n✅ Greek NT XML parsing complete!");
    console.log("🚀 You can now run: npm run load-originals");
  } catch (error) {
    console.error("❌ Error parsing Greek XML files:", error);
    throw error;
  }
}

async function main() {
  try {
    await parseAllGreekXML();
  } catch (error) {
    console.error("💥 Script failed:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
