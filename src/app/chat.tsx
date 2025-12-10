"use client";

import type { ToolCallPart, ToolResultPart } from "@tanstack/ai";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  <Card className="mt-2 border-blue-200 bg-blue-50">
    <CardContent className="pt-6">
      <div className="flex items-center gap-2">
        <span className="text-2xl">🌡️</span>
        <span className="font-bold text-blue-800">{data.temperature}°C</span>
      </div>
      <div className="mt-2 text-gray-700 text-sm">
        <strong>Conditions:</strong> {data.conditions}
      </div>
      <div className="text-gray-700 text-sm">
        <strong>Location:</strong> {data.location}
      </div>
    </CardContent>
  </Card>
);

/** Renders tool output based on tool name */
const ToolOutput = ({
  toolName,
  output,
}: {
  toolName: string;
  output: unknown;
}) => {
  if (
    (toolName === "get_weather" || toolName === "secure_get_weather") &&
    isWeatherOutput(output)
  ) {
    return <WeatherResult data={output} />;
  }
  return (
    <Card className="mt-2 border-green-200 bg-green-50">
      <CardContent className="pt-6">
        <pre className="overflow-x-auto text-green-700 text-xs">
          {JSON.stringify(output, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
};

/** Renders approval prompt UI */
const ApprovalPrompt = ({
  part,
  parsedArgs,
  onApprove,
  onDeny,
}: {
  part: ToolCallPart;
  parsedArgs: unknown;
  onApprove: () => void;
  onDeny: () => void;
}) => {
  const handleApprove = () => {
    console.log("🔵 Approval button clicked for tool:", part.name);
    onApprove();
  };

  const handleDeny = () => {
    console.log("🔴 Denial button clicked for tool:", part.name);
    onDeny();
  };

  return (
    <Card className="mt-2 border-2 border-yellow-500 bg-yellow-50">
      <CardHeader>
        <CardTitle className="text-yellow-800">
          🔒 Approval Required: {part.name}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 text-gray-600 text-sm">
          <pre className="overflow-x-auto rounded bg-gray-100 p-2 text-xs">
            {JSON.stringify(parsedArgs, null, 2)}
          </pre>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
            onClick={handleApprove}
            type="button"
          >
            ✓ Approve
          </button>
          <button
            className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
            onClick={handleDeny}
            type="button"
          >
            ✗ Deny
          </button>
        </div>
      </CardContent>
    </Card>
  );
};

/** Gets parsed arguments from tool inputs or part arguments */
const getParsedArgs = (
  part: ToolCallPart,
  toolInputs: Map<string, unknown>
): unknown | null => {
  const storedInput = toolInputs.get(part.id);
  if (storedInput !== undefined) {
    return storedInput;
  }
  const shouldParse =
    part.state === "input-complete" ||
    part.state === "approval-requested" ||
    part.state === "approval-responded";
  return shouldParse ? safeParseJSON(part.arguments) : null;
};

/** Gets tool output from part or result */
const getToolOutput = (
  part: ToolCallPart,
  result: ToolResultPart | undefined
): unknown | null => {
  // Check part.output first (already parsed for client tools)
  if (part.output !== undefined && part.output !== null) {
    return part.output;
  }

  // Check result content if available (even if streaming)
  if (result?.content) {
    const parsed = safeParseJSON(result.content);
    if (parsed !== null) {
      return parsed;
    }
    // If content exists but can't be parsed, might be incomplete JSON
    // Return null to show "Executing..." state
  }

  return null;
};

/** Formats display arguments for tool call */
const formatDisplayArgs = (
  part: ToolCallPart,
  parsedArgs: unknown | null
): string => {
  if (parsedArgs !== null) {
    return JSON.stringify(parsedArgs, null, 2);
  }
  if (part.arguments) {
    return part.arguments;
  }
  return "";
};

/** Renders tool call content based on state */
const renderToolCallContent = ({
  part,
  parsedArgs,
  output,
  result,
  onApprove,
  onDeny,
}: {
  part: ToolCallPart;
  parsedArgs: unknown | null;
  output: unknown | null;
  result: ToolResultPart | undefined;
  onApprove: (approvalId: string) => void;
  onDeny: (approvalId: string) => void;
}) => {
  // Show approval prompt only when approval is requested
  const needsApproval =
    part.state === "approval-requested" && part.approval !== undefined;

  if (needsApproval && parsedArgs !== null) {
    const approvalId = part.approval?.id;
    if (approvalId) {
      console.log("🔔 Approval request detected:", {
        toolName: part.name,
        approvalId,
        arguments: parsedArgs,
      });
      return (
        <ApprovalPrompt
          onApprove={() => onApprove(approvalId)}
          onDeny={() => onDeny(approvalId)}
          parsedArgs={parsedArgs}
          part={part}
        />
      );
    }
  }

  // Show output if available
  if (output !== null) {
    return <ToolOutput output={output} toolName={part.name} />;
  }

  // Show error state if result has error (check content for error indicators)
  if (result?.content && typeof result.content === "string") {
    const parsed = safeParseJSON(result.content);
    if (parsed !== null && typeof parsed === "object" && "error" in parsed) {
      return (
        <Card className="mt-2 border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="text-red-600 text-sm">
              ❌ Error: {String(parsed.error)}
            </div>
          </CardContent>
        </Card>
      );
    }
  }

  // Show executing state
  return (
    <Card className="mt-2 border-gray-200 bg-gray-50">
      <CardContent className="pt-6">
        <div className="text-gray-500 text-sm">⏳ Executing...</div>
      </CardContent>
    </Card>
  );
};

/** Renders a tool-call part with its linked result */
const ToolCallCard = ({
  part,
  result,
  messageId,
  idx,
  toolInputs,
  onApprove,
  onDeny,
}: {
  part: ToolCallPart;
  result: ToolResultPart | undefined;
  messageId: string;
  idx: number;
  toolInputs: Map<string, unknown>;
  onApprove: (approvalId: string) => void;
  onDeny: (approvalId: string) => void;
}) => {
  const parsedArgs = getParsedArgs(part, toolInputs);
  const output = getToolOutput(part, result);
  const displayArgs = formatDisplayArgs(part, parsedArgs);

  return (
    <Card
      className="mb-2 border-gray-200 bg-gray-50"
      key={`${messageId}-tool-call-${idx}`}
    >
      <CardHeader>
        <CardTitle className="text-gray-700 text-sm">
          🔧 Tool: {part.name}
          {part.state ? (
            <span className="ml-2 text-gray-500 text-xs">({part.state})</span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-2">
          <div className="mb-1 font-semibold text-gray-600 text-xs">Input:</div>
          <Card className="border-gray-200 bg-white">
            <CardContent className="pt-4">
              <pre className="overflow-x-auto text-gray-700 text-xs">
                {displayArgs}
              </pre>
            </CardContent>
          </Card>
        </div>
        {renderToolCallContent({
          onApprove,
          onDeny,
          output,
          part,
          parsedArgs,
          result,
        })}
      </CardContent>
    </Card>
  );
};

export function Chat() {
  const [input, setInput] = useState("");

  const { messages, sendMessage, isLoading, addToolApprovalResponse } = useChat(
    {
      connection: fetchServerSentEvents("/api/chat"),
    }
  );

  // Track tool inputs as they stream in
  const toolInputs = useMemo(() => {
    const inputs = new Map<string, unknown>();
    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type === "tool-call" && part.arguments) {
          const parsed = safeParseJSON(part.arguments);
          if (parsed !== null) {
            inputs.set(part.id, parsed);
          }
        }
      }
    }
    return inputs;
  }, [messages]);

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
                        onApprove={(approvalId) => {
                          addToolApprovalResponse({
                            id: approvalId,
                            approved: true,
                          });
                        }}
                        onDeny={(approvalId) => {
                          addToolApprovalResponse({
                            id: approvalId,
                            approved: false,
                          });
                        }}
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
