import { createServer } from "node:http";

const sseChunk = (payload) => `data: ${JSON.stringify(payload)}\n\n`;

const chunk = (choices, usage) => ({
  id: "chatcmpl-e2e",
  object: "chat.completion.chunk",
  created: 1,
  model: "e2e-model",
  choices,
  ...(usage === undefined ? {} : { usage }),
});

const completion = ({ content, toolCalls }) => ({
  id: "chatcmpl-e2e",
  object: "chat.completion",
  created: 1,
  model: "e2e-model",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content,
        ...(toolCalls === undefined ? {} : { tool_calls: toolCalls }),
      },
      finish_reason: toolCalls === undefined ? "stop" : "tool_calls",
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
});

const streakToolCall = () => ({
  index: 0,
  id: "call-streak",
  type: "function",
  function: { name: "get_workout_streak", arguments: "{}" },
});

const lastUserText = (body) => {
  const messages = body.messages ?? [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user" && typeof message.content === "string") return message.content;
  }
  return "";
};

const shouldCallStreak = (body) =>
  lastUserText(body).includes("Show my streak") &&
  (body.messages ?? []).every((message) => message.role !== "tool");

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200);
    response.end("ok");
    return;
  }
  if (request.method !== "POST" || !request.url?.startsWith("/v1/chat/completions")) {
    response.writeHead(404);
    response.end();
    return;
  }
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    let body = { messages: [] };
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {}
    const toolCalls = shouldCallStreak(body) ? [streakToolCall()] : undefined;
    if (body.stream === true) {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      });
      if (toolCalls !== undefined) {
        response.write(
          sseChunk(
            chunk([
              {
                index: 0,
                delta: {
                  role: "assistant",
                  content: null,
                  tool_calls: toolCalls,
                },
                finish_reason: null,
              },
            ]),
          ),
        );
        response.write(sseChunk(chunk([{ index: 0, delta: {}, finish_reason: "tool_calls" }])));
        response.write(
          sseChunk(chunk([], { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 })),
        );
      } else {
        response.write(
          sseChunk(
            chunk([
              {
                index: 0,
                delta: { role: "assistant", content: "Real worker reply" },
                finish_reason: null,
              },
            ]),
          ),
        );
        response.write(sseChunk(chunk([{ index: 0, delta: {}, finish_reason: "stop" }])));
        response.write(
          sseChunk(chunk([], { prompt_tokens: 18, completion_tokens: 6, total_tokens: 24 })),
        );
      }
      response.write("data: [DONE]\n\n");
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(completion({ content: "Real worker reply", toolCalls })));
  });
});

const port = Number(process.env.PROVIDER_PORT ?? "1399");
server.listen(port, "127.0.0.1", () => {
  console.log(`Mock OpenAI provider listening on 127.0.0.1:${port}`);
});
