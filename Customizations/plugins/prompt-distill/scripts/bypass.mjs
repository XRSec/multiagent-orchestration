/**
 * 0ms 纯规则本地旁路引擎 (Deterministic Fast-Path Engine)
 * 针对极简确认词、原生命令和紧急阻断词，直接放行，0ms 延迟，零幻觉风险
 */

// 纯确认词：避免小模型将“继续”脑补为带有偏见的具体代码行动
const CONFIRM_REGEX = /^(y|yes|ok|sure|continue|go\s*ahead|继续|好的|执行|推进|行|可以|好)$/i;

// 原生命令与脚本：保护精密的技术参数与命令行参数不受自然语言改写破坏
const NATIVE_COMMAND_REGEX = /^(\/.*|git\s+.*|npm\s+.*|cargo\s+.*|pytest.*|pnpm\s+.*|bun\s+.*|yarn\s+.*|docker\s+.*|node\s+.*|python\s+.*|make\s+.*)/i;

// 紧急阻断与回滚：避免由于小模型推理超时或语义平滑化导致操作刹车失效
const EMERGENCY_REGEX = /^(no|stop|abort|cancel|revert|回滚|放弃|别动|停止|中断|撤销)$/i;

/**
 * 检查用户输入是否命中快速旁路
 * @param {string} prompt 用户原始输入
 * @returns {{ shouldBypass: boolean, reason?: string }}
 */
export function checkBypass(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return { shouldBypass: true, reason: 'empty_prompt' };
  }

  const trimmed = prompt.trim();

  // 1. 纯确认词
  if (CONFIRM_REGEX.test(trimmed)) {
    return { shouldBypass: true, reason: 'confirmation_bypass' };
  }

  // 2. 原生系统命令与 CLI 脚本
  if (NATIVE_COMMAND_REGEX.test(trimmed)) {
    return { shouldBypass: true, reason: 'native_command_bypass' };
  }

  // 3. 紧急阻断与回滚词
  if (EMERGENCY_REGEX.test(trimmed)) {
    return { shouldBypass: true, reason: 'emergency_brake_bypass' };
  }

  // 4. 超短非指令输入（比如纯标点或<=2字符）直接透传
  if (trimmed.length <= 2) {
    return { shouldBypass: true, reason: 'too_short_bypass' };
  }

  return { shouldBypass: false };
}
