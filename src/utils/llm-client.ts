import { requestUrl } from 'obsidian';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number };
}

export class LLMClient {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(apiKey: string, model: string = 'gpt-4o-mini', baseUrl: string = 'https://api.openai.com/v1') {
    this.apiKey = (apiKey || '').trim();
    this.model = model;
    this.baseUrl = this.normalizeBaseUrl(baseUrl || 'https://api.openai.com/v1');
  }

  updateConfig(apiKey: string, model?: string, baseUrl?: string): void {
    this.apiKey = (apiKey || '').trim();
    if (model) this.model = model;
    if (baseUrl) this.baseUrl = this.normalizeBaseUrl(baseUrl);
  }

  private normalizeBaseUrl(url: string): string {
    return (url || '').trim().replace(/\/+$/, '');
  }

  private detectKeyProvider(apiKey: string): 'openrouter' | 'openai' | 'unknown' {
    if (!apiKey) return 'unknown';
    if (apiKey.startsWith('sk-or-')) return 'openrouter';
    if (apiKey.startsWith('sk-proj-') || apiKey.startsWith('sk-')) return 'openai';
    return 'unknown';
  }

  private resolveEndpointAndHeaders(apiKey: string): { url: string; headers: Record<string, string>; autoFixHint?: string } {
    const keyProvider = this.detectKeyProvider(apiKey);
    let base = this.normalizeBaseUrl(this.baseUrl || 'https://api.openai.com/v1');
    const isOpenAIBase = /api\.openai\.com/i.test(base);
    const isOpenRouterBase = /openrouter\.ai/i.test(base);
    let autoFixHint: string | undefined;

    if (keyProvider === 'openrouter' && isOpenAIBase) {
      base = 'https://openrouter.ai/api/v1';
      autoFixHint = '检测到 OpenRouter Key，已自动切换到 OpenRouter Base URL。';
    } else if (keyProvider === 'openai' && isOpenRouterBase) {
      base = 'https://api.openai.com/v1';
      autoFixHint = '检测到 OpenAI Key，已自动切换到 OpenAI Base URL。';
    }

    const url = /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };

    if (/openrouter\.ai/i.test(base)) {
      headers['HTTP-Referer'] = 'https://obsidian.md';
      headers['X-Title'] = '逻辑原子引擎';
    }

    return { url, headers, autoFixHint };
  }

  async chat(messages: LLMMessage[], temperature: number = 0.3): Promise<LLMResponse> {
    const apiKey = (this.apiKey || '').trim();
    if (!apiKey) {
      throw new Error('LLM API Key 未配置，请先在插件设置中填写。');
    }

    const { url, headers, autoFixHint } = this.resolveEndpointAndHeaders(apiKey);
    if (autoFixHint) {
      console.warn('[LogicAtom LLM] Auto fixed provider mismatch:', autoFixHint);
    }
    console.log('[LogicAtom LLM] Request:', { providerUrl: url, model: this.model });

    try {
      const response = await requestUrl({
        url,
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature,
          max_tokens: 2000,
        }),
      });

      const data = response.json;
      return {
        content: data.choices[0].message.content,
        model: data.model,
        usage: data.usage,
      };
    } catch (e: any) {
      const rawMessage = e?.message || String(e);
      const status = e?.status || e?.statusCode;
      const is401 = status === 401 || /401/.test(rawMessage);
      const is403 = status === 403 || /403/.test(rawMessage);

      if (is401 || is403) {
        const keyProvider = this.detectKeyProvider(apiKey);
        const mismatchHint = keyProvider === 'openrouter' && /openai\.com/i.test(url)
          ? '（OpenRouter Key 与 OpenAI URL 不匹配）'
          : keyProvider === 'openai' && /openrouter\.ai/i.test(url)
            ? '（OpenAI Key 与 OpenRouter URL 不匹配）'
            : '';
        console.error('[LogicAtom LLM] Auth Error:', rawMessage);
        throw new Error(
          `[LLM ${is401 ? '401' : '403'}] 鉴权失败：请检查 LLM API Key、Base URL 和模型权限是否匹配${mismatchHint}`,
        );
      }

      console.error('[LogicAtom LLM] Error:', rawMessage);
      throw new Error(`[LLM] 请求失败：${rawMessage}`);
    }
  }

  async complete(systemPrompt: string, userPrompt: string, temperature: number = 0.3): Promise<string> {
    const resp = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], temperature);
    return resp.content;
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const resp = await this.chat([
        { role: 'system', content: 'You are a connectivity checker. Reply with only OK.' },
        { role: 'user', content: 'health_check' },
      ], 0);
      return {
        ok: true,
        message: `LLM 连接成功，模型：${resp.model || this.model}`,
      };
    } catch (e: any) {
      return {
        ok: false,
        message: `LLM 连接失败：${e?.message || String(e)}`,
      };
    }
  }
}
