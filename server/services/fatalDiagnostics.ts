import { writeSync } from "node:fs";

// Avoid logging query text, SQL parameters, URLs, or customer data. Only retain
// local stack-frame locations; error messages can contain credentials and PII.
export function fatalSummary(error: unknown, origin: string) {
  const frames: string[] = [];
  let current = error;
  for (let depth = 0; depth < 3 && current instanceof Error; depth++) {
    for (const line of (current.stack ?? "").split("\n")) {
      if (!/^\s+at /.test(line)) continue;
      const location = line.match(/((?:\/[^()\s]+|node:[^()\s]+):\d+:\d+)\)?$/)?.[1];
      if (location && !location.includes("?") && !location.includes("@")) {
        frames.push(location.slice(-240));
      }
      if (frames.length >= 12) break;
    }
    if (frames.length >= 12) break;
    current = current.cause;
  }
  return { origin, frames };
}

// A monitor observes fatal errors without swallowing them or changing Node's
// exit behavior. Synchronous stderr ensures this small record survives exit.
process.on("uncaughtExceptionMonitor", (error, origin) => {
  try {
    writeSync(2, `[fatal] ${JSON.stringify(fatalSummary(error, origin))}\n`);
  } catch {
    // Diagnostics must never mask the original fatal error.
  }
});
