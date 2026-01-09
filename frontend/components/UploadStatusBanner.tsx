// v1.0: 上传状态 Banner 组件
// 显示异步上传的进度和结果，毛玻璃风格

import React, { useEffect, useRef } from 'react';
import { Icons } from '../constants';

export type UploadStatus = 'uploading' | 'success' | 'error' | null;

interface UploadStatusBannerProps {
  status: UploadStatus;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export const UploadStatusBanner: React.FC<UploadStatusBannerProps> = ({
  status,
  onRetry,
  onDismiss,
}) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 成功后 3 秒自动消失
  useEffect(() => {
    if (status === 'success') {
      timerRef.current = setTimeout(() => {
        onDismiss?.();
      }, 3000);
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [status, onDismiss]);

  if (!status) return null;

  const config = {
    uploading: {
      text: '录入已提交，正在上传...',
      borderColor: 'border-ios-blue/30',
      bgColor: 'rgba(91, 163, 192, 0.15)',
      icon: (
        <div className="w-5 h-5 border-2 border-ios-blue/30 border-t-ios-blue rounded-full animate-spin" />
      ),
    },
    success: {
      text: '上传成功！',
      borderColor: 'border-ios-green/30',
      bgColor: 'rgba(107, 158, 138, 0.15)',
      icon: <Icons.Check className="w-5 h-5 text-ios-green" />,
    },
    error: {
      text: '上传失败，请重试',
      borderColor: 'border-ios-red/30',
      bgColor: 'rgba(232, 90, 79, 0.15)',
      icon: <Icons.X className="w-5 h-5 text-ios-red" />,
    },
  };

  const { text, borderColor, bgColor, icon } = config[status];

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-glass-lg border ${borderColor} animate-slide-down flex items-center gap-3`}
      style={{
        background: bgColor,
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3)',
      }}
    >
      <div className="flex-shrink-0">{icon}</div>
      <span className="text-sm font-medium text-white">{text}</span>
      {status === 'error' && onRetry && (
        <button
          onClick={onRetry}
          className="ml-2 px-3 py-1 text-xs font-medium text-white bg-ios-red/30 hover:bg-ios-red/50 rounded-full transition-colors"
        >
          重试
        </button>
      )}
      {status !== 'uploading' && onDismiss && (
        <button
          onClick={onDismiss}
          className="ml-1 p-1 text-white/50 hover:text-white transition-colors"
        >
          <Icons.X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
