#!/usr/bin/env node
/**
 * scripts/inspect-cindy-prompt.mjs
 *
 * Command-line inspector for Cindy chat/session messages and their authentic prompt chains.
 * Parses Cindy deep-links (cindy://chat/... or cindy://session/...) or direct IDs,
 * resolves underlying SQLite records, and lists all prompt/context layers in execution order
 * starting from ~/.claude/CLAUDE.md.
 *
 * Usage:
 *   node scripts/inspect-cindy-prompt.mjs "<cindy-url-or-id>" [--full] [--json]
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function printHelp() {
  console.log(`
Cindy Prompt Inspector CLI
--------------------------
Usage:
  node scripts/inspect-cindy-prompt.mjs "<cindy-url-or-id>" [options]

Examples:
  node scripts/inspect-cindy-prompt.mjs "cindy://chat/b7a7b643-0e90-4ba7-8964-d9530a95b61a?message=a9e25c33-4268-48ab-b862-2c65aef7cf09"
  node scripts/inspect-cindy-prompt.mjs "cindy://session/38899962-618d-4275-8557-13fbc6ae8e4f"
  node scripts/inspect-cindy-prompt.mjs "a9e25c33-4268-48ab-b862-2c65aef7cf09" --full

Options:
  --full    Display complete texts without truncation
  --json    Output raw structured inspection payload as JSON
  --help    Show this help message
`);
}

function findActiveDatabase() {
  const appSupport = path.join(os.homedir(), 'Library', 'Application Support');
  const candidateDirs = ['Cindy', 'Cindy-dev2-dev', 'CindyR', 'Cindy_R-dev2-dev'];
  const dbs = [];

  for (const dir of candidateDirs) {
    const fullDir = path.join(appSupport, dir);
    if (!fs.existsSync(fullDir)) continue;
    try {
      const files = fs.readdirSync(fullDir);
      for (const f of files) {
        if (f.startsWith('cindy-') && f.endsWith('.db') && !f.includes('lock')) {
          const fullPath = path.join(fullDir, f);
          const stat = fs.statSync(fullPath);
          dbs.push({ path: fullPath, mtime: stat.mtimeMs, size: stat.size });
        }
      }
    } catch {
      // ignore unreadable dirs
    }
  }

  dbs.sort((a, b) => b.mtime - a.mtime);
  if (dbs.length === 0) {
    throw new Error('No Cindy SQLite database (*.db) found in ~/Library/Application Support/Cindy*');
  }
  return dbs[0].path;
}

function parseInputTarget(rawInput) {
  const input = rawInput.trim();
  if (input.startsWith('cindy://')) {
    const url = new URL(input);
    const host = url.host;
    const cleanPath = url.pathname.replace(/^\/+/, '');
    const messageId = url.searchParams.get('message');
    if (host === 'chat') {
      return { kind: 'chat', groupId: cleanPath, messageId: messageId || undefined };
    }
    if (host === 'session') {
      return { kind: 'session', sessionId: cleanPath, clientId: messageId || undefined };
    }
    return { kind: 'unknown', raw: input };
  }

  // UUID pattern or raw string
  return { kind: 'id', rawId: input };
}

function readFileContentIfExists(filePath) {
  if (!filePath) return null;
  try {
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        const text = fs.readFileSync(filePath, 'utf8');
        return {
          path: filePath,
          exists: true,
          sizeBytes: stat.size,
          lineCount: text.split('\n').length,
          content: text,
        };
      }
    }
  } catch {
    // ignore
  }
  return { path: filePath, exists: false, sizeBytes: 0, lineCount: 0, content: '' };
}

function truncatePreview(str, maxLength = 600, isFull = false) {
  if (!str) return '<empty>';
  if (isFull || str.length <= maxLength) return str;
  return `${str.slice(0, maxLength)}\n... [Truncated ${str.length - maxLength} chars, use --full to view entire text]`;
}

function resolveInspection(db, target) {
  let matchedGroup = null;
  let matchedChatMessage = null;
  let laneSessionId = null;
  let laneClientId = null;
  let targetSessionId = null;
  let targetClientId = null;

  // 1. Resolve from chat target
  if (target.kind === 'chat') {
    const groupStmt = db.prepare('SELECT * FROM bot_groups WHERE id = ?');
    matchedGroup = groupStmt.get(target.groupId);

    if (target.messageId) {
      const msgStmt = db.prepare('SELECT payload FROM chat_cache_messages WHERE room_id = ? AND message_id = ?');
      const row = msgStmt.get(target.groupId, target.messageId);
      if (row) {
        matchedChatMessage = JSON.parse(row.payload);
      }
    }
  } else if (target.kind === 'session') {
    targetSessionId = target.sessionId;
    targetClientId = target.clientId;
  } else if (target.kind === 'id') {
    // Try matching messageId in chat_cache_messages
    const chatMsg = db.prepare('SELECT room_id, payload FROM chat_cache_messages WHERE message_id = ? LIMIT 1').get(target.rawId);
    if (chatMsg) {
      matchedChatMessage = JSON.parse(chatMsg.payload);
      matchedGroup = db.prepare('SELECT * FROM bot_groups WHERE id = ?').get(chatMsg.room_id);
    } else {
      // Try matching session id
      const sess = db.prepare('SELECT id FROM sessions WHERE id = ? LIMIT 1').get(target.rawId);
      if (sess) {
        targetSessionId = sess.id;
      } else {
        // Try matching messages clientId
        const msg = db.prepare('SELECT session_id, client_id FROM messages WHERE client_id = ? OR id = ? LIMIT 1').get(target.rawId, target.rawId);
        if (msg) {
          targetSessionId = msg.session_id;
          targetClientId = msg.client_id;
        }
      }
    }
  }

  // 2. Extract Work Record card from chat message
  if (matchedChatMessage && Array.isArray(matchedChatMessage.content)) {
    const card = matchedChatMessage.content.find((c) => c.type === 'card' && c.namespace === 'cindy.work-record');
    if (card?.data?.sessionId) {
      laneSessionId = card.data.sessionId;
      laneClientId = card.data.clientId;
    }
  }

  const effectiveSessionId = laneSessionId || targetSessionId;
  const effectiveClientId = laneClientId || targetClientId;

  // 3. Query Sessions Table
  let sessionRow = null;
  if (effectiveSessionId) {
    sessionRow = db.prepare('SELECT * FROM sessions WHERE id = ?').get(effectiveSessionId);
  }

  // 4. Query Messages Table (User Trigger Input)
  let userMessageRow = null;
  if (effectiveSessionId) {
    if (effectiveClientId) {
      userMessageRow = db.prepare("SELECT * FROM messages WHERE session_id = ? AND client_id = ? AND role = 'user' LIMIT 1").get(effectiveSessionId, effectiveClientId);
    }
    if (!userMessageRow) {
      userMessageRow = db.prepare("SELECT * FROM messages WHERE session_id = ? AND role = 'user' ORDER BY created_at DESC LIMIT 1").get(effectiveSessionId);
    }
  }

  // 5. Query Messages Table (Assistant Output & Tools)
  let assistantRow = null;
  let toolUseRows = [];
  if (effectiveSessionId) {
    assistantRow = db.prepare("SELECT * FROM messages WHERE session_id = ? AND role = 'assistant' ORDER BY created_at DESC LIMIT 1").get(effectiveSessionId);
    toolUseRows = db.prepare("SELECT * FROM messages WHERE session_id = ? AND role = 'tool_use' ORDER BY created_at ASC").all(effectiveSessionId);
  }

  // Parse prompt contents
  let rawUserText = '';
  let wireActualPrompt = '';
  let parsedUserMeta = {};

  if (userMessageRow) {
    try {
      const parsedContent = JSON.parse(userMessageRow.content);
      wireActualPrompt = parsedContent.text || '';
    } catch {
      wireActualPrompt = userMessageRow.content || '';
    }
    try {
      parsedUserMeta = JSON.parse(userMessageRow.agent_meta || '{}');
      rawUserText = parsedUserMeta.autoReviewUserText || '';
    } catch {
      // ignore
    }
  }

  // Working directory & project directory resolution
  const workingDir = sessionRow?.working_dir || matchedGroup?.project_dir || process.cwd();
  const projectDir = sessionRow?.project_dir || matchedGroup?.project_dir || (fs.existsSync(path.join(workingDir, 'AGENTS.md')) ? workingDir : process.cwd());

  // Partner Bot ID resolution
  // Find real botId from card or author
  let realBotId = null;
  if (matchedChatMessage && Array.isArray(matchedChatMessage.content)) {
    const card = matchedChatMessage.content.find((c) => c.type === 'card' && c.namespace === 'cindy.work-record');
    if (card?.data?.clientId) {
      // client_id format: bot-group:<groupId>:<execId>:<botId>
      const parts = card.data.clientId.split(':');
      if (parts.length >= 4) realBotId = parts[3];
    }
  }
  const authorBotId = realBotId || matchedChatMessage?.author?.id || matchedGroup?.organizer_bot_id;

  // Resolve Context Files in strict injection order
  const layers = [];

  // Layer 1: ~/.claude/CLAUDE.md
  const globalClaudeMdPath = path.join(os.homedir(), '.claude', 'CLAUDE.md');
  layers.push({
    order: 1,
    name: 'Global Instructions (~/.claude/CLAUDE.md)',
    path: globalClaudeMdPath,
    category: 'global-rules',
    file: readFileContentIfExists(globalClaudeMdPath),
  });

  // Layer 2: Project-level Rules
  const projectClaudeMd = path.join(projectDir, 'CLAUDE.md');
  const projectAgentsMd = path.join(projectDir, 'AGENTS.md');
  const projectInstructionsMd = path.join(projectDir, '.cindy', 'instructions.md');

  layers.push({
    order: 2,
    name: 'Project Instructions (CLAUDE.md / AGENTS.md / .cindy/instructions.md)',
    category: 'project-rules',
    files: [
      readFileContentIfExists(projectClaudeMd),
      readFileContentIfExists(projectAgentsMd),
      readFileContentIfExists(projectInstructionsMd),
    ].filter((f) => f && f.exists),
  });

  // Layer 3: Partner / Bot Identity Files
  const partnerFiles = [];
  const candidatePartnerDirs = [
    authorBotId ? path.join(os.homedir(), '.multiagent-orchestration', 'partners', authorBotId) : null,
    authorBotId ? path.join(path.dirname(db.path || ''), 'owners', '123a8cb35427c8b02a4f', 'bots', authorBotId) : null,
    sessionRow?.working_dir ? path.resolve(sessionRow.working_dir, '..') : null,
    path.join(os.homedir(), '.multiagent-orchestration', 'partners', 'cindy-r'),
    matchedChatMessage?.author?.name ? path.join(os.homedir(), '.multiagent-orchestration', 'partners', matchedChatMessage.author.name.toLowerCase().replace(/_/g, '-')) : null,
  ].filter(Boolean);

  for (const pDir of candidatePartnerDirs) {
    if (fs.existsSync(pDir)) {
      const soul = readFileContentIfExists(path.join(pDir, 'SOUL.md'));
      const manual = readFileContentIfExists(path.join(pDir, 'PARTNER_MANUAL.md'));
      const memory = readFileContentIfExists(path.join(pDir, 'memories', 'MEMORY.md')) || readFileContentIfExists(path.join(pDir, 'MEMORY.md'));
      if (soul?.exists) partnerFiles.push(soul);
      if (manual?.exists) partnerFiles.push(manual);
      if (memory?.exists) partnerFiles.push(memory);
      if (partnerFiles.length > 0) break;
    }
  }

  layers.push({
    order: 3,
    name: 'Partner Identity (SOUL.md / PARTNER_MANUAL.md / MEMORY.md)',
    category: 'partner-identity',
    botAuthor: matchedChatMessage?.author?.displayName || matchedChatMessage?.author?.name || 'Cindy_R',
    files: partnerFiles,
  });

  // Layer 4: Platform System Prompt Append
  layers.push({
    order: 4,
    name: 'Cindy Runtime System Prompt Append & Guardrails',
    category: 'system-append',
    summary: 'Platform execution invariants, tool capability restrictions, and workspace isolation.',
  });

  // Layer 5: User Original Prompt
  layers.push({
    order: 5,
    name: 'User Original Prompt (autoReviewUserText / Request)',
    category: 'user-original-prompt',
    text: rawUserText || (matchedChatMessage?.author?.kind === 'user' ? matchedChatMessage.content.map((c) => c.text).filter(Boolean).join('\n') : '<none>'),
  });

  // Layer 6: Actual Wire Prompt Delivered to Model
  layers.push({
    order: 6,
    name: 'Actual Wire Prompt (Delivered to Model / Tool Loop)',
    category: 'wire-actual-prompt',
    text: wireActualPrompt,
  });

  // Layer 7: Model Reply & Execution
  let assistantText = '';
  let assistantMeta = {};
  if (assistantRow) {
    try {
      const parsed = JSON.parse(assistantRow.content);
      assistantText = parsed.text || assistantRow.content;
    } catch {
      assistantText = assistantRow.content;
    }
    try {
      assistantMeta = JSON.parse(assistantRow.agent_meta || '{}');
    } catch {
      // ignore
    }
  } else if (matchedChatMessage) {
    assistantText = matchedChatMessage.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  }

  const toolNames = toolUseRows.map((t) => {
    try {
      return JSON.parse(t.content)?.toolName;
    } catch {
      return 'unknown';
    }
  }).filter(Boolean);

  layers.push({
    order: 7,
    name: 'Assistant Reply & Tool Chain',
    category: 'assistant-execution',
    replyText: assistantText,
    toolsUsed: toolNames,
    toolCallCount: toolUseRows.length,
    meta: assistantMeta,
  });

  // Layer 8: Execution Metadata & Session
  layers.push({
    order: 8,
    name: 'Session & Execution Metadata',
    category: 'execution-meta',
    sessionId: effectiveSessionId,
    sdkSessionId: sessionRow?.sdk_session_id || parsedUserMeta?.sdkSessionId || assistantMeta?.sdkSessionId,
    model: sessionRow?.model || assistantMeta?.model || 'unknown',
    workingDir,
    groupName: matchedGroup?.name,
    groupId: matchedGroup?.id,
  });

  return {
    target,
    resolvedAt: new Date().toISOString(),
    database: db.path || '<sqlite>',
    effectiveSessionId,
    layers,
  };
}

function renderConsoleReport(result, isFull = false) {
  const line = (char = '=', len = 80) => char.repeat(len);
  console.log(`\n${line('=')}`);
  console.log(`  Cindy Authentic Prompt Inspector`);
  console.log(`  Target: ${JSON.stringify(result.target)}`);
  console.log(`  Session ID: ${result.effectiveSessionId || '<none>'}`);
  console.log(`${line('=')}\n`);

  for (const layer of result.layers) {
    console.log(`\n[Layer ${layer.order}] ${layer.name}`);
    console.log(line('-'));

    if (layer.category === 'global-rules') {
      if (layer.file?.exists) {
        console.log(`Path: ${layer.file.path} (${layer.file.lineCount} lines, ${layer.file.sizeBytes} bytes)`);
        console.log(`\n${truncatePreview(layer.file.content, 400, isFull)}\n`);
      } else {
        console.log(`File not found at: ${layer.path}`);
      }
    } else if (layer.category === 'project-rules') {
      if (!layer.files || layer.files.length === 0) {
        console.log('No project-level instructions (CLAUDE.md / AGENTS.md) found.');
      } else {
        for (const f of layer.files) {
          console.log(`* File: ${f.path} (${f.lineCount} lines, ${f.sizeBytes} bytes)`);
          console.log(`\n${truncatePreview(f.content, 400, isFull)}\n`);
        }
      }
    } else if (layer.category === 'partner-identity') {
      console.log(`Author Bot: ${layer.botAuthor}`);
      if (!layer.files || layer.files.length === 0) {
        console.log('No partner SOUL/MANUAL/MEMORY files found.');
      } else {
        for (const f of layer.files) {
          console.log(`* File: ${f.path} (${f.lineCount} lines)`);
          console.log(`\n${truncatePreview(f.content, 300, isFull)}\n`);
        }
      }
    } else if (layer.category === 'system-append') {
      console.log(`Summary: ${layer.summary}`);
    } else if (layer.category === 'user-original-prompt') {
      console.log(`Text:`);
      console.log(truncatePreview(layer.text, 500, isFull));
    } else if (layer.category === 'wire-actual-prompt') {
      console.log(`Length: ${layer.text ? layer.text.length : 0} characters`);
      console.log(`\n${truncatePreview(layer.text, 800, isFull)}\n`);
    } else if (layer.category === 'assistant-execution') {
      console.log(`Tools Called: ${layer.toolCallCount} (${layer.toolsUsed.join(', ') || 'none'})`);
      console.log(`\nReply Preview:`);
      console.log(truncatePreview(layer.replyText, 500, isFull));
    } else if (layer.category === 'execution-meta') {
      console.log(`Session: ${layer.sessionId}`);
      console.log(`SDK Session: ${layer.sdkSessionId}`);
      console.log(`Model: ${layer.model}`);
      console.log(`Working Dir: ${layer.workingDir}`);
      if (layer.groupName) console.log(`Group: ${layer.groupName} (${layer.groupId})`);
    }
  }
  console.log(`\n${line('=')}\n`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const isFull = args.includes('--full');
  const isJson = args.includes('--json');
  const targetArg = args.find((a) => !a.startsWith('--'));

  if (!targetArg) {
    console.error('Error: missing target URL or ID');
    process.exit(1);
  }

  const dbPath = findActiveDatabase();
  const db = new DatabaseSync(dbPath, { readOnly: true });

  const target = parseInputTarget(targetArg);
  const result = resolveInspection(db, target);

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    renderConsoleReport(result, isFull);
  }
}

main();
