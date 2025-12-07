"use client";

import type { StreamChunk, ToolCallPart, ToolResultPart } from "@tanstack/ai";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { useState } from "react";
import type { WeatherOutput } from "./api/chat/tools";

/** Safely parse JSON, returning null on failure (e.g., incomplete streaming JSON) */
const safeParseJSON = (json: string): unknown | null => {
  if (!json || json.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
};

/** Type guard to check if output matches weather schema */
const isWeatherOutput = (output: unknown): output is WeatherOutput =>
  typeof output === "object" &&
  output !== null &&
  "temperature" in output &&
  "conditions" in output &&
  "location" in output;

/** Renders weather tool output in a nice format */
const WeatherResult = ({ data }: { data: WeatherOutput }) => (
  <div className="mt-2 rounded-md bg-blue-50 p-3 text-sm">
    <div className="flex items-center gap-2">
      <span className="text-2xl">🌡️</span>
      <span className="font-bold text-blue-800">{data.temperature}°C</span>
    </div>
    <div className="mt-1 text-gray-700">
      <strong>Conditions:</strong> {data.conditions}
    </div>
    <div className="text-gray-700">
      <strong>Location:</strong> {data.location}
    </div>
  </div>
);

/** Renders tool output based on tool name */
const ToolOutput = ({
  toolName,
  output,
}: {
  toolName: string;
  output: unknown;
}) => {
  if (toolName === "get_weather" && isWeatherOutput(output)) {
    return <WeatherResult data={output} />;
  }
  return (
    <pre className="mt-2 text-green-600 text-xs">
      {JSON.stringify(output, null, 2)}
    </pre>
  );
};

/** Renders a tool-call part with its linked result */
const ToolCallCard = ({
  part,
  result,
  messageId,
  idx,
  toolInputs,
}: {
  part: ToolCallPart;
  result: ToolResultPart | undefined;
  messageId: string;
  idx: number;
  toolInputs: Map<string, unknown>;
}) => {
  // Use stored input from TOOL_CALL_END if available (OpenAI sends args here)
  // Otherwise try parsing part.arguments
  const storedInput = toolInputs.get(part.id);
  let parsedArgs: unknown | null;
  if (storedInput !== undefined) {
    // Use captured input from TOOL_CALL_END
    parsedArgs = storedInput;
  } else {
    // Try parsing part.arguments (may be empty for OpenAI)
    const shouldParse =
      part.state === "input-complete" ||
      part.state === "approval-requested" ||
      part.state === "approval-responded";
    parsedArgs = shouldParse ? safeParseJSON(part.arguments) : null;
  }

  // Use part.output (already parsed for client tools) or parse result content
  const isResultComplete = result?.state === "complete";
  const output =
    part.output ?? (isResultComplete ? safeParseJSON(result.content) : null);

  // Display args: parsed if complete, raw if streaming, placeholder if empty
  let displayArgs: string;
  if (parsedArgs !== null) {
    // Complete - show formatted JSON
    displayArgs = JSON.stringify(parsedArgs, null, 2);
  } else if (part.arguments) {
    // Streaming - show raw JSON
    displayArgs = part.arguments;
  } else {
    // Empty
    displayArgs = "";
  }

  return (
    <div
      className="mb-2 rounded-lg border bg-gray-50 p-3"
      key={`${messageId}-tool-call-${idx}`}
    >
      <div className="mb-1 font-semibold text-gray-700 text-sm">
        🔧 Tool: {part.name}
        {part.state ? (
          <span className="ml-2 text-gray-500 text-xs">({part.state})</span>
        ) : null}
      </div>
      <pre className="text-gray-600 text-xs">Input: {displayArgs}</pre>
      {output !== null ? (
        <ToolOutput output={output} toolName={part.name} />
      ) : (
        <div className="mt-2 text-gray-400 text-xs">⏳ Executing...</div>
      )}
    </div>
  );
};

export function Chat() {
  const [input, setInput] = useState("");
  const [toolInputs, setToolInputs] = useState<Map<string, unknown>>(new Map());

  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    onChunk: (chunk: StreamChunk) => {
      // Capture complete arguments from TOOL_CALL_END
      // OpenAI sends complete args here, not in part.arguments
      if (chunk.type === "TOOL_CALL_END" && chunk.input !== undefined) {
        setToolInputs((prev) => {
          const next = new Map(prev);
          // chunk.input is already parsed
          next.set(chunk.toolCallId, chunk.input);
          return next;
        });
      }
    },
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
        {messages.map((message) => {
          // Collect tool results for linking
          const toolResults = message.parts
            .filter((p): p is ToolResultPart => p.type === "tool-result")
            .reduce(
              (acc, r) => {
                acc[r.toolCallId] = r;
                return acc;
              },
              {} as Record<string, ToolResultPart>
            );

          return (
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
                        className="mb-2 whitespace-pre-wrap text-gray-500 text-sm italic"
                        key={`${message.id}-thinking-${idx}`}
                      >
                        💭 Thinking: {part.content}
                      </div>
                    );
                  }
                  if (part.type === "text") {
                    return (
                      <div
                        className="whitespace-pre-wrap"
                        key={`${message.id}-text-${idx}`}
                      >
                        {part.content}
                      </div>
                    );
                  }
                  if (part.type === "tool-call") {
                    return (
                      <ToolCallCard
                        idx={idx}
                        key={`${message.id}-tool-call-${idx}`}
                        messageId={message.id}
                        part={part}
                        result={toolResults[part.id]}
                        toolInputs={toolInputs}
                      />
                    );
                  }
                  // Skip tool-result since we render it with tool-call
                  return null;
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <form className="border-t p-4" onSubmit={handleSubmit}>
        <div className="flex items-end gap-2">
          <textarea
            className="flex-1 resize-none rounded-lg border px-4 py-2"
            disabled={isLoading}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Type a message... (Shift+Enter for new line)"
            rows={Math.min(10, input.split("\n").length)}
            value={input}
          />
          <button
            className="h-fit rounded-lg bg-blue-600 px-6 py-2 text-white disabled:opacity-50"
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
