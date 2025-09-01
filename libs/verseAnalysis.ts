import { createEmbedding } from './openai';
import { queryVectors, fetchVectorById } from './pinecone';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface VerseResult {
  id: string;
  kjvText: string;
  originalText?: string;
  originalLanguage?: 'hebrew' | 'greek';
  book: string;
  chapter: number;
  verse: number;
  testament: 'OT' | 'NT';
}

export interface AnalysisResult {
  verses: VerseResult[];
  explanation: string;
  query: string;
  analysisType?: string;
}

const OLD_TESTAMENT_BOOKS = [
  'genesis', 'exodus', 'leviticus', 'numbers', 'deuteronomy',
  'joshua', 'judges', 'ruth', '1 samuel', '2 samuel', '1 kings', '2 kings',
  '1 chronicles', '2 chronicles', 'ezra', 'nehemiah', 'esther',
  'job', 'psalms', 'proverbs', 'ecclesiastes', 'song of solomon',
  'isaiah', 'jeremiah', 'lamentations', 'ezekiel', 'daniel',
  'hosea', 'joel', 'amos', 'obadiah', 'jonah', 'micah',
  'nahum', 'habakkuk', 'zephaniah', 'haggai', 'zechariah', 'malachi'
];

function determineTestament(book: string): 'OT' | 'NT' {
  return OLD_TESTAMENT_BOOKS.includes(book.toLowerCase()) ? 'OT' : 'NT';
}

async function searchKJVVerses(query: string, topK: number = 5): Promise<any[]> {
  try {
    const queryEmbedding = await createEmbedding(query, 1536);
    const kjvIndexName = process.env.PINECONE_INDEX_NAME!;
    
    const results = await queryVectors(kjvIndexName, queryEmbedding, topK, true);
    
    return results.map((match: any) => ({
      id: match.id,
      score: match.score,
      text: match.metadata?.text || "No text available",
      book: match.metadata?.book,
      chapter: match.metadata?.chapter,
      verse: match.metadata?.verse,
    }));
  } catch (error) {
    console.error('Error searching KJV verses:', error);
    throw error;
  }
}

async function findOriginalLanguageVerse(book: string, chapter: number, verse: number): Promise<any> {
  try {
    const testament = determineTestament(book);
    const language = testament === 'OT' ? 'hebrew' : 'greek';
    
    // Get the appropriate index name based on testament
    const indexName = testament === 'OT' 
      ? process.env.PINECONE_INDEX_HEBREW_NAME 
      : process.env.PINECONE_INDEX_GREEK_NAME;
    
    if (!indexName) {
      console.error(`Missing environment variable: PINECONE_INDEX_${language.toUpperCase()}_NAME`);
      return null;
    }
    
    // Try to find exact match first
    const verseId = `${testament}-${book.toLowerCase().replace(/\s+/g, '-')}-${chapter}-${verse}`;
    let originalVerse = await fetchVectorById(indexName, verseId);
    
    if (!originalVerse) {
      // If exact match not found, search by similarity
      const searchQuery = `${book} ${chapter}:${verse}`;
      const queryEmbedding = await createEmbedding(searchQuery, 1536);
      
      const results = await queryVectors(indexName, queryEmbedding, 3, true);
      
      // Find the best match for the specific verse
      originalVerse = results.find((match: any) => 
        match.metadata?.book?.toLowerCase() === book.toLowerCase() &&
        match.metadata?.chapter === chapter &&
        match.metadata?.verse === verse
      ) || results[0];
    }
    
    if (originalVerse) {
      return {
        text: originalVerse.metadata?.text || '',
        language,
        testament
      };
    }
    
    return null;
  } catch (error) {
    console.error(`Error finding original language verse for ${book} ${chapter}:${verse}:`, error);
    return null;
  }
}

