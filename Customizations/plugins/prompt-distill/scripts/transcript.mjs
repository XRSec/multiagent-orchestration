import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * 从会话 transcript (.jsonl) 中按轮次提取指定某轮主 Agent 生成的正文内容
 * @param {string} transcriptPath - transcript 文件绝对路径
 * @param {string} sessionId - 会话 ID（用于兜底定位）
 * @param {number} targetTurnIndex - 目标提取的轮次（从 1 开始，例如 1 表示第 1 轮主 Agent 正文）
 * @returns {string} 目标轮次主 Agent 输出的纯文本正文
 */
export function extractAssistantTextByTurn(transcriptPath, sessionId, targetTurnIndex = 1) {
  let resolvedPath = transcriptPath;

  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    resolvedPath = findTranscriptBySessionId(sessionId);
  }

  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    return '';
  }

  try {
    const rawContent = fs.readFileSync(resolvedPath, 'utf8');
    const lines = rawContent.split('\n');

    let currentTurn = 0;
    const turnAssistantTexts = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch (e) {
        continue;
      }

      // 检测用户提问，递增轮次
      if (record.type === 'user') {
        currentTurn++;
        if (currentTurn > targetTurnIndex) {
          // 已进入下一轮用户输入，当前目标轮次收集完毕
          break;
        }
        continue;
      }

      // 提取属于目标轮次的 assistant 正文
      if (currentTurn === targetTurnIndex && record.type === 'assistant') {
        const msg = record.message;
        if (msg && Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part && part.type === 'text' && typeof part.text === 'string') {
              const cleaned = part.text.trim();
              if (cleaned) {
                turnAssistantTexts.push(cleaned);
              }
            }
          }
        }
      }
    }

    return turnAssistantTexts.join('\n\n');
  } catch (err) {
    return '';
  }
}

/**
 * 遍历 ~/.claude/projects 查找匹配 sessionId 的 transcript
 */
function findTranscriptBySessionId(sessionId) {
  if (!sessionId) return null;
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(projectsDir)) return null;

  try {
    for (const d of fs.readdirSync(projectsDir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const target = path.join(projectsDir, d.name, `${sessionId}.jsonl`);
      if (fs.existsSync(target)) return target;
    }
  } catch (e) {}

  return null;
}
