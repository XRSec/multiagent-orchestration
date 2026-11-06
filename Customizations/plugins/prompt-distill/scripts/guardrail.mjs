/**
 * 保真门禁引擎 (Fidelity Guardrail Engine)
 * 防止小模型出现“过度推演与参数虚构”或“专业符号与技术语法侵蚀”
 */

// 提取技术实体：文件路径/名称 (如 file.ext, /path/to/x)、函数标识、特定命令行 flag、哈希
const ENTITY_PATTERNS = [
  /[a-zA-Z0-9_\-\./]+\.[a-zA-Z0-9_]{1,10}\b/g, // 文件名及相对/绝对路径
  /\b0x[a-fA-F0-9]+\b/g,                        // 十六进制
  /\b[a-f0-9]{7,40}\b/g,                        // Git commit hash
  /--[a-zA-Z0-9\-]+/g                           // CLI 选项
];

/**
 * 提取文本中的所有关键实体
 * @param {string} text 
 * @returns {Set<string>}
 */
function extractEntities(text) {
  const entities = new Set();
  if (!text) return entities;
  for (const pattern of ENTITY_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      for (const m of matches) {
        // 过滤掉纯数字或过短的常见标点
        if (m.length > 2 && !/^\d+$/.test(m)) {
          entities.add(m.toLowerCase());
        }
      }
    }
  }
  return entities;
}

/**
 * 校验提炼产物是否通过保真安全门禁
 * @param {string} originalPrompt 用户原始输入
 * @param {string} distilledResult 小模型产出的结构化提炼背景
 * @returns {{ valid: boolean, reason?: string }}
 */
export function verifyDistillation(originalPrompt, distilledResult) {
  if (!distilledResult || typeof distilledResult !== 'string' || distilledResult.trim().length === 0) {
    return { valid: false, reason: 'empty_result' };
  }

  // 1. 代码块越界检测：提炼背景严禁包含完整的可执行代码实现（允许单行符号或反引号内变量名）
  const codeBlockMatch = distilledResult.match(/```[a-zA-Z]*\n[\s\S]{50,}\n```/);
  if (codeBlockMatch) {
    return { valid: false, reason: 'code_block_hallucination_detected' };
  }

  // 2. 膨胀率断言：除基础结构化标签外，提炼输出长度不得无限制膨胀（允许 300 字符的基础元信息空间）
  const trimmedOriginal = originalPrompt.trim();
  const trimmedDistilled = distilledResult.trim();
  const maxAllowedLength = Math.max(350, trimmedOriginal.length * 3.5);
  if (trimmedDistilled.length > maxAllowedLength) {
    return { valid: false, reason: `inflation_ratio_exceeded (${trimmedDistilled.length} > ${maxAllowedLength})` };
  }

  // 3. 实体保留校验：原始输入中的关键技术实体（文件、路径、hash）必须在提炼结果中保留
  const originalEntities = extractEntities(trimmedOriginal);
  if (originalEntities.size > 0) {
    const distilledLower = trimmedDistilled.toLowerCase();
    const missingEntities = [];
    for (const ent of originalEntities) {
      if (!distilledLower.includes(ent)) {
        missingEntities.push(ent);
      }
    }
    // 如果关键实体丢失超过 50%，判定失真
    if (missingEntities.length > 0 && missingEntities.length >= Math.ceil(originalEntities.size * 0.5)) {
      return { valid: false, reason: `critical_entities_missing: ${missingEntities.join(', ')}` };
    }
  }

  return { valid: true };
}
