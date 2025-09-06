import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// This route takes a messy user query and figures out what they really want
// Example: "giv me jon 316" becomes "give me John 3:16" + knows they want 1 specific verse
export async function POST(request: NextRequest) {
  try {
    // Get the user's question from the request
    const { query } = await request.json();

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // Ask AI to clean up the query and figure out what the user wants
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a Bible query parser. Analyze the user's request and return a JSON response with:
1. "cleanedQuery": Fix spelling, grammar, and formatting while preserving intent
2. "topK": Number of verses requested (1-50). Look for numbers like "give me 5 verses", "one verse", "twenty bible verses". Default to 5 if unclear.
3. "hasSpecificVerse": true if they're asking for a specific verse reference like "John 3:16", "Psalms 23:1", false otherwise
4. "specificVerses": If hasSpecificVerse is true, extract an array of verse objects with "book", "chapter", "verse", and optionally "endVerse" for ranges

Handle misspellings of Bible books (e.g., "jon" → "John", "mathew" → "Matthew", "psams" → "Psalms", "genisis" → "Genesis").

Examples:
"giv me won virse" → {"cleanedQuery": "give me one verse", "topK": 1, "hasSpecificVerse": false, "specificVerses": []}
"show me jon 3:16" → {"cleanedQuery": "show me John 3:16", "topK": 1, "hasSpecificVerse": true, "specificVerses": [{"book": "John", "chapter": 3, "verse": 16}]}
"genisis 1:1 and mathew 5:3-5" → {"cleanedQuery": "Genesis 1:1 and Matthew 5:3-5", "topK": 4, "hasSpecificVerse": true, "specificVerses": [{"book": "Genesis", "chapter": 1, "verse": 1}, {"book": "Matthew", "chapter": 5, "verse": 3, "endVerse": 5}]}
"find 10 bible verses about love" → {"cleanedQuery": "find 10 bible verses about love", "topK": 10, "hasSpecificVerse": false, "specificVerses": []}

Return only the JSON object, nothing else.`,
        },
        {
          role: "user",
          content: query,
        },
      ],
      max_tokens: 150,
      temperature: 0,
    });

    // Get the AI's response (should be JSON with cleaned query info)
    const result = response.choices[0]?.message?.content?.trim();

    try {
      // Try to parse the AI's JSON response
      const parsedResult = JSON.parse(result || "{}");

      // Clean up the results and set safe defaults
      const cleanedQuery = parsedResult.cleanedQuery || query; // Fixed spelling/grammar
      const topK = Math.min(Math.max(parseInt(parsedResult.topK) || 5, 1), 50); // How many verses (1-50)
      const hasSpecificVerse = Boolean(parsedResult.hasSpecificVerse); // True if asking for "John 3:16"
      const specificVerses = parsedResult.specificVerses || []; // Array of specific verse requests

      // Send back the cleaned up query info
      return NextResponse.json({
        cleanedQuery,        // "give me John 3:16" (fixed spelling)
        topK,               // 1 (number of verses they want)
        hasSpecificVerse,   // true (they asked for a specific verse)
        specificVerses,     // [{"book": "John", "chapter": 3, "verse": 16}]
      });
    } catch (parseError) {
      // If something goes wrong, use safe defaults
      return NextResponse.json({
        cleanedQuery: query,
        topK: 5,
        hasSpecificVerse: false,
        specificVerses: [],
      });
    }
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
