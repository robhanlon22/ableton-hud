declare module 'osc' {
  export interface OscMessage {
    address: string;
    args?: unknown[];
  }

  export interface UDPPortOptions {
    localAddress?: string;
    localPort?: number;
    remoteAddress?: string;
    remotePort?: number;
    metadata?: boolean;
  }

  export class UDPPort {
    constructor(options?: UDPPortOptions);
    on(event: 'ready', callback: () => void): void;
    on(event: 'error', callback: (error: Error) => void): void;
    on(event: 'message', callback: (message: OscMessage) => void): void;
    send(message: OscMessage): void;
    open(): void;
    close(): void;
  }

  const OSC: {
    UDPPort: typeof UDPPort;
  };

  export default OSC;
}
