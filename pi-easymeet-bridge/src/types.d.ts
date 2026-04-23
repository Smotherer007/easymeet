declare module "protoo-client";

declare module "@mariozechner/pi-agent-core" {
  export type AgentMessage = Record<string, unknown> & {
    role?: string;
    content?: unknown;
  };
}

declare module "@mariozechner/pi-coding-agent" {
  export interface ExtensionContext {
    hasUI: boolean;
    ui: {
      notify(message: string, variant?: string): void;
      input(label: string, value?: string): Promise<string | undefined>;
    };
  }

  export interface ExtensionCommandContext extends ExtensionContext {}

  export interface ExtensionAPI {
    registerCommand(
      name: string,
      options: {
        description?: string;
        handler(args: string | undefined, ctx: ExtensionCommandContext): Promise<void> | void;
      },
    ): void;
    on(event: string, handler: (...args: any[]) => void): void;
    sendUserMessage(content: string, options?: { deliverAs?: "steer" | "followUp" }): void;
  }
}
