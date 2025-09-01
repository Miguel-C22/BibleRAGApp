import fs from 'fs';
import path from 'path';
import { DOMParser } from '@xmldom/xmldom';
import dotenv from 'dotenv';

dotenv.config();

interface GreekVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

// Book name mappings from XML to standard names
const BOOK_MAPPINGS: Record<string, string> = {
  'Jn': 'John',
  'Mt': 'Matthew', 
  'Mk': 'Mark',
  'Lk': 'Luke',
  'Ac': 'Acts',
  'Ro': 'Romans',
  '1Co': '1 Corinthians',
  '2Co': '2 Corinthians',
  'Ga': 'Galatians',
  'Eph': 'Ephesians',
  'Php': 'Philippians',
  'Col': 'Colossians',
  '1Th': '1 Thessalonians',
  '2Th': '2 Thessalonians',
  '1Ti': '1 Timothy',
  '2Ti': '2 Timothy',
  'Tit': 'Titus',
  'Phm': 'Philemon',
  'Heb': 'Hebrews',
  'Jas': 'James',
  '1Pe': '1 Peter',
  '2Pe': '2 Peter',
  '1Jn': '1 John',
  '2Jn': '2 John',
  '3Jn': '3 John',
  'Jud': 'Jude',
  'Re': 'Revelation'
};

function parseXMLFile(filePath: string): GreekVerse[] {
  const verses: GreekVerse[] = [];
  
  try {
    const xmlContent = fs.readFileSync(filePath, 'utf-8');
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, 'text/xml');
    
    // Get book info
    const bookElement = doc.getElementsByTagName('book')[0];
    const bookId = bookElement?.getAttribute('id') || '';
    const bookName = BOOK_MAPPINGS[bookId] || bookId;
    
    console.log(`📖 Parsing ${bookName} (${bookId})`);
    
    // Find all verse-number elements
    const verseElements = doc.getElementsByTagName('verse-number');
    
    for (let i = 0; i < verseElements.length; i++) {
      const verseElement = verseElements[i];
      const verseId = verseElement.getAttribute('id') || '';
      
      // Parse verse reference (e.g., "John 1:1")
      const match = verseId.match(/(\w+)\s+(\d+):(\d+)/);
      if (!match) continue;
      
      const chapter = parseInt(match[2]);
      const verse = parseInt(match[3]);
      
      // Collect all Greek words for this verse
      const words: string[] = [];
      let currentNode = verseElement.nextSibling;
      
      // Continue until we hit the next verse-number or end of content
      while (currentNode) {
        if (currentNode.nodeType === 1 && currentNode.nodeName === 'verse-number') {
          break; // Next verse found
        }
        
        if (currentNode.nodeType === 1 && currentNode.nodeName === 'w') {
          const word = currentNode.textContent?.trim();
          if (word) {
            words.push(word);
          }
        } else if (currentNode.nodeType === 1 && currentNode.nodeName === 'suffix') {
          const suffix = currentNode.textContent?.trim();
          if (suffix && words.length > 0) {
            // Add punctuation/spacing to the last word
            words[words.length - 1] += suffix;
          }
        }
        
        currentNode = currentNode.nextSibling;
      }
      
      if (words.length > 0) {
        const verseText = words.join(' ').replace(/\s+([,.;:])/g, '$1').trim();
        
        verses.push({
          book: bookName,
          chapter,
          verse,
          text: verseText
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

async function parseAllGreekXML(): Promise<void> {
  try {
    console.log('🔄 Starting Greek NT XML parsing...');
    
    const greekNTDir = path.join(process.cwd(), 'data', 'GreekNT');
    const dataDir = path.join(process.cwd(), 'data');
    
    if (!fs.existsSync(greekNTDir)) {
      throw new Error(`GreekNT directory not found at: ${greekNTDir}`);
    }
    
    // Get all XML files
    const xmlFiles = fs.readdirSync(greekNTDir)
      .filter(file => file.endsWith('.xml'))
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
    
    // Sort verses by book order, then chapter, then verse
    const bookOrder = [
      'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans',
      '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians',
      'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians',
      '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews',
      'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John',
      'Jude', 'Revelation'
    ];
    
    allVerses.sort((a, b) => {
      const bookA = bookOrder.indexOf(a.book);
      const bookB = bookOrder.indexOf(b.book);
      
      if (bookA !== bookB) return bookA - bookB;
      if (a.chapter !== b.chapter) return a.chapter - b.chapter;
      return a.verse - b.verse;
    });
    
    // Save to JSON file
    const outputPath = path.join(dataDir, 'greek_nt.json');
    fs.writeFileSync(outputPath, JSON.stringify(allVerses, null, 2));
    
    console.log(`💾 Saved complete Greek NT to: ${outputPath}`);
    
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
      allVerses.find(v => v.book === 'John' && v.chapter === 1 && v.verse === 1),
      allVerses.find(v => v.book === 'John' && v.chapter === 3 && v.verse === 16),
      allVerses.find(v => v.book === 'Romans' && v.chapter === 8 && v.verse === 28)
    ].filter(Boolean);
    
    samples.forEach(verse => {
      if (verse) {
        console.log(`   ${verse.book} ${verse.chapter}:${verse.verse} - ${verse.text.substring(0, 60)}...`);
      }
    });
    
    console.log('\n✅ Greek NT XML parsing complete!');
    console.log('🚀 You can now run: npm run load-originals');
    
  } catch (error) {
    console.error('❌ Error parsing Greek XML files:', error);
    throw error;
  }
}

async function main() {
  try {
    await parseAllGreekXML();
  } catch (error) {
    console.error('💥 Script failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}