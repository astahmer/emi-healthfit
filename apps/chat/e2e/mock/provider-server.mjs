import { createServer } from "node:http";

let requestCount = 0;

const sseChunk = (payload) => `data: ${JSON.stringify(payload)}\n\n`;

const chunk = (choices, usage) => ({
  id: "chatcmpl-e2e",
  object: "chat.completion.chunk",
  created: 1,
  model: "e2e-model",
  choices,
  ...(usage === undefined ? {} : { usage }),
});

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
  requestCount += 1;
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
  });
  if (requestCount === 1) {
    response.write(
      sseChunk(
        chunk([
          {
            index: 0,
            delta: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  index: 0,
                  id: "call-streak",
                  type: "function",
                  function: { name: "get_workout_streak", arguments: "{}" },
                },
              ],
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
});

const port = Number(process.env.PROVIDER_PORT ?? "1399");
server.listen(port, "127.0.0.1", () => {
  console.log(`Mock OpenAI provider listening on 127.0.0.1:${port}`);
});
