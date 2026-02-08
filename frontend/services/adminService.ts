/**
 * 管理员面板服务
 * v1.7 - 价格趋势使用加权平均：
 *   - getCategoryPriceTrend 使用数量加权平均计算单价
 *   - 公式：sum(unit_price * quantity) / sum(quantity)
 *   - 解决同一天同一物料多条记录时的价格显示问题
 *
 * v1.6 - 价格趋势按门店过滤：
 *   - getCategoryPriceTrend 添加 restaurantId 参数
 *   - 支持按单个门店过滤价格数据
 *
 * v1.5 - 价格趋势分析功能：
 *   - 添加 getCategoriesByBrand 获取品牌下的分类列表
 *   - 添加 getCategoryPriceTrend 获取分类价格趋势数据
 *   - 支持整体趋势和物料拆分视图
 *
 * v1.4 - 修复供应商列表过滤：
 *   - 添加 is_active 过滤，只显示活跃供应商
 *
 * v1.3 - 重大功能更新：
 *   - 过滤测试门店（"测试门店"不显示）
 *   - 添加品牌列表获取
 *   - 供应商支持品牌过滤 + CRUD 操作
 *   - 物料支持 CRUD 操作
 *   - 异常告警支持品牌/门店过滤
 *   - 报表支持日期范围 + 门店明细展开
 *
 * v1.2 - 修复数据库列名错误
 * v1.1 - 修复数据库查询错误
 * v1.0 - 初始版本
 */

import { supabase } from './supabaseClient';
import { PriceAlert, RestaurantEntryStatus, AdminUserView } from '../types';

// 价格波动告警阈值（百分比）
const PRICE_CHANGE_THRESHOLD = 10;
// 未录入天数警告阈值
const NO_ENTRY_WARNING_DAYS = 2;
const NO_ENTRY_CRITICAL_DAYS = 3;
// 测试门店名称（过滤用）
const TEST_RESTAURANT_NAME = '测试门店';

// ==================== 品牌列表 ====================

export interface BrandView {
  id: number;
  name: string;
  code: string;
}

/**
 * 获取品牌列表（用于过滤下拉）
 */
export async function getBrandList(): Promise<BrandView[]> {
  try {
    const { data: brands, error } = await supabase
      .from('master_brand')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name');

    if (error || !brands) {
      console.error('[AdminService] 获取品牌列表失败:', error);
      return [];
    }

    return brands;
  } catch (error) {
    console.error('[AdminService] 获取品牌列表失败:', error);
    return [];
  }
}

// ==================== 总览统计 ====================

export interface AdminOverviewStats {
  totalRestaurants: number;
  activeToday: number;
  pendingAlerts: number;
  totalSpendToday: number;
  totalSpendWeek: number;
  totalSpendMonth: number;
}

/**
 * 获取管理员总览统计数据（排除测试门店）
 */
export async function getAdminOverviewStats(): Promise<AdminOverviewStats> {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  try {
    // 获取非测试门店ID列表
    const { data: validRestaurants } = await supabase
      .from('master_restaurant')
      .select('id')
      .neq('restaurant_name', TEST_RESTAURANT_NAME);

    const validIds = (validRestaurants || []).map(r => r.id);

    // 并行查询
    const [
      todayEntriesRes,
      todaySpendRes,
      weekSpendRes,
      monthSpendRes
    ] = await Promise.all([
      // 今日有录入的门店
      supabase.from('ims_material_price')
        .select('restaurant_id')
        .gte('price_date', today)
        .in('restaurant_id', validIds)
        .limit(1000),
      // 今日总采购额
      supabase.from('ims_material_price')
        .select('total_amount')
        .gte('price_date', today)
        .in('restaurant_id', validIds),
      // 本周总采购额
      supabase.from('ims_material_price')
        .select('total_amount')
        .gte('price_date', weekAgo)
        .in('restaurant_id', validIds),
      // 本月总采购额
      supabase.from('ims_material_price')
        .select('total_amount')
        .gte('price_date', monthAgo)
        .in('restaurant_id', validIds)
    ]);

    // 计算今日活跃门店数（去重）
    const uniqueRestaurants = new Set(
      (todayEntriesRes.data || []).map((e: { restaurant_id: string }) => e.restaurant_id)
    );

    return {
      totalRestaurants: validIds.length,
      activeToday: uniqueRestaurants.size,
      pendingAlerts: 0,
      totalSpendToday: (todaySpendRes.data || []).reduce((sum: number, r: { total_amount: number | null }) => sum + (r.total_amount || 0), 0),
      totalSpendWeek: (weekSpendRes.data || []).reduce((sum: number, r: { total_amount: number | null }) => sum + (r.total_amount || 0), 0),
      totalSpendMonth: (monthSpendRes.data || []).reduce((sum: number, r: { total_amount: number | null }) => sum + (r.total_amount || 0), 0)
    };
  } catch (error) {
    console.error('[AdminService] 获取总览统计失败:', error);
    return {
      totalRestaurants: 0,
      activeToday: 0,
      pendingAlerts: 0,
      totalSpendToday: 0,
      totalSpendWeek: 0,
      totalSpendMonth: 0
    };
  }
}

