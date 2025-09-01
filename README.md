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

**Data Sources Explained:**
- **Hebrew OT**: Parsed from your XML files in `/data/HebrewOT/` → `bible-hebrew` index
- **Greek NT**: Parsed from your XML files in `/data/GreekNT/` → `bible-greek` index  
- **Complete Coverage**: All 39 Hebrew OT books + 27 Greek NT books
- **Separate Indexes**: Hebrew and Greek stored in dedicated indexes for better organization
- **Batch Processing**: Handles large datasets without token limits

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

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## API Endpoints

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

## Usage Examples

1. **Specific Verse Analysis:**
   - "What does John 3:16 mean?"
   - "Explain Romans 8:28 in the original Greek"

2. **Topical Searches:**
   - "Give me 5 verses about love"
   - "Show me verses about faith and hope"

3. **Multiple Verse Comparison:**
   - "Compare John 3:16 and 1 John 4:8"
