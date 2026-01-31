// v6.3.0 - 管理员面板修改密码事件监听 + 响应式设计修复
// v6.2.0 - 管理员面板独立布局，移除主侧边栏，标题改为"门店管家"
// v6.1.0 - 管理员登录默认进入管理控制台 + SWR 缓存优化
// v6.0.0 - 添加管理员面板入口，根据角色显示
// v5.1.0 - 添加上传进度 Banner，提醒用户不要关闭页面
// v5.0.0 - 添加上传状态 Banner，显示异步上传进度和结果
// v4.3.0 - 添加版本检测，每 10 分钟轮询检查新版本并提示用户刷新
// v4.2.0 - PreloadData 改为登录后加载，不再启动时加载
// v4.1.0 - 添加 userNickname 支持，用于更亲切的问候语
// v4.0.1 - 修复预加载无限循环，改为后台静默加载不阻塞UI
// v4.0.0 - 添加上传队列历史记录页面（显示队列状态、支持失败重试）
// v3.5.0 - 集成 PreloadDataContext，实现下拉框数据预加载
// v3.4.0 - 添加修改密码页面
// v3.3.0 - 仪表板数据从数据库获取
// v3.2.0 - EntryForm 欢迎页传递菜单回调
// v3.1.0 - 添加登录页面路由
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { EntryForm } from './components/EntryForm';
import { LoginPage } from './components/LoginPage';
import { ChangePasswordPage } from './components/ChangePasswordPage';
import { QueueHistoryPage } from './components/QueueHistoryPage';
import { Memo } from './components/Memo';
import { AdminPanel } from './components/AdminPanel';
import { UpdateBanner } from './components/ui/UpdateBanner';
import { UploadStatusBanner, UploadStatus } from './components/UploadStatusBanner';
import { UploadProgressBanner } from './components/UploadProgressBanner';
import { AppView } from './types';
import { Icons } from './constants';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PreloadDataProvider, usePreloadData } from './contexts/PreloadDataContext';
import { startVersionCheck, stopVersionCheck } from './services/versionService';
import { uploadQueueService, QueueItem } from './services/uploadQueueService';