// ==================== 录入监控 ====================

/**
 * 获取各门店录入状态（排除测试门店）
 */
export async function getRestaurantEntryStatus(): Promise<RestaurantEntryStatus[]> {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const weekAgoStr = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  try {
    // 获取所有门店（排除测试门店）
    const { data: restaurants, error: restError } = await supabase
      .from('master_restaurant')
      .select('id, restaurant_name')
      .neq('restaurant_name', TEST_RESTAURANT_NAME)
      .order('restaurant_name');

    if (restError || !restaurants) {
      console.error('[AdminService] 获取门店列表失败:', restError);
      return [];
    }

    // 获取每个门店的最后录入日期和统计
    const statusList: RestaurantEntryStatus[] = await Promise.all(
      restaurants.map(async (rest) => {
        const { data: lastEntry } = await supabase
          .from('ims_material_price')
          .select('price_date')
          .eq('restaurant_id', rest.id)
          .order('price_date', { ascending: false })
          .limit(1);

        const { count: todayCount } = await supabase
          .from('ims_material_price')
          .select('id', { count: 'exact', head: true })
          .eq('restaurant_id', rest.id)
          .gte('price_date', todayStr);

        const { count: weekCount } = await supabase
          .from('ims_material_price')
          .select('id', { count: 'exact', head: true })
          .eq('restaurant_id', rest.id)
          .gte('price_date', weekAgoStr);

        const lastEntryDate = lastEntry?.[0]?.price_date || null;
        let daysSinceEntry = 999;
        if (lastEntryDate) {
          const lastDate = new Date(lastEntryDate);
          daysSinceEntry = Math.floor((today.getTime() - lastDate.getTime()) / (24 * 60 * 60 * 1000));
        }

        let status: 'active' | 'warning' | 'critical' = 'active';
        if (daysSinceEntry >= NO_ENTRY_CRITICAL_DAYS) {
          status = 'critical';
        } else if (daysSinceEntry >= NO_ENTRY_WARNING_DAYS) {
          status = 'warning';
        }

        return {
          restaurant_id: rest.id,
          restaurant_name: rest.restaurant_name,
          last_entry_date: lastEntryDate,
          days_since_entry: daysSinceEntry,
          entry_count_today: todayCount || 0,
          entry_count_week: weekCount || 0,
          status
        };
      })
    );

    return statusList.sort((a, b) => {
      const order = { critical: 0, warning: 1, active: 2 };
      return order[a.status] - order[b.status];
    });
  } catch (error) {
    console.error('[AdminService] 获取门店录入状态失败:', error);
    return [];
  }
}

// ==================== 异常告警（支持品牌/门店过滤） ====================

export interface PriceAlertExtended extends PriceAlert {
  restaurant_id: string;
  brand_id: number | null;
}

/**
 * 获取价格异常告警（支持品牌/门店过滤，排除测试门店）
 */
export async function getPriceAlerts(brandId?: number, restaurantId?: string): Promise<PriceAlertExtended[]> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // 获取餐厅信息（排除测试门店）
    let restaurantQuery = supabase
      .from('master_restaurant')
      .select('id, restaurant_name, brand_id')
      .neq('restaurant_name', TEST_RESTAURANT_NAME);

    if (brandId) {
      restaurantQuery = restaurantQuery.eq('brand_id', brandId);
    }
    if (restaurantId) {
      restaurantQuery = restaurantQuery.eq('id', restaurantId);
    }

    const { data: restaurants } = await restaurantQuery;

    if (!restaurants || restaurants.length === 0) {
      return [];
    }

    const restaurantMap = new Map<string, { name: string; brand_id: number | null }>();
    const validIds = restaurants.map(r => {
      restaurantMap.set(r.id, { name: r.restaurant_name, brand_id: r.brand_id });
      return r.id;
    });

    // 获取价格记录
    const { data: priceRecords, error: priceError } = await supabase
      .from('ims_material_price')
      .select('id, material_id, restaurant_id, unit_price, price_date, item_name')
      .gte('price_date', thirtyDaysAgo)
      .in('restaurant_id', validIds)
      .order('price_date', { ascending: false })
      .limit(2000);

    if (priceError || !priceRecords) {
      console.error('[AdminService] 获取价格记录失败:', priceError);
      return [];
    }

    // 按物料+门店分组，找出价格波动
    const alerts: PriceAlertExtended[] = [];
    const groupedRecords: Record<string, Array<{
      id: number;
      material_id: number | null;
      restaurant_id: string;
      unit_price: number | null;
      price_date: string;
      item_name: string;
    }>> = {};

    priceRecords.forEach((record) => {
      const key = `${record.material_id || record.item_name}-${record.restaurant_id}`;
      if (!groupedRecords[key]) {
        groupedRecords[key] = [];
      }
      groupedRecords[key].push(record);
    });

    Object.values(groupedRecords).forEach((records) => {
      if (records.length < 2) return;

      records.sort((a, b) => new Date(b.price_date).getTime() - new Date(a.price_date).getTime());

      const latest = records[0];
      const previous = records[1];

      if (latest.unit_price && previous.unit_price && previous.unit_price > 0) {
        const changePercent = ((latest.unit_price - previous.unit_price) / previous.unit_price) * 100;

        if (Math.abs(changePercent) >= PRICE_CHANGE_THRESHOLD) {
          const restInfo = restaurantMap.get(latest.restaurant_id);
          alerts.push({
            id: `${latest.id}-${previous.id}`,
            material_name: latest.item_name || '未知物料',
            restaurant_name: restInfo?.name || '未知门店',
            restaurant_id: latest.restaurant_id,
            brand_id: restInfo?.brand_id || null,
            old_price: previous.unit_price,
            new_price: latest.unit_price,
            change_percent: changePercent,
            detected_at: latest.price_date,
            status: 'pending'
          });
        }
      }
    });

    return alerts.sort((a, b) => Math.abs(b.change_percent) - Math.abs(a.change_percent));
  } catch (error) {
    console.error('[AdminService] 获取价格告警失败:', error);
    return [];
  }
}

