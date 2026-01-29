/**
 * 管理员数据 SWR Hooks
 * v1.1 - 支持品牌过滤、CRUD 操作、门店明细
 *
 * v1.0 - 初始版本：SWR 缓存实现
 */

import useSWR, { SWRConfiguration, mutate as globalMutate } from 'swr';
import {
  getAdminOverviewStats,
  getRestaurantEntryStatus,
  getPriceAlerts,
  getAdminUserList,
  getAdminRestaurantList,
  getAdminSupplierList,
  getAdminMaterialList,
  getCrossRestaurantReport,
  getRestaurantPurchaseDetails,
  getBrandList,
  getCategoryList,
  getUnitList,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  AdminOverviewStats,
  AdminRestaurantView,
  AdminSupplierView,
  AdminMaterialView,
  CrossRestaurantReport,
  RestaurantPurchaseDetail,
  BrandView,
  PriceAlertExtended,
  SupplierInput,
  MaterialInput
} from '../services/adminService';
import { RestaurantEntryStatus, AdminUserView } from '../types';

// SWR 默认配置
const defaultConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 30000,
  errorRetryCount: 3,
};

// 缓存时间配置（毫秒）
const CACHE_TTL = {
  overview: 60 * 1000,
  entryStatus: 2 * 60 * 1000,
  alerts: 5 * 60 * 1000,
  users: 5 * 60 * 1000,
  restaurants: 10 * 60 * 1000,
  suppliers: 5 * 60 * 1000,
  materials: 5 * 60 * 1000,
  reports: 5 * 60 * 1000,
  brands: 30 * 60 * 1000,
  categories: 30 * 60 * 1000,
  units: 30 * 60 * 1000,
};

/**
 * 品牌列表 Hook
 */
export function useBrandList() {
  const { data, error, isLoading } = useSWR<BrandView[]>(
    'admin/brands',
    getBrandList,
    {
      ...defaultConfig,
      refreshInterval: CACHE_TTL.brands,
    }
  );

  return {
    brands: data || [],
    isLoading,
    isError: !!error,
  };
}

/**
 * 分类列表 Hook
 */
export function useCategoryList() {
  const { data, error, isLoading } = useSWR<{ id: number; name: string }[]>(
    'admin/categories',
    getCategoryList,
    {
      ...defaultConfig,
      refreshInterval: CACHE_TTL.categories,
    }
  );

  return {
    categories: data || [],
    isLoading,
    isError: !!error,
  };
}

/**
 * 单位列表 Hook
 */
export function useUnitList() {
  const { data, error, isLoading } = useSWR<{ id: number; name: string }[]>(
    'admin/units',
    getUnitList,
    {
      ...defaultConfig,
      refreshInterval: CACHE_TTL.units,
    }
  );

  return {
    units: data || [],
    isLoading,
    isError: !!error,
  };
}

/**
 * 总览统计数据 Hook
 */
export function useAdminOverview() {
  const { data, error, isLoading, mutate } = useSWR<AdminOverviewStats>(
    'admin/overview',
    getAdminOverviewStats,
    {
      ...defaultConfig,
      refreshInterval: CACHE_TTL.overview,
    }
  );

  return {
    stats: data,
    isLoading,
    isError: !!error,
    error,
    refresh: mutate,
  };
}

/**
 * 门店录入状态 Hook
 */
export function useRestaurantEntryStatus() {
  const { data, error, isLoading, mutate } = useSWR<RestaurantEntryStatus[]>(
    'admin/entry-status',
    getRestaurantEntryStatus,
    {
      ...defaultConfig,
      refreshInterval: CACHE_TTL.entryStatus,
    }
  );

  return {
    statusList: data || [],
    isLoading,
    isError: !!error,
    error,
    refresh: mutate,
  };
}

/**
 * 价格异常告警 Hook（支持品牌/门店过滤）
 */
export function usePriceAlerts(brandId?: number, restaurantId?: string) {
  const key = brandId || restaurantId
    ? ['admin/price-alerts', brandId, restaurantId]
    : 'admin/price-alerts';

  const { data, error, isLoading, mutate } = useSWR<PriceAlertExtended[]>(
    key,
    () => getPriceAlerts(brandId, restaurantId),
    {
      ...defaultConfig,
      refreshInterval: CACHE_TTL.alerts,
    }
  );

  return {
    alerts: data || [],
    isLoading,
    isError: !!error,
    error,
    refresh: mutate,
  };
}

/**
 * 用户列表 Hook（只读）
 */
export function useAdminUsers() {
  const { data, error, isLoading, mutate } = useSWR<AdminUserView[]>(
    'admin/users',
    getAdminUserList,
    {
      ...defaultConfig,
      refreshInterval: CACHE_TTL.users,
    }
  );

  return {
    users: data || [],
    isLoading,
    isError: !!error,
    error,
    refresh: mutate,
  };
}

