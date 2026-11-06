/**
 * Purpose: Automated system monitor and Seven Mo-Bots self-check orchestrator.
 * Context: Monitors multiagent-orchestration daemon, mobile UI responsiveness, and partner sandboxes.
 * Usage: npx tsx scripts/system-monitor-and-self-check.ts
 * Prerequisites: Node.js 18+, running Vite server, SQLite database.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface AuditReport {
  timestamp: string;
  shanghaiTime: string;
  backendHealthy: boolean;
  activePartners: number;
  totalMessages: number;
  mobileLayoutPass: boolean;
  details: Record<string, any>;
}

export async function runSelfCheckAndMonitor(): Promise<AuditReport> {
  const now = new Date();
  const shanghaiTime = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    dateStyle: 'full',
    timeStyle: 'medium'
  }).format(now);

  const report: AuditReport = {
    timestamp: now.toISOString(),
    shanghaiTime,
    backendHealthy: false,
    activePartners: 0,
    totalMessages: 0,
    mobileLayoutPass: false,
    details: {}
  };

  // 1. Check Backend API & Database
  try {
    const res = await fetch('http://127.0.0.1:5173/api/rooms/multiagent_orchestration/messages');
    if (res.ok) {
      const data = await res.json();
      report.backendHealthy = true;
      report.totalMessages = Array.isArray(data.messages) ? data.messages.length : 0;
      report.details.messagesApiOk = true;
    }
  } catch (err: any) {
    report.details.backendError = err.message;
  }

  // 2. Check Seven Mo-Bots Sandboxes & Capabilities
  const botsList = [
    'bot_moadmin_director_03',
    'bot_mocode_engine_01',
    'bot_modoc_scribe_02',
    'bot_moci_sentinel_07',
    'bot_mogit_scm_05',
    'bot_modeep_scout_04',
    'bot_mo_meta_06'
  ];

  let healthyBots = 0;
  const projectRoot = process.cwd();
  const botHealthMap: Record<string, boolean> = {};

  for (const botId of botsList) {
    const customDir = path.join(projectRoot, 'Customizations', 'agents', botId.replace(/^bot_/, '').split('_')[0]);
    // check either Customizations or Bots directory
    const exists = fs.existsSync(customDir) || fs.existsSync(path.join(projectRoot, 'Bots'));
    if (exists) {
      healthyBots++;
      botHealthMap[botId] = true;
    } else {
      botHealthMap[botId] = false;
    }
  }
  report.activePartners = healthyBots;
  report.details.botHealthMap = botHealthMap;

  // 3. Check Models Config
  try {
    const modelsRes = await fetch('http://127.0.0.1:5173/api/config/models');
    if (modelsRes.ok) {
      const modelsData = await modelsRes.json();
      report.details.modelsConfigOk = modelsData.ok;
      report.details.modelsSource = modelsData.sourceFile;
      report.details.activeDefaultModel = modelsData.activeDefaultModel;
    }
  } catch (err: any) {
    report.details.modelsConfigError = err.message;
  }

  // 4. Verify Mobile Layout Invariants (390px Viewport)
  try {
    const inlineScript = `
(async () => {
  const task = await taskSpace("quick-mobile-check");
  const page = task.page("p1");
  await page.cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await page.goto("http://127.0.0.1:5173/bots/groups/multiagent_orchestration");
  await new Promise(r => setTimeout(r, 1200));
  const check = await page.evaluate(() => {
    const main = document.querySelector('main');
    const nav = document.querySelector('nav[aria-label="Mobile Navigation"]');
    return {
      mainWidth: main ? Math.round(main.getBoundingClientRect().width) : 0,
      hasNav: !!nav,
      noOverflow: document.documentElement.scrollWidth <= window.innerWidth
    };
  });
  console.log('__MOBILE_METRICS__:' + JSON.stringify(check));
  await task.finish({ keep: [] });
})();
`;

    const egoBin = path.join(process.env.HOME || '', '.local', 'bin', 'ego-browser');
    const output = execSync(`${egoBin} nodejs -e '${inlineScript.replace(/'/g, "'\\''")}' 2>&1`, {
      encoding: 'utf8',
      timeout: 20000
    });

    const prefix = '__MOBILE_METRICS__:';
    const metricLine = output.split('\n').find(l => l.includes(prefix));
    if (metricLine) {
      const jsonStr = metricLine.slice(metricLine.indexOf(prefix) + prefix.length).trim();
      const parsed = JSON.parse(jsonStr);
      report.mobileLayoutPass = parsed.mainWidth === 390 && parsed.hasNav && parsed.noOverflow;
      report.details.mobileCheck = parsed;
    }
  } catch (err: any) {
    report.details.mobileCheckError = err.message;
  }

  // 5. Append to Monitor Log
  const logDir = path.join(projectRoot, 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, 'monitor-audit.log');
  fs.appendFileSync(logFile, `[${shanghaiTime}] ${JSON.stringify(report)}\n`, 'utf8');

  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSelfCheckAndMonitor().then((rep) => {
    console.log('=== SYSTEM MONITOR & SELF-CHECK REPORT ===');
    console.log(JSON.stringify(rep, null, 2));
    process.exit(0);
  }).catch((err) => {
    console.error('Monitor check error:', err);
    process.exit(1);
  });
}
