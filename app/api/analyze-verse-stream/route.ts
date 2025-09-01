import { NextRequest } from "next/server";
import { analyzeVerses, analyzeSpecificVerse } from "../../../libs/verseAnalysis";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: NextRequest) {
  try {
    const { query, topK = 5, specificVerses } = await request.json();

    if (!query) {
      return new Response("Query is required", { status: 400 });
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

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial status
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", message: "Searching Bible verses..." })}\n\n`));

          // Get verses with original language analysis
          let analysisResult;
          
          if (specificVerses && Array.isArray(specificVerses) && specificVerses.length > 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", message: "Analyzing specific verses..." })}\n\n`));
            
            const versePromises = specificVerses.map(verseInfo => 
              analyzeSpecificVerse(verseInfo.book, verseInfo.chapter, verseInfo.verse)
            );
            
            const verseResults = await Promise.all(versePromises);
            const allVerses = verseResults.flatMap(result => result.verses);
            
            // Send verses first
            const formattedVerses = allVerses.map(verse => ({
              reference: `${verse.book} ${verse.chapter}:${verse.verse}`,
              kjvText: verse.kjvText,
              originalText: verse.originalText || null,
              originalLanguage: verse.originalLanguage || null,
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
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", message: "Finding relevant verses..." })}\n\n`));
            
            analysisResult = await analyzeVerses(query, Math.min(topK, 10));
            
            // Send verses
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

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "verses", verses: formattedVerses })}\n\n`));
          }

          // Stream the AI explanation
          if (analysisResult.verses && analysisResult.verses.length > 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", message: "Generating analysis with original languages..." })}\n\n`));

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

            // Stream the completion
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

            for await (const chunk of completion) {
              const content = chunk.choices[0]?.delta?.content;
              if (content) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "explanation", content })}\n\n`));
              }
            }
          }

          // Send completion signal
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "complete" })}\n\n`));
          controller.close();

        } catch (error) {
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