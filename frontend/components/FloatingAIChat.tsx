/**
 * FloatingAIChat v1.0
 * 管理员 AI 助手悬浮聊天组件 - Storm Glass 毛玻璃风格
 *
 * 功能：
 * - 悬浮气泡按钮，点击展开聊天面板
 * - 多轮对话，支持 tool calling 状态展示
 * - 写操作二次确认 UI（确认/取消按钮）
 * - 自动滚动到最新消息
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { sendChatMessage, ChatMessage, PendingAction } from '../services/aiChatService';

// 简单 Markdown 渲染：代码块、加粗、换行
function renderMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // 按代码块分割
  const segments = text.split(/(```[\s\S]*?```)/g);

  segments.forEach((seg, i) => {
    if (seg.startsWith('```')) {
      // 代码块
      const code = seg.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
      parts.push(
        <pre key={i} className="my-2 p-3 rounded-xl text-xs overflow-x-auto font-mono"
          style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <code>{code}</code>
        </pre>
      );
    } else {
      // 普通文本：处理加粗和换行
      const lines = seg.split('\n');
      lines.forEach((line, j) => {
        if (j > 0) parts.push(<br key={`br-${i}-${j}`} />);
        // 加粗
        const boldParts = line.split(/(\*\*[^*]+\*\*)/g);
        boldParts.forEach((bp, k) => {
          if (bp.startsWith('**') && bp.endsWith('**')) {
            parts.push(<strong key={`b-${i}-${j}-${k}`}>{bp.slice(2, -2)}</strong>);
          } else {
            parts.push(<span key={`t-${i}-${j}-${k}`}>{bp}</span>);
          }
        });
      });
    }
  });
  return parts;
}

export const FloatingAIChat: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 打开时聚焦输入框
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  // 发送消息
  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: trimmed, timestamp: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const result = await sendChatMessage(newMessages);
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: result.text,
        pendingAction: result.pendingAction,
        timestamp: Date.now()
      };
      setMessages([...newMessages, assistantMsg]);
      if (result.pendingAction) {
        setPendingAction(result.pendingAction);
      }
    } catch (e: any) {
      setMessages([...newMessages, {
        role: 'assistant' as const,
        content: `❌ 请求失败: ${e.message}`,
        timestamp: Date.now()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // 确认写操作
  const handleConfirm = async () => {
    if (!pendingAction || isLoading) return;
    setIsLoading(true);
    const confirmedAction = { ...pendingAction, confirmed: true };
    setPendingAction(null);

    try {
      const result = await sendChatMessage(messages, confirmedAction);
      setMessages((prev: ChatMessage[]) => [...prev, {
        role: 'assistant',
        content: result.text,
        timestamp: Date.now()
      }]);
    } catch (e: any) {
      setMessages((prev: ChatMessage[]) => [...prev, {
        role: 'assistant',
        content: `❌ 执行失败: ${e.message}`,
        timestamp: Date.now()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // 取消写操作
  const handleCancel = () => {
    setPendingAction(null);
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: '❎ 操作已取消。',
      timestamp: Date.now()
    }]);
  };

  // 清空对话
  const handleClear = () => {
    setMessages([]);
    setPendingAction(null);
  };

  // 键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* 悬浮气泡按钮 */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-110 active:scale-95"
          style={{
            background: 'linear-gradient(135deg, rgba(91,163,192,0.8) 0%, rgba(91,163,192,0.5) 100%)',
            border: '1px solid rgba(255,255,255,0.2)',
            boxShadow: '0 4px 20px rgba(91,163,192,0.4), 0 0 40px rgba(91,163,192,0.15)',
          }}
          title="AI 助手"
        >
          <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
        </button>
      )}

      {/* 聊天面板 */}
      {isOpen && (
        <div
          className="fixed bottom-4 right-4 z-50 flex flex-col rounded-2xl overflow-hidden"
          style={{
            width: 'min(420px, calc(100vw - 32px))',
            height: 'min(600px, calc(100vh - 100px))',
            background: 'rgba(25, 25, 30, 0.85)',
            backdropFilter: 'blur(40px) saturate(150%)',
            WebkitBackdropFilter: 'blur(40px) saturate(150%)',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.3)',
          }}
        >
          {/* 头部 */}
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, rgba(91,163,192,0.5) 0%, rgba(91,163,192,0.25) 100%)' }}>
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-semibold text-white">AI 数据助手</div>
                <div className="text-[10px] text-white/40">Gemini · 可查询和修改数据</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button onClick={handleClear} className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors" title="清空对话">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              )}
              <button onClick={() => setIsOpen(false)} className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors" title="关闭">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
            </div>
          </div>

          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                  style={{ background: 'rgba(91,163,192,0.15)', border: '1px solid rgba(91,163,192,0.2)' }}>
                  <svg className="w-6 h-6 text-[#5BA3C0]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <p className="text-sm text-white/60 mb-1">你好，我是 AI 数据助手</p>
                <p className="text-xs text-white/30">可以帮你查询和管理库存数据</p>
                <div className="mt-4 space-y-2 w-full">
                  {['今天各门店录入了多少条数据？', '野百灵品牌有哪些物料？', '最近一周价格异常的记录'].map((q, i) => (
                    <button key={i} onClick={() => { setInput(q); }} className="w-full text-left text-xs px-3 py-2 rounded-xl text-white/50 hover:text-white/80 transition-colors"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user' ? 'text-white' : 'text-white/90'
                  }`}
                  style={msg.role === 'user' ? {
                    background: 'linear-gradient(135deg, rgba(91,163,192,0.4) 0%, rgba(91,163,192,0.25) 100%)',
                    border: '1px solid rgba(91,163,192,0.3)',
                  } : {
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {renderMarkdown(msg.content)}
                </div>
              </div>
            ))}

            {/* 加载动画 */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="px-4 py-3 rounded-2xl" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            {/* 写操作确认 */}
            {pendingAction && !isLoading && (
              <div className="flex gap-2 px-1">
                <button onClick={handleConfirm}
                  className="flex-1 py-2 rounded-xl text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, rgba(107,158,138,0.6) 0%, rgba(107,158,138,0.4) 100%)', border: '1px solid rgba(107,158,138,0.4)' }}>
                  ✓ 确认执行
                </button>
                <button onClick={handleCancel}
                  className="flex-1 py-2 rounded-xl text-sm font-medium text-white/70 transition-all hover:text-white hover:bg-white/10 active:scale-[0.98]"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  ✕ 取消
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* 输入区 */}
          <div className="px-3 pb-3 pt-1 flex-shrink-0">
            <div className="flex items-end gap-2 rounded-xl px-3 py-2"
              style={{ background: 'rgba(25,25,30,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入问题..."
                rows={1}
                className="flex-1 bg-transparent text-sm text-white placeholder-white/30 resize-none outline-none max-h-24"
                style={{ scrollbarWidth: 'thin' }}
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="p-1.5 rounded-lg transition-all disabled:opacity-30"
                style={{ color: input.trim() ? '#5BA3C0' : 'rgba(255,255,255,0.3)' }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
