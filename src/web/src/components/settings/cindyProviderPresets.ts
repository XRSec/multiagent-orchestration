/**
 * Migrated from cindy/main:packages/model-providers/catalog/providers.json (presets section)
 * Official Cindy provider preset catalog for AddProviderWizard / ProviderEditorModal.
 */

export interface CindyProviderPreset {
  id: string;
  name: string;
  docsUrl: string;
  baseUrl: string;
  models: Array<{
    id: string;
    name: string;
    contextWindow?: number;
    maxTokens?: number;
    reasoning?: boolean;
    image?: boolean;
  }>;
}

export const CINDY_PROVIDER_PRESETS: readonly CindyProviderPreset[] = [
  {
    "id": "sub2api",
    "name": "Sub2API",
    "docsUrl": "https://github.com/Wei-Shaw/sub2api",
    "baseUrl": "https://{endpoint}/v1",
    "models": []
  },
  {
    "id": "openrouter",
    "name": "OpenRouter",
    "docsUrl": "https://openrouter.ai/docs/cookbook/coding-agents/claude-code-integration",
    "baseUrl": "https://openrouter.ai/api",
    "models": [
      {
        "id": "z-ai/glm-5.2",
        "name": "GLM-5.2",
        "contextWindow": 1048576,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "moonshotai/kimi-k2.6",
        "name": "Kimi K2.6",
        "contextWindow": 262144,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "deepseek/deepseek-v4-pro",
        "name": "DeepSeek V4 Pro",
        "contextWindow": 1048576,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "qwen/qwen3.8-27b",
        "name": "Qwen3.8 27B",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "qwen/qwen3.8-2.4t-a95b",
        "name": "Qwen3.8 2.4T A95B",
        "contextWindow": 1048576,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "qwen/qwen3.8-flash",
        "name": "Qwen3.8 Flash",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      }
    ]
  },
  {
    "id": "deepseek",
    "name": "DeepSeek",
    "docsUrl": "https://api-docs.deepseek.com/guides/anthropic_api",
    "baseUrl": "https://api.deepseek.com/anthropic",
    "models": [
      {
        "id": "deepseek-flash",
        "name": "DeepSeek V4.1 Flash",
        "contextWindow": 1048576,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "deepseek-v4-pro",
        "name": "DeepSeek-V4-Pro",
        "contextWindow": 1048576,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      }
    ]
  },
  {
    "id": "zhipu-glm-cn",
    "name": "智谱 GLM（中国大陆）",
    "docsUrl": "https://docs.bigmodel.cn/cn/guide/develop/claude",
    "baseUrl": "https://open.bigmodel.cn/api/anthropic",
    "models": [
      {
        "id": "glm-5.3-flash",
        "name": "GLM-5.3-Flash",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "glm-5.3",
        "name": "GLM-5.3",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "glm-5.2",
        "name": "GLM-5.2",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "glm-5.1",
        "name": "GLM-5.1",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      }
    ]
  },
  {
    "id": "zhipu-glm-global",
    "name": "Z.ai GLM (Global)",
    "docsUrl": "https://docs.z.ai/devpack/tool/claude",
    "baseUrl": "https://api.z.ai/api/anthropic",
    "models": [
      {
        "id": "glm-5.3-flash",
        "name": "GLM-5.3-Flash",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "glm-5.3",
        "name": "GLM-5.3",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "glm-5.2",
        "name": "GLM-5.2",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "glm-5.1",
        "name": "GLM-5.1",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      }
    ]
  },
  {
    "id": "moonshot-kimi-cn",
    "name": "Kimi (Moonshot 中国大陆)",
    "docsUrl": "https://platform.moonshot.cn/docs/guide/agent-support",
    "baseUrl": "https://api.moonshot.cn/anthropic",
    "models": [
      {
        "id": "kimi-k3.1-pro",
        "name": "Kimi K3.1 Pro",
        "contextWindow": 1048576,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "kimi-k3.1-pro-highspeed",
        "name": "Kimi K3.1 Pro Highspeed",
        "contextWindow": 1048576,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "kimi-k3",
        "name": "Kimi K3",
        "contextWindow": 1048576,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "kimi-k2.7-code",
        "name": "Kimi K2.7 Code",
        "contextWindow": 262144,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "kimi-k2.7-code-highspeed",
        "name": "Kimi K2.7 Code HighSpeed",
        "contextWindow": 262144,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "kimi-k2.6",
        "name": "Kimi K2.6",
        "contextWindow": 262144,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      }
    ]
  },
  {
    "id": "moonshot-kimi-global",
    "name": "Kimi (Moonshot Global)",
    "docsUrl": "https://platform.moonshot.ai/docs/guide/agent-support",
    "baseUrl": "https://api.moonshot.ai/anthropic",
    "models": [
      {
        "id": "kimi-k3.1-pro",
        "name": "Kimi K3.1 Pro",
        "contextWindow": 1048576,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "kimi-k3.1-pro-highspeed",
        "name": "Kimi K3.1 Pro Highspeed",
        "contextWindow": 1048576,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "kimi-k3",
        "name": "Kimi K3",
        "contextWindow": 1048576,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "kimi-k2.7-code",
        "name": "Kimi K2.7 Code",
        "contextWindow": 262144,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "kimi-k2.7-code-highspeed",
        "name": "Kimi K2.7 Code HighSpeed",
        "contextWindow": 262144,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "kimi-k2.6",
        "name": "Kimi K2.6",
        "contextWindow": 262144,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      }
    ]
  },
  {
    "id": "moonshot-kimi-code",
    "name": "Kimi Code（编程计划包月）",
    "docsUrl": "https://www.kimi.com/zh-cn/help/kimi-code/third-party-agents",
    "baseUrl": "https://api.kimi.com/coding",
    "models": [
      {
        "id": "k3.1-pro",
        "name": "Kimi K3.1 Pro",
        "contextWindow": 262144,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "k3.1-pro-highspeed",
        "name": "Kimi K3.1 Pro Highspeed",
        "contextWindow": 1048576,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "kimi-for-coding",
        "name": "Kimi K2.8 Preview",
        "contextWindow": 1048576,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "kimi-for-coding-highspeed",
        "name": "Kimi K2.7 Code HighSpeed",
        "contextWindow": 262144,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "k3",
        "name": "Kimi K3",
        "contextWindow": 262144,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "k3-256k",
        "name": "Kimi K3 (256K)",
        "contextWindow": 262144,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      }
    ]
  },
  {
    "id": "minimax-cn",
    "name": "MiniMax（中国大陆）",
    "docsUrl": "https://platform.minimaxi.com/docs/api-reference/responses-create",
    "baseUrl": "https://api.minimaxi.com/anthropic",
    "models": [
      {
        "id": "MiniMax-M3.1-Flash",
        "name": "MiniMax M3.1 Flash",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "MiniMax-M3",
        "name": "MiniMax-M3",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "MiniMax-M2.7",
        "name": "MiniMax-M2.7",
        "contextWindow": 204800,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "MiniMax-M2.7-highspeed",
        "name": "MiniMax-M2.7-highspeed",
        "contextWindow": 204800,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "MiniMax-M2.5",
        "name": "MiniMax-M2.5",
        "contextWindow": 204800,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "MiniMax-M2.5-highspeed",
        "name": "MiniMax-M2.5-highspeed",
        "contextWindow": 204800,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "MiniMax-M2.1",
        "name": "MiniMax-M2.1",
        "contextWindow": 204800,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "MiniMax-M2.1-highspeed",
        "name": "MiniMax-M2.1-highspeed",
        "contextWindow": 204800,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "MiniMax-M2",
        "name": "MiniMax-M2",
        "contextWindow": 204800,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      }
    ]
  },
  {
    "id": "minimax-global",
    "name": "MiniMax (Global)",
    "docsUrl": "https://platform.minimax.io/docs/api-reference/responses-create",
    "baseUrl": "https://api.minimax.io/anthropic",
    "models": [
      {
        "id": "MiniMax-M3.1-Flash",
        "name": "MiniMax M3.1 Flash",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "MiniMax-M3",
        "name": "MiniMax-M3",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "MiniMax-M2.7",
        "name": "MiniMax-M2.7",
        "contextWindow": 204800,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "MiniMax-M2.7-highspeed",
        "name": "MiniMax-M2.7-highspeed",
        "contextWindow": 204800,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "MiniMax-M2.5",
        "name": "MiniMax-M2.5",
        "contextWindow": 204800,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "MiniMax-M2.5-highspeed",
        "name": "MiniMax-M2.5-highspeed",
        "contextWindow": 204800,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "MiniMax-M2.1",
        "name": "MiniMax-M2.1",
        "contextWindow": 204800,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "MiniMax-M2.1-highspeed",
        "name": "MiniMax-M2.1-highspeed",
        "contextWindow": 204800,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "MiniMax-M2",
        "name": "MiniMax-M2",
        "contextWindow": 204800,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      }
    ]
  },
  {
    "id": "aliyun-bailian-coding",
    "name": "阿里云百炼 Coding Plan（包月）",
    "docsUrl": "https://help.aliyun.com/zh/model-studio/coding-plan",
    "baseUrl": "https://coding.dashscope.aliyuncs.com/apps/anthropic",
    "models": [
      {
        "id": "qwen3.7-plus",
        "name": "Qwen3.7-Plus",
        "contextWindow": 983616,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "qwen3.6-plus",
        "name": "Qwen3.6-Plus",
        "contextWindow": 983616,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "kimi-k2.5",
        "name": "Kimi K2.5",
        "contextWindow": 229376,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "glm-5",
        "name": "GLM-5",
        "contextWindow": 169984,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "MiniMax-M2.5",
        "name": "MiniMax-M2.5",
        "contextWindow": 196608,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "qwen3-coder-next",
        "name": "Qwen3 Coder Next",
        "contextWindow": 204800,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "qwen3-coder-plus",
        "name": "Qwen3-Coder-Plus",
        "contextWindow": 997952,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      }
    ]
  },
  {
    "id": "aliyun-bailian-token-plan-cn",
    "name": "阿里云百炼 Token Plan（个人版）",
    "docsUrl": "https://help.aliyun.com/zh/model-studio/token-plan-personal-overview",
    "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic",
    "models": [
      {
        "id": "qwen3.8-max",
        "name": "Qwen3.8-Max",
        "contextWindow": 983616,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "qwen3.8-flash",
        "name": "Qwen3.8-Flash",
        "contextWindow": 983616,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "qwen3.7-max",
        "name": "Qwen3.7-Max",
        "contextWindow": 983616,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "qwen3.7-plus",
        "name": "Qwen3.7-Plus",
        "contextWindow": 983616,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "qwen3.6-flash",
        "name": "Qwen3.6-Flash",
        "contextWindow": 983616,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "deepseek-v4.1-flash",
        "name": "DeepSeek-V4.1-Flash",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "deepseek-v4-pro",
        "name": "DeepSeek-V4-Pro",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "glm-5.3",
        "name": "GLM-5.3",
        "contextWindow": 1048576,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "glm-5.2",
        "name": "GLM-5.2",
        "contextWindow": 1048576,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      }
    ]
  },
  {
    "id": "aliyun-bailian-token-plan-team-cn",
    "name": "阿里云百炼 Token Plan（团队版）",
    "docsUrl": "https://help.aliyun.com/zh/model-studio/token-plan-team-overview",
    "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic",
    "models": [
      {
        "id": "qwen3.8-max",
        "name": "Qwen3.8-Max",
        "contextWindow": 983616,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "qwen3.8-flash",
        "name": "Qwen3.8-Flash",
        "contextWindow": 983616,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "qwen3.7-max",
        "name": "Qwen3.7-Max",
        "contextWindow": 983616,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "qwen3.7-plus",
        "name": "Qwen3.7-Plus",
        "contextWindow": 983616,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "qwen3.6-plus",
        "name": "Qwen3.6-Plus",
        "contextWindow": 983616,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "qwen3.6-flash",
        "name": "Qwen3.6-Flash",
        "contextWindow": 983616,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "deepseek-v4.1-flash",
        "name": "DeepSeek-V4.1-Flash",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "deepseek-v4-pro",
        "name": "DeepSeek-V4-Pro",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "deepseek-v4-flash",
        "name": "DeepSeek-V4-Flash",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "kimi-k2.7-code",
        "name": "Kimi K2.7 Code",
        "contextWindow": 229376,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "kimi-k2.6",
        "name": "Kimi K2.6",
        "contextWindow": 229376,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "kimi-k2.5",
        "name": "Kimi K2.5",
        "contextWindow": 229376,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "glm-5.3",
        "name": "GLM-5.3",
        "contextWindow": 1048576,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "glm-5.2",
        "name": "GLM-5.2",
        "contextWindow": 1048576,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "glm-5.1",
        "name": "GLM-5.1",
        "contextWindow": 169984,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "glm-5",
        "name": "GLM-5",
        "contextWindow": 169984,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "MiniMax-M2.5",
        "name": "MiniMax-M2.5",
        "contextWindow": 196608,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      }
    ]
  },
  {
    "id": "google-gemini-api",
    "name": "Google Gemini API",
    "docsUrl": "https://ai.google.dev/gemini-api/docs/openai",
    "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai",
    "models": [
      {
        "id": "gemini-3.6-flash",
        "name": "Gemini 3.6 Flash",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "gemini-3.5-flash",
        "name": "Gemini 3.5 Flash",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "gemini-3.5-flash-lite",
        "name": "Gemini 3.5 Flash-Lite",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      }
    ]
  },
  {
    "id": "litellm",
    "name": "LiteLLM Proxy",
    "docsUrl": "https://docs.litellm.ai/docs/proxy/quick_start",
    "baseUrl": "http://127.0.0.1:4000/v1",
    "models": []
  },
  {
    "id": "lmstudio",
    "name": "LM Studio",
    "docsUrl": "https://lmstudio.ai/docs/app/api",
    "baseUrl": "http://127.0.0.1:1234",
    "models": []
  },
  {
    "id": "llamacpp",
    "name": "llama.cpp",
    "docsUrl": "https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md",
    "baseUrl": "http://127.0.0.1:8080/v1",
    "models": []
  },
  {
    "id": "vllm",
    "name": "vLLM",
    "docsUrl": "https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html",
    "baseUrl": "http://127.0.0.1:8000/v1",
    "models": []
  },
  {
    "id": "longcat",
    "name": "LongCat",
    "docsUrl": "https://longcat.chat/platform/docs/zh/",
    "baseUrl": "https://api.longcat.chat/anthropic",
    "models": [
      {
        "id": "LongCat-2.0",
        "name": "LongCat 2.0",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      }
    ]
  },
  {
    "id": "zhipu-coding-plan-cn",
    "name": "智谱 GLM Coding Plan（中国大陆）",
    "docsUrl": "https://docs.bigmodel.cn/cn/coding-plan/quick-start",
    "baseUrl": "https://open.bigmodel.cn/api/anthropic",
    "models": [
      {
        "id": "glm-5.3[1m]",
        "name": "GLM-5.3 (1M)",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "glm-5.3-flash[1m]",
        "name": "GLM-5.3-Flash (1M)",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "glm-5.3",
        "name": "GLM-5.3",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "glm-5.3-flash",
        "name": "GLM-5.3-Flash",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      }
    ]
  },
  {
    "id": "zai-coding-plan-global",
    "name": "Z.ai GLM Coding Plan (Global)",
    "docsUrl": "https://docs.z.ai/devpack/overview",
    "baseUrl": "https://api.z.ai/api/anthropic",
    "models": [
      {
        "id": "glm-5.3[1m]",
        "name": "GLM-5.3 (1M)",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "glm-5.3-flash[1m]",
        "name": "GLM-5.3-Flash (1M)",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "glm-5.3",
        "name": "GLM-5.3",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "glm-5.3-flash",
        "name": "GLM-5.3-Flash",
        "contextWindow": 1000000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      }
    ]
  },
  {
    "id": "xiaomi-mimo-api-cn",
    "name": "小米 MiMo API（按量）",
    "docsUrl": "https://mimo.mi.com/docs/zh-CN/quick-start/summary/first-api-call",
    "baseUrl": "https://api.xiaomimimo.com/anthropic",
    "models": [
      {
        "id": "mimo-v2.6-pro",
        "name": "MiMo-V2.6-Pro",
        "contextWindow": 1048576,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "mimo-v2.6-flash",
        "name": "MiMo-V2.6-Flash",
        "contextWindow": 1048576,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "mimo-v2.6-pro-ultraspeed",
        "name": "MiMo-V2.6-Pro-UltraSpeed",
        "contextWindow": 1048576,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      }
    ]
  },
  {
    "id": "xiaomi-mimo-token-plan-cn",
    "name": "小米 MiMo Token Plan（包月）",
    "docsUrl": "https://mimo.mi.com/docs/zh-CN/quick-start/summary/first-api-call",
    "baseUrl": "https://token-plan-cn.xiaomimimo.com/anthropic",
    "models": [
      {
        "id": "mimo-v2.6-pro",
        "name": "MiMo-V2.6-Pro",
        "contextWindow": 1048576,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "mimo-v2.6-flash",
        "name": "MiMo-V2.6-Flash",
        "contextWindow": 1048576,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      }
    ]
  },
  {
    "id": "volcengine-api",
    "name": "火山方舟 API",
    "docsUrl": "https://www.volcengine.com/docs/82379/1330310",
    "baseUrl": "https://ark.cn-beijing.volces.com/api/v3",
    "models": []
  },
  {
    "id": "siliconflow-cn",
    "name": "硅基流动（中国大陆）",
    "docsUrl": "https://docs.siliconflow.cn/cn/userguide/quickstart",
    "baseUrl": "https://api.siliconflow.cn/v1",
    "models": []
  },
  {
    "id": "siliconflow-global",
    "name": "硅基流动",
    "docsUrl": "https://docs.siliconflow.com/en/userguide/quickstart",
    "baseUrl": "https://api.siliconflow.com/v1",
    "models": []
  },
  {
    "id": "volcengine-agent-plan",
    "name": "火山方舟 Agent Plan",
    "docsUrl": "https://docs.volcengine.com/docs/82379/2373738",
    "baseUrl": "https://ark.cn-beijing.volces.com/api/plan",
    "models": [
      {
        "id": "ark-code-latest",
        "name": "Ark Code Latest",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      }
    ]
  },
  {
    "id": "volcengine-coding-plan",
    "name": "火山方舟 Coding Plan",
    "docsUrl": "https://www.volcengine.com/docs/82379/1925114",
    "baseUrl": "https://ark.cn-beijing.volces.com/api/coding",
    "models": [
      {
        "id": "ark-code-latest",
        "name": "Ark Code Latest",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      }
    ]
  },
  {
    "id": "tencentcloud-coding-plan",
    "name": "腾讯云 Coding Plan",
    "docsUrl": "https://cloud.tencent.com/document/product/1823/130092",
    "baseUrl": "https://api.lkeap.cloud.tencent.com/coding/anthropic",
    "models": [
      {
        "id": "tc-code-latest",
        "name": "Tencent Code Latest",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "glm-5",
        "name": "GLM-5",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      }
    ]
  },
  {
    "id": "opencode-go",
    "name": "OpenCode Go",
    "docsUrl": "https://opencode.ai/docs/go/",
    "baseUrl": "https://opencode.ai/zen/go",
    "models": [
      {
        "id": "minimax-m3",
        "name": "MiniMax M3",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "minimax-m2.7",
        "name": "MiniMax M2.7",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "minimax-m2.5",
        "name": "MiniMax M2.5",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "qwen3.7-max",
        "name": "Qwen3.7 Max",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "qwen3.7-plus",
        "name": "Qwen3.7 Plus",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "qwen3.6-plus",
        "name": "Qwen3.6 Plus",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "grok-4.5",
        "name": "Grok 4.5",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "glm-5.2",
        "name": "GLM-5.2",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "glm-5.1",
        "name": "GLM-5.1",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "kimi-k3",
        "name": "Kimi K3",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "kimi-k2.7-code",
        "name": "Kimi K2.7 Code",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "kimi-k2.6",
        "name": "Kimi K2.6",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "mimo-v2.6-pro",
        "name": "MiMo-V2.6-Pro",
        "contextWindow": 1048576,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "mimo-v2.6-flash",
        "name": "MiMo-V2.6-Flash",
        "contextWindow": 1048576,
        "maxTokens": 64000,
        "reasoning": true,
        "image": true
      },
      {
        "id": "deepseek-v4-pro",
        "name": "DeepSeek V4 Pro",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "deepseek-v4-flash",
        "name": "DeepSeek V4 Flash",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "hy3",
        "name": "Hy3",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      }
    ]
  },
  {
    "id": "vercel-ai-gateway",
    "name": "Vercel AI Gateway",
    "docsUrl": "https://vercel.com/docs/ai-gateway/coding-agents",
    "baseUrl": "https://ai-gateway.vercel.sh",
    "models": [
      {
        "id": "anthropic/claude-sonnet-4.6",
        "name": "Claude Sonnet 4.6 (Vercel)",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "openai/gpt-5.4",
        "name": "GPT-5.4 (Vercel)",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "xai/grok-4.5",
        "name": "Grok 4.5 (Vercel)",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      }
    ]
  },
  {
    "id": "agnes",
    "name": "Agnes AI",
    "docsUrl": "https://wiki.agnes-ai.com/en/docs/overview",
    "baseUrl": "https://apihub.agnes-ai.com",
    "models": [
      {
        "id": "agnes-3.0-flash",
        "name": "Agnes 3.0 Flash",
        "contextWindow": 512000,
        "maxTokens": 65536,
        "reasoning": true,
        "image": true
      },
      {
        "id": "agnes-2.5-pro",
        "name": "Agnes 2.5 Pro",
        "contextWindow": 1000000,
        "maxTokens": 65536,
        "reasoning": true,
        "image": true
      },
      {
        "id": "agnes-2.5-pro-beta",
        "name": "Agnes 2.5 Pro Beta",
        "contextWindow": 1000000,
        "maxTokens": 65536,
        "reasoning": true,
        "image": true
      },
      {
        "id": "agnes-2.5-flash",
        "name": "Agnes 2.5 Flash",
        "contextWindow": 512000,
        "maxTokens": 65536,
        "reasoning": true,
        "image": true
      }
    ]
  },
  {
    "id": "openhubs",
    "name": "OpenHubs",
    "docsUrl": "https://openhubs.zhidemai.com/docs",
    "baseUrl": "https://openhubs.zhidemai.com",
    "models": [
      {
        "id": "deepseek-v4-flash",
        "name": "DeepSeek V4 Flash",
        "contextWindow": 1048576,
        "maxTokens": 384000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "kimi-k3.1-pro",
        "name": "Kimi K3.1 Pro",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      },
      {
        "id": "glm-5.3",
        "name": "GLM 5.3",
        "contextWindow": 200000,
        "maxTokens": 64000,
        "reasoning": true,
        "image": false
      }
    ]
  },
  {
    "id": "ollama-cloud",
    "name": "Ollama Cloud",
    "docsUrl": "https://docs.ollama.com/cloud",
    "baseUrl": "https://ollama.com",
    "models": []
  },
  {
    "id": "magpie",
    "name": "Magpie",
    "docsUrl": "https://usemagpie.ai/docs/integrate",
    "baseUrl": "http://127.0.0.1:3425",
    "models": []
  }
];
