// v1.2 - 添加错误处理和后台重试
// v1.1 - 优化删除交互，减少间距
// v1.0 - 备忘录组件，支持入库/出库记录

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { Icons } from '../constants';

interface MemoItem {
  id: string;
  memo_type: 'inbound' | 'outbound';
  content: string;
  created_at: string;
  updated_at: string;
}

// 重试工具函数
const retry = async <T,>(fn: () => Promise<T>, maxRetries = 3, delay = 1000): Promise<T> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      await new Promise((r) => setTimeout(r, delay * (i + 1)));
    }
  }
  throw new Error('Max retries reached');
};

export const Memo: React.FC = () => {
  const { user } = useAuth();
  const [memos, setMemos] = useState<MemoItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [memoType, setMemoType] = useState<'inbound' | 'outbound'>('inbound');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 保存删除前的状态用于回滚
  const deletedMemoRef = useRef<{ memo: MemoItem; index: number } | null>(null);

  // 自动清除错误提示
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // 加载备忘录列表
  const loadMemos = useCallback(async (silent = false) => {
    if (!user?.restaurant_id) return;

    if (!silent) setLoading(true);

    try {
      const { data, error: fetchError } = await retry(async () => {
        const res = await supabase
          .from('ims_memo')
          .select('*')
          .eq('restaurant_id', user.restaurant_id)
          .order('updated_at', { ascending: false });
        if (res.error) throw res.error;
        return res;
      });

      if (data) setMemos(data);
    } catch {
      setError('加载失败，请刷新重试');
    }

    if (!silent) setLoading(false);
  }, [user?.restaurant_id]);

  useEffect(() => {
    loadMemos();
  }, [loadMemos]);

  const handleSelect = (memo: MemoItem) => {
    setSelectedId(memo.id);
    setMemoType(memo.memo_type);
    setContent(memo.content);
  };

  const handleNew = () => {
    setSelectedId(null);
    setContent('');
  };

  // 保存备忘录（乐观更新 + 后台重试）
  const handleSave = async () => {
    if (!user?.restaurant_id || !user?.id) return;

    setSaving(true);
    setError(null);
    const now = new Date().toISOString();

    if (selectedId) {
      const oldMemos = [...memos];
      // 乐观更新
      setMemos((prev) =>
        prev.map((m) =>
          m.id === selectedId ? { ...m, content, memo_type: memoType, updated_at: now } : m
        )
      );

      try {
        await retry(async () => {
          const { error: updateError } = await supabase
            .from('ims_memo')
            .update({ content, memo_type: memoType, updated_at: now })
            .eq('id', selectedId);
          if (updateError) throw updateError;
        });
      } catch {
        // 回滚
        setMemos(oldMemos);
        setError('保存失败，请重试');
      }
    } else {
      try {
        const { data } = await retry(async () => {
          const res = await supabase
            .from('ims_memo')
            .insert({
              memo_type: memoType,
              content,
              restaurant_id: user.restaurant_id,
              created_by: user.id,
            })
            .select()
            .single();
          if (res.error) throw res.error;
          return res;
        });

        if (data) {
          setSelectedId(data.id);
          setMemos((prev) => [data, ...prev]);
        }
      } catch {
        setError('新建失败，请重试');
      }
    }

    setSaving(false);
  };

  // 删除备忘录（乐观更新 + 后台重试）
  const handleDelete = async () => {
    if (!selectedId) return;

    const index = memos.findIndex((m) => m.id === selectedId);
    const deletedMemo = memos[index];
    deletedMemoRef.current = { memo: deletedMemo, index };

    // 乐观删除
    setMemos((prev) => prev.filter((m) => m.id !== selectedId));
    setSelectedId(null);
    setContent('');

    try {
      await retry(async () => {
        const { error: deleteError } = await supabase
          .from('ims_memo')
          .delete()
          .eq('id', deletedMemo.id);
        if (deleteError) throw deleteError;
      });
    } catch {
      // 回滚
      if (deletedMemoRef.current) {
        const { memo, index: idx } = deletedMemoRef.current;
        setMemos((prev) => {
          const newMemos = [...prev];
          newMemos.splice(idx, 0, memo);
          return newMemos;
        });
        setSelectedId(memo.id);
        setContent(memo.content);
        setMemoType(memo.memo_type);
      }
      setError('删除失败，请重试');
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-full flex flex-col md:flex-row gap-3 p-3 md:p-4 relative">
      {/* 错误提示 */}
      {error && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-glass-lg text-sm text-red-400 flex items-center gap-2"
          style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}
        >
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400/70 hover:text-red-400">
            <Icons.X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 左侧：历史列表 */}
      <div
        className="w-full md:w-56 flex-shrink-0 rounded-glass-xl p-3"
        style={{
          background: 'rgba(25,25,30,0.45)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-semibold">历史记录</h3>
          <button
            onClick={handleNew}
            className="p-1.5 rounded-glass-md hover:bg-white/10 transition-colors"
            title="新建"
          >
            <Icons.Plus className="w-5 h-5 text-white/70" />
          </button>
        </div>

        {loading ? (
          <div className="text-white/50 text-sm text-center py-4">加载中...</div>
        ) : memos.length === 0 ? (
          <div className="text-white/50 text-sm text-center py-4">暂无记录</div>
        ) : (
          <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto">
            {memos.map((memo) => (
              <button
                key={memo.id}
                onClick={() => handleSelect(memo)}
                className={`w-full text-left p-3 rounded-glass-lg transition-all ${
                  selectedId === memo.id
                    ? 'bg-white/15 border border-white/20'
                    : 'hover:bg-white/5 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      memo.memo_type === 'inbound'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-orange-500/20 text-orange-400'
                    }`}
                  >
                    {memo.memo_type === 'inbound' ? '入库' : '出库'}
                  </span>
                  <span className="text-white/50 text-xs">{formatDate(memo.updated_at)}</span>
                </div>
                <div className="text-white/80 text-sm mt-1 truncate">
                  {memo.content.slice(0, 30) || '(空)'}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 右侧：编辑区 */}
      <div
        className="flex-1 rounded-glass-xl p-3 md:p-4 flex flex-col"
        style={{
          background: 'rgba(25,25,30,0.45)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => setMemoType('inbound')}
            className={`px-4 py-2 rounded-glass-lg text-sm font-medium transition-all ${
              memoType === 'inbound'
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'text-white/60 hover:bg-white/5 border border-transparent'
            }`}
          >
            入库
          </button>
          <button
            onClick={() => setMemoType('outbound')}
            className={`px-4 py-2 rounded-glass-lg text-sm font-medium transition-all ${
              memoType === 'outbound'
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                : 'text-white/60 hover:bg-white/5 border border-transparent'
            }`}
          >
            出库
          </button>

          <div className="flex-1" />

          {selectedId && (
            <button
              onClick={handleDelete}
              className="p-2 rounded-glass-md text-red-400 hover:bg-red-500/10 transition-colors"
              title="删除"
            >
              <Icons.Trash className="w-5 h-5" />
            </button>
          )}
        </div>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="在此输入备忘内容..."
          className="flex-1 w-full p-4 rounded-glass-lg bg-white/5 border border-white/10 text-white placeholder-white/30 resize-none focus:outline-none focus:border-white/20 transition-colors"
          style={{ minHeight: '200px' }}
        />

        <div className="mt-3 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving || !content.trim()}
            className={`px-6 py-2.5 rounded-glass-lg font-medium transition-all ${
              saving || !content.trim()
                ? 'bg-white/10 text-white/30 cursor-not-allowed'
                : 'bg-white/15 text-white hover:bg-white/20 border border-white/20'
            }`}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
};
