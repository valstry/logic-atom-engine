import * as https from 'https';
import * as http from 'http';
import {
  StoreMemoryRequest,
  DeleteMemoriesFilter,
  SearchResponse,
  StoreResponse,
  GetMemoriesResponse,
  MemoryItem,
  MemoryResult,
} from './types';

interface HttpRequestParams {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export class EverMemOSClient {
  private static readonly MAX_SEARCH_QUERY_LENGTH = 180;
  private static readonly MAX_SEARCH_QUERY_ENCODED_LENGTH = 320;
  private apiUrl: string;
  private apiKey: string;
  private userId: string;
  private userName: string;
  private groupId: string;
  private groupName: string;
  private retrieveMethod: string;

  constructor(
    apiUrl: string,
    apiKey: string,
    userId: string,
    userName: string,
    groupId: string,
    groupName: string,
    retrieveMethod: string = 'hybrid',
  ) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
    this.userId = userId;
    this.userName = userName;
    this.groupId = groupId;
    this.groupName = groupName;
    this.retrieveMethod = retrieveMethod;
  }

  updateConfig(
    apiUrl: string,
    apiKey: string,
    userId: string,
    userName: string,
    groupId: string,
    groupName: string,
    retrieveMethod?: string,
  ): void {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
    this.userId = userId;
    this.userName = userName;
    this.groupId = groupId;
    this.groupName = groupName;
    if (retrieveMethod) this.retrieveMethod = retrieveMethod;
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['Authorization'] = `Bearer ${this.apiKey}`;
    return h;
  }

  private normalizeSearchQuery(
    query: string,
    maxLength: number = EverMemOSClient.MAX_SEARCH_QUERY_LENGTH,
  ): string {
    const compact = (query || '').replace(/\s+/g, ' ').trim();
    if (
      compact.length <= maxLength &&
      encodeURIComponent(compact).length <= EverMemOSClient.MAX_SEARCH_QUERY_ENCODED_LENGTH
    ) {
      return compact;
    }

    const tokens = compact
      .split(/[，。；：.!?()\[\]{}<>"'`~|\\/:\s]+/)
      .map(token => token.trim())
      .filter(token => token.length >= 2);

    const deduped: string[] = [];
    for (const token of tokens) {
      if (!deduped.includes(token)) {
        deduped.push(token);
      }
    }

    let reduced = '';
    for (const token of deduped) {
      const next = reduced ? `${reduced} ${token}` : token;
      if (
        next.length > maxLength ||
        encodeURIComponent(next).length > EverMemOSClient.MAX_SEARCH_QUERY_ENCODED_LENGTH
      ) {
        break;
      }
      reduced = next;
    }

    if (reduced) {
      return reduced;
    }

    let fallback = compact.slice(0, maxLength);
    while (
      fallback.length > 1 &&
      encodeURIComponent(fallback).length > EverMemOSClient.MAX_SEARCH_QUERY_ENCODED_LENGTH
    ) {
      fallback = fallback.slice(0, -1);
    }
    return fallback;
  }

  private httpRequest(params: HttpRequestParams): Promise<any> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(params.url);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;
      const bodyData = params.body || '';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...params.headers,
      };
      if (bodyData) {
        headers['Content-Length'] = Buffer.byteLength(bodyData).toString();
      }

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : (isHttps ? 443 : 80),
        path: parsedUrl.pathname + (parsedUrl.search || ''),
        method: params.method || 'GET',
        headers,
      };

