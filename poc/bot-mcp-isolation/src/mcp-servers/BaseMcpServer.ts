import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ToolInfo, ToolCallResponse } from '../types.js';

export abstract class BaseMcpServer {
  public readonly serverName: string;
  public readonly version: string;
  protected server: McpServer;
  private client: Client | null = null;
  private clientTransport: InMemoryTransport | null = null;
  private serverTransport: InMemoryTransport | null = null;
  private connected = false;

  constructor(serverName: string, version = '1.0.0') {
    this.serverName = serverName;
    this.version = version;
    this.server = new McpServer({
      name: serverName,
      version: version,
    });
  }

  /**
   * Subclasses register their tools here.
   */
  protected abstract registerTools(): void;

  /**
   * Initializes the server and connects a linked in-memory client.
   */
  public async start(): Promise<void> {
    if (this.connected) return;

    this.registerTools();

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    this.clientTransport = clientTransport;
    this.serverTransport = serverTransport;

    await this.server.connect(serverTransport);

    this.client = new Client(
      { name: `${this.serverName}-client`, version: this.version },
      { capabilities: {} }
    );
    await this.client.connect(clientTransport);
    this.connected = true;
  }

  /**
   * Lists all registered tools on this server.
   */
  public async listTools(): Promise<ToolInfo[]> {
    if (!this.connected || !this.client) {
      throw new Error(`McpServer ${this.serverName} is not started.`);
    }

    const res = await this.client.listTools();
    return res.tools.map((t) => ({
      name: t.name,
      serverName: this.serverName,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  /**
   * Invokes a tool through genuine MCP client-server JSON-RPC transport.
   */
  public async callTool(toolName: string, args?: Record<string, unknown>): Promise<ToolCallResponse> {
    if (!this.connected || !this.client) {
      throw new Error(`McpServer ${this.serverName} is not started.`);
    }

    try {
      const response = await this.client.callTool({
        name: toolName,
        arguments: args ?? {},
      });

      return {
        success: !response.isError,
        serverName: this.serverName,
        toolName,
        content: (response.content as Array<{ type: string; text?: string; data?: unknown }>) || [],
        isError: !!response.isError,
      };
    } catch (err: any) {
      return {
        success: false,
        serverName: this.serverName,
        toolName,
        content: [{ type: 'text', text: `Tool execution failed: ${err.message}` }],
        isError: true,
      };
    }
  }

  /**
   * Stops and closes the server.
   */
  public async stop(): Promise<void> {
    if (!this.connected) return;
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    if (this.server) {
      await this.server.close();
    }
    this.connected = false;
  }
}