// 主应用内容（需要在 AuthProvider 内部使用）
const AppContent: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  // 预加载在后台静默进行，不阻塞 UI
  const { error: preloadError } = usePreloadData();

  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [hasRedirectedAdmin, setHasRedirectedAdmin] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // 版本更新提示状态
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  // v5.0: 上传状态 Banner
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>(null);
  const lastQueueIdRef = useRef<string | null>(null);

  // v6.1: 管理员登录后自动跳转到管理控制台（仅首次）
  useEffect(() => {
    if (isAuthenticated && user?.role === 'administrator' && !hasRedirectedAdmin) {
      setCurrentView(AppView.ADMIN_OVERVIEW);
      setHasRedirectedAdmin(true);
    }
  }, [isAuthenticated, user?.role, hasRedirectedAdmin]);

  // v6.3: 监听管理员面板的修改密码事件
  useEffect(() => {
    const handleAdminChangePassword = () => {
      setCurrentView(AppView.CHANGE_PASSWORD);
    };
    window.addEventListener('admin-change-password', handleAdminChangePassword);
    return () => {
      window.removeEventListener('admin-change-password', handleAdminChangePassword);
    };
  }, []);

  // 版本检测：每 10 分钟检查一次新版本
  useEffect(() => {
    startVersionCheck((hasUpdate) => {
      if (hasUpdate) {
        setShowUpdateBanner(true);
      }
    });

    return () => {
      stopVersionCheck();
    };
  }, []);

  // v5.0: 订阅上传队列变化，更新 Banner 状态
  useEffect(() => {
    const unsubscribe = uploadQueueService.subscribe((queue: QueueItem[]) => {
      // 找到最近添加的项目（按 createdAt 排序）
      const sortedQueue = [...queue].sort((a, b) => b.createdAt - a.createdAt);
      const latestItem = sortedQueue[0];

      if (!latestItem) {
        // 队列为空，清除状态
        if (uploadStatus !== null) {
          setUploadStatus(null);
          lastQueueIdRef.current = null;
        }
        return;
      }

      // 只跟踪最新的项目
      if (lastQueueIdRef.current !== latestItem.id) {
        lastQueueIdRef.current = latestItem.id;
      }

      // 根据最新项目的状态更新 Banner
      if (latestItem.status === 'uploading' || latestItem.status === 'pending') {
        setUploadStatus('uploading');
      } else if (latestItem.status === 'success') {
        setUploadStatus('success');
      } else if (latestItem.status === 'failed') {
        setUploadStatus('error');
      }
    });

    return () => {
      unsubscribe();
    };
  }, [uploadStatus]);

  // v5.0: 处理 Banner 关闭
  const handleDismissBanner = useCallback(() => {
    setUploadStatus(null);
  }, []);

  // v5.0: 处理重试
  const handleRetryUpload = useCallback(() => {
    if (lastQueueIdRef.current) {
      uploadQueueService.retryFailedItem(lastQueueIdRef.current);
    }
  }, []);

  // 从认证上下文获取用户名和昵称
  const CURRENT_USER_NAME = user?.name || "用户";
  const CURRENT_USER_NICKNAME = user?.nickname || user?.name || "用户";

  // 仅认证加载时显示 loading（预加载在后台静默进行）
  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          <div className="text-white text-xl">加载中...</div>
        </div>
      </div>
    );
  }

  // 预加载错误仅记录日志，不阻塞 UI
  if (preloadError) {
    console.warn('[App] 数据预加载失败（后台静默），下拉框将按需加载:', preloadError);
  }

  // 未登录显示登录页面
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const handleSaveEntry = async () => {
    // 数据已通过 EntryForm -> inventoryService 提交到数据库
    // Dashboard 会自动加载最新数据
    setCurrentView(AppView.DASHBOARD);
  };

  // 已登录显示主应用
  // 管理员用户始终使用管理员布局（包括修改密码页面）
  const isAdminUser = user?.role === 'administrator';
  const isAdminView = isAdminUser;

  return (
    <div className="fixed inset-0 flex text-primary font-sans overflow-hidden">
      {/* 版本更新提示横幅 */}
      <UpdateBanner
        visible={showUpdateBanner}
        onRefresh={() => window.location.reload()}
        onDismiss={() => setShowUpdateBanner(false)}
      />

      {/* v5.0: 上传状态 Banner - 不在历史记录页显示 */}
      {currentView !== AppView.HISTORY && (
        <UploadStatusBanner
          status={uploadStatus}
          onRetry={handleRetryUpload}
          onDismiss={handleDismissBanner}
        />
      )}

      {/* v5.1: 上传进度 Banner - 提醒用户不要关闭页面 */}
      <UploadProgressBanner currentPage={currentView === AppView.HISTORY ? 'history' : undefined} />

      {/* v6.2: 管理员面板时不显示主侧边栏 */}
      {!isAdminView && (
        <Sidebar
          currentView={currentView}
          onChangeView={setCurrentView}
          isOpen={sidebarOpen}
          toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onChangePassword={() => setCurrentView(AppView.CHANGE_PASSWORD)}
        />
      )}

      {/* v6.3: 管理员用户布局 - 管理面板或修改密码 */}
      {isAdminView ? (
        <div className="flex-1 h-full overflow-hidden">
          {currentView === AppView.CHANGE_PASSWORD ? (
            <ChangePasswordPage onBack={() => setCurrentView(AppView.ADMIN_OVERVIEW)} />
          ) : (
            <AdminPanel />
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col h-full relative w-full">
          {/* Mobile Header Button - Storm Glass */}
          {currentView !== AppView.NEW_ENTRY && currentView !== AppView.CHANGE_PASSWORD && (
            <div className="md:hidden pt-6 px-4 pb-2 flex items-center justify-between">
               <span className="text-xl font-bold text-white">门店管家</span>
               <button onClick={() => setSidebarOpen(true)} className="p-2 text-white/70 hover:text-white">
                 <Icons.Menu className="w-6 h-6" />
               </button>
            </div>
          )}

          <main className={`flex-1 ${currentView === AppView.DASHBOARD ? 'overflow-hidden' : 'overflow-y-auto'} ${currentView === AppView.NEW_ENTRY || currentView === AppView.CHANGE_PASSWORD || currentView === AppView.HISTORY ? 'p-0' : 'p-4 md:p-8'} max-w-5xl mx-auto w-full`}>
              {currentView === AppView.DASHBOARD && (
                <Dashboard restaurantId={user?.restaurant_id} userId={user?.id} />
              )}
              {currentView === AppView.NEW_ENTRY && <EntryForm onSave={handleSaveEntry} userName={CURRENT_USER_NAME} userNickname={CURRENT_USER_NICKNAME} onOpenMenu={() => setSidebarOpen(true)} />}
              {currentView === AppView.HISTORY && <QueueHistoryPage onBack={() => setCurrentView(AppView.DASHBOARD)} />}
              {currentView === AppView.CHANGE_PASSWORD && <ChangePasswordPage onBack={() => setCurrentView(AppView.DASHBOARD)} />}
              {currentView === AppView.MEMO && <Memo />}
          </main>
        </div>
      )}
    </div>
  );
};

// 根组件：提供 AuthProvider + PreloadDataProvider
const App: React.FC = () => {
  return (
    <AuthProvider>
      <PreloadDataProvider>
        <AppContent />
      </PreloadDataProvider>
    </AuthProvider>
  );
};

export default App;