/**
 * 门店列表 Hook（只读）
 */
export function useAdminRestaurants() {
  const { data, error, isLoading, mutate } = useSWR<AdminRestaurantView[]>(
    'admin/restaurants',
    getAdminRestaurantList,
    {
      ...defaultConfig,
      refreshInterval: CACHE_TTL.restaurants,
    }
  );

  return {
    restaurants: data || [],
    isLoading,
    isError: !!error,
    error,
    refresh: mutate,
  };
}

/**
 * 供应商列表 Hook（支持品牌过滤 + CRUD）
 */
export function useAdminSuppliers(brandId?: number) {
  const key = brandId ? ['admin/suppliers', brandId] : 'admin/suppliers';

  const { data, error, isLoading, mutate } = useSWR<AdminSupplierView[]>(
    key,
    () => getAdminSupplierList(brandId),
    {
      ...defaultConfig,
      refreshInterval: CACHE_TTL.suppliers,
    }
  );

  const addSupplier = async (input: SupplierInput) => {
    const result = await createSupplier(input);
    if (result.success) {
      mutate();
      // 清除所有供应商相关缓存
      globalMutate((key) => typeof key === 'string' && key.startsWith('admin/suppliers'), undefined, { revalidate: true });
    }
    return result;
  };

  const editSupplier = async (id: number, input: Partial<SupplierInput>) => {
    const result = await updateSupplier(id, input);
    if (result.success) {
      mutate();
      globalMutate((key) => typeof key === 'string' && key.startsWith('admin/suppliers'), undefined, { revalidate: true });
    }
    return result;
  };

  const removeSupplier = async (id: number) => {
    const result = await deleteSupplier(id);
    if (result.success) {
      mutate();
      globalMutate((key) => typeof key === 'string' && key.startsWith('admin/suppliers'), undefined, { revalidate: true });
    }
    return result;
  };

  return {
    suppliers: data || [],
    isLoading,
    isError: !!error,
    error,
    refresh: mutate,
    addSupplier,
    editSupplier,
    removeSupplier,
  };
}

/**
 * 物料列表 Hook（支持品牌过滤 + CRUD）
 */
export function useAdminMaterials(brandId?: number) {
  const key = brandId ? ['admin/materials', brandId] : 'admin/materials';

  const { data, error, isLoading, mutate } = useSWR<AdminMaterialView[]>(
    key,
    () => getAdminMaterialList(brandId),
    {
      ...defaultConfig,
      refreshInterval: CACHE_TTL.materials,
    }
  );

  const addMaterial = async (input: MaterialInput) => {
    const result = await createMaterial(input);
    if (result.success) {
      mutate();
      globalMutate((key) => typeof key === 'string' && key.startsWith('admin/materials'), undefined, { revalidate: true });
    }
    return result;
  };

  const editMaterial = async (id: number, input: Partial<MaterialInput>) => {
    const result = await updateMaterial(id, input);
    if (result.success) {
      mutate();
      globalMutate((key) => typeof key === 'string' && key.startsWith('admin/materials'), undefined, { revalidate: true });
    }
    return result;
  };

  const removeMaterial = async (id: number) => {
    const result = await deleteMaterial(id);
    if (result.success) {
      mutate();
      globalMutate((key) => typeof key === 'string' && key.startsWith('admin/materials'), undefined, { revalidate: true });
    }
    return result;
  };

  return {
    materials: data || [],
    isLoading,
    isError: !!error,
    error,
    refresh: mutate,
    addMaterial,
    editMaterial,
    removeMaterial,
  };
}

/**
 * 跨门店报表 Hook（支持日期范围）
 */
export function useCrossRestaurantReport(days: number = 30) {
  const { data, error, isLoading, mutate } = useSWR<CrossRestaurantReport[]>(
    ['admin/cross-report', days],
    () => getCrossRestaurantReport(days),
    {
      ...defaultConfig,
      refreshInterval: CACHE_TTL.reports,
    }
  );

  return {
    report: data || [],
    isLoading,
    isError: !!error,
    error,
    refresh: mutate,
  };
}

/**
 * 门店采购明细 Hook
 */
export function useRestaurantDetails(restaurantId: string | null, days: number = 30) {
  const { data, error, isLoading } = useSWR<RestaurantPurchaseDetail[]>(
    restaurantId ? ['admin/restaurant-details', restaurantId, days] : null,
    () => restaurantId ? getRestaurantPurchaseDetails(restaurantId, days) : Promise.resolve([]),
    {
      ...defaultConfig,
      refreshInterval: CACHE_TTL.reports,
    }
  );

  return {
    details: data || [],
    isLoading,
    isError: !!error,
  };
}
