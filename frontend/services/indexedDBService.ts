/**
 * IndexedDB 存储服务
 * v1.6 - 动态配额检查（基于实际数据大小）+ 使用率阈值 + 持久化存储
 * v1.5 - 动态配额检查 + 持久化存储请求 + 使用率监控
 * v1.4 - 添加存储空间检查函数 checkStorageAvailable
 * v1.3 - 添加打开数据库超时机制（防止页面空白）
 * v1.2 - 移除日常操作日志，只保留错误日志
 * v1.1 - 添加详细日志 + 存储大小估算
 * v1.0 - 替代 localStorage，解决 5MB 容量限制问题
 *
 * 变更历史：
 * - v1.6: 动态配额检查（基于实际数据大小），checkStorageForItem() 新增
 *         使用率超过 80% 时触发清理，持久化存储请求
 * - v1.5: 动态配额检查（基于实际数据大小），持久化存储请求，使用率监控
 * - v1.4: 添加 checkStorageAvailable 函数，提交前检查存储空间是否充足
 * - v1.3: 添加 5 秒超时机制，防止 IndexedDB 打开失败时页面空白
 * - v1.2: 移除频繁的日常操作日志（保存成功等），只保留错误日志
 * - v1.1: 添加详细日志便于调试，新增 getStorageEstimate 函数
 * - v1.0: 初始版本，支持队列数据持久化
 *
 * 功能：
 * - 提供类似 localStorage 的简单 API
 * - 支持大容量存储（通常为磁盘空间的 50%）
 * - 自动处理数据库初始化和升级
 * - 动态存储空间检查和预警（基于实际数据大小）
 */

const DB_NAME = 'smartice_inventory';
const DB_VERSION = 1;
const STORE_NAME = 'upload_queue';
const DB_OPEN_TIMEOUT_MS = 5000; // v1.3: 数据库打开超时时间
const STORAGE_WARNING_THRESHOLD = 0.8; // v1.6: 使用率超过 80% 时警告
const STORAGE_BUFFER_MULTIPLIER = 1.5; // v1.6: 存储时预留 50% 缓冲空间

// ============ 数据库初始化 ============

let dbInstance: IDBDatabase | null = null;

/**
 * 获取数据库实例（懒加载 + 单例）
 * v1.3: 添加超时机制，防止永久挂起
 */
async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  return new Promise((resolve, reject) => {
    // v1.3: 超时处理
    const timeoutId = setTimeout(() => {
      console.error('[IndexedDB] 打开数据库超时（5秒），回退到 localStorage');
      reject(new Error('IndexedDB 打开超时'));
    }, DB_OPEN_TIMEOUT_MS);

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        clearTimeout(timeoutId);
        console.error('[IndexedDB] 打开数据库失败:', request.error);
        reject(new Error('IndexedDB 不可用'));
      };

      request.onsuccess = () => {
        clearTimeout(timeoutId);
        dbInstance = request.result;
        resolve(dbInstance);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 创建对象存储（类似表）
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };

      // v1.3: 处理被阻塞的情况（其他标签页打开了旧版本）
      request.onblocked = () => {
        clearTimeout(timeoutId);
        console.error('[IndexedDB] 数据库被阻塞，请关闭其他标签页');
        reject(new Error('IndexedDB 被阻塞'));
      };
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('[IndexedDB] 打开数据库异常:', error);
      reject(new Error('IndexedDB 打开异常'));
    }
  });
}

// ============ 公开 API ============

/**
 * 保存数据到 IndexedDB
 * @param key 存储键名
 * @param value 任意可序列化数据
 */
export async function setItem<T>(key: string, value: T): Promise<void> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.put({ key, value });

    request.onsuccess = () => {
      // v1.2: 移除保存成功日志（频繁调用会刷屏）
      resolve();
    };

    request.onerror = () => {
      console.error('[IndexedDB] 保存失败:', request.error);
      reject(new Error('IndexedDB 保存失败'));
    };
  });
}

/**
 * 从 IndexedDB 读取数据
 * @param key 存储键名
 * @returns 存储的数据，不存在时返回 null
 */
export async function getItem<T>(key: string): Promise<T | null> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.get(key);

    request.onsuccess = () => {
      if (request.result) {
        resolve(request.result.value as T);
      } else {
        resolve(null);
      }
    };

    request.onerror = () => {
      console.error('[IndexedDB] 读取失败:', request.error);
      reject(new Error('IndexedDB 读取失败'));
    };
  });
}

/**
 * 从 IndexedDB 删除数据
 * @param key 存储键名
 */
export async function removeItem(key: string): Promise<void> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.delete(key);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      console.error('[IndexedDB] 删除失败:', request.error);
      reject(new Error('IndexedDB 删除失败'));
    };
  });
}

/**
 * 清空所有数据
 */
export async function clear(): Promise<void> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.clear();

    request.onsuccess = () => {
      // v1.2: 移除清空成功日志
      resolve();
    };

    request.onerror = () => {
      console.error('[IndexedDB] 清空失败:', request.error);
      reject(new Error('IndexedDB 清空失败'));
    };
  });
}

/**
 * 检查 IndexedDB 是否可用
 */
export function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

/**
 * 从 localStorage 迁移数据到 IndexedDB（一次性迁移）
 * @param localStorageKey localStorage 的键名
 * @param indexedDBKey IndexedDB 的键名
 */
export async function migrateFromLocalStorage<T>(
  localStorageKey: string,
  indexedDBKey: string
): Promise<T | null> {
  try {
    const localData = localStorage.getItem(localStorageKey);
    if (!localData) {
      return null;
    }

    const parsed = JSON.parse(localData) as T;

    // 保存到 IndexedDB
    await setItem(indexedDBKey, parsed);

    // 删除 localStorage 数据
    localStorage.removeItem(localStorageKey);

    // v1.2: 移除迁移日志
    return parsed;
  } catch (error) {
    console.error('[IndexedDB] 迁移失败:', error);
    return null;
  }
}

