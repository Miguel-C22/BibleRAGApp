import { NextRequest, NextResponse } from "next/server";
import { analyzeVerses, analyzeSpecificVerse } from "../../../libs/verseAnalysis";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: NextRequest) {
  try {
    const { query, topK = 5, specificVerses } = await request.json();

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // Check if question is Bible-related first
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

    // Parse the query to see if it's asking for specific verses
    let analysisResult;
    
    if (specificVerses && Array.isArray(specificVerses) && specificVerses.length > 0) {
      // Handle specific verse requests like "John 3:16"
      const versePromises = specificVerses.map(verseInfo => 
        analyzeSpecificVerse(verseInfo.book, verseInfo.chapter, verseInfo.verse)
      );
      
      const verseResults = await Promise.all(versePromises);
      
      // Combine all verses and explanations
      const allVerses = verseResults.flatMap(result => result.verses);
      
      // Generate a combined explanation if multiple verses
      let combinedExplanation = '';
      if (verseResults.length === 1) {
        combinedExplanation = verseResults[0].explanation;
      } else {
        const versesText = allVerses.map(verse => 
          `${verse.book} ${verse.chapter}:${verse.verse}: ${verse.kjvText}${verse.originalText ? `\n${verse.originalLanguage === 'hebrew' ? 'Hebrew' : 'Greek'}: ${verse.originalText}` : ''}`
        ).join('\n\n');
        
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
          combinedExplanation = verseResults.map(result => result.explanation).join('\n\n---\n\n');
        }
      }
      
      analysisResult = {
        verses: allVerses,
        explanation: combinedExplanation,
        query,
        analysisType: 'specific_verses'
      };
    } else {
      // Handle general topical queries like "verses about love"
      analysisResult = await analyzeVerses(query, Math.min(topK, 10));
      analysisResult.analysisType = 'topical_search';
    }

    // Format the response
    const formattedVerses = analysisResult.verses.map(verse => ({
      reference: `${verse.book} ${verse.chapter}:${verse.verse}`,
      kjvText: verse.kjvText,
      originalText: verse.originalText || null,
      originalLanguage: verse.originalLanguage || null,
      testament: verse.testament,
      book: verse.book,
      chapter: verse.chapter,
      verse: verse.verse
    }));

    return NextResponse.json({
      query: analysisResult.query,
      verses: formattedVerses,
      explanation: analysisResult.explanation,
      analysisType: analysisResult.analysisType,
      total: formattedVerses.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
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