// ==================== 用户列表 ====================

/**
 * 获取用户列表（只读，排除测试门店用户）
 */
export async function getAdminUserList(): Promise<AdminUserView[]> {
  try {
    // 获取非测试门店ID
    const { data: validRestaurants } = await supabase
      .from('master_restaurant')
      .select('id, restaurant_name')
      .neq('restaurant_name', TEST_RESTAURANT_NAME);

    const restaurantMap = new Map<string, string>();
    const validIds = (validRestaurants || []).map(r => {
      restaurantMap.set(r.id, r.restaurant_name);
      return r.id;
    });

    const { data: users, error } = await supabase
      .from('master_employee')
      .select('id, username, employee_name, role_code, is_active, restaurant_id')
      .in('restaurant_id', validIds)
      .order('employee_name');

    if (error || !users) {
      console.error('[AdminService] 获取用户列表失败:', error);
      return [];
    }

    return users.map((user) => ({
      id: user.id,
      username: user.username,
      employee_name: user.employee_name,
      role_code: user.role_code,
      restaurant_name: restaurantMap.get(user.restaurant_id) || '未分配',
      last_login: null,
      is_active: user.is_active,
      entry_count_30d: 0
    }));
  } catch (error) {
    console.error('[AdminService] 获取用户列表失败:', error);
    return [];
  }
}

// ==================== 门店列表 ====================

export interface AdminRestaurantView {
  id: string;
  restaurant_name: string;
  address: string | null;
  brand_id: number | null;
  brand_name: string | null;
  employee_count: number;
}

/**
 * 获取门店列表（只读，排除测试门店）
 */
export async function getAdminRestaurantList(): Promise<AdminRestaurantView[]> {
  try {
    const { data: restaurants, error } = await supabase
      .from('master_restaurant')
      .select('id, restaurant_name, address, brand_id')
      .neq('restaurant_name', TEST_RESTAURANT_NAME)
      .order('restaurant_name');

    if (error || !restaurants) {
      console.error('[AdminService] 获取门店列表失败:', error);
      return [];
    }

    const { data: brands } = await supabase
      .from('master_brand')
      .select('id, name');

    const brandMap = new Map<number, string>();
    (brands || []).forEach((b: { id: number; name: string }) => {
      brandMap.set(b.id, b.name);
    });

    return Promise.all(
      restaurants.map(async (rest) => {
        const { count } = await supabase
          .from('master_employee')
          .select('id', { count: 'exact', head: true })
          .eq('restaurant_id', rest.id);

        return {
          id: rest.id,
          restaurant_name: rest.restaurant_name,
          address: rest.address,
          brand_id: rest.brand_id,
          brand_name: brandMap.get(rest.brand_id) || null,
          employee_count: count || 0
        };
      })
    );
  } catch (error) {
    console.error('[AdminService] 获取门店列表失败:', error);
    return [];
  }
}

// ==================== 供应商 CRUD ====================

export interface AdminSupplierView {
  id: number;
  supplier_name: string;
  contact_person: string | null;
  contact_phone: string | null;
  address: string | null;
  brand_id: number;
  brand_name: string | null;
  is_active: boolean;
}

export interface SupplierInput {
  name: string;
  contact_person?: string;
  phone?: string;
  address?: string;
  brand_id: number;
}

/**
 * 获取供应商列表（支持品牌过滤）
 */
