import { NextRequest, NextResponse } from "next/server";
import { createEmbedding } from "../../../libs/openai";
import { queryVectors, fetchVectorById } from "../../../libs/pinecone";
import OpenAI from "openai";

/*

	•	Uses Pinecone vector similarity search only.
	•	Faster and cheaper (1 API call: OpenAI → Pinecone).
	•	Returns documents ranked by Pinecone’s similarity score.
	•	Good when:
	•	Speed matters more than accuracy.
	•	Pinecone’s default ranking is “good enough.”
	•	You want to avoid extra OpenAI costs.

*/

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// UTILITY: AI-powered book name normalization - handles misspellings and abbreviations
// Converts user input like "mathew", "1 cor", "psams" to proper Bible book names
const normalizeBookName = async (bookName: string): Promise<string | null> => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a Bible book name normalizer. Given a potentially misspelled or abbreviated Bible book name, return the correct standardized name that would be used in verse IDs.

Rules:
- Return the exact book name as it appears in standard Bible verse IDs
- Handle common misspellings (e.g., "Mathew" → "Matthew", "Psams" → "Psalms")
- Handle abbreviations (e.g., "1 Cor" → "1 Corinthians", "Rom" → "Romans", "Gen" → "Genesis")
- Handle variations (e.g., "First Corinthians" → "1 Corinthians", "Song of Solomon" → "Song of Songs")
- If the input is not a recognizable Bible book, return "INVALID"
- Only return the normalized book name, nothing else

