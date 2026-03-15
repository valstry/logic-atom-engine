// EverMemOS Cloud API Types
// Base: https://api.evermind.ai/api/v0
// Auth: Bearer {API_KEY}

// --- Request Types ---

export interface StoreMemoryRequest {
  message_id: string;
  create_time: string;
  sender: string;
  sender_name?: string;
  content: string;
  group_id?: string;
  group_name?: string;
  role?: 'user' | 'assistant';
  flush?: boolean;
}

export interface DeleteMemoriesFilter {
  event_id?: string;
  user_id?: string;
  group_id?: string;
}

export interface StoredMemoryInfo {
  eventId: string;  // message_id used at storage time, used for deletion
  content: string;  // stored content summary
}

// Search uses GET with query params, no request body type needed

// --- Response Types ---

export interface MemoryItem {
  id?: string;
  content: string;
  summary?: string;
  episode?: string;
  subject?: string;
  memory_type?: string;
  created_at?: string;
  updated_at?: string;
  score?: number;
  metadata?: Record<string, unknown>;
  original_data?: Array<{
    messages?: Array<{
      content: string;
      role: string;
      timestamp: string;
    }>;
  }>;
}

export interface SearchResponse {
  status: string;
  message: string;
  result: {
    memories: MemoryItem[];
    profiles?: MemoryItem[];
    scores?: unknown[];
    total_count?: number;
    has_more?: boolean;
  };
}

export interface StoreResponse {
  status: string;
  message: string;
  result?: {
    saved_memories?: unknown[];
    count?: number;
    status_info?: string;
  };
}

export interface GetMemoriesResponse {
  status: string;
  message: string;
  result: {
    memories: MemoryItem[];
    total_count?: number;
    has_more?: boolean;
  };
}

// --- Unified Internal Types ---

export interface MemoryResult {
  id: string;
  title: string;
  content: string;
  type: 'memory' | 'profile';
  memoryType: string;
  score: number;
  createdAt: string;
  raw: MemoryItem;
}
