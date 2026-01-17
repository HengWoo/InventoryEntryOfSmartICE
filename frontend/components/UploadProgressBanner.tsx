/**
 * 上传进度横幅组件
 * v1.0 - 订阅上传队列，显示进度并提醒用户不要关闭页面
 *
 * 功能：
 * - 当有 pending/uploading 项时自动显示
 * - 提醒用户不要关闭页面
 * - 用户进入历史页面后隐藏
 * - 所有上传完成后自动隐藏
 */

import React, { useState, useEffect } from 'react';
import { uploadQueueService, QueueItem } from '../services/uploadQueueService';

interface UploadProgressBannerProps {
  currentPage?: string;  // 当前页面，'history' 时隐藏
}

export const UploadProgressBanner: React.FC<UploadProgressBannerProps> = ({ currentPage }) => {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const unsubscribe = uploadQueueService.subscribe((newQueue) => {
      setQueue(newQueue);
      // 有新的上传任务时重新显示
      const hasActive = newQueue.some(item => item.status === 'pending' || item.status === 'uploading');
      if (hasActive) {
        setDismissed(false);
      }
    });

    setQueue(uploadQueueService.getQueue());
    return () => unsubscribe();
  }, []);

  const pendingCount = queue.filter(item => item.status === 'pending').length;
  const uploadingCount = queue.filter(item => item.status === 'uploading').length;
  const activeCount = pendingCount + uploadingCount;

  // 隐藏条件：无活跃上传 / 用户在历史页 / 用户手动关闭
  if (activeCount === 0 || currentPage === 'history' || dismissed) {
    return null;
  }

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-glass-lg border border-amber-500/30 animate-slide-down flex items-center gap-3"
      style={{
        background: 'rgba(245, 158, 11, 0.15)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3)',
      }}
    >
      {/* 旋转动画图标 */}
      <div className="flex-shrink-0">
        <div className="w-5 h-5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
      <span className="text-sm font-medium text-white">
        {uploadingCount > 0 ? (
          <>正在上传 {uploadingCount} 项{pendingCount > 0 && `，等待 ${pendingCount} 项`}</>
        ) : (
          <>等待上传 {pendingCount} 项</>
        )}
        <span className="ml-2 text-amber-300">请勿关闭页面</span>
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="ml-1 p-1 text-white/50 hover:text-white transition-colors"
        aria-label="关闭提示"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

export default UploadProgressBanner;
