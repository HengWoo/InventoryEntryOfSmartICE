/**
 * AI Chat Service v1.0
 * 管理员 AI 助手服务层 - 调用 Supabase Edge Function ai-chat
 *
 * 功能：
 * - 发送消息到 AI 助手
 * - 管理对话历史
 * - 处理写操作二次确认流程
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://wdpeoyugsxqnpwwtkqsl.supabase.co';
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/ai-chat`;

// 消息类型
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  pendingAction?: PendingAction;
  timestamp: number;
}

// 待确认的写操作
export interface PendingAction {
  sql: string;
  explanation: string;
  affected_table?: string;
  confirmed?: boolean;
}

// AI 响应
interface AIResponse {
  text: string;
  pendingAction?: PendingAction;
  error?: string;
}

/**
 * 发送消息到 AI 助手
 * @param messages 对话历史
 * @param pendingAction 待确认的写操作（用户确认后传入）
 */
export async function sendChatMessage(
  messages: ChatMessage[],
  pendingAction?: PendingAction
): Promise<AIResponse> {
  // 构建发送给 Edge Function 的消息格式
  const apiMessages = messages.map(m => ({
    role: m.role,
    content: m.content
  }));

  const body: Record<string, any> = { messages: apiMessages };
  if (pendingAction) {
    body.pendingAction = pendingAction;
  }

  const response = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI 服务请求失败 (${response.status}): ${errorText}`);
  }

  return await response.json();
}