/**
 * 获取存储空间估算（用于调试）
 * 返回已用空间和总配额
 */
export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      // v1.2: 移除存储空间日志（调用方可以根据返回值自行打印）
      return { usage, quota };
    } catch (error) {
      console.error('[IndexedDB] 获取存储估算失败:', error);
      return null;
    }
  }
  // v1.2: 移除不支持 API 的警告日志
  return null;
}

/**
 * v1.6: 检查存储空间是否足够存储指定数据
 * 基于实际数据大小进行动态检查，而非固定阈值
 * @param dataToStore 要存储的数据（用于计算大小）
 * @returns { canStore: boolean, reason?: string, usagePercent: number }
 */
export async function checkStorageForItem<T>(dataToStore: T): Promise<{
  canStore: boolean;
  reason?: string;
  usagePercent: number;
  availableMB: number;
  requiredMB: number;
}> {
  const estimate = await getStorageEstimate();

  // 无法获取存储信息时，假设可以存储
  if (!estimate) {
    return { canStore: true, usagePercent: 0, availableMB: 0, requiredMB: 0 };
  }

  const dataSize = JSON.stringify(dataToStore).length;
  const requiredBytes = dataSize * STORAGE_BUFFER_MULTIPLIER; // 预留 50% 缓冲
  const availableBytes = estimate.quota - estimate.usage;
  const usagePercent = (estimate.usage / estimate.quota) * 100;
  const availableMB = availableBytes / 1024 / 1024;
  const requiredMB = requiredBytes / 1024 / 1024;

  // 检查 1: 使用率是否超过警告阈值
  if (usagePercent > STORAGE_WARNING_THRESHOLD * 100) {
    console.warn(`[IndexedDB] 存储使用率过高: ${usagePercent.toFixed(1)}%`);
  }

  // 检查 2: 可用空间是否足够
  if (availableBytes < requiredBytes) {
    const reason = `存储空间不足: 需要 ${requiredMB.toFixed(1)}MB，剩余 ${availableMB.toFixed(1)}MB`;
    console.warn(`[IndexedDB] ${reason}`);
    return { canStore: false, reason, usagePercent, availableMB, requiredMB };
  }

  return { canStore: true, usagePercent, availableMB, requiredMB };
}

/**
 * v1.6: 检查存储空间是否充足（基于使用率）
 * @param warningThreshold 警告阈值（0-1），默认 0.8 (80%)
 * @returns true=空间充足，false=空间不足或使用率过高
 */
export async function checkStorageAvailable(warningThreshold: number = STORAGE_WARNING_THRESHOLD): Promise<boolean> {
  const estimate = await getStorageEstimate();
  if (!estimate) {
    // 无法获取存储信息时，假设空间充足
    return true;
  }

  const usagePercent = (estimate.usage / estimate.quota) * 100;
  const availableMB = (estimate.quota - estimate.usage) / 1024 / 1024;
  const isAvailable = usagePercent < warningThreshold * 100;

  if (!isAvailable) {
    console.warn(`[IndexedDB] 存储使用率过高: ${usagePercent.toFixed(1)}%，剩余 ${availableMB.toFixed(1)}MB`);
  }

  return isAvailable;
}

/**
 * v1.6: 请求持久化存储（防止浏览器自动清理）
 * Safari 会在 7 天不活跃后自动清理数据，请求持久化可以防止这种情况
 * @returns true=已获得持久化权限，false=未获得或不支持
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) {
    console.log('[IndexedDB] 浏览器不支持持久化存储 API');
    return false;
  }

  try {
    const isPersisted = await navigator.storage.persist();
    console.log(`[IndexedDB] 持久化存储: ${isPersisted ? '已启用' : '未启用'}`);
    return isPersisted;
  } catch (error) {
    console.error('[IndexedDB] 请求持久化存储失败:', error);
    return false;
  }
}

/**
 * v1.6: 获取存储使用情况摘要（用于 UI 显示）
 */
export async function getStorageSummary(): Promise<{
  usedMB: number;
  quotaMB: number;
  usagePercent: number;
  isWarning: boolean;
} | null> {
  const estimate = await getStorageEstimate();
  if (!estimate) return null;

  const usedMB = estimate.usage / 1024 / 1024;
  const quotaMB = estimate.quota / 1024 / 1024;
  const usagePercent = (estimate.usage / estimate.quota) * 100;

  return {
    usedMB,
    quotaMB,
    usagePercent,
    isWarning: usagePercent > STORAGE_WARNING_THRESHOLD * 100
  };
}

/**
 * v1.3: 删除并重建数据库（用于修复损坏的数据库）
 * 注意：这会删除所有本地队列数据！
 */
export async function resetDatabase(): Promise<boolean> {
  try {
    // 关闭现有连接
    if (dbInstance) {
      dbInstance.close();
      dbInstance = null;
    }

    // 删除数据库
    return new Promise((resolve) => {
      const request = indexedDB.deleteDatabase(DB_NAME);

      request.onsuccess = () => {
        console.log('[IndexedDB] 数据库已重置');
        // 同时清除 localStorage 中的旧数据
        localStorage.removeItem('upload_queue');
        resolve(true);
      };

      request.onerror = () => {
        console.error('[IndexedDB] 重置数据库失败:', request.error);
        resolve(false);
      };

      request.onblocked = () => {
        console.warn('[IndexedDB] 重置被阻塞，请关闭其他标签页后重试');
        resolve(false);
      };
    });
  } catch (error) {
    console.error('[IndexedDB] 重置数据库异常:', error);
    return false;
  }
}
