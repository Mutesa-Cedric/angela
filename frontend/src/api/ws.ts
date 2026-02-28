export type WSEventHandler = (event: string, data: Record<string, unknown>) => void;

export class WSClient {
  private ws: WebSocket | null = null;
  private handlers: WSEventHandler[] = [];
  private reconnectTimer: number | null = null;

  connect(url: string = `ws://${window.location.host}/api/stream`): void {
    if (this.ws) return;

    this.ws = new WebSocket(url);

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { event: string; data: Record<string, unknown> };
        for (const handler of this.handlers) {
          handler(msg.event, msg.data);
        }
      } catch {
        console.warn("WS: invalid message", e.data);
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      // Auto-reconnect after 3s
      this.reconnectTimer = window.setTimeout(() => this.connect(url), 3000);
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  onEvent(handler: WSEventHandler): void {
    this.handlers.push(handler);
  }

  disconnect(): void {
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}

export const wsClient = new WSClient();
