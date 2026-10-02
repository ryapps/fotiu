import "dotenv/config";
import { PhotoboothAppProvider } from "@/modules/photobooth/photobooth-app-provider";
import { startPhotoboothAppCallbackServer } from "@/modules/photobooth/photobooth-app-callback-server";
import { createBoothAgent } from "@/modules/photobooth/agent";
import { parseBoothAgentConfig } from "@/modules/photobooth/agent-config";
import { createPhotoboothProvider } from "@/modules/photobooth/mock-provider";

async function main() {
  const config = parseBoothAgentConfig(process.env);
  const provider = createPhotoboothProvider(
    config.providerKey,
    {
      mode: config.mockMode,
      delayMs: config.mockDelayMs,
      completionDelayMs: config.mockCompletionDelayMs,
    },
    config.photoboothAppUrl && config.photoboothAppCallbackToken
      ? {
          baseUrl: config.photoboothAppUrl,
          actionType: config.photoboothAppAction ?? "image",
          actionIndex: config.photoboothAppActionIndex ?? 0,
          callbackToken: config.photoboothAppCallbackToken,
        }
      : undefined,
  );
  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());
  process.once("SIGTERM", () => controller.abort());

  let callbackServer:
    Awaited<ReturnType<typeof startPhotoboothAppCallbackServer>> | undefined;
  if (provider instanceof PhotoboothAppProvider) {
    callbackServer = await startPhotoboothAppCallbackServer({
      port: config.photoboothAppCallbackPort ?? 43127,
      accept: (token, event) => provider.acceptCallback(token, event),
    });
    process.stdout.write(
      `[booth-agent] Photobooth-App callback listening on 127.0.0.1:${config.photoboothAppCallbackPort ?? 43127}\n`,
    );
    controller.signal.addEventListener("abort", () => callbackServer?.close(), {
      once: true,
    });
  }

  const agent = createBoothAgent({
    config,
    provider,
    onError(error) {
      if (error instanceof Error) {
        process.stderr.write(`[booth-agent] ${error.message}\n`);
      } else {
        process.stderr.write("[booth-agent] Poll cycle failed.\n");
      }
    },
  });
  await agent.run(controller.signal);
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    process.stderr.write(`[booth-agent] Stopped: ${error.message}\n`);
  } else {
    process.stderr.write("[booth-agent] Stopped unexpectedly.\n");
  }
  process.exitCode = 1;
});
