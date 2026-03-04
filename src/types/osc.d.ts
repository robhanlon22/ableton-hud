declare module "osc" {
  export interface OscMessage {
    address: string;
    args?: unknown[];
  }

  export interface UDPPortOptions {
    localAddress?: string;
    localPort?: number;
    metadata?: boolean;
    remoteAddress?: string;
    remotePort?: number;
  }

  export class UDPPort {
    constructor(options?: UDPPortOptions);
    close(): void;
    on(event: "ready", callback: () => void): void;
    on(event: "error", callback: (error: Error) => void): void;
    on(event: "message", callback: (message: OscMessage) => void): void;
    open(): void;
    send(message: OscMessage): void;
  }

  const OSC: {
    UDPPort: typeof UDPPort;
  };

  export default OSC;
}
