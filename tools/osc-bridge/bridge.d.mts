export interface RunningBridge {
  udpPort: number;
  wsPort: number;
  clientCount: () => number;
  close: () => Promise<void>;
}
export function startBridge(options?: {
  udpPort?: number;
  wsPort?: number;
  host?: string;
  udpHost?: string;
  log?: (line: string) => void;
}): Promise<RunningBridge>;
