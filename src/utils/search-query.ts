const CHINESE_STOP_WORDS = new Set([
  '我们', '你们', '他们', '这个', '那个', '这些', '那些', '一种', '一些', '以及', '然后',
  '因为', '所以', '如果', '就是', '不是', '已经', '可以', '需要', '进行', '通过', '对于',
  '关于', '其中', '没有', '怎么', '为什么', '什么', '时候', '可能', '需要先', '一个',
  '一种方法', '文章', '内容', '原文', '过程', '结果', '问题', '东西',
]);

const ENGLISH_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'about', 'then',
  'than', 'have', 'has', 'had', 'will', 'would', 'could', 'should', 'their',
  'there', 'what', 'when', 'where', 'which', 'while', 'using', 'used', 'into',
  'through', 'because', 'result', 'input', 'output', 'analysis', 'context',
]);

export interface SearchQueryOptions {
  prefix?: string;
  maxHandles?: number;
}

function normalizeWhitespace(text: string): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function trimDecorators(text: string): string {
  return text
    .replace(/^[-*#\d.\s:：_\[\]()"']+/, '')
    .replace(/[：:]\s*(对象|定义|程度|关系|动作|前提|说明|示例)\s*$/i, '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[()（）"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMeaningfulHandle(text: string): boolean {
  const value = text.trim();
  if (value.length < 2) return false;
  if (/^\d+$/.test(value)) return false;
  const lower = value.toLowerCase();
  if (CHINESE_STOP_WORDS.has(value) || ENGLISH_STOP_WORDS.has(lower)) return false;
  return true;
}

function splitClauses(text: string): string[] {
  return text
    .replace(/\r?\n/g, ' ')
    .split(/[，。；：、,.!?()\[\]{}<>/\\|]+/)
    .map(part => normalizeWhitespace(part))
    .filter(Boolean);
}

function splitEnglishWords(text: string): string[] {
  return text
    .split(/\s+/)
    .map(word => word.trim())
    .filter(word => /^[a-z0-9][a-z0-9-]{1,}$/i.test(word));
}

export function sanitizeHandle(raw: string, maxLength: number = 18): string {
  const trimmed = trimDecorators(normalizeWhitespace(raw));
  if (!trimmed) return '';

  const clauses = splitClauses(trimmed)
    .map(part => part.length > maxLength ? part.slice(0, maxLength) : part)
    .filter(isMeaningfulHandle);

  if (clauses.length > 0) {
    return clauses[0];
  }

  const words = splitEnglishWords(trimmed)
    .filter(word => !ENGLISH_STOP_WORDS.has(word.toLowerCase()))
    .slice(0, 3);
  if (words.length > 0) {
    return words.join(' ');
  }

  return trimmed.slice(0, maxLength);
}

export function extractInterfaceHandles(text: string, maxCount: number = 5): string[] {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];

  const clauses = splitClauses(normalized);
  const rawCandidates: string[] = [];

  for (const clause of clauses) {
    if (clause.length >= 2 && clause.length <= 18) {
      rawCandidates.push(clause);
      continue;
    }
    if (clause.length > 18) {
      rawCandidates.push(clause.slice(0, 18));
    }
  }

  const tokenMatches = normalized.match(/[A-Za-z][A-Za-z0-9-]{1,}|[\u4e00-\u9fa5]{2,12}/g) || [];
  rawCandidates.push(...tokenMatches);

  const unique: string[] = [];
  for (const candidate of rawCandidates) {
    const handle = sanitizeHandle(candidate);
    if (!isMeaningfulHandle(handle)) continue;
    if (!unique.includes(handle)) {
      unique.push(handle);
    }
    if (unique.length >= maxCount) break;
  }

  return unique;
}

export function sanitizeGeneratedHandles(handles: string[], fallbackText: string, maxCount: number = 5): string[] {
  const unique: string[] = [];
  for (const handle of handles) {
    const cleaned = sanitizeHandle(handle);
    if (!isMeaningfulHandle(cleaned)) continue;
    if (!unique.includes(cleaned)) {
      unique.push(cleaned);
    }
    if (unique.length >= maxCount) break;
  }

  if (unique.length > 0) {
    return unique;
  }

  return extractInterfaceHandles(fallbackText, maxCount);
}

export function buildInterfaceSearchQuery(text: string, options: SearchQueryOptions = {}): string {
  const handles = extractInterfaceHandles(text, options.maxHandles || 4);
  const parts: string[] = [];

  if (options.prefix) {
    const prefix = sanitizeHandle(options.prefix, 12);
    if (prefix) parts.push(prefix);
  }

  parts.push(...handles);
  return normalizeWhitespace(parts.join(' '));
}
