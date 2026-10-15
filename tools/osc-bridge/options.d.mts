export function bridgeOptions(
  argv?: string[],
  env?: Record<string, string | undefined>,
): { udpPort: number; wsPort: number; sendTargets: string[]; extraOrigins: string[] };
