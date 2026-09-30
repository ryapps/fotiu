import "dotenv/config";
import { createBoothAgent } from "@/modules/photobooth/agent";
import { parseBoothAgentConfig } from "@/modules/photobooth/agent-config";
import { createPhotoboothProvider } from "@/modules/photobooth/mock-provider";

async function main() {
  const config = parseBoothAgentConfig(process.env);
  const provider = createPhotoboothProvider(config.providerKey, {
    mode: config.mockMode,
    delayMs: config.mockDelayMs,
    completionDelayMs: config.mockCompletionDelayMs,
  });
  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());
  process.once("SIGTERM", () => controller.abort());

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
