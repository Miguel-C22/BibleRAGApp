"use client";

import { suggestedQuestions } from "@/consts/global";
import { useState } from "react";

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentResponse, setCurrentResponse] = useState("");
  const [currentStatus, setCurrentStatus] = useState("");

  const handleSend = async (text?: string) => {
    const messageText = text || inputValue.trim();
    if (!messageText || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: messageText,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);
    setCurrentResponse("");
    setCurrentStatus("");

    try {
      // Parse the user's intent first
      // CURRENT ROUTE: /api/parse-intent - Cleans up user input and extracts intent
      const intentResponse = await fetch("/api/parse-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: messageText }),
      });

      const intentData = await intentResponse.json();
      const cleanedQuery = intentData.cleanedQuery || messageText;
      const topK = intentData.topK || 5;
      const hasSpecificVerse = intentData.hasSpecificVerse || false;
      const specificVerses = intentData.specificVerses || [];

      // CURRENT ROUTE: /api/analyze-verse-stream - Streams Bible analysis with Hebrew/Greek insights
      // 
      // ALTERNATIVE ROUTES YOU COULD USE INSTEAD:
      //
      // 1. "/api/analyze-verse" - Same analysis but ALL AT ONCE (no streaming)
      //    • Use if: You want simpler code, don't need the typing effect
      //    • Returns: Complete verses + explanation in one response
      //    • Good for: API integrations, when you want all data immediately
      //
      // 2. "/api/search" - Basic Bible search with simple AI summary
      //    • Use if: You want faster, cheaper responses without Hebrew/Greek
      //    • Returns: Verses + brief summary (no original language analysis)
      //    • Good for: Quick verse lookup, when speed > depth
      //
      // 3. "/api/search-rerank" - Advanced search with better relevance ranking
      //    • Use if: You want better search accuracy but still simple responses
      //    • Returns: Reranked verses + AI summary (no Hebrew/Greek)
      //    • Good for: When search quality is important but don't need deep analysis
      //
      const response = await fetch("/api/analyze-verse-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: cleanedQuery,
          topK,
          specificVerses: hasSpecificVerse ? specificVerses : undefined,
        }),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let verses: any[] = [];
      let explanation = "";
      let responseText = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case "status":
                  setCurrentStatus(data.message);
                  break;

                case "verses":
                  verses = data.verses;
                  // Format verses with improved styling
                  const versesFormatted = verses
                    .map((verse: any) => {
                      let verseText = `<div class="border-l-4 border-indigo-600 bg-indigo-50 p-3 my-2 rounded-r-lg">`;
                      verseText += `<div class="mb-2">`;
                      verseText += `<h4 class="font-bold text-lg text-gray-900 mb-1">📖 ${verse.reference}</h4>`;
                      verseText += `<p class="text-gray-800 italic leading-relaxed">${verse.kjvText}</p>`;
                      verseText += `</div>`;

                      if (verse.originalText) {
                        const langName =
                          verse.originalLanguage === "hebrew"
                            ? "HEBREW"
                            : "GREEK";
                        const flag =
                          verse.originalLanguage === "hebrew" ? "🇮🇱" : "🇬🇷";
                        verseText += `<div class="border-t border-indigo-200 pt-2 mt-2">`;
                        verseText += `<div class="flex items-center gap-2 mb-1">`;
                        verseText += `<span class="text-sm font-semibold text-indigo-800">${flag} ${langName}</span>`;
                        verseText += `</div>`;
                        verseText += `<p class="text-gray-700 font-medium">${verse.originalText}</p>`;
                        verseText += `</div>`;
                      }

                      verseText += `</div>`;
                      return verseText;
                    })
                    .join("");

                  if (hasSpecificVerse) {
                    responseText = `${versesFormatted}\n`;
                  } else {
                    responseText = `📝 **Verses about "${messageText}"**\n\n${versesFormatted}\n`;
                  }
                  setCurrentResponse(responseText);
                  break;

                case "explanation":
                  explanation += data.content;
                  setCurrentResponse(responseText + explanation);
                  break;

                case "complete":
                  setCurrentStatus("");
                  const assistantMessage: Message = {
                    id: (Date.now() + 1).toString(),
                    text: responseText + explanation,
                    isUser: false,
                    timestamp: new Date(),
                  };
                  setMessages((prev) => [...prev, assistantMessage]);
                  setCurrentResponse("");
                  break;

                case "error":
                  setCurrentStatus("");
                  const errorMessage: Message = {
                    id: (Date.now() + 1).toString(),
                    text: data.message,
                    isUser: false,
                    timestamp: new Date(),
                  };
                  setMessages((prev) => [...prev, errorMessage]);
                  setCurrentResponse("");
                  return;
              }
            } catch (parseError) {
              console.warn("Failed to parse streaming data:", parseError);
            }
          }
        }
      }
    } catch (error) {
      console.error("Streaming error:", error);
      setCurrentStatus("");
      setCurrentResponse("");

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text:
          error instanceof Error
            ? error.message
            : "I'm sorry, I'm having trouble accessing the Bible verses right now. Please try again later.",
        isUser: false,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  if (messages.length === 0) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col">
        {/* Header */}
        <header className="bg-white px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center cursor-pointer hover:bg-indigo-700 transition-colors"
              onClick={() => setMessages([])}
            >
              <svg
                className="w-6 h-6 text-white"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M6 2c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2H6zm0 2h12v16H6V4zm2 2v2h8V6H8zm0 4v2h8v-2H8zm0 4v2h5v-2H8z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                BibleRAG - Original Languages
              </h1>
              <p className="text-sm text-gray-600">
                Bible study with Hebrew & Greek analysis
              </p>
            </div>
          </div>
        </header>

        {/* Welcome Content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-20 h-20 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-8">
              <svg
                className="w-10 h-10 text-white"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </div>

            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Welcome to BibleRAG
            </h2>
            <p className="text-lg text-gray-600 mb-12">
              Experience Bible study like never before. I analyze verses using
              the original Hebrew and Greek texts to provide the most accurate
              understanding of God's Word. Ask about specific verses or topics!
            </p>

            <div className="mb-12">
              <h3 className="text-xl font-semibold text-gray-900 mb-6">
                Get started with these questions:
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
                {suggestedQuestions.map((question, index) => (
                  <button
                    key={index}
                    onClick={() => handleSend(question)}
                    className="p-4 text-left bg-white rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors duration-200"
                  >
                    <span className="text-gray-800">{question}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Input Area */}
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-3">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Ask anything about the Bible..."
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-black"
              />
              <button
                onClick={() => handleSend()}
                disabled={!inputValue.trim() || isLoading}
                className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Chat interface
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-white px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center cursor-pointer hover:bg-indigo-700 transition-colors"
            onClick={() => setMessages([])}
          >
            <svg
              className="w-6 h-6 text-white"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M6 2c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2H6zm0 2h12v16H6V4zm2 2v2h8V6H8zm0 4v2h8v-2H8zm0 4v2h5v-2H8z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              BibleRAG - Original Languages
            </h1>
            <p className="text-sm text-gray-600">
              Bible study with Hebrew & Greek analysis
            </p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.isUser ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-4xl rounded-2xl px-6 py-4 ${
                  message.isUser
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-gray-900 border border-gray-200 shadow-sm"
                }`}
              >
                {!message.isUser && (
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                      <span className="text-indigo-600 text-sm font-medium">
                        👑
                      </span>
                    </div>
                    <span className="text-sm font-medium text-gray-600">
                      KING JAMES VERSION
                    </span>
                  </div>
                )}
                <div>
                  <div
                    className="whitespace-pre-wrap leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: message.text
                        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                        .replace(
                          /^### (.*$)/gm,
                          "<h3 style='font-weight: bold; color: black;'>$1</h3>"
                        )
                        .replace(/\n/g, "<br>"),
                    }}
                  />
                </div>
                <p
                  className={`text-xs mt-3 pt-2 border-t ${
                    message.isUser
                      ? "text-indigo-200 border-indigo-500"
                      : "text-gray-500 border-gray-100"
                  }`}
                >
                  {formatTime(message.timestamp)}
                </p>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-4xl rounded-2xl px-6 py-4 bg-white text-gray-900 border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                    <span className="text-indigo-600 text-sm font-medium">
                      👑
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-600">
                    KING JAMES VERSION
                  </span>
                </div>
                {currentStatus ? (
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse"></div>
                    <span className="text-sm text-gray-600">
                      {currentStatus}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: "0.1s" }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    ></div>
                  </div>
                )}
                {currentResponse && (
                  <div>
                    <div
                      className="whitespace-pre-wrap leading-relaxed"
                      dangerouslySetInnerHTML={{
                        __html: currentResponse
                          .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                          .replace(
                            /^### (.*$)/gm,
                            "<h3 style='font-weight: bold; color: black;'>$1</h3>"
                          )
                          .replace(/\n/g, "<br>"),
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-3">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Ask anything about the Bible..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-black"
            />
            <button
              onClick={() => handleSend()}
              disabled={!inputValue.trim() || isLoading}
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
