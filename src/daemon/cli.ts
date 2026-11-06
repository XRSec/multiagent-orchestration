/**
 * @file src/daemon/cli.ts
 * @description Unified Gateway CLI Controller for Multi-Agent Orchestration.
 * Powered by GatewayClient (works locally or remotely over FRP / Tailscale).
 */

import * as fs from 'fs';
import * as path from 'path';
import { DaemonServer } from './transport/DaemonServer';
import { GatewayClient } from './gateway/GatewayClient';

const projectRoot = path.resolve(__dirname, '../..');
const daemonDir = path.join(projectRoot, '.daemon');
const pidFile = path.join(daemonDir, 'daemon.pid');

const gatewayUrl = process.env.MO_GATEWAY_URL || 'ws://127.0.0.1:38080/gateway';
const gatewayToken = process.env.MO_GATEWAY_TOKEN;

async function getClient(): Promise<GatewayClient> {
  const client = new GatewayClient({
    url: gatewayUrl,
    token: gatewayToken,
    clientName: 'mo-cli',
    clientType: 'cli',
  });
  await client.connect();
  return client;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';

  switch (command) {
    case 'start': {
      console.log('Starting Multi-Agent Gateway Daemon...');
      const server = new DaemonServer({
        projectRoot,
        dataDir: daemonDir,
        httpPort: 38080,
        httpHost: process.env.MO_GATEWAY_HOST || '127.0.0.1',
        authToken: gatewayToken,
      });

      // Populate default bots if empty
      const storage = server.getStorage();
      const botDirs = [
        path.join(projectRoot, 'Customizations', 'agents'),
        path.join(projectRoot, 'Bots'),
      ];
      for (const bDir of botDirs) {
        if (fs.existsSync(bDir)) {
          const botNames = fs.readdirSync(bDir);
          for (const name of botNames) {
            const profilePath = path.join(bDir, name, 'profile.json');
            if (fs.existsSync(profilePath)) {
              try {
                const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
                storage.registerBot({
                  id: profile.id,
                  name: profile.name || name,
                  display_name: profile.display_name,
                  description: profile.description,
                  avatar: profile.avatar,
                  avatar_color: profile.avatar_color,
                  status: profile.status,
                  canonical_session_id: profile.canonical_session_id,
                  bot_dir: path.join(bDir, name),
                  claude_config_dir: path.join(bDir, name, 'claude_config'),
                  created_at: profile.created_at,
                  updated_at: profile.updated_at,
                });
              } catch {}
            }
          }
        }
      }

      await server.start();
      console.log(`✓ Multi-Agent Device Gateway Host started.`);
      console.log(`  PID: ${process.pid}`);
      console.log(`  Gateway Endpoint: ws://${server.getConfig().httpHost}:${server.getConfig().httpPort}/gateway`);
      console.log(`  Health Check URL: http://${server.getConfig().httpHost}:${server.getConfig().httpPort}/health`);
      console.log(`  Registered Bots: ${storage.listBots().length}`);

      const gracefulStop = async () => {
        console.log('\nShutting down gateway daemon...');
        await server.stop();
        console.log('✓ Gateway daemon stopped gracefully.');
        process.exit(0);
      };

      process.on('SIGINT', gracefulStop);
      process.on('SIGTERM', gracefulStop);
      break;
    }

    case 'status': {
      try {
        const client = await getClient();
        const status = await client.invoke('system:status', {});
        console.log('Multi-Agent Device Gateway Status:');
        console.log(JSON.stringify(status, null, 2));
        client.disconnect();
      } catch (err: any) {
        console.error(`Error querying gateway (${gatewayUrl}): ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case 'ping': {
      try {
        const client = await getClient();
        const res = await client.ping();
        console.log(`✓ Ping response: pong in ${res.latencyMs}ms`);
        client.disconnect();
      } catch (err: any) {
        console.error(`Error pinging gateway (${gatewayUrl}): ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case 'list-bots': {
      try {
        const client = await getClient();
        const bots = await client.invoke('agent:list', {});
        console.log(`Registered Bots on Gateway (${bots.length}):`);
        for (const b of bots) {
          console.log(`- [${b.id}] ${b.name} (${b.display_name})`);
        }
        client.disconnect();
      } catch (err: any) {
        console.error(`Error listing bots: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case 'stop': {
      if (!fs.existsSync(pidFile)) {
        console.log('No PID file found. Gateway daemon is likely not running.');
        process.exit(0);
      }
      const pidStr = fs.readFileSync(pidFile, 'utf-8').trim();
      const pid = parseInt(pidStr, 10);
      try {
        process.kill(pid, 'SIGTERM');
        console.log(`Sent SIGTERM to Gateway Daemon PID ${pid}`);
      } catch (err: any) {
        console.error(`Failed to kill process ${pid}: ${err.message}`);
      }
      break;
    }

    default:
      console.log(`Usage: npx tsx src/daemon/cli.ts <start|status|ping|list-bots|stop>`);
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal CLI Error:', err);
    process.exit(1);
  });
}
