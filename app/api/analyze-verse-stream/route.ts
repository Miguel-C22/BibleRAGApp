import { NextRequest } from "next/server";
import { analyzeVerses, analyzeSpecificVerse } from "../../../libs/verseAnalysis";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// This route provides STREAMING Bible analysis with Hebrew/Greek insights
// It sends back data piece by piece (verses first, then analysis) for better user experience
export async function POST(request: NextRequest) {
  try {
    // Get the user's question and optional parameters
    const { query, topK = 5, specificVerses } = await request.json();

    if (!query) {
      return new Response("Query is required", { status: 400 });
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

      // If not Bible-related, send rejection message as stream
      if (!isRelevant) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            const nonBiblicalResponse = JSON.stringify({
              type: "error",
              message: "I only answer questions related to the Bible, Christianity, and faith. Please ask me about scripture, biblical stories, Christian teachings, or spiritual guidance."
            });
            controller.enqueue(encoder.encode(`data: ${nonBiblicalResponse}\n\n`));
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Transfer-Encoding": "chunked",
          },
        });
      }
    } catch (relevanceError) {
      console.error("Relevance check failed:", relevanceError);
    }

    // STEP 2: Set up streaming response (sends data piece by piece to user)
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial status update to user
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", message: "Searching Bible verses..." })}\n\n`));

          // STEP 3A: Handle specific verses (like "John 3:16") or general search
          let analysisResult;
          
          // If user asked for specific verses (like "John 3:16"), get those exactly
          if (specificVerses && Array.isArray(specificVerses) && specificVerses.length > 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", message: "Analyzing specific verses..." })}\n\n`));
            
            // Look up each specific verse with Hebrew/Greek text
            const versePromises = specificVerses.map(verseInfo => 
              analyzeSpecificVerse(verseInfo.book, verseInfo.chapter, verseInfo.verse)
            );
            
            const verseResults = await Promise.all(versePromises);
            const allVerses = verseResults.flatMap(result => result.verses);
            
            // Send the verses to user first (before analysis)
            const formattedVerses = allVerses.map(verse => ({
              reference: `${verse.book} ${verse.chapter}:${verse.verse}`,
              kjvText: verse.kjvText,                    // English text
              originalText: verse.originalText || null,   // Hebrew/Greek text
              originalLanguage: verse.originalLanguage || null, // "hebrew" or "greek"
              testament: verse.testament,
              book: verse.book,
              chapter: verse.chapter,
              verse: verse.verse
            }));

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "verses", verses: formattedVerses })}\n\n`));

            analysisResult = {
              verses: allVerses,
              query
            };
          } else {
            // STEP 3B: For general questions, search for relevant verses
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", message: "Finding relevant verses..." })}\n\n`));
            
            // Search for verses that match the user's question
            analysisResult = await analyzeVerses(query, Math.min(topK, 10));
            
            // Send the found verses to user first
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

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "verses", verses: formattedVerses })}\n\n`));
          }

          // STEP 4: Generate detailed analysis with Hebrew/Greek insights
          if (analysisResult.verses && analysisResult.verses.length > 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", message: "Generating analysis with original languages..." })}\n\n`));

            // Combine all verses with their original language texts for AI analysis
            const versesText = analysisResult.verses.map(verse => 
              `${verse.book} ${verse.chapter}:${verse.verse}: ${verse.kjvText}${verse.originalText ? `\n${verse.originalLanguage === 'hebrew' ? 'Hebrew' : 'Greek'}: ${verse.originalText}` : ''}`
            ).join('\n\n');
            
            const analysisPrompt = `You are a Bible scholar with expertise in Hebrew and Greek. A user asked: "${query}"

Here are the relevant verses with original language texts:

${versesText}

Please provide a comprehensive but well-structured explanation that covers:

### Relationship to the Question
How these verses connect to what the user asked

### Key Word Analysis  
Important Hebrew/Greek terms and their deeper meanings (use **bold** sparingly for key terms only)

### Historical Context
Cultural and historical background that illuminates the passage

### Original Language Insights
How the Hebrew/Greek adds depth beyond English translations

### Practical Application
How this applies to believers today

Format your response with clear sections using ### headers and natural paragraph breaks. Use **bold** sparingly only for truly important terms. Write in a conversational, accessible style that's easy to read.`;

            // STEP 5: Stream AI analysis back to user word by word
            const completion = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: 'You are a knowledgeable Bible scholar who explains scripture with attention to original languages, historical context, and practical application.'
                },
                {
                  role: 'user',
                  content: analysisPrompt
                }
              ],
              max_tokens: 1000,
              temperature: 0.7,
              stream: true
            });

            // Send each word/phrase as it comes from AI (creates typing effect)
            for await (const chunk of completion) {
              const content = chunk.choices[0]?.delta?.content;
              if (content) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "explanation", content })}\n\n`));
              }
            }
          }

          // Tell the frontend we're done
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "complete" })}\n\n`));
          controller.close();

        } catch (error) {
          // If anything goes wrong, send error message to user
          console.error("Error in streaming response:", error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: "error", 
            message: "An error occurred while analyzing the verses. Please try again." 
          })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });

  } catch (error) {
    console.error("Error in analyze-verse-stream endpoint:", error);
    return new Response("Internal server error", { status: 500 });
  }
}