export async function analyzeVerses(query: string, topK: number = 5): Promise<AnalysisResult> {
  try {
    // Step 1: Search KJV verses in Pinecone
    console.log(`🔍 Searching for KJV verses: "${query}"`);
    const kjvResults = await searchKJVVerses(query, topK);
    
    if (kjvResults.length === 0) {
      return {
        verses: [],
        explanation: "No verses found matching your query.",
        query
      };
    }
    
    // Step 2: For each KJV verse, find the original language text
    console.log(`📖 Looking up original language texts for ${kjvResults.length} verses`);
    const versesWithOriginals: VerseResult[] = [];
    
    for (const kjvVerse of kjvResults) {
      const originalData = await findOriginalLanguageVerse(
        kjvVerse.book, 
        kjvVerse.chapter, 
        kjvVerse.verse
      );
      
      versesWithOriginals.push({
        id: kjvVerse.id,
        kjvText: kjvVerse.text,
        originalText: originalData?.text,
        originalLanguage: originalData?.language,
        book: kjvVerse.book,
        chapter: kjvVerse.chapter,
        verse: kjvVerse.verse,
        testament: originalData?.testament || determineTestament(kjvVerse.book)
      });
    }
    
    // Step 3: Generate explanation based on KJV + original language texts
    console.log('🤖 Generating verse explanation with original language context');
    const explanation = await generateExplanation(query, versesWithOriginals);
    
    return {
      verses: versesWithOriginals,
      explanation,
      query
    };
    
  } catch (error) {
    console.error('Error in analyzeVerses:', error);
    throw error;
  }
}

async function generateExplanation(query: string, verses: VerseResult[]): Promise<string> {
  try {
    const versesContext = verses.map(verse => {
      let context = `**${verse.book} ${verse.chapter}:${verse.verse}**\n`;
      context += `KJV: "${verse.kjvText}"\n`;
      
      if (verse.originalText) {
        const langName = verse.originalLanguage === 'hebrew' ? 'Hebrew' : 'Greek';
        context += `${langName}: "${verse.originalText}"\n`;
      } else {
        context += `Original language text not available.\n`;
      }
      
      return context;
    }).join('\n');

    const prompt = `You are a Bible scholar with expertise in Hebrew and Greek. A user asked: "${query}"

Here are the relevant verses with their original language texts:

${versesContext}

Please provide a comprehensive explanation that:
1. Summarizes the key message of these verses
2. Explains important Hebrew/Greek word meanings and their significance
3. Provides historical and cultural context where relevant
4. Shows how the original language adds depth to understanding
5. Offers practical application for today

Keep your explanation engaging, educational, and accessible to general readers. Focus on how the original language enhances our understanding of the passage.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a knowledgeable Bible scholar who explains scripture with attention to original languages, historical context, and practical application.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 800,
      temperature: 0.7
    });

    return completion.choices[0]?.message?.content || 'Unable to generate explanation.';
    
  } catch (error) {
    console.error('Error generating explanation:', error);
    return `Here are the relevant verses for "${query}":\n\n${verses.map(v => 
      `${v.book} ${v.chapter}:${v.verse} - ${v.kjvText}`
    ).join('\n\n')}`;
  }
}

// Helper function for specific verse lookup
export async function analyzeSpecificVerse(book: string, chapter: number, verse: number): Promise<AnalysisResult> {
  try {
    const query = `${book} ${chapter}:${verse}`;
    
    // Search for the specific verse in KJV
    const kjvResults = await searchKJVVerses(query, 3);
    
    // Find exact match or best match
    const exactMatch = kjvResults.find(result => 
      result.book.toLowerCase() === book.toLowerCase() &&
      result.chapter === chapter &&
      result.verse === verse
    ) || kjvResults[0];
    
    if (!exactMatch) {
      return {
        verses: [],
        explanation: `Verse ${book} ${chapter}:${verse} not found.`,
        query
      };
    }
    
    const originalData = await findOriginalLanguageVerse(book, chapter, verse);
    
    const verseResult: VerseResult = {
      id: exactMatch.id,
      kjvText: exactMatch.text,
      originalText: originalData?.text,
      originalLanguage: originalData?.language,
      book: exactMatch.book,
      chapter: exactMatch.chapter,
      verse: exactMatch.verse,
      testament: originalData?.testament || determineTestament(book)
    };
    
    const explanation = await generateExplanation(query, [verseResult]);
    
    return {
      verses: [verseResult],
      explanation,
      query
    };
    
  } catch (error) {
    console.error(`Error analyzing specific verse ${book} ${chapter}:${verse}:`, error);
    throw error;
  }
}