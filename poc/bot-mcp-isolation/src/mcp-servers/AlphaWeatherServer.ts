import { z } from 'zod';
import { BaseMcpServer } from './BaseMcpServer.js';

export class AlphaWeatherServer extends BaseMcpServer {
  // Private in-memory store for alpha_db tool
  private readonly dbStore: Map<string, Array<Record<string, unknown>>> = new Map();

  constructor() {
    super('alpha_weather_server', '1.0.0');
  }

  protected registerTools(): void {
    // 1. alpha_weather_tool
    this.server.tool(
      'alpha_weather_tool',
      {
        location: z.string().describe('City or region name to fetch weather for'),
        unit: z.enum(['celsius', 'fahrenheit']).optional().describe('Temperature unit'),
      },
      async ({ location, unit = 'celsius' }) => {
        // Deterministic but dynamic weather generation
        const hash = Array.from(location).reduce((acc, c) => acc + c.charCodeAt(0), 0);
        let tempC = (hash % 30) + 5;
        let temp = unit === 'fahrenheit' ? Math.round((tempC * 9) / 5 + 32) : tempC;

        const conditions = ['Sunny', 'Cloudy', 'Partly Cloudy', 'Light Rain', 'Clear'];
        const condition = conditions[hash % conditions.length];
        const humidity = 40 + (hash % 50);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                server: 'alpha_weather_server',
                tool: 'alpha_weather_tool',
                location,
                temperature: `${temp}°${unit === 'fahrenheit' ? 'F' : 'C'}`,
                condition,
                humidity: `${humidity}%`,
                timestamp: new Date().toISOString(),
              }, null, 2),
            },
          ],
        };
      }
    );

    // 2. alpha_db
    this.server.tool(
      'alpha_db',
      {
        action: z.enum(['insert', 'query', 'list_tables']).describe('Database operation'),
        table: z.string().optional().describe('Target table name'),
        dataJson: z.string().optional().describe('JSON string of data record for insert'),
      },
      async ({ action, table = 'default', dataJson }) => {
        if (!this.dbStore.has(table)) {
          this.dbStore.set(table, []);
        }
        const records = this.dbStore.get(table)!;

        if (action === 'insert') {
          if (!dataJson) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Missing dataJson string for insert action' }],
            };
          }
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(dataJson);
          } catch (e: any) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Invalid dataJson: ${e.message}` }],
            };
          }
          const item = { id: records.length + 1, ...parsed, createdAt: new Date().toISOString() };
          records.push(item);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ status: 'inserted', table, insertedId: item.id, record: item }, null, 2),
              },
            ],
          };
        } else if (action === 'query') {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ status: 'success', table, count: records.length, records }, null, 2),
              },
            ],
          };
        } else if (action === 'list_tables') {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ tables: Array.from(this.dbStore.keys()) }, null, 2),
              },
            ],
          };
        }

        return {
          isError: true,
          content: [{ type: 'text', text: `Unknown action: ${action}` }],
        };
      }
    );
  }
}
