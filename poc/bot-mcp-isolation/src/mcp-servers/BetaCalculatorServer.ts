import { z } from 'zod';
import { BaseMcpServer } from './BaseMcpServer.js';

export class BetaCalculatorServer extends BaseMcpServer {
  constructor() {
    super('beta_calculator_server', '1.0.0');
  }

  protected registerTools(): void {
    // 1. beta_calculator_tool
    this.server.tool(
      'beta_calculator_tool',
      {
        operation: z.enum(['add', 'subtract', 'multiply', 'divide', 'power']).describe('Math operation'),
        a: z.number().describe('First operand'),
        b: z.number().describe('Second operand'),
      },
      async ({ operation, a, b }) => {
        let result: number;
        switch (operation) {
          case 'add':
            result = a + b;
            break;
          case 'subtract':
            result = a - b;
            break;
          case 'multiply':
            result = a * b;
            break;
          case 'divide':
            if (b === 0) {
              return {
                isError: true,
                content: [{ type: 'text', text: 'Division by zero is not permitted' }],
              };
            }
            result = a / b;
            break;
          case 'power':
            result = Math.pow(a, b);
            break;
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                server: 'beta_calculator_server',
                tool: 'beta_calculator_tool',
                operation,
                operands: { a, b },
                result,
                timestamp: new Date().toISOString(),
              }, null, 2),
            },
          ],
        };
      }
    );

    // 2. beta_metrics
    this.server.tool(
      'beta_metrics',
      {
        metricType: z.enum(['memory', 'uptime', 'node_version', 'all']).optional().describe('Metric to query'),
      },
      async ({ metricType = 'all' }) => {
        const mem = process.memoryUsage();
        const metrics: Record<string, unknown> = {
          server: 'beta_calculator_server',
          tool: 'beta_metrics',
        };

        if (metricType === 'memory' || metricType === 'all') {
          metrics.memory = {
            heapUsedMB: (mem.heapUsed / 1024 / 1024).toFixed(2),
            heapTotalMB: (mem.heapTotal / 1024 / 1024).toFixed(2),
            rssMB: (mem.rss / 1024 / 1024).toFixed(2),
          };
        }

        if (metricType === 'uptime' || metricType === 'all') {
          metrics.uptimeSeconds = process.uptime();
        }

        if (metricType === 'node_version' || metricType === 'all') {
          metrics.platform = {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(metrics, null, 2),
            },
          ],
        };
      }
    );
  }
}
