import fs from 'fs';
import path from 'path';
// Note: Using built-in fetch (Node.js 18+)
import { createEmbeddings } from '../libs/openai';
import { upsertVectors } from '../libs/pinecone';
import dotenv from 'dotenv';

dotenv.config();

interface Verse {
  id: string;
  text: string;
  book: string;
  chapter: number;
  verse: number;
  testament: 'OT' | 'NT';
}

// This constant is no longer used - book names come from Sefaria API and XML files

// Helper to load Hebrew OT from local JSON file (parsed from XML)
async function fetchHebrewOT(): Promise<Verse[]> {
  const verses: Verse[] = [];
  
  // First, try to load from local file if available
  const localHebrewPath = path.join(process.cwd(), 'data', 'hebrew_ot.json');
  if (fs.existsSync(localHebrewPath)) {
    try {
      console.log('📁 Loading Hebrew OT from local file...');
      const fileContent = fs.readFileSync(localHebrewPath, 'utf-8');
      const hebrewData = JSON.parse(fileContent);
      
      if (Array.isArray(hebrewData)) {
        hebrewData.forEach((verse: any) => {
          if (verse.text && verse.book && verse.chapter && verse.verse) {
            verses.push({
              id: `OT-${verse.book.replace(/\s+/g, '-')}-${verse.chapter}-${verse.verse}`,
              text: verse.text,
              book: verse.book,
              chapter: verse.chapter,
              verse: verse.verse,
              testament: 'OT' as const
            });
          }
        });
      }
      
      if (verses.length > 0) {
        console.log(`✅ Loaded ${verses.length} Hebrew verses from local file`);
        return verses;
      }
    } catch (error) {
      console.log('⚠️  Error reading local Hebrew OT file:', error);
    }
  }

  // Fallback: Create sample Hebrew verses for testing
  console.log('📝 Using sample Hebrew verses for demonstration');
  console.log('💡 To get complete Hebrew OT, run: npm run parse-hebrew-xml');
  const sampleHebrewVerses = [
    {
      id: 'OT-Genesis-1-1',
      text: 'בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ',
      book: 'Genesis',
      chapter: 1,
      verse: 1,
      testament: 'OT' as const
    },
    {
      id: 'OT-Psalms-23-1',
      text: 'יְהוָה רֹעִי לֹא אֶחְסָר',
      book: 'Psalms',
      chapter: 23,
      verse: 1,
      testament: 'OT' as const
    },
    {
      id: 'OT-Psalms-1-1',
      text: 'אַשְׁרֵי־הָאִישׁ אֲשֶׁר לֹא הָלַךְ בַּעֲצַת רְשָׁעִים וּבְדֶרֶךְ חַטָּאִים לֹא עָמָד וּבְמוֹשַׁב לֵצִים לֹא יָשָׁב',
      book: 'Psalms',
      chapter: 1,
      verse: 1,
      testament: 'OT' as const
    }
  ];

  return sampleHebrewVerses;
}

