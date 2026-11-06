/**
 * 纯净轻量小模型交互客户端 (Pure Lightweight LLM Client)
 * 约束：
 * 1. 严格使用廉价小模型 (默认 ANTHROPIC_DEFAULT_HAIKU_MODEL)
 * 2. 绝对不携带任何 tools, hooks, mcp 工具定义
 * 3. 仅携带插件本身的系统注入词 (system prompt) 与文本 messages
 */

export class LightweightLLM {
  constructor(config = {}) {
    this.config = config;
    this.resolvedModel = this.resolveModel();
    const rawBaseUrl = process.env.ANTHROPIC_BASE_URL || process.env.CPA_BASE_URL || (config.baseUrl && !config.baseUrl.startsWith('$') ? config.baseUrl : '');
    this.baseUrl = (rawBaseUrl || '').replace(/\/+$/, '');
    this.apiKey = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY || process.env.CPA_API_KEY || (config.apiKey && !config.apiKey.startsWith('$') ? config.apiKey : '');
    this.timeoutMs = config.timeoutMs || 15000;
  }

  resolveModel() {
    const configured = this.config.model;
    if (configured === 'ANTHROPIC_DEFAULT_HAIKU_MODEL') {
      const fromEnv = process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL;
      if (fromEnv && fromEnv.trim()) {
        return fromEnv.trim();
      }
      return this.config.fallbackModel || 'gemini-3.8-flash';
    }
    return configured || this.config.fallbackModel || 'gemini-3.8-flash';
  }

  /**
   * 发起纯净单轮 LLM 文本请求
   * @param {string} userPrompt - 用户指令
   * @param {string} systemPrompt - 纯净系统注入词
   * @returns {Promise<string>} LLM 返回的正文内容
   */
  async complete(userPrompt, systemPrompt = '') {
    const endpoint = `${this.baseUrl}/v1/messages`;
    const payload = {
      model: this.resolvedModel,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ]
    };

    // 仅携带注入词，绝不携带任何 tools 或 mcp 定义
    if (systemPrompt && systemPrompt.trim()) {
      payload.system = systemPrompt.trim();
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`LLM HTTP ${res.status}: ${errorText.slice(0, 300)}`);
      }

      const data = await res.json();
      
      // 解析 Anthropic Messages 协议回复
      if (Array.isArray(data.content)) {
        const textParts = data.content
          .filter(c => c && c.type === 'text' && typeof c.text === 'string')
          .map(c => c.text);
        if (textParts.length > 0) {
          return textParts.join('\n').trim();
        }
      }

      // 兼容 OpenAI 格式备选解析
      if (Array.isArray(data.choices) && data.choices[0]?.message?.content) {
        return data.choices[0].message.content.trim();
      }

      throw new Error(`Unexpected LLM response format: ${JSON.stringify(data).slice(0, 200)}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}
