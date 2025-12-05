"use client";

import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { useState } from "react";

export function Chat() {
  const [input, setInput] = useState("");

  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      sendMessage(input);
      setInput("");
    }
  };

  return (
    <div className="flex h-screen w-full flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((message) => (
          <div
            className={`mb-4 ${
              message.role === "assistant" ? "text-blue-600" : "text-gray-800"
            }`}
            key={message.id}
          >
            <div className="mb-1 font-semibold">
              {message.role === "assistant" ? "Assistant" : "You"}
            </div>
            <div>
              {message.parts.map((part, idx) => {
                if (part.type === "thinking") {
                  return (
                    <div
                      className="mb-2 text-gray-500 text-sm italic"
                      key={`${message.id}-thinking-${idx}`}
                    >
                      💭 Thinking: {part.content}
                    </div>
                  );
                }
                if (part.type === "text") {
                  return (
                    <div key={`${message.id}-text-${idx}`}>{part.content}</div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <form className="border-t p-4" onSubmit={handleSubmit}>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border px-4 py-2"
            disabled={isLoading}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            type="text"
            value={input}
          />
          <button
            className="rounded-lg bg-blue-600 px-6 py-2 text-white disabled:opacity-50"
            disabled={!input.trim() || isLoading}
            type="submit"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