Examples:
"mathew" → "Matthew"
"1 cor" → "1 Corinthians"
"psams" → "Psalms"
"gen" → "Genesis"
"first john" → "1 John"
"song of solomon" → "Song of Songs"
"revelations" → "Revelation"
"xyz123" → "INVALID"`,
        },
        { role: "user", content: bookName },
      ],
      max_tokens: 50,
    });

    const normalized = response.choices[0]?.message?.content?.trim();
    return normalized && normalized !== "INVALID" ? normalized : null;
  } catch (error) {
    console.log("Book name normalization failed:", error);
    return bookName; // fallback to original
  }
};

export async function POST(request: NextRequest) {
  try {
    // Extract query and topK from request body
    const { query, topK = 5 } = await request.json();

    // Validate that query exists
    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // STEP 1: Bible Relevance Check - Filter out non-Bible questions to keep chatbot focused
    try {
      const relevanceCheck = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              'You are a Bible content filter. Respond "YES" only if the question asks about:\n- Bible verses, passages, or books\n- Biblical characters (Jesus, Moses, David, etc.)\n- Christian beliefs, theology, or doctrine\n- Faith, prayer, or spiritual guidance\n- Biblical stories or events\n\nRespond "NO" for everything else including:\n- Weather, news, sports, cooking, technology\n- General knowledge or science questions  \n- Personal problems unrelated to faith\n- Any secular topics\n\nBe very strict. When in doubt, answer "NO".\n\nExamples:\n"What is John 3:16?" → YES\n"What does the Bible say about love?" → YES\n"What is the weather?" → NO\n"How do I cook pasta?" → NO\n"Tell me about Jesus" → YES',
          },
          {
            role: "user",
            content: `"${query}"`,
          },
        ],
        max_tokens: 5,
      });

      // Parse the AI response to determine if question is Bible-related
      const relevanceResponse = relevanceCheck.choices[0]?.message?.content
        ?.trim()
        .toUpperCase();
      const isRelevant = relevanceResponse === "YES";

      // If not Bible-related, return polite rejection message
      if (!isRelevant) {
        return NextResponse.json({
          query,
          documents: [],
          total: 0,
          aiResponse:
            "I only answer questions related to the Bible, Christianity, and faith. Please ask me about scripture, biblical stories, Christian teachings, or spiritual guidance.",
          verses: "",
        });
      }
    } catch (relevanceError) {
      // If relevance check fails, default to allowing the query through
    }

    // STEP 2: Query Cleanup - Fix spelling/grammar to improve search accuracy
    let cleanedQuery = query;
    try {
      const cleanupResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              'You are a text cleaner. Fix ONLY spelling and grammar errors. Do NOT change the topic, meaning, or rewrite the question. Keep the exact same intent. Examples: "giv me jon 3:16" → "give me john 3:16", "psams 23" → "psalms 23", "whats the wether today" → "what is the weather today"',
          },
          { role: "user", content: query },
        ],
        max_tokens: 100,
      });

      // Use cleaned query if successful, fallback to original if cleanup fails
      cleanedQuery =
        cleanupResponse.choices[0]?.message?.content?.trim() || query;
    } catch (cleanupError) {
      // Query cleanup failed, using original query
    }

    // UTILITY: Response preference analyzer - determines if user wants verse-only, detailed explanation, or summary
    const analyzeResponsePreference = async (query: string) => {
      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Analyze the user's Bible query to determine their response preference. Return only one of these options:
              
"VERSE_ONLY" - User wants just the verse text without explanation (e.g., "just give me John 3:16", "verse only", "no summary")
"DETAILED" - User wants detailed explanation or commentary (e.g., "explain this verse", "what does this mean", "give me commentary") 
"SUMMARY" - Default for most requests, user wants verse plus brief explanation/context

Examples:
"Give me John 3:16 no summary" → VERSE_ONLY
"What does Matthew 5:4 mean?" → DETAILED  
"Show me Psalm 23:1" → SUMMARY
"just the verse for Romans 8:28" → VERSE_ONLY
"explain John 3:16 to me" → DETAILED
"Tell me about love" → SUMMARY`,
            },
            { role: "user", content: query },
          ],
          max_tokens: 20,
        });

        const preference = response.choices[0]?.message?.content?.trim();
        return preference === "VERSE_ONLY"
          ? { wantsSummary: false, responseStyle: "verse_only" }
          : preference === "DETAILED"
          ? { wantsSummary: true, responseStyle: "detailed" }
          : { wantsSummary: true, responseStyle: "summary" }; // default
      } catch (error) {
        return { wantsSummary: true, responseStyle: "summary" }; // default
      }
    };

    const responsePreference = await analyzeResponsePreference(cleanedQuery);

    // STEP 3A: Specific Verse Detection - Check if user is requesting exact Bible verses (e.g., "John 3:16")
    // Extract book name and verse reference patterns from user query
    // UTILITY: Extract verse references like "John 3:16", "1 Corinthians 13:4-7" from text
    const extractVerseReferences = (text: string) => {
      const results = [];

      // Pattern 1: "Book Chapter:Verse" (e.g., "John 12:2", "1 Corinthians 13:4")
      // Use lookahead and lookbehind to be more precise about boundaries
      const simplePattern =
        /(?:^|\s)([1-3]?\s*[a-zA-Z]+(?:\s+[a-zA-Z]+)*?)\s+(\d+):(\d+)(?:-(\d+))?(?=\s|$)/gi;
      let match;

      while ((match = simplePattern.exec(text)) !== null) {
        results.push([
          match[0].trim(), // full match
          match[1].trim(), // book name
          match[2], // chapter
          match[3], // start verse
          match[4], // end verse (if range)
        ]);
      }

      return results;
    };

    const verseMatches = extractVerseReferences(cleanedQuery);

    // If we found specific verse requests, handle them directly (bypasses vector search)
    if (verseMatches.length > 0) {
      // This is a specific verse request, get exact verses by ID lookup
      const requestedVerses = [];

      for (const match of verseMatches) {
        const [, bookName, chapter, startVerse, endVerse] = match;
        const chapterNum = parseInt(chapter);
        const startVerseNum = parseInt(startVerse);
        const endVerseNum = endVerse ? parseInt(endVerse) : startVerseNum;

        // Use AI to normalize the book name (handles misspellings and abbreviations)
        const rawBookName = bookName.trim();
        const normalizedBookName = await normalizeBookName(rawBookName);
        if (!normalizedBookName) {
          continue; // Skip this match if we can't identify the book
        }

        // Try to fetch each verse directly by ID using the normalized book name
        // This is faster than vector search for exact verse requests
        for (
          let verseNum = startVerseNum;
          verseNum <= endVerseNum;
          verseNum++
        ) {
          const verseId = `${normalizedBookName}-${chapterNum}-${verseNum}`;

          const exactMatch = await fetchVectorById(
            process.env.PINECONE_INDEX_NAME!,
            verseId
          );

          if (exactMatch) {
            requestedVerses.push(exactMatch);
          }
        }
      }

      if (requestedVerses.length > 0) {
        const documents = requestedVerses.map((match: any) => ({
          id: match.id,
          score: match.score,
          text: match.metadata?.text || "No text available",
          abbrev: match.metadata?.abbrev,
          book: match.metadata?.book,
          chapter: match.metadata?.chapter,
          verse: match.metadata?.verse,
        }));

        const verses = documents
          .map((doc) => {
            const bookName = doc.book || doc.abbrev.toUpperCase();
            const cleanText = doc.text.replace(/\{([^}]*)\}/g, "$1");
            return `${bookName} ${doc.chapter}:${doc.verse} - ${cleanText}`;
          })
          .join("\n\n");

        // Generate AI response based on user's stated preference (verse-only, summary, or detailed)
        let aiResponse = verses; // fallback to just verses if AI response fails

        if (responsePreference.wantsSummary) {
          try {
            const promptText =
              responsePreference.responseStyle === "detailed"
                ? `You are a helpful Bible assistant. Here are the specific Bible verses the user requested:

${verses}

Please provide a detailed explanation including:
- What this verse means in its original context
- Key themes and theological significance  
- How it applies to life today
- Any relevant background or commentary
- Keep your response thorough but under 200 words.`
                : `You are a helpful Bible assistant. Here are relevant Bible verses for the user's query about "${query}":

${verses}

Please:
- Summarize the key message in 2-3 sentences.
- Optionally give practical advice or context.
- Make it clear, concise, and encouraging.
- Keep your response under 150 words.`;

            const completion = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: "You are a knowledgeable Bible assistant.",
                },
                { role: "user", content: promptText },
              ],
            });

            const summary = completion.choices[0]?.message?.content || "";
            aiResponse = summary
              ? `${verses}\n\n📝 Summary:\n${summary}`
              : verses;
          } catch (aiError) {
            aiResponse = verses; // fallback to verses only
          }
        }

        return NextResponse.json({
          query,
          documents,
          total: documents.length,
          aiResponse,
          verses: verses,
        });
      }
    }

    // STEP 3B: Vector Search - If not a specific verse request, do semantic search
    const queryEmbedding = await createEmbedding(cleanedQuery, 1536);

    // Search vector database for semantically similar Bible passages
    const results = await queryVectors(
      process.env.PINECONE_INDEX_NAME!,
      queryEmbedding,
      topK,
      true
    );

    // Transform raw Pinecone results into structured document format
    const documents = results.map((match: any) => ({
      id: match.id,
      score: match.score,
      text: match.metadata?.text || "No text available",
      abbrev: match.metadata?.abbrev,
      book: match.metadata?.book,
      chapter: match.metadata?.chapter,
      verse: match.metadata?.verse,
    }));

    // STEP 4: Response Generation - Create AI summary based on user preference
    let aiResponse = "";
    if (documents.length > 0) {
      // Format search results into readable verse format
      const verses = documents
        .map((doc) => {
          const bookName = doc.book || doc.abbrev.toUpperCase();
          const cleanText = doc.text.replace(/\{([^}]*)\}/g, "$1"); // Convert {word} to word (italics)
          return `${bookName} ${doc.chapter}:${doc.verse} - ${cleanText}`;
        })
        .join("\n\n");

      // Generate AI summary if user wants explanation (not just verses)
      if (responsePreference.wantsSummary) {
        const assistantPrompt =
          responsePreference.responseStyle === "detailed"
            ? `You are a helpful Bible assistant. Here are relevant Bible verses for the user's query about "${query}":

${verses}

Please provide a detailed explanation including:
- What these verses mean in their original context
- Key themes and theological significance  
- How they apply to life today
- Practical guidance or encouragement
- Keep your response thorough but under 200 words.`
            : `You are a helpful Bible assistant. Here are relevant Bible verses for the user's query about "${query}":

${verses}

Please:
- Summarize the key message in 2-3 sentences.
- Optionally give practical advice or context.
- Make it clear, concise, and encouraging.
- Keep your response under 150 words.`;

        // Generate contextual AI response using GPT-4o-mini
        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: "You are a knowledgeable Bible assistant.",
              },
              { role: "user", content: assistantPrompt },
            ],
          });

          const summary = completion.choices[0]?.message?.content || "";
          aiResponse = summary
            ? `${verses}\n\n📝 Summary:\n${summary}`
            : verses;
        } catch (aiError) {
          // Fallback to simple verse listing if AI response fails
          aiResponse = `Here are some relevant Bible verses about "${query}":\n\n${verses}`;
        }
      } else {
        // User specifically requested verses only (no summary or explanation)
        aiResponse = verses;
      }
    }

    // Return complete response with search results and AI summary
    return NextResponse.json({
      query,
      documents,
      total: documents.length,
      aiResponse,
      verses:
        documents.length > 0
          ? documents
              .map((doc) => {
                const bookName = doc.book || doc.abbrev.toUpperCase();
                const cleanText = doc.text.replace(/\{([^}]*)\}/g, "$1"); // Convert {word} to word (italics)
                return `${bookName} ${doc.chapter}:${doc.verse} - ${cleanText}`;
              })
              .join("\n\n")
          : "",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
