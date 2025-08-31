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
    const { query, topK = 10 } = await request.json();

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }


    // Check if question is Bible-related FIRST using original query
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

      const relevanceResponse = relevanceCheck.choices[0]?.message?.content?.trim().toUpperCase();
      
      const isRelevant = relevanceResponse === "YES";

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

    // First, clean up the query for spelling/grammar issues
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

      cleanedQuery =
        cleanupResponse.choices[0]?.message?.content?.trim() || query;
    } catch (cleanupError) {
      // Query cleanup failed, using original
    }

    const queryEmbedding = await createEmbedding(cleanedQuery, 1536);

    const results = await queryVectors(
      process.env.PINECONE_INDEX_NAME!,
      queryEmbedding,
      topK,
      true
    );

    const documents = results.map((match: any) => ({
      id: match.id,
      score: match.score,
      text: match.metadata?.text || "No text available",
      abbrev: match.metadata?.abbrev,
      book: match.metadata?.book,
      chapter: match.metadata?.chapter,
      verse: match.metadata?.verse,
    }));

    const rerankedResults = await rerank(query, documents, 5);

    const rerankedDocuments = rerankedResults.data.map((result: any) => {
      const originalDoc = documents[result.index];
      return {
        ...originalDoc,
        rerankScore: result.score,
      };
    });

    // Generate AI response with the reranked results
    let aiResponse = "";
    const verses = rerankedDocuments
      .map((doc) => {
        const bookName = doc.book || doc.abbrev.toUpperCase();
        const cleanText = doc.text.replace(/\{([^}]*)\}/g, "$1");
        return `${bookName} ${doc.chapter}:${doc.verse} - ${cleanText}`;
      })
      .join("\n\n");

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
        aiResponse = `Here are some relevant Bible verses about "${query}":\n\n${verses}`;
      }
    }

    return NextResponse.json({
      query,
      documents: rerankedDocuments,
      total: rerankedDocuments.length,
      aiResponse,
      verses: verses,
      reranked: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
