import { NextRequest, NextResponse } from "next/server";
import { analyzeVerses, analyzeSpecificVerse } from "../../../libs/verseAnalysis";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// This route provides NON-STREAMING Bible analysis with Hebrew/Greek insights
// Unlike the streaming version, this sends back ALL data at once when complete
export async function POST(request: NextRequest) {
  try {
    // Get the user's question and optional parameters
    const { query, topK = 5, specificVerses } = await request.json();

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // STEP 1: Check if this is a Bible-related question (same as other routes)
    try {
      const relevanceCheck = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              'You are a Bible content filter. Respond "YES" only if the question asks about:\n- Bible verses, passages, or books\n- Biblical characters (Jesus, Moses, David, etc.)\n- Christian beliefs, theology, or doctrine\n- Faith, prayer, or spiritual guidance\n- Biblical stories or events\n\nRespond "NO" for everything else including:\n- Weather, news, sports, cooking, technology\n- General knowledge or science questions  \n- Personal problems unrelated to faith\n- Any secular topics\n\nBe very strict. When in doubt, answer "NO".\n\nExamples:\n"What does John 3:16 mean?" → YES\n"What does the Bible say about love?" → YES\n"What is the weather?" → NO\n"How do I cook pasta?" → NO\n"Tell me about Jesus" → YES',
          },
          {
            role: "user",
            content: `"${query}"`,
          },
        ],
        max_tokens: 5,
      });

      const relevanceResponse = relevanceCheck.choices[0]?.message?.content?.trim().toUpperCase();
      const isRelevant = relevanceResponse === "YES";

      // If not Bible-related, return rejection message
      if (!isRelevant) {
        return NextResponse.json({
          query,
          verses: [],
          explanation:
            "I only answer questions related to the Bible, Christianity, and faith. Please ask me about scripture, biblical stories, Christian teachings, or spiritual guidance.",
          analysisType: "not_biblical",
        });
      }
    } catch (relevanceError) {
      console.error("Relevance check failed:", relevanceError);
    }

    // STEP 2: Determine what type of analysis to do
    let analysisResult;
    
    // STEP 2A: Handle specific verses (like "John 3:16")
    if (specificVerses && Array.isArray(specificVerses) && specificVerses.length > 0) {
      // User asked for exact verses - look them up directly
      // Look up each specific verse with Hebrew/Greek text and analysis
      const versePromises = specificVerses.map(verseInfo => 
        analyzeSpecificVerse(verseInfo.book, verseInfo.chapter, verseInfo.verse)
      );
      
      const verseResults = await Promise.all(versePromises);
      
      // Combine all the verses from the results
      const allVerses = verseResults.flatMap(result => result.verses);
      
      // Create explanation that connects multiple verses (if user asked for multiple)
      let combinedExplanation = '';
      if (verseResults.length === 1) {
        // Only one verse - use its individual explanation
        combinedExplanation = verseResults[0].explanation;
      } else {
        // Multiple verses - create combined analysis
        // Combine all verses with their Hebrew/Greek text for AI analysis
        const versesText = allVerses.map(verse => 
          `${verse.book} ${verse.chapter}:${verse.verse}: ${verse.kjvText}${verse.originalText ? `\n${verse.originalLanguage === 'hebrew' ? 'Hebrew' : 'Greek'}: ${verse.originalText}` : ''}`
        ).join('\n\n');
        
        // Ask AI to create comprehensive analysis connecting all the verses
        try {
          const combinedPrompt = `You are a Bible scholar with expertise in Hebrew and Greek. A user asked: "${query}"

Here are the specific verses they mentioned with original language texts:

${versesText}

Please provide a comprehensive explanation that connects these verses and explains:
1. The relationship between these verses and how they relate to the user's question
2. Important Hebrew/Greek word meanings and their significance
3. Historical and cultural context where relevant
4. How the original language adds depth to understanding
5. Practical application for today

Keep your explanation engaging, educational, and accessible to general readers.`;

          const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'You are a knowledgeable Bible scholar who explains scripture with attention to original languages, historical context, and practical application.'
              },
              {
                role: 'user',
                content: combinedPrompt
              }
            ],
            max_tokens: 1000,
            temperature: 0.7
          });

          combinedExplanation = completion.choices[0]?.message?.content || 'Unable to generate explanation.';
        } catch (error) {
          // Fallback: just combine individual explanations if AI fails
          combinedExplanation = verseResults.map(result => result.explanation).join('\n\n---\n\n');
        }
      }
      
      analysisResult = {
        verses: allVerses,
        explanation: combinedExplanation,
        query,
        analysisType: 'specific_verses' // Flag indicating this was specific verses
      };
    } else {
      // STEP 2B: Handle general questions (like "verses about love")
      // Search for relevant verses and generate analysis
      analysisResult = await analyzeVerses(query, Math.min(topK, 10));
      analysisResult.analysisType = 'topical_search'; // Flag indicating this was a search
    }

    // STEP 3: Format all the data for the response
    const formattedVerses = analysisResult.verses.map(verse => ({
      reference: `${verse.book} ${verse.chapter}:${verse.verse}`,
      kjvText: verse.kjvText,                    // English text
      originalText: verse.originalText || null,   // Hebrew/Greek text
      originalLanguage: verse.originalLanguage || null, // "hebrew" or "greek"
      testament: verse.testament,
      book: verse.book,
      chapter: verse.chapter,
      verse: verse.verse
    }));

    // Send back everything at once (verses + complete explanation)
    return NextResponse.json({
      query: analysisResult.query,
      verses: formattedVerses,               // Array of verses with Hebrew/Greek
      explanation: analysisResult.explanation, // Complete AI analysis
      analysisType: analysisResult.analysisType, // "specific_verses" or "topical_search"
      total: formattedVerses.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    // If anything goes wrong, send error response
    console.error("Error in analyze-verse endpoint:", error);
    return NextResponse.json(
      { 
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}