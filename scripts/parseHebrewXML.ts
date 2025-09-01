import fs from 'fs';
import path from 'path';
import { DOMParser } from '@xmldom/xmldom';
import dotenv from 'dotenv';

dotenv.config();

interface HebrewVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

// Book name mappings from XML abbreviations to full names
const HEBREW_BOOK_MAPPINGS: Record<string, string> = {
  'Gen': 'Genesis',
  'Exod': 'Exodus',
  'Lev': 'Leviticus', 
  'Num': 'Numbers',
  'Deut': 'Deuteronomy',
  'Josh': 'Joshua',
  'Judg': 'Judges',
  'Ruth': 'Ruth',
  '1Sam': '1 Samuel',
  '2Sam': '2 Samuel',
  '1Kgs': '1 Kings',
  '2Kgs': '2 Kings',
  '1Chr': '1 Chronicles',
  '2Chr': '2 Chronicles',
  'Ezra': 'Ezra',
  'Neh': 'Nehemiah',
  'Esth': 'Esther',
  'Job': 'Job',
  'Ps': 'Psalms',
  'Prov': 'Proverbs',
  'Eccl': 'Ecclesiastes',
  'Song': 'Song of Solomon',
  'Isa': 'Isaiah',
  'Jer': 'Jeremiah',
  'Lam': 'Lamentations',
  'Ezek': 'Ezekiel',
  'Dan': 'Daniel',
  'Hos': 'Hosea',
  'Joel': 'Joel',
  'Amos': 'Amos',
  'Obad': 'Obadiah',
  'Jonah': 'Jonah',
  'Mic': 'Micah',
  'Nah': 'Nahum',
  'Hab': 'Habakkuk',
  'Zeph': 'Zephaniah',
  'Hag': 'Haggai',
  'Zech': 'Zechariah',
  'Mal': 'Malachi'
};

function parseHebrewXMLFile(filePath: string): HebrewVerse[] {
  const verses: HebrewVerse[] = [];
  
  try {
    const xmlContent = fs.readFileSync(filePath, 'utf-8');
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, 'text/xml');
    
    // Get book abbreviation from filename
    const fileName = path.basename(filePath, '.xml');
    const bookName = HEBREW_BOOK_MAPPINGS[fileName] || fileName;
    
    console.log(`📖 Parsing ${bookName} (${fileName})`);
    
    // Find all verse elements in OSIS format
    const verseElements = doc.getElementsByTagName('verse');
    
    for (let i = 0; i < verseElements.length; i++) {
      const verseElement = verseElements[i];
      const osisID = verseElement.getAttribute('osisID') || '';
      
      // Parse OSIS ID (e.g., "Gen.1.1" or "1Sam.1.1")
      const osisMatch = osisID.match(/([^.]+)\.(\d+)\.(\d+)/);
      if (!osisMatch) continue;
      
      const chapter = parseInt(osisMatch[2]);
      const verse = parseInt(osisMatch[3]);
      
      // Extract Hebrew text from the verse element
      const hebrewWords: string[] = [];
      
      // Look for 'w' elements (words) inside the verse
      const wordElements = verseElement.getElementsByTagName('w');
      for (let j = 0; j < wordElements.length; j++) {
        const wordElement = wordElements[j];
        const wordText = wordElement.textContent?.trim();
        if (wordText) {
          hebrewWords.push(wordText);
        }
      }
      
      // If no word elements found, try getting all text content
      if (hebrewWords.length === 0) {
        const allText = verseElement.textContent?.trim();
        if (allText) {
          // Split by whitespace and filter out empty strings
          hebrewWords.push(...allText.split(/\s+/).filter(word => word.length > 0));
        }
      }
      
      if (hebrewWords.length > 0) {
        const verseText = hebrewWords.join(' ').trim();
        
        // Only add if we have actual Hebrew text (contains Hebrew characters)
        if (verseText && /[\u0590-\u05FF]/.test(verseText)) {
          verses.push({
            book: bookName,
            chapter,
            verse,
            text: verseText
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

async function parseAllHebrewXML(): Promise<void> {
  try {
    console.log('🔄 Starting Hebrew OT XML parsing...');
    
    const hebrewOTDir = path.join(process.cwd(), 'data', 'HebrewOT');
    const dataDir = path.join(process.cwd(), 'data');
    
    if (!fs.existsSync(hebrewOTDir)) {
      throw new Error(`HebrewOT directory not found at: ${hebrewOTDir}`);
    }
    
    // Get all XML files (exclude VerseMap.xml)
    const xmlFiles = fs.readdirSync(hebrewOTDir)
      .filter(file => file.endsWith('.xml') && file !== 'VerseMap.xml')
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
    
    // Sort verses by biblical book order, then chapter, then verse
    const bookOrder = [
      'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
      'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings',
      '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther',
      'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon',
      'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel',
      'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah',
      'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi'
    ];
    
    allVerses.sort((a, b) => {
      const bookA = bookOrder.indexOf(a.book);
      const bookB = bookOrder.indexOf(b.book);
      
      if (bookA !== bookB) return bookA - bookB;
      if (a.chapter !== b.chapter) return a.chapter - b.chapter;
      return a.verse - b.verse;
    });
    
    // Save to JSON file
    const outputPath = path.join(dataDir, 'hebrew_ot.json');
    fs.writeFileSync(outputPath, JSON.stringify(allVerses, null, 2));
    
    console.log(`💾 Saved complete Hebrew OT to: ${outputPath}`);
    
    // Show some statistics
    const bookCounts: Record<string, number> = {};
    allVerses.forEach(verse => {
      bookCounts[verse.book] = (bookCounts[verse.book] || 0) + 1;
    });
    
    console.log('\n📈 Verses per book:');
    Object.entries(bookCounts).forEach(([book, count]) => {
      console.log(`   ${book}: ${count} verses`);
    });
    
    // Show a few sample verses
    console.log('\n📝 Sample verses:');
    const samples = [
      allVerses.find(v => v.book === 'Genesis' && v.chapter === 1 && v.verse === 1),
      allVerses.find(v => v.book === 'Psalms' && v.chapter === 23 && v.verse === 1),
      allVerses.find(v => v.book === 'Isaiah' && v.chapter === 53 && v.verse === 6)
    ].filter(Boolean);
    
    samples.forEach(verse => {
      if (verse) {
        console.log(`   ${verse.book} ${verse.chapter}:${verse.verse} - ${verse.text.substring(0, 40)}...`);
      }
    });
    
    console.log('\n✅ Hebrew OT XML parsing complete!');
    console.log('🚀 You can now run: npm run load-originals');
    
  } catch (error) {
    console.error('❌ Error parsing Hebrew XML files:', error);
    throw error;
  }
}

async function main() {
  try {
    await parseAllHebrewXML();
  } catch (error) {
    console.error('💥 Script failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}