import { createServer, type Server } from "node:http";

export function startPhotoboothAppCallbackServer(input: {
  port: number;
  accept: (token: string | null, event: string | null) => boolean;
}): Promise<Server> {
  const server = createServer((request, response) => {
    const remoteAddress = request.socket.remoteAddress;
    const isLoopback =
      remoteAddress === "127.0.0.1" ||
      remoteAddress === "::1" ||
      remoteAddress === "::ffff:127.0.0.1";
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (
      request.method !== "GET" ||
      url.pathname !== "/photobooth-app/event" ||
      !isLoopback
    ) {
      response.writeHead(404).end();
      return;
    }
    const accepted = input.accept(
      url.searchParams.get("token"),
      url.searchParams.get("event"),
    );
    response.writeHead(accepted ? 204 : 401).end();
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(input.port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server);
    });
  });
}
