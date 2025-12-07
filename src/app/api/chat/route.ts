import { chat, toStreamResponse } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";
import { getWeatherServer } from "./tools";

export async function POST(request: Request) {
  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({
        error: "OPENAI_API_KEY not configured",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const { messages, conversationId } = await request.json();

  try {
    // Create a streaming chat response
    const stream = chat({
      adapter: openai(),
      messages,
      model: "gpt-5-nano",
      conversationId,
      tools: [getWeatherServer],
      providerOptions: {
        reasoning: {
          effort: "low",
          summary: "auto",
        },
      },
    });

    // Convert stream to HTTP response
    return toStreamResponse(stream);
  } catch (error: unknown) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "An error occurred",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