      console.log('[LogicAtom] Request:', {
        method: options.method,
        path: parsedUrl.pathname,
        hasBody: !!bodyData,
      });

      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer | string) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          console.log('[LogicAtom] Response:', { status: res.statusCode, path: parsedUrl.pathname });
          if (res.statusCode && res.statusCode >= 400) {
            const status = res.statusCode;
            const endpoint = `${options.method} ${parsedUrl.pathname}`;
            if (status === 401 || status === 403) {
              reject(new Error(`[EverMind ${status}] 鉴权失败：请检查 API Key / user_id / group_id 配置（${endpoint}）`));
              return;
            }
            if (status === 414) {
              reject(new Error(`[EverMind 414] Search query too long for ${endpoint}`));
              return;
            }
            reject(new Error(`HTTP ${status}: ${data.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Invalid JSON response: ${data.slice(0, 200)}`));
          }
        });
      });

      req.on('error', (err: Error) => {
        console.error('[LogicAtom] Request error:', err.message, (err as NodeJS.ErrnoException).code || '');
        reject(err);
      });

      if (bodyData) req.write(bodyData);
      req.end();
    });
  }

  async storeMemory(content: string, messageId?: string): Promise<{ response: StoreResponse; eventId: string }> {
    const id = messageId || `atom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const body: StoreMemoryRequest = {
      message_id: id,
      create_time: new Date().toISOString(),
      sender: this.userId,
      sender_name: this.userName,
      content,
      group_id: this.groupId,
      flush: true,
    };

    const response = await this.httpRequest({
      url: `${this.apiUrl}/memories`,
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });
    return { response, eventId: id };
  }

  async deleteMemory(eventId: string): Promise<void> {
    const body: DeleteMemoriesFilter = { event_id: eventId };
    console.log('[LogicAtom] Deleting memory:', eventId);
    await this.httpRequest({
      url: `${this.apiUrl}/memories`,
      method: 'DELETE',
      headers: this.headers,
      body: JSON.stringify(body),
    });
    console.log('[LogicAtom] Memory deleted:', eventId);
  }

  async searchMemories(query: string, topK: number = 10, method?: string): Promise<MemoryResult[]> {
    const normalizedQuery = this.normalizeSearchQuery(query);
    const params = new URLSearchParams({
      query: normalizedQuery,
      user_id: this.userId,
      group_id: this.groupId,
      retrieve_method: method || this.retrieveMethod,
      top_k: String(topK),
    });

    const data = await this.httpRequest({
      url: `${this.apiUrl}/memories/search?${params}`,
      method: 'GET',
      headers: this.headers,
    }) as SearchResponse;

    if (!data || !data.result) return [];
    return this.normalizeResults(data);
  }

  async getMemories(): Promise<MemoryResult[]> {
    const params = new URLSearchParams({ user_id: this.userId });
    const data = await this.httpRequest({
      url: `${this.apiUrl}/memories?${params}`,
      method: 'GET',
      headers: this.headers,
    }) as GetMemoriesResponse;

    if (!data || !data.result) return [];
    return (data.result.memories || []).map((item, i) => this.itemToResult(item, i));
  }

  private normalizeResults(data: SearchResponse): MemoryResult[] {
    const results: MemoryResult[] = [];
    const memories = data.result.memories || [];
    const profiles = data.result.profiles || [];

    for (let i = 0; i < profiles.length; i++) {
      const item = { ...profiles[i], memory_type: 'profile' };
      results.push(this.itemToResult(item, i));
    }

    for (let i = 0; i < memories.length; i++) {
      results.push(this.itemToResult(memories[i], profiles.length + i));
    }

    return results;
  }

  private itemToResult(item: MemoryItem, index: number): MemoryResult {
    const content = item.content || item.summary || item.episode || item.subject || '';
    const title = item.subject || item.summary
      || (content.length > 60 ? `${content.slice(0, 60)}...` : content)
      || `Memory #${index}`;

    return {
      id: item.id || `mem_${index}`,
      title,
      content,
      type: item.memory_type === 'profile' ? 'profile' : 'memory',
      memoryType: item.memory_type || 'episodic_memory',
      score: item.score ?? 0,
      createdAt: item.created_at || '',
      raw: item,
    };
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    console.log('[LogicAtom] Testing connection...', {
      apiUrl: this.apiUrl,
      userId: this.userId,
      groupId: this.groupId,
      hasKey: !!this.apiKey,
    });
    try {
      const results = await this.searchMemories('test', 1);
      return { ok: true, message: `连接成功，找到 ${results.length} 条记忆` };
    } catch (e: any) {
      const msg = e?.message || String(e);
      const code = e?.code || '';
      console.error('[LogicAtom] Connection test failed:', msg, code);
      return { ok: false, message: `连接失败：${msg}` };
    }
  }
}
