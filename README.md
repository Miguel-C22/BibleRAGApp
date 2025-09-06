# BibleRAG - Bible Study with Original Languages

A Next.js application that provides Bible verse search with original Hebrew/Greek text analysis using Pinecone vector database and OpenAI.

## Features

- **KJV Bible Search**: Search through King James Version with semantic similarity
- **Original Language Analysis**: Get Hebrew (OT) and Greek (NT) texts with English explanations
- **Verse Explanations**: AI-powered explanations based on original language meanings
- **Multiple Query Types**:
  - Specific verses ("What does John 3:16 mean?")
  - Topical searches ("Give me 5 verses about love")

## Environment Variables

Create a `.env.local` file in the root directory with:

```bash
# OpenAI API Key for embeddings and completions
OPENAI_API_KEY=your_openai_api_key_here

# Pinecone configuration
PINECONE_API_KEY=your_pinecone_api_key_here
PINECONE_INDEX_NAME=bible-kjv
PINECONE_INDEX_HEBREW_NAME=bible-hebrew
PINECONE_INDEX_GREEK_NAME=bible-greek
```

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Set up your environment variables (see above)

3. Load KJV Bible data to Pinecone (if not already done):

```bash
npm run vectorize
```

4. Parse your Hebrew OT XML files to JSON:

```bash
npm run parse-hebrew-xml
```

5. Parse your Greek NT XML files to JSON:

```bash
npm run parse-greek-xml
```

6. Load Hebrew/Greek original language data to separate Pinecone indexes:

```bash
npm run load-originals
```

7. Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### `/api/analyze-verse` (POST)

Analyzes Bible verses with original language context.

**Request Body:**

```json
{
  "query": "What does John 3:16 mean?",
  "topK": 5,
  "specificVerses": [
    {
      "book": "John",
      "chapter": 3,
      "verse": 16
    }
  ]
}
```

**Response:**

```json
{
  "query": "What does John 3:16 mean?",
  "verses": [
    {
      "reference": "John 3:16",
      "kjvText": "For God so loved the world...",
      "originalText": "οὕτως γὰρ ἠγάπησεν ὁ θεὸς τὸν κόσμον...",
      "originalLanguage": "greek",
      "testament": "NT"
    }
  ],
  "explanation": "Detailed explanation based on original Greek...",
  "analysisType": "specific_verses"
}
```

### `/api/search-rerank` (POST)

Original Bible search with reranking (KJV only).

### `/api/parse-intent` (POST)

Parses user queries to extract verse references and intent.

## Project Structure

- `/app/api/` - Next.js API routes
- `/libs/` - Core functionality (OpenAI, Pinecone, verse analysis)
- `/scripts/` - Data loading and processing scripts
- `/data/` - Bible data files (KJV JSON, original languages)

## Welcome Page
<img width="1728" height="960" alt="image" src="https://github.com/user-attachments/assets/f48a9a19-354c-427e-82a4-05b1c20dd58f" />

## Response Example
<img width="1724" height="938" alt="image" src="https://github.com/user-attachments/assets/506a0f00-107e-414b-b6e8-0056c27a2635" />