export async function getAdminSupplierList(brandId?: number): Promise<AdminSupplierView[]> {
  try {
    let query = supabase
      .from('ims_supplier')
      .select('id, name, contact_person, phone, address, brand_id, is_active')
      .eq('is_active', true)
      .order('name');

    if (brandId) {
      query = query.eq('brand_id', brandId);
    }

    const { data: suppliers, error } = await query;

    if (error || !suppliers) {
      console.error('[AdminService] 获取供应商列表失败:', error);
      return [];
    }

    // 获取品牌映射
    const { data: brands } = await supabase
      .from('master_brand')
      .select('id, name');

    const brandMap = new Map<number, string>();
    (brands || []).forEach((b: { id: number; name: string }) => {
      brandMap.set(b.id, b.name);
    });

    return suppliers.map((sup) => ({
      id: sup.id,
      supplier_name: sup.name,
      contact_person: sup.contact_person,
      contact_phone: sup.phone,
      address: sup.address,
      brand_id: sup.brand_id,
      brand_name: brandMap.get(sup.brand_id) || null,
      is_active: sup.is_active ?? true
    }));
  } catch (error) {
    console.error('[AdminService] 获取供应商列表失败:', error);
    return [];
  }
}

/**
 * 添加供应商
 */
export async function createSupplier(input: SupplierInput): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('ims_supplier')
      .insert({
        name: input.name,
        contact_person: input.contact_person || null,
        phone: input.phone || null,
        address: input.address || null,
        brand_id: input.brand_id,
        is_active: true
      })
      .select('id')
      .single();

    if (error) {
      console.error('[AdminService] 添加供应商失败:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data.id };
  } catch (error) {
    console.error('[AdminService] 添加供应商失败:', error);
    return { success: false, error: '添加供应商失败' };
  }
}

/**
 * 更新供应商
 */
export async function updateSupplier(id: number, input: Partial<SupplierInput>): Promise<{ success: boolean; error?: string }> {
  try {
    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.contact_person !== undefined) updateData.contact_person = input.contact_person;
    if (input.phone !== undefined) updateData.phone = input.phone;
    if (input.address !== undefined) updateData.address = input.address;
    if (input.brand_id !== undefined) updateData.brand_id = input.brand_id;
    updateData.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from('ims_supplier')
      .update(updateData)
      .eq('id', id);

    if (error) {
      console.error('[AdminService] 更新供应商失败:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('[AdminService] 更新供应商失败:', error);
    return { success: false, error: '更新供应商失败' };
  }
}

/**
 * 删除供应商（软删除）
 */
export async function deleteSupplier(id: number): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('ims_supplier')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('[AdminService] 删除供应商失败:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('[AdminService] 删除供应商失败:', error);
    return { success: false, error: '删除供应商失败' };
  }
}

// ==================== 物料 CRUD ====================

export interface AdminMaterialView {
  id: number;
  code: string;
  material_name: string;
  category_id: number | null;
  category_name: string | null;
  base_unit_id: number | null;
  unit_name: string | null;
  brand_id: number;
  brand_name: string | null;
  is_active: boolean;
}

export interface MaterialInput {
  code: string;
  name: string;
  category_id: number;
  base_unit_id: number;
  brand_id: number;
}

/**
 * 获取物料列表（支持品牌过滤）
 */
export async function getAdminMaterialList(brandId?: number): Promise<AdminMaterialView[]> {
  try {
    let query = supabase
      .from('ims_material')
      .select('id, code, name, category_id, base_unit_id, brand_id, is_active')
      .eq('is_active', true)
      .order('name')
      .limit(500);

    if (brandId) {
      query = query.eq('brand_id', brandId);
    }

    const { data: materials, error } = await query;

    if (error || !materials) {
      console.error('[AdminService] 获取物料列表失败:', error);
      return [];
    }

    // 获取分类、单位、品牌映射
    const [categoriesRes, unitsRes, brandsRes] = await Promise.all([
      supabase.from('ims_category').select('id, name'),
      supabase.from('ims_unit').select('id, name_cn'),
      supabase.from('master_brand').select('id, name')
    ]);

    const categoryMap = new Map<number, string>();
    (categoriesRes.data || []).forEach((c: { id: number; name: string }) => {
      categoryMap.set(c.id, c.name);
    });

    const unitMap = new Map<number, string>();
    (unitsRes.data || []).forEach((u: { id: number; name_cn: string }) => {
      unitMap.set(u.id, u.name_cn);
    });

    const brandMap = new Map<number, string>();
    (brandsRes.data || []).forEach((b: { id: number; name: string }) => {
      brandMap.set(b.id, b.name);
    });

    return materials.map((mat) => ({
      id: mat.id,
      code: mat.code,
      material_name: mat.name,
      category_id: mat.category_id,
      category_name: categoryMap.get(mat.category_id) || null,
      base_unit_id: mat.base_unit_id,
      unit_name: unitMap.get(mat.base_unit_id) || null,
      brand_id: mat.brand_id,
      brand_name: brandMap.get(mat.brand_id) || null,
      is_active: mat.is_active ?? true
    }));
  } catch (error) {
    console.error('[AdminService] 获取物料列表失败:', error);
    return [];
  }
}

