/**
 * 仪表板数据服务
 * v9.0 - 店长端价格趋势 + 异常报警功能：
 *   - 新增 getStoreManagerPriceTrend 获取店长端价格趋势
 *   - 新增 getStoreManagerAnomalies 获取异常列表
 *   - 新增 resolveAnomaly 处理异常（确认/修改）
 *   - 新增 detectPriceAnomaly 中位数基准异常检测算法
 *   - 新增 runHistoricalAnomalyDetection 历史数据异常检测
 *
 * v8.0 - 品类列表按餐厅品牌过滤（与库存录入一致），修复干货/干杂/干杂调味品重复问题
 * v7.0 - 新增 getItemSupplierStats（单个物品的供应商采购占比）
 * v6.0 - 品类列表按门店过滤（只显示有采购记录的品类）+ 按名称去重
 * v5.0 - 修复品类筛选：通过 ims_material 表关联 category_id（JOIN查询）
 * v4.0 - 统计卡片/供应商支持品类筛选，物品列表支持模糊搜索+最近采购优先
 * v3.0 - 新增品类趋势、供应商统计、物品单价追踪、采购量趋势 API
 * v2.0 - 使用 restaurant_id 替代 store_id
 */

import { supabase } from './supabaseClient';
import { DailyLog, ProcurementItem } from '../types';

// ============ 类型定义 ============

export interface DashboardStats {
  totalSpend: number;
  totalItems: number;
  supplierCount: number;
}

export interface DailyTrend {
  date: string;
  cost: number;
}

export interface Category {
  id: number;
  name: string;
}

export interface SupplierStats {
  supplier: string;
  total: number;
}

export interface ItemPriceTrend {
  date: string;
  price: number;
  quantity: number;
}

export interface QuantityTrend {
  date: string;
  quantity: number;
}

export interface ItemInfo {
  name: string;
  unit: string;
  lastPurchaseDate: string;
}

// ============ 数据获取 API ============

/**
 * 获取仪表板统计数据（支持品类筛选）
 */
export async function getDashboardStats(
  restaurantId?: string,
  categoryId?: number,
  days: number = 30
): Promise<DashboardStats> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  let query = supabase
    .from('ims_material_price')
    .select('total_amount, quantity, supplier_id, supplier_name, material_id, ims_material!inner(category_id)')
    .gte('price_date', startDateStr);

  if (restaurantId) query = query.eq('restaurant_id', restaurantId);
  if (categoryId) query = query.eq('ims_material.category_id', categoryId);

  const { data, error } = await query;

  if (error) {
    console.error('获取仪表板统计失败:', error);
    throw error;
  }

  const totalSpend = data?.reduce((sum, row) => sum + (Number(row.total_amount) || 0), 0) || 0;
  const totalItems = data?.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0) || 0;

  const suppliers = new Set<string>();
  data?.forEach(row => {
    if (row.supplier_id) suppliers.add(`id:${row.supplier_id}`);
    else if (row.supplier_name) suppliers.add(`name:${row.supplier_name}`);
  });

  return { totalSpend, totalItems, supplierCount: suppliers.size };
}

/**
 * 获取每日采购趋势
 * @param restaurantId 餐厅 ID（可选）
 * @param days 最近天数，默认 30 天
 */