// Helper to load Greek NT from online sources or local file
async function loadGreekNT(): Promise<Verse[]> {
  const verses: Verse[] = [];

  // First, try to load from local file if available
  const localGreekPath = path.join(process.cwd(), 'data', 'greek_nt.json');
  if (fs.existsSync(localGreekPath)) {
    try {
      console.log('📁 Loading Greek NT from local file...');
      const fileContent = fs.readFileSync(localGreekPath, 'utf-8');
      const greekData = JSON.parse(fileContent);
      
      if (Array.isArray(greekData)) {
        greekData.forEach((verse: any, index: number) => {
          if (verse.text && verse.book && verse.chapter && verse.verse) {
            verses.push({
              id: `NT-${verse.book.replace(/\s+/g, '-')}-${verse.chapter}-${verse.verse}`,
              text: verse.text,
              book: verse.book,
              chapter: verse.chapter,
              verse: verse.verse,
              testament: 'NT' as const
            });
          }
        });
      }
      
      if (verses.length > 0) {
        console.log(`✅ Loaded ${verses.length} Greek verses from local file`);
        return verses;
      }
    } catch (error) {
      console.log('⚠️  Error reading local Greek NT file:', error);
    }
  }

  // No online sources - using local file or fallback

  // Fallback: Create more comprehensive sample Greek verses
  console.log('📝 Using sample Greek verses for demonstration');
  const sampleGreekVerses = [
    {
      id: 'NT-John-3-16',
      text: 'οὕτως γὰρ ἠγάπησεν ὁ θεὸς τὸν κόσμον, ὥστε τὸν υἱὸν τὸν μονογενῆ ἔδωκεν, ἵνα πᾶς ὁ πιστεύων εἰς αὐτὸν μὴ ἀπόληται ἀλλὰ ἔχῃ ζωὴν αἰώνιον.',
      book: 'John',
      chapter: 3,
      verse: 16,
      testament: 'NT' as const
    },
    {
      id: 'NT-1-Corinthians-13-4',
      text: 'ἡ ἀγάπη μακροθυμεῖ, χρηστεύεται ἡ ἀγάπη, οὐ ζηλοῖ, οὐ περπερεύεται, οὐ φυσιοῦται',
      book: '1 Corinthians',
      chapter: 13,
      verse: 4,
      testament: 'NT' as const
    },
    {
      id: 'NT-John-1-1',
      text: 'Ἐν ἀρχῇ ἦν ὁ λόγος, καὶ ὁ λόγος ἦν πρὸς τὸν θεόν, καὶ θεὸς ἦν ὁ λόγος.',
      book: 'John',
      chapter: 1,
      verse: 1,
      testament: 'NT' as const
    },
    {
      id: 'NT-Romans-8-28',
      text: 'οἴδαμεν δὲ ὅτι τοῖς ἀγαπῶσιν τὸν θεὸν πάντα συνεργεῖ εἰς ἀγαθόν, τοῖς κατὰ πρόθεσιν κλητοῖς οὖσιν.',
      book: 'Romans',
      chapter: 8,
      verse: 28,
      testament: 'NT' as const
    },
    {
      id: 'NT-Ephesians-2-8',
      text: 'τῇ γὰρ χάριτί ἐστε σεσῳσμένοι διὰ πίστεως· καὶ τοῦτο οὐκ ἐξ ὑμῶν, θεοῦ τὸ δῶρον·',
      book: 'Ephesians',
      chapter: 2,
      verse: 8,
      testament: 'NT' as const
    }
  ];

  return sampleGreekVerses;
}