/**
 * 获取分类列表（按品牌过滤）
 * v2.0 - 添加品牌过滤，避免不同品牌的同名分类重复显示
 * @param brandId 可选品牌ID，传入时返回该品牌 + 通用(brand_id=3或NULL) 的分类
 */
export async function getCategoryList(brandId?: number): Promise<{ id: number; name: string }[]> {
  try {
    let query = supabase
      .from('ims_category')
      .select('id, name')
      .eq('is_active', true)
      .eq('category_type', 'material');

    // 品牌过滤：加载本品牌 + 通用(NULL或id=3) 分类
    if (brandId) {
      query = query.or(`brand_id.eq.${brandId},brand_id.eq.3,brand_id.is.null`);
    }

    const { data, error } = await query.order('name');

    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

/**
 * 获取单位列表
 */
export async function getUnitList(): Promise<{ id: number; name: string }[]> {
  try {
    const { data, error } = await supabase
      .from('ims_unit')
      .select('id, name_cn')
      .order('name_cn');

    if (error) return [];
    return (data || []).map(u => ({ id: u.id, name: u.name_cn }));
  } catch {
    return [];
  }
}

/**
 * 添加物料
 */
export async function createMaterial(input: MaterialInput): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('ims_material')
      .insert({
        code: input.code,
        name: input.name,
        category_id: input.category_id,
        base_unit_id: input.base_unit_id,
        brand_id: input.brand_id,
        is_active: true
      })
      .select('id')
      .single();

    if (error) {
      console.error('[AdminService] 添加物料失败:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data.id };
  } catch (error) {
    console.error('[AdminService] 添加物料失败:', error);
    return { success: false, error: '添加物料失败' };
  }
}

/**
 * 更新物料
 */
export async function updateMaterial(id: number, input: Partial<MaterialInput>): Promise<{ success: boolean; error?: string }> {
  try {
    const updateData: Record<string, unknown> = {};
    if (input.code !== undefined) updateData.code = input.code;
    if (input.name !== undefined) updateData.name = input.name;
    if (input.category_id !== undefined) updateData.category_id = input.category_id;
    if (input.base_unit_id !== undefined) updateData.base_unit_id = input.base_unit_id;
    if (input.brand_id !== undefined) updateData.brand_id = input.brand_id;
    updateData.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from('ims_material')
      .update(updateData)
      .eq('id', id);

    if (error) {
      console.error('[AdminService] 更新物料失败:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('[AdminService] 更新物料失败:', error);
    return { success: false, error: '更新物料失败' };
  }
}

/**
 * 删除物料（软删除）
 */
export async function deleteMaterial(id: number): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('ims_material')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('[AdminService] 删除物料失败:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('[AdminService] 删除物料失败:', error);
    return { success: false, error: '删除物料失败' };
  }
}

// ==================== 跨门店报表（支持日期范围和明细） ====================

export interface CrossRestaurantReport {
  restaurant_id: string;
  restaurant_name: string;
  brand_name: string | null;
  total_spend: number;
  entry_count: number;
}

export interface RestaurantPurchaseDetail {
  id: number;
  item_name: string;
  quantity: number | null;
  unit_name: string | null;
  unit_price: number | null;
  total_amount: number | null;
  price_date: string;
  supplier_name: string | null;
}

/**
 * 获取跨门店采购汇总报表（排除测试门店）
 */
export async function getCrossRestaurantReport(days: number = 30): Promise<CrossRestaurantReport[]> {
  try {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: restaurants, error: restError } = await supabase
      .from('master_restaurant')
      .select('id, restaurant_name, brand_id')
      .neq('restaurant_name', TEST_RESTAURANT_NAME);

    if (restError || !restaurants) {
      return [];
    }

    // 获取品牌映射
    const { data: brands } = await supabase
      .from('master_brand')
      .select('id, name');

    const brandMap = new Map<number, string>();
    (brands || []).forEach((b: { id: number; name: string }) => {
      brandMap.set(b.id, b.name);
    });

    return Promise.all(
      restaurants.map(async (rest) => {
        const { data: prices } = await supabase
          .from('ims_material_price')
          .select('total_amount')
          .eq('restaurant_id', rest.id)
          .gte('price_date', startDate);

        const totalSpend = (prices || []).reduce((sum: number, p: { total_amount: number | null }) => sum + (p.total_amount || 0), 0);
        const entryCount = prices?.length || 0;

        return {
          restaurant_id: rest.id,
          restaurant_name: rest.restaurant_name,
          brand_name: brandMap.get(rest.brand_id) || null,
          total_spend: totalSpend,
          entry_count: entryCount
        };
      })
    );
  } catch (error) {
    console.error('[AdminService] 获取跨门店报表失败:', error);
    return [];
  }
}

/**
 * 获取门店采购明细
 */
export async function getRestaurantPurchaseDetails(restaurantId: string, days: number = 30): Promise<RestaurantPurchaseDetail[]> {
  try {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: prices, error } = await supabase
      .from('ims_material_price')
      .select('id, item_name, quantity, unit, unit_price, total_amount, price_date, supplier_name')
      .eq('restaurant_id', restaurantId)
      .gte('price_date', startDate)
      .order('price_date', { ascending: false })
      .limit(100);

    if (error || !prices) {
      console.error('[AdminService] 获取门店明细失败:', error);
      return [];
    }

    return prices.map(p => ({
      id: p.id,
      item_name: p.item_name,
      quantity: p.quantity,
      unit_name: p.unit,
      unit_price: p.unit_price,
      total_amount: p.total_amount,
      price_date: p.price_date,
      supplier_name: p.supplier_name
    }));
  } catch (error) {
    console.error('[AdminService] 获取门店明细失败:', error);
    return [];
  }
}

// ==================== 价格趋势分析 ====================

// 价格趋势数据点
export interface PriceTrendDataPoint {
  date: string;
  avgPrice: number;
}

// 物料价格趋势（拆分视图）
export interface MaterialPriceTrend {
  materialId: number;
  materialName: string;
  data: PriceTrendDataPoint[];
}

// 单个门店的价格趋势数据
export interface RestaurantTrendData {
  restaurantId: string;
  restaurantName: string;
  aggregatedTrend: PriceTrendDataPoint[];  // 该门店的整体平均
  materialTrends: MaterialPriceTrend[];     // 该门店的物料明细
}

// 分类价格趋势响应（支持多门店）
export interface CategoryPriceTrendResponse {
  categoryId: number;
  categoryName: string;
  aggregatedTrend: PriceTrendDataPoint[];  // 整体平均（所有选中门店合计）
  materialTrends: MaterialPriceTrend[];     // 各物料明细（所有选中门店合计）
  restaurantData: RestaurantTrendData[];    // 每个门店的独立数据
}

// 分类视图（用于下拉选择）
export interface CategoryView {
  id: number;
  name: string;
}

/**
 * 获取品牌下的分类列表
 */
export async function getCategoriesByBrand(brandId: number): Promise<CategoryView[]> {
  try {
    // 获取该品牌下有物料的分类
    const { data: materials, error: matError } = await supabase
      .from('ims_material')
      .select('category_id')
      .eq('brand_id', brandId)
      .eq('is_active', true);

    if (matError || !materials) {
      console.error('[AdminService] 获取品牌物料失败:', matError);
      return [];
    }

    // 获取唯一的分类ID
    const categoryIds = [...new Set(materials.map(m => m.category_id).filter(Boolean))];

    if (categoryIds.length === 0) {
      return [];
    }

    // 获取分类详情
    const { data: categories, error: catError } = await supabase
      .from('ims_category')
      .select('id, name')
      .in('id', categoryIds)
      .order('name');

    if (catError || !categories) {
      console.error('[AdminService] 获取分类列表失败:', catError);
      return [];
    }

    return categories;
  } catch (error) {
    console.error('[AdminService] 获取品牌分类失败:', error);
    return [];
  }
}

/**
 * 获取分类价格趋势数据（支持多门店对比）
 * @param restaurantIds 门店ID数组，为空时返回所有门店合计
 */
export async function getCategoryPriceTrend(
  brandId: number,
  categoryId: number,
  days: number = 30,
  restaurantIds?: string[]
): Promise<CategoryPriceTrendResponse | null> {
  try {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // 获取分类信息
    const { data: category, error: catError } = await supabase
      .from('ims_category')
      .select('id, name')
      .eq('id', categoryId)
      .single();

    if (catError || !category) {
      console.error('[AdminService] 获取分类信息失败:', catError);
      return null;
    }

    // 获取该品牌+分类下的物料
    const { data: materials, error: matError } = await supabase
      .from('ims_material')
      .select('id, name')
      .eq('brand_id', brandId)
      .eq('category_id', categoryId)
      .eq('is_active', true);

    if (matError || !materials || materials.length === 0) {
      console.error('[AdminService] 获取物料列表失败:', matError);
      return {
        categoryId: category.id,
        categoryName: category.name,
        aggregatedTrend: [],
        materialTrends: [],
        restaurantData: []
      };
    }

    const materialIds = materials.map(m => m.id);
    const materialMap = new Map<number, string>();
    materials.forEach(m => materialMap.set(m.id, m.name));

    // 获取门店信息（用于显示门店名称）
    const restaurantMap = new Map<string, string>();
    if (restaurantIds && restaurantIds.length > 0) {
      const { data: restaurants } = await supabase
        .from('master_restaurant')
        .select('id, restaurant_name')
        .in('id', restaurantIds);
      if (restaurants) {
        restaurants.forEach(r => restaurantMap.set(r.id, r.restaurant_name));
      }
    }

    // 获取价格记录（包含 restaurant_id 用于分组，quantity 用于加权平均）
    let query = supabase
      .from('ims_material_price')
      .select('material_id, unit_price, price_date, restaurant_id, quantity')
      .in('material_id', materialIds)
      .gte('price_date', startDate)
      .not('unit_price', 'is', null)
      .order('price_date', { ascending: true });

    // 如果指定了门店，按门店过滤
    if (restaurantIds && restaurantIds.length > 0) {
      query = query.in('restaurant_id', restaurantIds);
    }

    const { data: priceRecords, error: priceError } = await query;

    if (priceError || !priceRecords) {
      console.error('[AdminService] 获取价格记录失败:', priceError);
      return {
        categoryId: category.id,
        categoryName: category.name,
        aggregatedTrend: [],
        materialTrends: [],
        restaurantData: []
      };
    }

    // 类型断言
    type PriceRecord = { material_id: number; unit_price: number; price_date: string; restaurant_id: string; quantity: number | null };
    const records = priceRecords as unknown as PriceRecord[];

    // 整体聚合（所有选中门店合计）- 使用加权平均
    // weightedSum = sum(unit_price * quantity), totalQty = sum(quantity)
    // avgPrice = weightedSum / totalQty
    const dateAggregation: Record<string, { weightedSum: number; totalQty: number }> = {};
    const materialDateAggregation: Record<number, Record<string, { weightedSum: number; totalQty: number }>> = {};

    // 按门店分组聚合
    const restaurantAggregation: Record<string, {
      dateAgg: Record<string, { weightedSum: number; totalQty: number }>;
      materialAgg: Record<number, Record<string, { weightedSum: number; totalQty: number }>>;
    }> = {};

    records.forEach((record) => {
      const { price_date: date, unit_price: price, material_id: materialId, restaurant_id: restId, quantity } = record;
      if (!date || !price || !materialId) return;

      // 数量默认为1（如果没有记录数量）
      const qty = quantity || 1;

      // 整体聚合
      if (!dateAggregation[date]) {
        dateAggregation[date] = { weightedSum: 0, totalQty: 0 };
      }
      dateAggregation[date].weightedSum += price * qty;
      dateAggregation[date].totalQty += qty;

      // 整体物料聚合
      if (!materialDateAggregation[materialId]) {
        materialDateAggregation[materialId] = {};
      }
      if (!materialDateAggregation[materialId][date]) {
        materialDateAggregation[materialId][date] = { weightedSum: 0, totalQty: 0 };
      }
      materialDateAggregation[materialId][date].weightedSum += price * qty;
      materialDateAggregation[materialId][date].totalQty += qty;

      // 按门店分组聚合
      if (restId) {
        if (!restaurantAggregation[restId]) {
          restaurantAggregation[restId] = { dateAgg: {}, materialAgg: {} };
        }
        // 门店整体
        if (!restaurantAggregation[restId].dateAgg[date]) {
          restaurantAggregation[restId].dateAgg[date] = { weightedSum: 0, totalQty: 0 };
        }
        restaurantAggregation[restId].dateAgg[date].weightedSum += price * qty;
        restaurantAggregation[restId].dateAgg[date].totalQty += qty;

        // 门店物料
        if (!restaurantAggregation[restId].materialAgg[materialId]) {
          restaurantAggregation[restId].materialAgg[materialId] = {};
        }
        if (!restaurantAggregation[restId].materialAgg[materialId][date]) {
          restaurantAggregation[restId].materialAgg[materialId][date] = { weightedSum: 0, totalQty: 0 };
        }
        restaurantAggregation[restId].materialAgg[materialId][date].weightedSum += price * qty;
        restaurantAggregation[restId].materialAgg[materialId][date].totalQty += qty;
      }
    });

    // 生成整体趋势数据（加权平均）
    const aggregatedTrend: PriceTrendDataPoint[] = Object.entries(dateAggregation)
      .map(([date, { weightedSum, totalQty }]) => ({
        date,
        avgPrice: Math.round((weightedSum / totalQty) * 100) / 100
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 生成整体物料趋势（最多12个）
    const materialTrends: MaterialPriceTrend[] = [];
    const sortedMaterialIds = Object.keys(materialDateAggregation)
      .map(Number)
      .sort((a, b) => {
        const countA = Object.keys(materialDateAggregation[a]).length;
        const countB = Object.keys(materialDateAggregation[b]).length;
        return countB - countA;
      })
      .slice(0, 12);

    sortedMaterialIds.forEach((materialId) => {
      const materialData = materialDateAggregation[materialId];
      const data: PriceTrendDataPoint[] = Object.entries(materialData)
        .map(([date, { weightedSum, totalQty }]) => ({
          date,
          avgPrice: Math.round((weightedSum / totalQty) * 100) / 100
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      materialTrends.push({
        materialId,
        materialName: materialMap.get(materialId) || '未知物料',
        data
      });
    });

    // 生成每个门店的独立数据
    const restaurantData: RestaurantTrendData[] = [];
    Object.entries(restaurantAggregation).forEach(([restId, { dateAgg, materialAgg }]) => {
      // 门店整体趋势（加权平均）
      const restAggTrend: PriceTrendDataPoint[] = Object.entries(dateAgg)
        .map(([date, { weightedSum, totalQty }]) => ({
          date,
          avgPrice: Math.round((weightedSum / totalQty) * 100) / 100
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // 门店物料趋势（加权平均）
      const restMatTrends: MaterialPriceTrend[] = [];
      sortedMaterialIds.forEach((materialId) => {
        if (materialAgg[materialId]) {
          const data: PriceTrendDataPoint[] = Object.entries(materialAgg[materialId])
            .map(([date, { weightedSum, totalQty }]) => ({
              date,
              avgPrice: Math.round((weightedSum / totalQty) * 100) / 100
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

          restMatTrends.push({
            materialId,
            materialName: materialMap.get(materialId) || '未知物料',
            data
          });
        }
      });

      restaurantData.push({
        restaurantId: restId,
        restaurantName: restaurantMap.get(restId) || '未知门店',
        aggregatedTrend: restAggTrend,
        materialTrends: restMatTrends
      });
    });

    return {
      categoryId: category.id,
      categoryName: category.name,
      aggregatedTrend,
      materialTrends,
      restaurantData
    };
  } catch (error) {
    console.error('[AdminService] 获取价格趋势失败:', error);
    return null;
  }
}

// 价格记录详情
export interface PriceRecordDetail {
  id: number;
  itemName: string;
  materialName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalAmount: number;
  priceDate: string;
  supplierName: string;
  restaurantName: string;
  createdAt: string;
  receiptImages: string[];  // 入库单图片数组
  goodsImages: string[];    // 货物图片数组
}

/**
 * 获取指定日期、物料、门店的价格记录详情
 */
export async function getPriceRecordDetails(
  date: string,
  materialName: string,
  restaurantId?: string
): Promise<PriceRecordDetail[]> {
  try {
    // 先根据物料名称获取物料ID
    const { data: materials } = await supabase
      .from('ims_material')
      .select('id, name')
      .eq('name', materialName)
      .limit(1);

    const materialId = materials?.[0]?.id;

    // 构建查询
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
        supplier_name,
        created_at,
        restaurant_id,
        material_id,
        receipt_image,
        goods_image
      `)
      .eq('price_date', date);

    // 如果找到了物料ID，按物料ID过滤；否则按 item_name 模糊匹配
    if (materialId) {
      query = query.eq('material_id', materialId);
    } else {
      // 尝试模糊匹配 item_name
      query = query.ilike('item_name', `%${materialName}%`);
    }

    // 如果指定了门店，按门店过滤
    if (restaurantId) {
      query = query.eq('restaurant_id', restaurantId);
    }

    const { data: records, error } = await query.order('created_at', { ascending: false });

    if (error || !records) {
      console.error('[AdminService] 获取价格记录详情失败:', error);
      return [];
    }

    // 获取门店名称
    const restaurantIds = [...new Set(records.map(r => r.restaurant_id).filter(Boolean))];
    const restaurantMap = new Map<string, string>();
    if (restaurantIds.length > 0) {
      const { data: restaurants } = await supabase
        .from('master_restaurant')
        .select('id, restaurant_name')
        .in('id', restaurantIds);
      if (restaurants) {
        restaurants.forEach(r => restaurantMap.set(r.id, r.restaurant_name));
      }
    }

    // 解析 JSON 格式的图片 URL 数组
    const parseImageUrls = (jsonStr: string | null): string[] => {
      if (!jsonStr) return [];
      try {
        const parsed = JSON.parse(jsonStr);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };

    return records.map(r => ({
      id: r.id,
      itemName: r.item_name || '',
      materialName: materialName,
      quantity: r.quantity || 0,
      unit: r.unit || '',
      unitPrice: r.unit_price || 0,
      totalAmount: r.total_amount || 0,
      priceDate: r.price_date || '',
      supplierName: r.supplier_name || '',
      restaurantName: restaurantMap.get(r.restaurant_id) || '未知门店',
      createdAt: r.created_at || '',
      receiptImages: parseImageUrls(r.receipt_image),
      goodsImages: parseImageUrls(r.goods_image)
    }));
  } catch (error) {
    console.error('[AdminService] 获取价格记录详情失败:', error);
    return [];
  }
}
