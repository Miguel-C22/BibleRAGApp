import { NextRequest, NextResponse } from "next/server";
import { createEmbedding } from "../../../libs/openai";
import { queryVectors, rerank } from "../../../libs/pinecone";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/*

	•	Uses Pinecone search + OpenAI reranking.
	•	Slower and slightly more expensive (2 API calls: OpenAI → Pinecone → OpenAI).
	•	Results are re-ordered by OpenAI for better semantic relevance.
	•	Good when:
	•	Accuracy is critical (chatbots, Q&A, content search).
	•	Pinecone’s ranking alone sometimes gives less relevant results.
	•	You want the “best match” instead of just “close matches.”

*/

export async function POST(request: NextRequest) {
  try {
    // Extract query and topK from request body
    const { query, topK = 10 } = await request.json();

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
      const relevanceResponse = relevanceCheck.choices[0]?.message?.content?.trim().toUpperCase();
      
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
              'You are a text cleaner. Fix spelling, grammar, and formatting in Bible verse requests. Only return the corrected text, nothing else. Keep the same intent and meaning. Examples: "giv me jon 3:16" → "give me john 3:16", "psams 23" → "psalms 23", "tel me about luv" → "tell me about love"',
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

    // STEP 3: Vector Search - Convert query to embedding and search Pinecone for similar Bible verses
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

    // STEP 4: Reranking - Use OpenAI's reranking model for better semantic relevance
    const rerankedResults = await rerank(query, documents, 5);

    // Combine original documents with rerank scores for final ranking
    const rerankedDocuments = rerankedResults.data.map((result: any) => {
      const originalDoc = documents[result.index];
      return {
        ...originalDoc,
        rerankScore: result.score,
      };
    });

    // STEP 5: Response Generation - Format verses and create AI summary
    let aiResponse = "";
    
    // Format reranked documents into readable verse format
    const verses = rerankedDocuments
      .map((doc) => {
        const bookName = doc.book || doc.abbrev.toUpperCase();
        // Remove any markup from verse text
        const cleanText = doc.text.replace(/\{([^}]*)\}/g, "$1");
        return `${bookName} ${doc.chapter}:${doc.verse} - ${cleanText}`;
      })
      .join("\n\n");

    // Generate AI summary if we found relevant verses
    if (rerankedDocuments.length > 0) {
      const assistantPrompt = `
You are a helpful Bible assistant. Here are relevant Bible verses for the user's query about "${query}":

${verses}

Please:
- Summarize the key message in 2-3 sentences.
- Optionally give practical advice or context.
- Make it clear, concise, and encouraging.
- Keep your response under 150 words.
`;

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

        aiResponse = completion.choices[0]?.message?.content || "";
      } catch (aiError) {
        // Fallback to simple verse listing if AI response fails
        aiResponse = `Here are some relevant Bible verses about "${query}":\n\n${verses}`;
      }
    }

    // Return complete response with reranked results and AI summary
    return NextResponse.json({
      query,
      documents: rerankedDocuments,
      total: rerankedDocuments.length,
      aiResponse,
      verses: verses,
      reranked: true, // Flag indicating this used reranking
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
