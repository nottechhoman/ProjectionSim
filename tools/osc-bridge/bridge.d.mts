export interface RunningBridge {
  udpPort: number;
  wsPort: number;
  clientCount: () => number;
  sendTargets: { host: string; port: number }[];
  close: () => Promise<void>;
}
export function startBridge(options?: {
  udpPort?: number;
  wsPort?: number;
  host?: string;
  udpHost?: string;
  /** OSC is also sent here ("host:port"), whatever the app asks for. */
  sendTargets?: (string | { host: string; port: number })[];
  /** Extra page origins allowed to send OSC ('*' = any). Local pages always may. */
  allowOrigins?: string[];
  log?: (line: string) => void;
}): Promise<RunningBridge>;
export function originAllowed(origin: string | undefined, allowed?: string[]): boolean;
export const DEFAULT_ALLOWED_ORIGINS: string[];
export function createFrameReader(maxMessage?: number): { push(chunk: Buffer): { opcode: number; payload: Buffer }[] };