async function createOriginalLanguageIndexes(): Promise<void> {
  try {
    console.log('🔄 Starting Bible original languages data loading...');

    // Create data directory if it doesn't exist
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Get index names from environment
    const hebrewIndexName = process.env.PINECONE_INDEX_HEBREW_NAME;
    const greekIndexName = process.env.PINECONE_INDEX_GREEK_NAME;

    if (!hebrewIndexName || !greekIndexName) {
      throw new Error('Missing required environment variables: PINECONE_INDEX_HEBREW_NAME and PINECONE_INDEX_GREEK_NAME');
    }

    console.log(`📊 Target indexes: Hebrew → ${hebrewIndexName}, Greek → ${greekIndexName}`);

    // Load Hebrew OT
    console.log('\n📖 Fetching Hebrew OT...');
    const hebrewOT = await fetchHebrewOT();
    console.log(`✅ Loaded ${hebrewOT.length} Hebrew verses`);

    // Load Greek NT
    console.log('\n📖 Loading Greek NT...');
    const greekNT = await loadGreekNT();
    console.log(`✅ Loaded ${greekNT.length} Greek verses`);

    // Process Hebrew OT
    if (hebrewOT.length > 0) {
      console.log('\n🇮🇱 Processing Hebrew Old Testament...');
      
      // Save Hebrew verses backup
      const hebrewBackupPath = path.join(dataDir, 'hebrew_ot.json');
      fs.writeFileSync(hebrewBackupPath, JSON.stringify(hebrewOT, null, 2));
      console.log(`💾 Saved Hebrew backup to: ${hebrewBackupPath}`);

      console.log('🤖 Creating embeddings for Hebrew verses in batches...');
      const hebrewTexts = hebrewOT.map(v => v.text);
      
      // Process in batches to avoid token limits
      const batchSize = 100; // Process 100 verses at a time
      const hebrewEmbeddings: number[][] = [];
      
      for (let i = 0; i < hebrewTexts.length; i += batchSize) {
        const batch = hebrewTexts.slice(i, i + batchSize);
        console.log(`   Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(hebrewTexts.length/batchSize)} (${batch.length} verses)...`);
        
        const batchEmbeddings = await createEmbeddings(batch, 1536);
        hebrewEmbeddings.push(...batchEmbeddings);
        
        // Small delay between batches
        if (i + batchSize < hebrewTexts.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      console.log(`✅ Created ${hebrewEmbeddings.length} Hebrew embeddings`);

      console.log('📦 Preparing Hebrew Pinecone vectors...');
      const hebrewVectors = hebrewOT.map((verse, i) => ({
        id: verse.id,
        values: hebrewEmbeddings[i],
        metadata: {
          book: verse.book,
          chapter: verse.chapter,
          verse: verse.verse,
          text: verse.text,
          testament: verse.testament,
          language: 'hebrew'
        },
      }));

      console.log(`🚀 Upserting ${hebrewVectors.length} Hebrew vectors to ${hebrewIndexName}...`);
      await upsertVectors(hebrewIndexName, hebrewVectors);
      console.log('✅ Hebrew OT successfully loaded to Pinecone!');
    } else {
      console.log('⚠️  No Hebrew verses to process');
    }

    // Process Greek NT
    if (greekNT.length > 0) {
      console.log('\n🇬🇷 Processing Greek New Testament...');
      
      // Save Greek verses backup
      const greekBackupPath = path.join(dataDir, 'greek_nt_processed.json');
      fs.writeFileSync(greekBackupPath, JSON.stringify(greekNT, null, 2));
      console.log(`💾 Saved Greek backup to: ${greekBackupPath}`);

      console.log('🤖 Creating embeddings for Greek verses in batches...');
      const greekTexts = greekNT.map(v => v.text);
      
      // Process in batches to avoid token limits
      const batchSize = 100; // Process 100 verses at a time
      const greekEmbeddings: number[][] = [];
      
      for (let i = 0; i < greekTexts.length; i += batchSize) {
        const batch = greekTexts.slice(i, i + batchSize);
        console.log(`   Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(greekTexts.length/batchSize)} (${batch.length} verses)...`);
        
        const batchEmbeddings = await createEmbeddings(batch, 1536);
        greekEmbeddings.push(...batchEmbeddings);
        
        // Small delay between batches
        if (i + batchSize < greekTexts.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      console.log(`✅ Created ${greekEmbeddings.length} Greek embeddings`);

      console.log('📦 Preparing Greek Pinecone vectors...');
      const greekVectors = greekNT.map((verse, i) => ({
        id: verse.id,
        values: greekEmbeddings[i],
        metadata: {
          book: verse.book,
          chapter: verse.chapter,
          verse: verse.verse,
          text: verse.text,
          testament: verse.testament,
          language: 'greek'
        },
      }));

      console.log(`🚀 Upserting ${greekVectors.length} Greek vectors to ${greekIndexName}...`);
      await upsertVectors(greekIndexName, greekVectors);
      console.log('✅ Greek NT successfully loaded to Pinecone!');
    } else {
      console.log('⚠️  No Greek verses to process');
    }

    console.log('\n🎉 Successfully loaded Bible original languages into Pinecone!');
    console.log(`📈 Final Summary:`);
    console.log(`   • Hebrew OT verses: ${hebrewOT.length} → ${hebrewIndexName}`);
    console.log(`   • Greek NT verses: ${greekNT.length} → ${greekIndexName}`);
    console.log(`   • Total verses processed: ${hebrewOT.length + greekNT.length}`);
  } catch (error) {
    console.error('❌ Error loading Bible original languages:', error);
    throw error;
  }
}


async function main() {
  try {
    await createOriginalLanguageIndexes();
  } catch (error) {
    console.error('💥 Script failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}