export async function getDailyTrend(
  restaurantId?: string,
  days: number = 30
): Promise<DailyTrend[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  let query = supabase
    .from('ims_material_price')
    .select('price_date, total_amount')
    .gte('price_date', startDateStr)
    .order('price_date', { ascending: true });

  if (restaurantId) {
    query = query.eq('restaurant_id', restaurantId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('获取每日趋势失败:', error);
    throw error;
  }

  // 按日期聚合
  const dailyMap = new Map<string, number>();
  data?.forEach(row => {
    const date = row.price_date;
    const amount = Number(row.total_amount) || 0;
    dailyMap.set(date, (dailyMap.get(date) || 0) + amount);
  });

  // 转换为数组
  return Array.from(dailyMap.entries()).map(([date, cost]) => ({
    date,
    cost,
  }));
}

/**
 * 获取采购记录列表（转换为 DailyLog 格式供 Dashboard 使用）
 * @param restaurantId 餐厅 ID（可选）
 * @param days 最近天数，默认 30 天
 */
export async function getPurchaseLogs(
  restaurantId?: string,
  days: number = 30
): Promise<DailyLog[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  let query = supabase
    .from('ims_material_price')
    .select(`
      id,
      item_name,
      quantity,
      unit,
      unit_price,
      total_amount,
      price_date,
      supplier_id,
      supplier_name,
      notes,
      status
    `)
    .gte('price_date', startDateStr)
    .order('price_date', { ascending: false });

  if (restaurantId) {
    query = query.eq('restaurant_id', restaurantId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('获取采购记录失败:', error);
    throw error;
  }

  if (!data || data.length === 0) {
    return [];
  }

  // 按日期+供应商分组，转换为 DailyLog 格式
  const logsMap = new Map<string, DailyLog>();

  data.forEach((row, index) => {
    const supplier = row.supplier_name || `供应商#${row.supplier_id || '未知'}`;
    const key = `${row.price_date}-${supplier}`;

    if (!logsMap.has(key)) {
      logsMap.set(key, {
        id: `log-${index}`,
        date: row.price_date,
        category: 'Dry Goods', // 默认分类
        supplier: supplier,
        items: [],
        totalCost: 0,
        notes: '',
        status: row.status === 'approved' ? 'Stocked' : 'Pending',
      });
    }

    const log = logsMap.get(key)!;

    // 添加物品
    const item: ProcurementItem = {
      name: row.item_name,
      specification: row.notes || '',
      quantity: Number(row.quantity) || 0,
      unit: row.unit || '',
      unitPrice: Number(row.unit_price) || 0,
      total: Number(row.total_amount) || 0,
    };

    log.items.push(item);
    log.totalCost += item.total;
  });

  return Array.from(logsMap.values());
}

// ============ 新增 API v3.0 ============

/**
 * 获取品类列表（按门店品牌过滤，只显示该品牌的分类）
 * v4.1 - 修复：按餐厅品牌过滤分类，与库存录入保持一致
 */
export async function getCategories(restaurantId?: string): Promise<Category[]> {
  let brandId: number | null = null;

  // 如果有门店ID，先查询该门店的品牌
  if (restaurantId) {
    const { data: restaurant } = await supabase
      .from('master_restaurant')
      .select('brand_id')
      .eq('id', restaurantId)
      .single();
    brandId = restaurant?.brand_id || null;
  }

  // 查询分类（按品牌过滤）
  let query = supabase
    .from('ims_category')
    .select('id, name')
    .eq('is_active', true)
    .eq('category_type', 'material');

  // 品牌过滤：本品牌 + 通用(id=3) + NULL
  if (brandId) {
    query = query.or(`brand_id.eq.${brandId},brand_id.eq.3,brand_id.is.null`);
  }

  const { data, error } = await query.order('sort_order');

  if (error) {
    console.error('获取品类列表失败:', error);
    return [];
  }

  // 按名称去重
  const categoryMap = new Map<string, Category>();
  data?.forEach(row => {
    if (row.name && !categoryMap.has(row.name)) {
      categoryMap.set(row.name, { id: row.id, name: row.name });
    }
  });

  return Array.from(categoryMap.values());
}

/**
 * 按品类获取每日采购趋势
 */
export async function getCategoryTrend(
  restaurantId?: string,
  categoryId?: number,
  days: number = 30
): Promise<DailyTrend[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  let query = supabase
    .from('ims_material_price')
    .select('price_date, total_amount, material_id, ims_material!inner(category_id)')
    .gte('price_date', startDateStr)
    .order('price_date', { ascending: true });

  if (restaurantId) query = query.eq('restaurant_id', restaurantId);
  if (categoryId) query = query.eq('ims_material.category_id', categoryId);

  const { data, error } = await query;
  if (error) {
    console.error('获取品类趋势失败:', error);
    return [];
  }

  const dailyMap = new Map<string, number>();
  data?.forEach(row => {
    const date = row.price_date;
    dailyMap.set(date, (dailyMap.get(date) || 0) + (Number(row.total_amount) || 0));
  });

  return Array.from(dailyMap.entries()).map(([date, cost]) => ({ date, cost }));
}

/**
 * 获取供应商采购统计（支持品类筛选）
 */
export async function getSupplierStats(
  restaurantId?: string,
  categoryId?: number,
  days: number = 30
): Promise<SupplierStats[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  let query = supabase
    .from('ims_material_price')
    .select('supplier_name, total_amount, material_id, ims_material!inner(category_id)')
    .gte('price_date', startDateStr);

  if (restaurantId) query = query.eq('restaurant_id', restaurantId);
  if (categoryId) query = query.eq('ims_material.category_id', categoryId);

  const { data, error } = await query;
  if (error) {
    console.error('获取供应商统计失败:', error);
    return [];
  }

  const supplierMap = new Map<string, number>();
  data?.forEach(row => {
    const supplier = row.supplier_name || '未知供应商';
    supplierMap.set(supplier, (supplierMap.get(supplier) || 0) + (Number(row.total_amount) || 0));
  });

  return Array.from(supplierMap.entries())
    .map(([supplier, total]) => ({ supplier, total }))
    .sort((a, b) => b.total - a.total);
}

/**
 * 获取物品单价趋势
 */
export async function getItemPriceTrend(
  itemName: string,
  restaurantId?: string,
  days: number = 30
): Promise<ItemPriceTrend[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  let query = supabase
    .from('ims_material_price')
    .select('price_date, unit_price, quantity')
    .eq('item_name', itemName)
    .gte('price_date', startDateStr)
    .order('price_date', { ascending: true });

  if (restaurantId) query = query.eq('restaurant_id', restaurantId);

  const { data, error } = await query;
  if (error) {
    console.error('获取物品单价趋势失败:', error);
    return [];
  }

  return data?.map(row => ({
    date: row.price_date,
    price: Number(row.unit_price) || 0,
    quantity: Number(row.quantity) || 0,
  })) || [];
}

/**
 * 获取采购量趋势
 */
export async function getQuantityTrend(
  restaurantId?: string,
  categoryId?: number,
  days: number = 30
): Promise<QuantityTrend[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  let query = supabase
    .from('ims_material_price')
    .select('price_date, quantity, material_id, ims_material!inner(category_id)')
    .gte('price_date', startDateStr)
    .order('price_date', { ascending: true });

  if (restaurantId) query = query.eq('restaurant_id', restaurantId);
  if (categoryId) query = query.eq('ims_material.category_id', categoryId);

  const { data, error } = await query;
  if (error) {
    console.error('获取采购量趋势失败:', error);
    return [];
  }

  const dailyMap = new Map<string, number>();
  data?.forEach(row => {
    const date = row.price_date;
    dailyMap.set(date, (dailyMap.get(date) || 0) + (Number(row.quantity) || 0));
  });

  return Array.from(dailyMap.entries()).map(([date, quantity]) => ({ date, quantity }));
}

/**
 * 获取所有物品名称列表（模糊搜索+最近采购优先）
 */
export async function getItemNames(
  restaurantId?: string,
  days: number = 30
): Promise<ItemInfo[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  let query = supabase
    .from('ims_material_price')
    .select('item_name, unit, price_date')
    .gte('price_date', startDateStr)
    .order('price_date', { ascending: false });

  if (restaurantId) query = query.eq('restaurant_id', restaurantId);

  const { data, error } = await query;
  if (error) {
    console.error('获取物品列表失败:', error);
    return [];
  }

  // 按物品名去重，保留最近采购日期和单位
  const itemMap = new Map<string, ItemInfo>();
  data?.forEach(row => {
    if (row.item_name && !itemMap.has(row.item_name)) {
      itemMap.set(row.item_name, {
        name: row.item_name,
        unit: row.unit || '',
        lastPurchaseDate: row.price_date
      });
    }
  });

  // 按最近采购日期排序（已经是降序了）
  return Array.from(itemMap.values());
}

/**
 * 获取单个物品的供应商采购统计
 */
export async function getItemSupplierStats(
  itemName: string,
  restaurantId?: string,
  days: number = 30
): Promise<SupplierStats[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  let query = supabase
    .from('ims_material_price')
    .select('supplier_name, total_amount')
    .eq('item_name', itemName)
    .gte('price_date', startDateStr);

  if (restaurantId) query = query.eq('restaurant_id', restaurantId);

  const { data, error } = await query;
  if (error) {
    console.error('获取物品供应商统计失败:', error);
    return [];
  }

  const supplierMap = new Map<string, number>();
  data?.forEach(row => {
    const supplier = row.supplier_name || '未知供应商';
    supplierMap.set(supplier, (supplierMap.get(supplier) || 0) + (Number(row.total_amount) || 0));
  });

  return Array.from(supplierMap.entries())
    .map(([supplier, total]) => ({ supplier, total }))
    .sort((a, b) => b.total - a.total);
}

// ============ v9.0 店长端价格趋势 + 异常报警 ============

// 异常状态类型
export type AnomalyStatus = 'normal' | 'anomaly' | 'confirmed' | 'resolved';

// 价格异常记录
export interface PriceAnomaly {
  id: number;
  itemName: string;
  materialId: number | null;
  priceDate: string;
  unitPrice: number;
  unit: string;
  quantity: number;
  medianPrice: number;
  deviationPercent: number;
  anomalyStatus: AnomalyStatus;
  supplierName: string | null;
  createdAt: string;
}

// 店长端价格趋势数据点
export interface StorePriceTrendPoint {
  date: string;
  avgPrice: number;
  count: number;
}

// 店长端物料价格趋势
export interface StoreMaterialTrend {
  materialId: number | null;
  materialName: string;
  unit: string;
  data: StorePriceTrendPoint[];
}

// 店长端价格趋势响应
export interface StorePriceTrendResponse {
  categoryId: number;
  categoryName: string;
  aggregatedTrend: StorePriceTrendPoint[];
  materialTrends: StoreMaterialTrend[];
}

// 异常检测阈值（偏离中位数超过10%标记为异常）
const ANOMALY_THRESHOLD_PERCENT = 10;
// 最少历史记录数（少于此数不检测异常）
const MIN_HISTORY_COUNT = 3;

/**
 * 计算数组的中位数
 */
function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 获取店长端价格趋势（门店固定）
 * @param restaurantId 门店ID
 * @param categoryId 分类ID
 * @param days 天数
 */
export async function getStoreManagerPriceTrend(
  restaurantId: string,
  categoryId: number,
  days: number = 30
): Promise<StorePriceTrendResponse | null> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    // 获取分类信息
    const { data: category, error: catError } = await supabase
      .from('ims_category')
      .select('id, name')
      .eq('id', categoryId)
      .single();

    if (catError || !category) {
      console.error('获取分类信息失败:', catError);
      return null;
    }

    // 获取该分类下的物料
    const { data: materials, error: matError } = await supabase
      .from('ims_material')
      .select('id, name')
      .eq('category_id', categoryId)
      .eq('is_active', true);

    if (matError) {
      console.error('获取物料列表失败:', matError);
      return null;
    }

    const materialIds = materials?.map(m => m.id) || [];
    const materialMap = new Map<number, string>();
    materials?.forEach(m => materialMap.set(m.id, m.name));

    // 获取价格记录
    let query = supabase
      .from('ims_material_price')
      .select('material_id, item_name, unit_price, price_date, unit')
      .eq('restaurant_id', restaurantId)
      .gte('price_date', startDateStr)
      .not('unit_price', 'is', null)
      .order('price_date', { ascending: true });

    if (materialIds.length > 0) {
      query = query.in('material_id', materialIds);
    }

    const { data: priceRecords, error: priceError } = await query;

    if (priceError) {
      console.error('获取价格记录失败:', priceError);
      return null;
    }

    if (!priceRecords || priceRecords.length === 0) {
      return {
        categoryId: category.id,
        categoryName: category.name,
        aggregatedTrend: [],
        materialTrends: []
      };
    }

    // 整体聚合
    const dateAggregation: Record<string, { sum: number; count: number }> = {};
    // 物料聚合
    const materialAggregation: Record<string, {
      materialId: number | null;
      materialName: string;
      unit: string;
      dates: Record<string, { sum: number; count: number }>;
    }> = {};

    priceRecords.forEach(record => {
      const date = record.price_date;
      const price = Number(record.unit_price) || 0;
      const materialId = record.material_id;
      const materialName = materialId ? (materialMap.get(materialId) || record.item_name) : record.item_name;
      const unit = record.unit || '';

      // 整体聚合
      if (!dateAggregation[date]) {
        dateAggregation[date] = { sum: 0, count: 0 };
      }
      dateAggregation[date].sum += price;
      dateAggregation[date].count += 1;

      // 物料聚合（按物料名称分组）
      const key = materialName;
      if (!materialAggregation[key]) {
        materialAggregation[key] = {
          materialId,
          materialName,
          unit,
          dates: {}
        };
      }
      if (!materialAggregation[key].dates[date]) {
        materialAggregation[key].dates[date] = { sum: 0, count: 0 };
      }
      materialAggregation[key].dates[date].sum += price;
      materialAggregation[key].dates[date].count += 1;
    });

    // 生成整体趋势
    const aggregatedTrend: StorePriceTrendPoint[] = Object.entries(dateAggregation)
      .map(([date, { sum, count }]) => ({
        date,
        avgPrice: Math.round((sum / count) * 100) / 100,
        count
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 生成物料趋势（最多12个）
    const materialTrends: StoreMaterialTrend[] = Object.values(materialAggregation)
      .sort((a, b) => Object.keys(b.dates).length - Object.keys(a.dates).length)
      .slice(0, 12)
      .map(mat => ({
        materialId: mat.materialId,
        materialName: mat.materialName,
        unit: mat.unit,
        data: Object.entries(mat.dates)
          .map(([date, { sum, count }]) => ({
            date,
            avgPrice: Math.round((sum / count) * 100) / 100,
            count
          }))
          .sort((a, b) => a.date.localeCompare(b.date))
      }));

    return {
      categoryId: category.id,
      categoryName: category.name,
      aggregatedTrend,
      materialTrends
    };
  } catch (error) {
    console.error('获取店长端价格趋势失败:', error);
    return null;
  }
}

/**
 * 获取店长端异常列表
 * @param restaurantId 门店ID
 * @param limit 限制数量
 */
export async function getStoreManagerAnomalies(
  restaurantId: string,
  limit: number = 20
): Promise<PriceAnomaly[]> {
  try {
    const { data, error } = await supabase
      .from('ims_material_price')
      .select('id, item_name, material_id, price_date, unit_price, unit, quantity, supplier_name, anomaly_status, created_at')
      .eq('restaurant_id', restaurantId)
      .eq('anomaly_status', 'anomaly')
      .order('price_date', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('获取异常列表失败:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // 为每条异常记录计算中位数和偏离百分比
    const anomalies: PriceAnomaly[] = [];

    for (const record of data) {
      // 获取该物料的历史价格计算中位数
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

      let historyQuery = supabase
        .from('ims_material_price')
        .select('unit_price')
        .eq('restaurant_id', restaurantId)
        .gte('price_date', thirtyDaysAgoStr)
        .not('unit_price', 'is', null);

      if (record.material_id) {
        historyQuery = historyQuery.eq('material_id', record.material_id);
      } else {
        historyQuery = historyQuery.eq('item_name', record.item_name);
      }

      const { data: historyData } = await historyQuery;
      const prices = (historyData || []).map(h => Number(h.unit_price)).filter(p => p > 0);
      const medianPrice = calculateMedian(prices);
      const currentPrice = Number(record.unit_price) || 0;
      const deviationPercent = medianPrice > 0
        ? Math.round(((currentPrice - medianPrice) / medianPrice) * 100 * 10) / 10
        : 0;

      anomalies.push({
        id: record.id,
        itemName: record.item_name,
        materialId: record.material_id,
        priceDate: record.price_date,
        unitPrice: currentPrice,
        unit: record.unit || '',
        quantity: Number(record.quantity) || 0,
        medianPrice,
        deviationPercent,
        anomalyStatus: record.anomaly_status as AnomalyStatus,
        supplierName: record.supplier_name,
        createdAt: record.created_at
      });
    }

    return anomalies;
  } catch (error) {
    console.error('获取异常列表失败:', error);
    return [];
  }
}

/**
 * 处理异常（确认无误或标记为已修改）
 * @param priceId 价格记录ID
 * @param action 操作类型：'confirm' 确认无误，'resolve' 已修改解决
 * @param userId 操作用户ID
 * @param note 备注
 */
export async function resolveAnomaly(
  priceId: number,
  action: 'confirm' | 'resolve',
  userId: string,
  note?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const newStatus: AnomalyStatus = action === 'confirm' ? 'confirmed' : 'resolved';
    const defaultNote = action === 'confirm' ? '价格确实变化，已确认' : '已修改解决';

    const { error } = await supabase
      .from('ims_material_price')
      .update({
        anomaly_status: newStatus,
        anomaly_resolved_at: new Date().toISOString(),
        anomaly_resolved_by: userId,
        anomaly_note: note || defaultNote
      })
      .eq('id', priceId);

    if (error) {
      console.error('处理异常失败:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('处理异常失败:', error);
    return { success: false, error: '处理异常失败' };
  }
}

/**
 * 检测单条价格记录是否异常（中位数基准法）
 * 只检测偏高的价格（用户需求：小的当正常，大的当异常）
 * @param restaurantId 门店ID
 * @param materialId 物料ID（可选）
 * @param itemName 物品名称
 * @param currentPrice 当前价格
 * @returns 是否异常
 */
export async function detectPriceAnomaly(
  restaurantId: string,
  materialId: number | null,
  itemName: string,
  currentPrice: number
): Promise<{ isAnomaly: boolean; medianPrice: number; deviationPercent: number }> {
  try {
    // 获取最近30天的历史价格
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    let query = supabase
      .from('ims_material_price')
      .select('unit_price')
      .eq('restaurant_id', restaurantId)
      .gte('price_date', thirtyDaysAgoStr)
      .not('unit_price', 'is', null);

    if (materialId) {
      query = query.eq('material_id', materialId);
    } else {
      query = query.eq('item_name', itemName);
    }

    const { data, error } = await query;

    if (error) {
      console.error('获取历史价格失败:', error);
      return { isAnomaly: false, medianPrice: 0, deviationPercent: 0 };
    }

    const prices = (data || []).map(d => Number(d.unit_price)).filter(p => p > 0);

    // 历史数据少于阈值，不检测异常
    if (prices.length < MIN_HISTORY_COUNT) {
      return { isAnomaly: false, medianPrice: 0, deviationPercent: 0 };
    }

    const medianPrice = calculateMedian(prices);

    // 中位数为0时不检测
    if (medianPrice <= 0) {
      return { isAnomaly: false, medianPrice: 0, deviationPercent: 0 };
    }

    const deviationPercent = ((currentPrice - medianPrice) / medianPrice) * 100;

    // 只检测偏高的价格（deviation > threshold）
    const isAnomaly = deviationPercent > ANOMALY_THRESHOLD_PERCENT;

    return {
      isAnomaly,
      medianPrice: Math.round(medianPrice * 100) / 100,
      deviationPercent: Math.round(deviationPercent * 10) / 10
    };
  } catch (error) {
    console.error('检测价格异常失败:', error);
    return { isAnomaly: false, medianPrice: 0, deviationPercent: 0 };
  }
}

/**
 * 运行历史数据异常检测（一次性脚本）
 * 对指定门店的历史数据进行异常检测并标记
 * @param restaurantId 门店ID（可选，不传则检测所有门店）
 * @param days 检测最近多少天的数据
 */
export async function runHistoricalAnomalyDetection(
  restaurantId?: string,
  days: number = 30
): Promise<{ processed: number; anomalies: number; errors: number }> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    // 获取需要检测的价格记录
    let query = supabase
      .from('ims_material_price')
      .select('id, restaurant_id, material_id, item_name, unit_price')
      .gte('price_date', startDateStr)
      .eq('anomaly_status', 'normal')
      .not('unit_price', 'is', null);

    if (restaurantId) {
      query = query.eq('restaurant_id', restaurantId);
    }

    const { data: records, error } = await query.limit(1000);

    if (error) {
      console.error('获取价格记录失败:', error);
      return { processed: 0, anomalies: 0, errors: 0 };
    }

    if (!records || records.length === 0) {
      return { processed: 0, anomalies: 0, errors: 0 };
    }

    let processed = 0;
    let anomalies = 0;
    let errors = 0;

    // 逐条检测
    for (const record of records) {
      try {
        const result = await detectPriceAnomaly(
          record.restaurant_id,
          record.material_id,
          record.item_name,
          Number(record.unit_price)
        );

        if (result.isAnomaly) {
          // 标记为异常
          const { error: updateError } = await supabase
            .from('ims_material_price')
            .update({ anomaly_status: 'anomaly' })
            .eq('id', record.id);

          if (updateError) {
            errors++;
          } else {
            anomalies++;
          }
        }

        processed++;
      } catch {
        errors++;
      }
    }

    return { processed, anomalies, errors };
  } catch (error) {
    console.error('运行历史异常检测失败:', error);
    return { processed: 0, anomalies: 0, errors: 0 };
  }
}
