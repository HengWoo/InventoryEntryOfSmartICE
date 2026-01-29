/**
 * 管理员面板主组件
 * v2.5 - 表单弹窗下拉框统一使用 GlassSelect：
 *   - 新增/编辑供应商的品牌选择使用 GlassSelect
 *   - 新增/编辑物料的品牌/分类/单位选择使用 GlassSelect
 *   - 移除原生 select 元素和 FormSelectWrapper
 *   - 取消按钮重置表单状态
 *
 * v2.4 - 表单下拉框统一使用 GlassSelect：
 *   - 新增/编辑供应商的品牌选择
 *   - 新增/编辑物料的品牌/分类/单位选择
 *   - 移除原生 select 元素
 *
 * v2.3 - 重大功能更新：
 *   - 使用 GlassSelect 替代原生 select，统一下拉框样式
 *   - 供应商/物料列表添加搜索框
 *   - 物料编码自动生成（品牌前缀 + 随机数）
 *   - 修复编辑保存后自动关闭弹窗
 *   - 优化数据刷新（后台静默刷新）
 *
 * v2.2 - 下拉框样式统一：
 *   - 使用 appearance-none 移除浏览器默认样式
 *   - 添加自定义下拉箭头图标
 *   - 统一过滤器和表单下拉框样式
 *
 * v2.1 - 移动端表格优化：
 *   - 用户/门店/供应商/物料列表使用卡片布局（移动端）
 *   - 桌面端保持表格布局
 *   - 响应式设计：md 断点切换
 *
 * v2.0 - 完整功能重构：
 *   - 删除 duty_manager 角色显示
 *   - 供应商：品牌过滤 + CRUD（增删改）
 *   - 物料：品牌过滤 + CRUD（增删改）
 *   - 异常告警：品牌/门店过滤
 *   - 数据报表：日期范围 + 门店明细展开
 *   - 用户账户区：退出登录 + 修改密码
 *
 * v1.2 - 独立全屏布局，标题改为"门店管家"，移除返回按钮
 * v1.1 - 使用 SWR hooks 优化数据缓存
 * v1.0 - 初始版本：Storm Glass 风格管理员控制台
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GlassCard, GlassSelect } from './ui';
import { Icons } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import {
  useAdminOverview,
  useRestaurantEntryStatus,
  usePriceAlerts,
  useAdminUsers,
  useAdminRestaurants,
  useAdminSuppliers,
  useAdminMaterials,
  useCrossRestaurantReport,
  useBrandList,
  useCategoryList,
  useUnitList,
  useRestaurantDetails
} from '../hooks/useAdminData';
import { SupplierInput, MaterialInput } from '../services/adminService';

// 管理员面板子视图
type AdminSubView = 'overview' | 'monitoring' | 'alerts' | 'reports' | 'users' | 'restaurants' | 'suppliers' | 'materials';

// 编辑模态框类型
type ModalType = 'none' | 'add-supplier' | 'edit-supplier' | 'add-material' | 'edit-material' | 'confirm-delete';

export const AdminPanel: React.FC = () => {
  const { user, logout } = useAuth();
  const [currentView, setCurrentView] = useState<AdminSubView>('overview');

  // 用户菜单状态
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  // 移动端侧边栏状态
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const mobileSidebarRef = useRef<HTMLDivElement>(null);

  // 过滤器状态
  const [selectedBrandId, setSelectedBrandId] = useState<number | undefined>(undefined);
  const [alertBrandFilter, setAlertBrandFilter] = useState<number | undefined>(undefined);
  const [alertRestaurantFilter, setAlertRestaurantFilter] = useState<string | undefined>(undefined);
  const [reportDays, setReportDays] = useState<number>(30);
  const [expandedRestaurantId, setExpandedRestaurantId] = useState<string | null>(null);

  // v2.3: 搜索状态
  const [supplierSearch, setSupplierSearch] = useState('');
  const [materialSearch, setMaterialSearch] = useState('');

  // 模态框状态
  const [modalType, setModalType] = useState<ModalType>('none');
  const [editingSupplier, setEditingSupplier] = useState<{ id: number; name: string; contact_person?: string; phone?: string; address?: string; brand_id: number } | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<{ id: number; code: string; name: string; category_id: number; base_unit_id: number; brand_id: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'supplier' | 'material'; id: number; name: string } | null>(null);

  // 表单状态
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // v2.4: 表单下拉框状态（用于 GlassSelect）
  const [formBrandId, setFormBrandId] = useState<number | undefined>(undefined);
  const [formCategoryId, setFormCategoryId] = useState<number | undefined>(undefined);
  const [formUnitId, setFormUnitId] = useState<number | undefined>(undefined);

  // SWR hooks
  const { stats: overviewStats, isLoading: overviewLoading } = useAdminOverview();
  const { statusList: entryStatus, isLoading: statusLoading } = useRestaurantEntryStatus();
  const { alerts: priceAlerts, isLoading: alertsLoading } = usePriceAlerts(alertBrandFilter, alertRestaurantFilter);
  const { users, isLoading: usersLoading } = useAdminUsers();
  const { restaurants, isLoading: restaurantsLoading } = useAdminRestaurants();
  const { suppliers, isLoading: suppliersLoading, addSupplier, editSupplier, removeSupplier } = useAdminSuppliers(selectedBrandId);
  const { materials, isLoading: materialsLoading, addMaterial, editMaterial, removeMaterial } = useAdminMaterials(selectedBrandId);
  const { report: crossReport, isLoading: reportLoading } = useCrossRestaurantReport(reportDays);
  const { brands } = useBrandList();
  const { categories } = useCategoryList();
  const { units } = useUnitList();
  const { details: restaurantDetails, isLoading: detailsLoading } = useRestaurantDetails(expandedRestaurantId, reportDays);

  // v2.3: 过滤后的供应商和物料列表（支持搜索）
  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch.trim()) return suppliers;
    const query = supplierSearch.toLowerCase();
    return suppliers.filter(
      (s) =>
        s.supplier_name.toLowerCase().includes(query) ||
        (s.contact_person && s.contact_person.toLowerCase().includes(query)) ||
        (s.contact_phone && s.contact_phone.includes(query))
    );
  }, [suppliers, supplierSearch]);

  const filteredMaterials = useMemo(() => {
    if (!materialSearch.trim()) return materials;
    const query = materialSearch.toLowerCase();
    return materials.filter(
      (m) =>
        m.material_name.toLowerCase().includes(query) ||
        (m.code && m.code.toLowerCase().includes(query)) ||
        (m.category_name && m.category_name.toLowerCase().includes(query))
    );
  }, [materials, materialSearch]);

  // v2.3: 根据品牌生成物料编码前缀
  const getBrandCodePrefix = (brandId: number): string => {
    const brand = brands.find((b) => b.id === brandId);
    if (!brand) return 'MAT';
    // 使用品牌 code 或从名称生成拼音首字母
    if (brand.code) return brand.code.toUpperCase();
    // 常见品牌映射
    const brandPrefixMap: Record<string, string> = {
      '宁桂杏': 'NGX',
      '野百灵': 'YBL',
      '邦兰浦': 'BLP',
    };
    return brandPrefixMap[brand.name] || 'MAT';
  };

  // v2.3: 生成物料编码（品牌前缀 + 时间戳 + 随机数）
  const generateMaterialCode = (brandId: number): string => {
    const prefix = getBrandCodePrefix(brandId);
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timestamp}${random}`;
  };

  // 点击外部关闭用户菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 导航项配置
  const navItems: { id: AdminSubView; label: string; icon: React.ComponentType<{ className?: string }>; section?: string }[] = [
    { id: 'overview', label: '总览', icon: Icons.ChartBar, section: '监控' },
    { id: 'monitoring', label: '录入监控', icon: Icons.Clock },
    { id: 'alerts', label: '异常告警', icon: Icons.ExclamationTriangle },
    { id: 'reports', label: '数据报表', icon: Icons.Document, section: '报表' },
    { id: 'users', label: '用户', icon: Icons.User, section: '数据管理' },
    { id: 'restaurants', label: '门店', icon: Icons.Storefront },
    { id: 'suppliers', label: '供应商', icon: Icons.Truck },
    { id: 'materials', label: '物料', icon: Icons.Package },
  ];

  // 格式化金额
  const formatMoney = (n: number) => {
    if (n >= 10000) return `¥${(n / 10000).toFixed(1)}万`;
    return `¥${n.toLocaleString()}`;
  };

  // 格式化日期
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  // 用户头像字符
  const getAvatarChar = () => {
    if (user?.nickname) return user.nickname.slice(0, 1);
    if (user?.name) return user.name.slice(0, 1);
    return 'A';
  };

  // 状态徽章
  const StatusBadge = ({ status }: { status: 'active' | 'warning' | 'critical' }) => {
    const styles = {
      active: 'bg-ios-green/20 text-ios-green border-ios-green/30',
      warning: 'bg-ios-orange/20 text-ios-orange border-ios-orange/30',
      critical: 'bg-ios-red/20 text-ios-red border-ios-red/30'
    };
    const labels = { active: '正常', warning: '警告', critical: '异常' };
    return (
      <span className={`px-2 py-0.5 text-xs rounded-full border ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  // 角色标签 - v2.0: 删除 duty_manager
  const RoleBadge = ({ role }: { role: string }) => {
    const roleLabels: Record<string, string> = {
      administrator: '管理员',
      manager: '店长',
      chef: '厨师',
      employee: '员工'
    };
    const roleColors: Record<string, string> = {
      administrator: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      manager: 'bg-ios-blue/20 text-ios-blue border-ios-blue/30',
      chef: 'bg-ios-green/20 text-ios-green border-ios-green/30',
      employee: 'bg-white/10 text-white/70 border-white/20'
    };
    return (
      <span className={`px-2 py-0.5 text-xs rounded-full border ${roleColors[role] || roleColors.employee}`}>
        {roleLabels[role] || role}
      </span>
    );
  };

  // 加载指示器
  const LoadingSpinner = () => (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
    </div>
  );

  // v2.3: 使用 GlassSelect 替代原生 select - 品牌过滤
  const brandOptions = brands.map((b) => ({ value: b.id, label: b.name }));
  const restaurantOptions = restaurants.map((r) => ({ value: r.id, label: r.restaurant_name }));
  // v2.4: 分类和单位选项
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }));
  const unitOptions = units.map((u) => ({ value: u.id, label: u.name }));

  // 品牌过滤下拉框（使用 GlassSelect）
  const BrandFilter = ({ value, onChange, label = "筛选品牌" }: { value: number | undefined; onChange: (v: number | undefined) => void; label?: string }) => (
    <GlassSelect
      options={brandOptions}
      value={value}
      onChange={(v) => onChange(v as number | undefined)}
      placeholder={label}
      size="small"
    />
  );

  // 门店过滤下拉框（使用 GlassSelect）
  const RestaurantFilter = ({ value, onChange }: { value: string | undefined; onChange: (v: string | undefined) => void }) => (
    <GlassSelect
      options={restaurantOptions}
      value={value}
      onChange={(v) => onChange(v as string | undefined)}
      placeholder="全部门店"
      size="small"
      searchable
      searchPlaceholder="搜索门店..."
    />
  );

  // 日期范围选择器
  const DateRangeSelector = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
    <div className="flex gap-1">
      {[{ label: '1天', value: 1 }, { label: '7天', value: 7 }, { label: '30天', value: 30 }].map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1 text-xs rounded-lg transition-all ${
            value === opt.value
              ? 'bg-ios-blue/30 text-ios-blue border border-ios-blue/50'
              : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  // ============ 供应商表单处理 ============
  const handleAddSupplier = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);

    const input: SupplierInput = {
      name: formData.get('name') as string,
      contact_person: formData.get('contact_person') as string || undefined,
      phone: formData.get('phone') as string || undefined,
      address: formData.get('address') as string || undefined,
      brand_id: formBrandId || 0
    };

    if (!input.name || !input.brand_id) {
      setFormError('请填写供应商名称和选择品牌');
      setFormLoading(false);
      return;
    }

    const result = await addSupplier(input);
    setFormLoading(false);

    if (result.success) {
      setModalType('none');
      setFormBrandId(undefined); // 重置表单状态
    } else {
      setFormError(result.error || '添加失败');
    }
  };

  const handleEditSupplier = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingSupplier) return;

    setFormError(null);
    setFormLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);

    const input: Partial<SupplierInput> = {
      name: formData.get('name') as string,
      contact_person: formData.get('contact_person') as string || undefined,
      phone: formData.get('phone') as string || undefined,
      address: formData.get('address') as string || undefined,
      brand_id: formBrandId || editingSupplier.brand_id
    };

    const result = await editSupplier(editingSupplier.id, input);
    setFormLoading(false);

    if (result.success) {
      setModalType('none');
      setEditingSupplier(null);
      setFormBrandId(undefined); // 重置表单状态
    } else {
      setFormError(result.error || '更新失败');
    }
  };

  // ============ 物料表单处理 ============
  // v2.3: 添加物料时自动生成编码
  // v2.4: 使用 formBrandId/formCategoryId/formUnitId 状态
  const handleAddMaterial = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);

    const brandId = formBrandId || 0;
    let code = formData.get('code') as string;

    // 如果编码为空，自动生成
    if (!code || code.trim() === '') {
      code = generateMaterialCode(brandId);
    }

    const input: MaterialInput = {
      code,
      name: formData.get('name') as string,
      category_id: formCategoryId || 0,
      base_unit_id: formUnitId || 0,
      brand_id: brandId
    };

    if (!input.name || !input.brand_id) {
      setFormError('请填写物料名称和选择品牌');
      setFormLoading(false);
      return;
    }

    const result = await addMaterial(input);
    setFormLoading(false);

    if (result.success) {
      setModalType('none');
      // 重置表单状态
      setFormBrandId(undefined);
      setFormCategoryId(undefined);
      setFormUnitId(undefined);
    } else {
      setFormError(result.error || '添加失败');
    }
  };

  const handleEditMaterial = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingMaterial) return;

    setFormError(null);
    setFormLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);

    const input: Partial<MaterialInput> = {
      code: formData.get('code') as string,
      name: formData.get('name') as string,
      category_id: formCategoryId ?? editingMaterial.category_id,
      base_unit_id: formUnitId ?? editingMaterial.base_unit_id,
      brand_id: formBrandId ?? editingMaterial.brand_id
    };

    const result = await editMaterial(editingMaterial.id, input);
    setFormLoading(false);

    if (result.success) {
      setModalType('none');
      setEditingMaterial(null);
      // 重置表单状态
      setFormBrandId(undefined);
      setFormCategoryId(undefined);
      setFormUnitId(undefined);
    } else {
      setFormError(result.error || '更新失败');
    }
  };

  // ============ 删除处理 ============
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    setFormLoading(true);
    let result;

    if (deleteTarget.type === 'supplier') {
      result = await removeSupplier(deleteTarget.id);
    } else {
      result = await removeMaterial(deleteTarget.id);
    }

    setFormLoading(false);

    if (result.success) {
      setModalType('none');
      setDeleteTarget(null);
    } else {
      setFormError(result.error || '删除失败');
    }
  };

  // ============ 渲染视图 ============

  // 渲染总览视图
  const renderOverview = () => {
    if (overviewLoading && !overviewStats) return <LoadingSpinner />;

    return (
      <div className="space-y-4">
        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <GlassCard padding="sm" className="flex flex-col items-center justify-center min-h-[80px]">
            <span className="text-xs text-white/60">总门店</span>
            <p className="text-2xl font-light text-white">{overviewStats?.totalRestaurants || 0}</p>
          </GlassCard>
          <GlassCard padding="sm" className="flex flex-col items-center justify-center min-h-[80px]">
            <span className="text-xs text-white/60">今日活跃</span>
            <p className="text-2xl font-light text-ios-green">{overviewStats?.activeToday || 0}</p>
          </GlassCard>
          <GlassCard padding="sm" className="flex flex-col items-center justify-center min-h-[80px]">
            <span className="text-xs text-white/60">待处理告警</span>
            <p className="text-2xl font-light text-ios-red">{priceAlerts.length || 0}</p>
          </GlassCard>
          <GlassCard padding="sm" className="flex flex-col items-center justify-center min-h-[80px]">
            <span className="text-xs text-white/60">本月采购</span>
            <p className="text-xl font-light text-white">{formatMoney(overviewStats?.totalSpendMonth || 0)}</p>
          </GlassCard>
        </div>

        {/* 门店状态概览 */}
        <GlassCard padding="md">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-white">门店录入状态</h3>
            <button
              onClick={() => setCurrentView('monitoring')}
              className="text-xs text-ios-blue hover:text-ios-blue/80 transition-colors"
            >
              查看全部 →
            </button>
          </div>
          {statusLoading && entryStatus.length === 0 ? (
            <div className="py-6 text-center text-white/40 text-sm">加载中...</div>
          ) : (
            <div className="space-y-2">
              {entryStatus.slice(0, 5).map((rest) => (
                <div
                  key={rest.restaurant_id}
                  className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <StatusBadge status={rest.status} />
                    <span className="text-sm text-white">{rest.restaurant_name}</span>
                  </div>
                  <div className="text-xs text-white/50">
                    {rest.last_entry_date ? `最后录入: ${formatDate(rest.last_entry_date)}` : '暂无录入'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        {/* 最近告警 */}
        <GlassCard padding="md">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-white">最近异常告警</h3>
            <button
              onClick={() => setCurrentView('alerts')}
              className="text-xs text-ios-blue hover:text-ios-blue/80 transition-colors"
            >
              查看全部 →
            </button>
          </div>
          {alertsLoading && priceAlerts.length === 0 ? (
            <div className="py-6 text-center text-white/40 text-sm">加载中...</div>
          ) : priceAlerts.length === 0 ? (
            <div className="text-center py-6 text-white/40 text-sm">暂无异常告警</div>
          ) : (
            <div className="space-y-2">
              {priceAlerts.slice(0, 5).map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
                >
                  <div>
                    <div className="text-sm text-white">{alert.material_name}</div>
                    <div className="text-xs text-white/50">{alert.restaurant_name}</div>
                  </div>
                  <div className={`text-sm font-medium ${alert.change_percent > 0 ? 'text-ios-red' : 'text-ios-green'}`}>
                    {alert.change_percent > 0 ? '+' : ''}{alert.change_percent.toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    );
  };

  // 渲染录入监控视图
  const renderMonitoring = () => {
    if (statusLoading && entryStatus.length === 0) return <LoadingSpinner />;

    return (
      <GlassCard padding="md">
        <h3 className="text-base font-bold text-white mb-4">各门店录入状态</h3>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="text-left text-white/50 border-b border-white/10">
                <th className="pb-3 font-medium whitespace-nowrap">状态</th>
                <th className="pb-3 font-medium whitespace-nowrap">门店</th>
                <th className="pb-3 font-medium text-right whitespace-nowrap">今日</th>
                <th className="pb-3 font-medium text-right whitespace-nowrap">本周</th>
                <th className="pb-3 font-medium text-right whitespace-nowrap">最后录入</th>
              </tr>
            </thead>
            <tbody>
              {entryStatus.map((rest) => (
                <tr key={rest.restaurant_id} className="border-b border-white/5 last:border-0">
                  <td className="py-3 pr-3 whitespace-nowrap"><StatusBadge status={rest.status} /></td>
                  <td className="py-3 pr-4 text-white whitespace-nowrap">{rest.restaurant_name}</td>
                  <td className="py-3 pr-4 text-right text-white/70 whitespace-nowrap">{rest.entry_count_today}</td>
                  <td className="py-3 pr-4 text-right text-white/70 whitespace-nowrap">{rest.entry_count_week}</td>
                  <td className="py-3 text-right text-white/50 whitespace-nowrap">
                    {rest.last_entry_date ? formatDate(rest.last_entry_date) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    );
  };

  // 渲染异常告警视图 - v2.0: 添加品牌/门店过滤
  const renderAlerts = () => {
    return (
      <GlassCard padding="md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-white">价格异常告警</h3>
            <p className="text-xs text-white/50">检测规则：同一物料价格波动超过 ±10%</p>
          </div>
          <div className="flex gap-2">
            <BrandFilter value={alertBrandFilter} onChange={setAlertBrandFilter} label="全部品牌" />
            <RestaurantFilter value={alertRestaurantFilter} onChange={setAlertRestaurantFilter} />
          </div>
        </div>

        {alertsLoading && priceAlerts.length === 0 ? (
          <LoadingSpinner />
        ) : priceAlerts.length === 0 ? (
          <div className="text-center py-12 text-white/40">
            <Icons.CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>暂无价格异常</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="text-left text-white/50 border-b border-white/10">
                  <th className="pb-3 pr-4 font-medium whitespace-nowrap">物料</th>
                  <th className="pb-3 pr-4 font-medium whitespace-nowrap">门店</th>
                  <th className="pb-3 pr-4 font-medium text-right whitespace-nowrap">原价</th>
                  <th className="pb-3 pr-4 font-medium text-right whitespace-nowrap">现价</th>
                  <th className="pb-3 pr-4 font-medium text-right whitespace-nowrap">波动</th>
                  <th className="pb-3 font-medium text-right whitespace-nowrap">日期</th>
                </tr>
              </thead>
              <tbody>
                {priceAlerts.map((alert) => (
                  <tr key={alert.id} className="border-b border-white/5 last:border-0">
                    <td className="py-3 pr-4 text-white whitespace-nowrap">{alert.material_name}</td>
                    <td className="py-3 pr-4 text-white/70 whitespace-nowrap">{alert.restaurant_name}</td>
                    <td className="py-3 pr-4 text-right text-white/50 whitespace-nowrap">¥{alert.old_price.toFixed(2)}</td>
                    <td className="py-3 pr-4 text-right text-white whitespace-nowrap">¥{alert.new_price.toFixed(2)}</td>
                    <td className={`py-3 pr-4 text-right font-medium whitespace-nowrap ${alert.change_percent > 0 ? 'text-ios-red' : 'text-ios-green'}`}>
                      {alert.change_percent > 0 ? '↑' : '↓'}{Math.abs(alert.change_percent).toFixed(1)}%
                    </td>
                    <td className="py-3 text-right text-white/50 whitespace-nowrap">{formatDate(alert.detected_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    );
  };

  // 渲染报表视图 - v2.0: 日期范围 + 门店明细展开
  const renderReports = () => {
    return (
      <GlassCard padding="md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <h3 className="text-base font-bold text-white">跨门店采购汇总</h3>
          <DateRangeSelector value={reportDays} onChange={setReportDays} />
        </div>

        {reportLoading && crossReport.length === 0 ? (
          <LoadingSpinner />
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm min-w-[400px]">
              <thead>
                <tr className="text-left text-white/50 border-b border-white/10">
                  <th className="pb-3 pr-2 font-medium w-8"></th>
                  <th className="pb-3 pr-4 font-medium whitespace-nowrap">门店</th>
                  <th className="pb-3 pr-4 font-medium text-right whitespace-nowrap">采购总额</th>
                  <th className="pb-3 font-medium text-right whitespace-nowrap">录入</th>
                </tr>
              </thead>
              <tbody>
                {[...crossReport]
                  .sort((a, b) => b.total_spend - a.total_spend)
                  .map((report) => (
                    <React.Fragment key={report.restaurant_id || report.restaurant_name}>
                      <tr
                        className="border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors"
                        onClick={() => setExpandedRestaurantId(
                          expandedRestaurantId === report.restaurant_id ? null : report.restaurant_id
                        )}
                      >
                        <td className="py-3 pr-2 text-white/50">
                          <Icons.ChevronDown
                            className={`w-4 h-4 transition-transform ${
                              expandedRestaurantId === report.restaurant_id ? 'rotate-180' : ''
                            }`}
                          />
                        </td>
                        <td className="py-3 pr-4 text-white whitespace-nowrap">{report.restaurant_name}</td>
                        <td className="py-3 pr-4 text-right text-ios-blue font-medium whitespace-nowrap">{formatMoney(report.total_spend)}</td>
                        <td className="py-3 text-right text-white/70 whitespace-nowrap">{report.entry_count}</td>
                      </tr>

                      {/* 展开的明细行 */}
                      {expandedRestaurantId === report.restaurant_id && (
                        <tr>
                          <td colSpan={4} className="p-0">
                            <div className="bg-white/5 p-4 border-b border-white/10">
                              {detailsLoading ? (
                                <div className="text-center py-4 text-white/40 text-sm">加载明细中...</div>
                              ) : restaurantDetails.length === 0 ? (
                                <div className="text-center py-4 text-white/40 text-sm">暂无采购明细</div>
                              ) : (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-left text-white/40 border-b border-white/10">
                                      <th className="pb-2 font-medium">物料</th>
                                      <th className="pb-2 font-medium">供应商</th>
                                      <th className="pb-2 font-medium text-right">数量</th>
                                      <th className="pb-2 font-medium text-right">单价</th>
                                      <th className="pb-2 font-medium text-right">金额</th>
                                      <th className="pb-2 font-medium text-right">日期</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {restaurantDetails.slice(0, 10).map((detail) => (
                                      <tr key={detail.id} className="border-b border-white/5 last:border-0">
                                        <td className="py-2 text-white/80">{detail.item_name}</td>
                                        <td className="py-2 text-white/60">{detail.supplier_name || '-'}</td>
                                        <td className="py-2 text-right text-white/60">
                                          {detail.quantity} {detail.unit_name || ''}
                                        </td>
                                        <td className="py-2 text-right text-white/60">
                                          {detail.unit_price ? `¥${detail.unit_price.toFixed(2)}` : '-'}
                                        </td>
                                        <td className="py-2 text-right text-white/80">
                                          {detail.total_amount ? `¥${detail.total_amount.toFixed(2)}` : '-'}
                                        </td>
                                        <td className="py-2 text-right text-white/50">{formatDate(detail.price_date)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                              {restaurantDetails.length > 10 && (
                                <div className="text-center pt-2 text-white/40 text-xs">
                                  还有 {restaurantDetails.length - 10} 条记录...
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    );
  };

  // 渲染用户列表（只读）- v2.1: 移动端卡片布局
  const renderUsers = () => {
    if (usersLoading && users.length === 0) return <LoadingSpinner />;

    return (
      <GlassCard padding="md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-white">用户列表</h3>
          <span className="text-xs text-white/40 flex items-center gap-1">
            <Icons.Eye className="w-3 h-3" /> 只读
          </span>
        </div>

        {/* 移动端：卡片布局 */}
        <div className="md:hidden space-y-3">
          {users.map((u) => (
            <div
              key={u.id}
              className="p-3 rounded-lg bg-white/5 border border-white/10"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-medium">{u.employee_name}</span>
                <div className="flex items-center gap-2">
                  <RoleBadge role={u.role_code} />
                  <span className={`w-2 h-2 rounded-full ${u.is_active ? 'bg-ios-green' : 'bg-white/30'}`} />
                </div>
              </div>
              <div className="text-xs text-white/50 space-y-1">
                <div>用户名: <span className="text-white/70">{u.username}</span></div>
                <div>门店: <span className="text-white/70">{u.restaurant_name}</span></div>
              </div>
            </div>
          ))}
        </div>

        {/* 桌面端：表格布局 */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/50 border-b border-white/10">
                <th className="pb-3 font-medium">姓名</th>
                <th className="pb-3 font-medium">用户名</th>
                <th className="pb-3 font-medium">角色</th>
                <th className="pb-3 font-medium">所属门店</th>
                <th className="pb-3 font-medium text-center">状态</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-white/5 last:border-0">
                  <td className="py-3 text-white">{u.employee_name}</td>
                  <td className="py-3 text-white/70">{u.username}</td>
                  <td className="py-3"><RoleBadge role={u.role_code} /></td>
                  <td className="py-3 text-white/70">{u.restaurant_name}</td>
                  <td className="py-3 text-center">
                    <span className={`w-2 h-2 rounded-full inline-block ${u.is_active ? 'bg-ios-green' : 'bg-white/30'}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    );
  };

  // 渲染门店列表（只读）- v2.1: 移动端卡片布局
  const renderRestaurants = () => {
    if (restaurantsLoading && restaurants.length === 0) return <LoadingSpinner />;

    return (
      <GlassCard padding="md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-white">门店列表</h3>
          <span className="text-xs text-white/40 flex items-center gap-1">
            <Icons.Eye className="w-3 h-3" /> 只读
          </span>
        </div>

        {/* 移动端：卡片布局 */}
        <div className="md:hidden space-y-3">
          {restaurants.map((rest) => (
            <div
              key={rest.id}
              className="p-3 rounded-lg bg-white/5 border border-white/10"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-medium">{rest.restaurant_name}</span>
                <span className="text-xs text-white/50 bg-white/10 px-2 py-0.5 rounded">
                  {rest.employee_count} 人
                </span>
              </div>
              <div className="text-xs text-white/50 space-y-1">
                <div>品牌: <span className="text-white/70">{rest.brand_name || '-'}</span></div>
                {rest.address && (
                  <div className="truncate">地址: <span className="text-white/70">{rest.address}</span></div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 桌面端：表格布局 */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/50 border-b border-white/10">
                <th className="pb-3 font-medium">门店名称</th>
                <th className="pb-3 font-medium">品牌</th>
                <th className="pb-3 font-medium">地址</th>
                <th className="pb-3 font-medium text-right">员工数</th>
              </tr>
            </thead>
            <tbody>
              {restaurants.map((rest) => (
                <tr key={rest.id} className="border-b border-white/5 last:border-0">
                  <td className="py-3 text-white">{rest.restaurant_name}</td>
                  <td className="py-3 text-white/70">{rest.brand_name || '-'}</td>
                  <td className="py-3 text-white/50 max-w-[200px] truncate">{rest.address || '-'}</td>
                  <td className="py-3 text-right text-white/70">{rest.employee_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    );
  };

  // 渲染供应商列表 - v2.3: 添加搜索框 + 移动端卡片布局 + CRUD
  const renderSuppliers = () => {
    return (
      <GlassCard padding="md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <h3 className="text-base font-bold text-white">供应商列表</h3>
          <div className="flex items-center gap-2">
            <BrandFilter value={selectedBrandId} onChange={setSelectedBrandId} />
            <button
              onClick={() => {
                setFormError(null);
                setModalType('add-supplier');
              }}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-ios-blue/20 text-ios-blue border border-ios-blue/30 rounded-lg hover:bg-ios-blue/30 transition-colors"
            >
              <Icons.Plus className="w-3 h-3" />
              添加
            </button>
          </div>
        </div>

        {/* v2.3: 搜索框 */}
        <div className="mb-4">
          <input
            type="text"
            value={supplierSearch}
            onChange={(e) => setSupplierSearch(e.target.value)}
            placeholder="搜索供应商名称、联系人、电话..."
            className="w-full px-3 py-2 text-sm bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-ios-blue"
          />
        </div>

        {suppliersLoading && suppliers.length === 0 ? (
          <LoadingSpinner />
        ) : filteredSuppliers.length === 0 ? (
          <div className="text-center py-12 text-white/40">
            <Icons.Truck className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>{supplierSearch ? '无匹配结果' : '暂无供应商数据'}</p>
          </div>
        ) : (
          <>
            {/* 移动端：卡片布局 */}
            <div className="md:hidden space-y-3">
              {filteredSuppliers.map((sup) => (
                <div
                  key={sup.id}
                  className="p-3 rounded-lg bg-white/5 border border-white/10"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-medium">{sup.supplier_name}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingSupplier({
                            id: sup.id,
                            name: sup.supplier_name,
                            contact_person: sup.contact_person || undefined,
                            phone: sup.contact_phone || undefined,
                            address: sup.address || undefined,
                            brand_id: sup.brand_id
                          });
                          setFormError(null);
                          setModalType('edit-supplier');
                        }}
                        className="p-1.5 text-white/50 hover:text-ios-blue hover:bg-ios-blue/10 rounded transition-colors"
                      >
                        <Icons.Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setDeleteTarget({ type: 'supplier', id: sup.id, name: sup.supplier_name });
                          setFormError(null);
                          setModalType('confirm-delete');
                        }}
                        className="p-1.5 text-white/50 hover:text-ios-red hover:bg-ios-red/10 rounded transition-colors"
                      >
                        <Icons.Trash className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-white/50 space-y-1">
                    {sup.contact_person && <div>联系人: <span className="text-white/70">{sup.contact_person}</span></div>}
                    {sup.contact_phone && <div>电话: <span className="text-white/70">{sup.contact_phone}</span></div>}
                    <div>品牌: <span className="text-white/70">{sup.brand_name || '-'}</span></div>
                  </div>
                </div>
              ))}
            </div>

            {/* 桌面端：表格布局 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-white/50 border-b border-white/10">
                    <th className="pb-3 font-medium">供应商名称</th>
                    <th className="pb-3 font-medium">联系人</th>
                    <th className="pb-3 font-medium">联系电话</th>
                    <th className="pb-3 font-medium">品牌</th>
                    <th className="pb-3 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSuppliers.map((sup) => (
                    <tr key={sup.id} className="border-b border-white/5 last:border-0">
                      <td className="py-3 text-white">{sup.supplier_name}</td>
                      <td className="py-3 text-white/70">{sup.contact_person || '-'}</td>
                      <td className="py-3 text-white/70">{sup.contact_phone || '-'}</td>
                      <td className="py-3 text-white/50">{sup.brand_name || '-'}</td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setEditingSupplier({
                                id: sup.id,
                                name: sup.supplier_name,
                                contact_person: sup.contact_person || undefined,
                                phone: sup.contact_phone || undefined,
                                address: sup.address || undefined,
                                brand_id: sup.brand_id
                              });
                              setFormError(null);
                              setModalType('edit-supplier');
                            }}
                            className="p-1.5 text-white/50 hover:text-ios-blue hover:bg-ios-blue/10 rounded transition-colors"
                          >
                            <Icons.Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setDeleteTarget({ type: 'supplier', id: sup.id, name: sup.supplier_name });
                              setFormError(null);
                              setModalType('confirm-delete');
                            }}
                            className="p-1.5 text-white/50 hover:text-ios-red hover:bg-ios-red/10 rounded transition-colors"
                          >
                            <Icons.Trash className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </GlassCard>
    );
  };

  // 渲染物料列表 - v2.3: 添加搜索框 + 移动端卡片布局 + CRUD
  const renderMaterials = () => {
    return (
      <GlassCard padding="md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <h3 className="text-base font-bold text-white">物料列表</h3>
          <div className="flex items-center gap-2">
            <BrandFilter value={selectedBrandId} onChange={setSelectedBrandId} />
            <button
              onClick={() => {
                setFormError(null);
                setModalType('add-material');
              }}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-ios-blue/20 text-ios-blue border border-ios-blue/30 rounded-lg hover:bg-ios-blue/30 transition-colors"
            >
              <Icons.Plus className="w-3 h-3" />
              添加
            </button>
          </div>
        </div>

        {/* v2.3: 搜索框 */}
        <div className="mb-4">
          <input
            type="text"
            value={materialSearch}
            onChange={(e) => setMaterialSearch(e.target.value)}
            placeholder="搜索物料名称、编码、分类..."
            className="w-full px-3 py-2 text-sm bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-ios-blue"
          />
        </div>

        {materialsLoading && materials.length === 0 ? (
          <LoadingSpinner />
        ) : filteredMaterials.length === 0 ? (
          <div className="text-center py-12 text-white/40">
            <Icons.Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>{materialSearch ? '无匹配结果' : '暂无物料数据'}</p>
          </div>
        ) : (
          <>
            {/* 移动端：卡片布局 */}
            <div className="md:hidden space-y-3">
              {filteredMaterials.map((mat) => (
                <div
                  key={mat.id}
                  className="p-3 rounded-lg bg-white/5 border border-white/10"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-white font-medium">{mat.material_name}</span>
                      {mat.code && <span className="ml-2 text-xs text-white/40">{mat.code}</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingMaterial({
                            id: mat.id,
                            code: mat.code || '',
                            name: mat.material_name,
                            category_id: mat.category_id,
                            base_unit_id: mat.base_unit_id,
                            brand_id: mat.brand_id
                          });
                          // 重置表单状态，让 GlassSelect 使用 editingMaterial 的值
                          setFormBrandId(undefined);
                          setFormCategoryId(undefined);
                          setFormUnitId(undefined);
                          setFormError(null);
                          setModalType('edit-material');
                        }}
                        className="p-1.5 text-white/50 hover:text-ios-blue hover:bg-ios-blue/10 rounded transition-colors"
                      >
                        <Icons.Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setDeleteTarget({ type: 'material', id: mat.id, name: mat.material_name });
                          setFormError(null);
                          setModalType('confirm-delete');
                        }}
                        className="p-1.5 text-white/50 hover:text-ios-red hover:bg-ios-red/10 rounded transition-colors"
                      >
                        <Icons.Trash className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-white/50 flex flex-wrap gap-x-4 gap-y-1">
                    {mat.category_name && <span>分类: <span className="text-white/70">{mat.category_name}</span></span>}
                    {mat.unit_name && <span>单位: <span className="text-white/70">{mat.unit_name}</span></span>}
                    <span>品牌: <span className="text-white/70">{mat.brand_name || '-'}</span></span>
                  </div>
                </div>
              ))}
            </div>

            {/* 桌面端：表格布局 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-white/50 border-b border-white/10">
                    <th className="pb-3 font-medium">物料编码</th>
                    <th className="pb-3 font-medium">物料名称</th>
                    <th className="pb-3 font-medium">分类</th>
                    <th className="pb-3 font-medium">单位</th>
                    <th className="pb-3 font-medium">品牌</th>
                    <th className="pb-3 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMaterials.map((mat) => (
                    <tr key={mat.id} className="border-b border-white/5 last:border-0">
                      <td className="py-3 text-white/70">{mat.code || '-'}</td>
                      <td className="py-3 text-white">{mat.material_name}</td>
                      <td className="py-3 text-white/70">{mat.category_name || '-'}</td>
                      <td className="py-3 text-white/70">{mat.unit_name || '-'}</td>
                      <td className="py-3 text-white/50">{mat.brand_name || '-'}</td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setEditingMaterial({
                                id: mat.id,
                                code: mat.code || '',
                                name: mat.material_name,
                                category_id: mat.category_id,
                                base_unit_id: mat.base_unit_id,
                                brand_id: mat.brand_id
                              });
                              // 重置表单状态，让 GlassSelect 使用 editingMaterial 的值
                              setFormBrandId(undefined);
                              setFormCategoryId(undefined);
                              setFormUnitId(undefined);
                              setFormError(null);
                              setModalType('edit-material');
                            }}
                            className="p-1.5 text-white/50 hover:text-ios-blue hover:bg-ios-blue/10 rounded transition-colors"
                          >
                            <Icons.Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setDeleteTarget({ type: 'material', id: mat.id, name: mat.material_name });
                              setFormError(null);
                              setModalType('confirm-delete');
                            }}
                            className="p-1.5 text-white/50 hover:text-ios-red hover:bg-ios-red/10 rounded transition-colors"
                          >
                            <Icons.Trash className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </GlassCard>
    );
  };

  // 渲染当前视图内容
  const renderContent = () => {
    switch (currentView) {
      case 'overview': return renderOverview();
      case 'monitoring': return renderMonitoring();
      case 'alerts': return renderAlerts();
      case 'reports': return renderReports();
      case 'users': return renderUsers();
      case 'restaurants': return renderRestaurants();
      case 'suppliers': return renderSuppliers();
      case 'materials': return renderMaterials();
      default: return renderOverview();
    }
  };

  // 用户菜单组件
  const UserMenu = () => (
    <div
      className="absolute bottom-full left-0 right-0 mb-2 rounded-glass-lg overflow-hidden z-[100]"
      style={{
        background: 'rgba(25,25,30,0.95)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.15)'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => {
          setShowUserMenu(false);
          // 跳转到修改密码 - 需要退出管理面板
          window.dispatchEvent(new CustomEvent('admin-change-password'));
        }}
        className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/10 transition-colors cursor-pointer"
      >
        <Icons.Key className="w-5 h-5" />
        <span className="text-sm font-medium">修改密码</span>
      </button>
      <div className="border-t border-white/10" />
      <button
        onClick={() => {
          setShowUserMenu(false);
          logout();
        }}
        className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-white/10 transition-colors cursor-pointer"
      >
        <Icons.Logout className="w-5 h-5" />
        <span className="text-sm font-medium">退出登录</span>
      </button>
    </div>
  );

  // 模态框组件
  const renderModal = () => {
    if (modalType === 'none') return null;

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
        onClick={() => {
          setModalType('none');
          setEditingSupplier(null);
          setEditingMaterial(null);
          setDeleteTarget(null);
        }}
      >
        <div
          className="w-full max-w-md rounded-glass-lg p-6"
          style={{
            background: 'rgba(30,35,40,0.95)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.15)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 添加供应商 */}
          {modalType === 'add-supplier' && (
            <form onSubmit={handleAddSupplier}>
              <h3 className="text-lg font-bold text-white mb-4">添加供应商</h3>
              {formError && <div className="mb-3 p-2 bg-ios-red/20 border border-ios-red/30 rounded text-ios-red text-sm">{formError}</div>}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-white/60 mb-1">供应商名称 *</label>
                  <input name="name" type="text" required className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue" />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">品牌 *</label>
                  <GlassSelect
                    options={brandOptions}
                    value={formBrandId}
                    onChange={(v) => setFormBrandId(v as number | undefined)}
                    placeholder="选择品牌"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">联系人</label>
                  <input name="contact_person" type="text" className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue" />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">联系电话</label>
                  <input name="phone" type="text" className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue" />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">地址</label>
                  <input name="address" type="text" className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setModalType('none')} className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors">取消</button>
                <button type="submit" disabled={formLoading} className="px-4 py-2 text-sm bg-ios-blue text-white rounded-lg hover:bg-ios-blue/80 transition-colors disabled:opacity-50">
                  {formLoading ? '提交中...' : '添加'}
                </button>
              </div>
            </form>
          )}

          {/* 编辑供应商 */}
          {modalType === 'edit-supplier' && editingSupplier && (
            <form onSubmit={handleEditSupplier}>
              <h3 className="text-lg font-bold text-white mb-4">编辑供应商</h3>
              {formError && <div className="mb-3 p-2 bg-ios-red/20 border border-ios-red/30 rounded text-ios-red text-sm">{formError}</div>}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-white/60 mb-1">供应商名称 *</label>
                  <input name="name" type="text" required defaultValue={editingSupplier.name} className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue" />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">品牌 *</label>
                  <GlassSelect
                    options={brandOptions}
                    value={formBrandId ?? editingSupplier.brand_id}
                    onChange={(v) => setFormBrandId(v as number | undefined)}
                    placeholder="选择品牌"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">联系人</label>
                  <input name="contact_person" type="text" defaultValue={editingSupplier.contact_person} className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue" />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">联系电话</label>
                  <input name="phone" type="text" defaultValue={editingSupplier.phone} className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue" />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">地址</label>
                  <input name="address" type="text" defaultValue={editingSupplier.address} className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => { setModalType('none'); setEditingSupplier(null); setFormBrandId(undefined); }} className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors">取消</button>
                <button type="submit" disabled={formLoading} className="px-4 py-2 text-sm bg-ios-blue text-white rounded-lg hover:bg-ios-blue/80 transition-colors disabled:opacity-50">
                  {formLoading ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          )}

          {/* 添加物料 */}
          {modalType === 'add-material' && (
            <form onSubmit={handleAddMaterial}>
              <h3 className="text-lg font-bold text-white mb-4">添加物料</h3>
              {formError && <div className="mb-3 p-2 bg-ios-red/20 border border-ios-red/30 rounded text-ios-red text-sm">{formError}</div>}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-white/60 mb-1">物料编码 <span className="text-white/40">(留空自动生成)</span></label>
                  <input name="code" type="text" placeholder="自动生成：品牌前缀+随机码" className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue placeholder-white/30" />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">物料名称 *</label>
                  <input name="name" type="text" required className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue" />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">品牌 *</label>
                  <GlassSelect
                    options={brandOptions}
                    value={formBrandId}
                    onChange={(v) => setFormBrandId(v as number | undefined)}
                    placeholder="选择品牌"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">分类</label>
                  <GlassSelect
                    options={categoryOptions}
                    value={formCategoryId}
                    onChange={(v) => setFormCategoryId(v as number | undefined)}
                    placeholder="选择分类"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">单位</label>
                  <GlassSelect
                    options={unitOptions}
                    value={formUnitId}
                    onChange={(v) => setFormUnitId(v as number | undefined)}
                    placeholder="选择单位"
                    className="w-full"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => { setModalType('none'); setFormBrandId(undefined); setFormCategoryId(undefined); setFormUnitId(undefined); }} className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors">取消</button>
                <button type="submit" disabled={formLoading} className="px-4 py-2 text-sm bg-ios-blue text-white rounded-lg hover:bg-ios-blue/80 transition-colors disabled:opacity-50">
                  {formLoading ? '提交中...' : '添加'}
                </button>
              </div>
            </form>
          )}

          {/* 编辑物料 */}
          {modalType === 'edit-material' && editingMaterial && (
            <form onSubmit={handleEditMaterial}>
              <h3 className="text-lg font-bold text-white mb-4">编辑物料</h3>
              {formError && <div className="mb-3 p-2 bg-ios-red/20 border border-ios-red/30 rounded text-ios-red text-sm">{formError}</div>}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-white/60 mb-1">物料编码 *</label>
                  <input name="code" type="text" required defaultValue={editingMaterial.code} className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue" />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">物料名称 *</label>
                  <input name="name" type="text" required defaultValue={editingMaterial.name} className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue" />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">品牌 *</label>
                  <GlassSelect
                    options={brandOptions}
                    value={formBrandId ?? editingMaterial.brand_id}
                    onChange={(v) => setFormBrandId(v as number | undefined)}
                    placeholder="选择品牌"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">分类</label>
                  <GlassSelect
                    options={categoryOptions}
                    value={formCategoryId ?? editingMaterial.category_id}
                    onChange={(v) => setFormCategoryId(v as number | undefined)}
                    placeholder="选择分类"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">单位</label>
                  <GlassSelect
                    options={unitOptions}
                    value={formUnitId ?? editingMaterial.base_unit_id}
                    onChange={(v) => setFormUnitId(v as number | undefined)}
                    placeholder="选择单位"
                    className="w-full"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => { setModalType('none'); setEditingMaterial(null); setFormBrandId(undefined); setFormCategoryId(undefined); setFormUnitId(undefined); }} className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors">取消</button>
                <button type="submit" disabled={formLoading} className="px-4 py-2 text-sm bg-ios-blue text-white rounded-lg hover:bg-ios-blue/80 transition-colors disabled:opacity-50">
                  {formLoading ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          )}

          {/* 确认删除 */}
          {modalType === 'confirm-delete' && deleteTarget && (
            <div>
              <h3 className="text-lg font-bold text-white mb-4">确认删除</h3>
              {formError && <div className="mb-3 p-2 bg-ios-red/20 border border-ios-red/30 rounded text-ios-red text-sm">{formError}</div>}
              <p className="text-white/70 mb-6">
                确定要删除{deleteTarget.type === 'supplier' ? '供应商' : '物料'} <span className="text-white font-medium">"{deleteTarget.name}"</span> 吗？此操作不可撤销。
              </p>
              <div className="flex justify-end gap-2">
                <button onClick={() => { setModalType('none'); setDeleteTarget(null); }} className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors">取消</button>
                <button onClick={handleConfirmDelete} disabled={formLoading} className="px-4 py-2 text-sm bg-ios-red text-white rounded-lg hover:bg-ios-red/80 transition-colors disabled:opacity-50">
                  {formLoading ? '删除中...' : '确认删除'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col md:flex-row">
      {/* 侧边导航 - 桌面端 */}
      <div
        className="hidden md:flex flex-col w-56 h-full py-6 px-4 flex-shrink-0"
        style={{
          background: 'linear-gradient(180deg, rgba(30,35,40,0.2) 0%, rgba(35,40,50,0.12) 100%)',
          backdropFilter: 'blur(24px) saturate(140%)',
          borderRight: '1px solid rgba(255,255,255,0.1)'
        }}
      >
        {/* 标题 */}
        <h1 className="text-xl font-bold text-white mb-6 px-2">门店管家</h1>

        {/* 导航列表 */}
        <nav className="space-y-1 flex-1">
          {navItems.map((item) => (
            <React.Fragment key={item.id}>
              {item.section && (
                <div className="text-[10px] text-white/40 uppercase tracking-wider px-3 pt-4 pb-1">
                  {item.section}
                </div>
              )}
              <button
                onClick={() => setCurrentView(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm ${
                  currentView === item.id
                    ? 'bg-white/10 text-white border border-white/15'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            </React.Fragment>
          ))}
        </nav>

        {/* 用户账户区 - v2.0 新增 */}
        <div className="mt-auto pt-4 px-2 relative" ref={userMenuRef}>
          <div
            className="flex items-center gap-3 p-3 rounded-glass-xl cursor-pointer transition-all hover:bg-white/10"
            onClick={() => setShowUserMenu(!showUserMenu)}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.1)'
            }}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg, rgba(147,112,219,0.4) 0%, rgba(147,112,219,0.2) 100%)' }}
            >
              {getAvatarChar()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white truncate">{user?.name || '管理员'}</div>
              <div className="text-xs text-white/60 truncate">{user?.restaurant_name || '全部门店'}</div>
            </div>
            <Icons.ChevronDown className={`w-4 h-4 text-white/60 transition-transform flex-shrink-0 ${showUserMenu ? 'rotate-180' : ''}`} />
          </div>

          {/* 用户菜单 */}
          {showUserMenu && <UserMenu />}
        </div>
      </div>

      {/* 移动端顶部导航 - 与员工页面一致 */}
      <div className="md:hidden pt-6 px-4 pb-2 flex items-center justify-between border-b border-white/10">
        <span className="text-xl font-bold text-white">门店管家</span>
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="p-2 text-white/70 hover:text-white"
        >
          <Icons.Menu className="w-6 h-6" />
        </button>
      </div>

      {/* 移动端侧边栏 Slide-over - Storm Glass 风格 */}
      <div
        className={`fixed inset-0 z-50 md:hidden ${mobileSidebarOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        {/* 背景遮罩 */}
        <div
          className={`absolute inset-0 ${mobileSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          style={{
            backgroundColor: 'rgba(0,0,0,0.3)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            transition: 'opacity 200ms ease-out',
          }}
          onClick={() => setMobileSidebarOpen(false)}
        />

        {/* 侧边栏内容 */}
        <div
          ref={mobileSidebarRef}
          className={`absolute top-0 bottom-0 left-0 w-64 transform transition-transform duration-300 flex flex-col p-4 overflow-visible ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
          style={{
            background: 'linear-gradient(180deg, rgba(30,35,40,0.25) 0%, rgba(35,40,50,0.15) 100%)',
            backdropFilter: 'blur(24px) saturate(140%)',
            WebkitBackdropFilter: 'blur(24px) saturate(140%)',
            borderRight: '1px solid rgba(255,255,255,0.18)',
            borderTop: '1px solid rgba(255,255,255,0.15)'
          }}
        >
          <h1 className="text-2xl font-bold mb-8 px-4 mt-8 text-white">门店管家</h1>

          {/* 导航列表 */}
          <nav className="space-y-1 flex-1 overflow-y-auto overflow-x-visible">
            {navItems.map((item) => (
              <React.Fragment key={item.id}>
                {item.section && (
                  <div className="text-[10px] text-white/40 uppercase tracking-wider px-3 pt-4 pb-1">
                    {item.section}
                  </div>
                )}
                <button
                  onClick={() => {
                    setCurrentView(item.id);
                    setMobileSidebarOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-glass-lg transition-all"
                  style={{
                    background: currentView === item.id ? 'rgba(255,255,255,0.12)' : 'transparent',
                    color: currentView === item.id ? '#FFFFFF' : 'rgba(255,255,255,0.7)',
                    border: currentView === item.id ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent'
                  }}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </button>
              </React.Fragment>
            ))}
          </nav>

          {/* 用户信息区 - 移动端侧边栏底部 */}
          <div className="mt-auto mb-6 px-2 relative">
            <div
              className="flex items-center gap-3 p-3 rounded-glass-xl cursor-pointer transition-all hover:bg-white/10"
              onClick={() => setShowUserMenu(!showUserMenu)}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.1)'
              }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg, rgba(147,112,219,0.4) 0%, rgba(147,112,219,0.2) 100%)' }}
              >
                {getAvatarChar()}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-white">{user?.name || '管理员'}</div>
                <div className="text-xs text-white/60">{user?.restaurant_name || '全部门店'}</div>
              </div>
              <Icons.ChevronDown className={`w-4 h-4 text-white/60 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
            </div>

            {/* 用户菜单 - 移动端侧边栏 - 使用 fixed 定位避免被裁剪 */}
            {showUserMenu && (
              <div
                className="fixed left-4 right-4 bottom-24 rounded-glass-lg overflow-hidden z-[200]"
                style={{
                  background: 'rgba(25,25,30,0.95)',
                  backdropFilter: 'blur(24px)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  maxWidth: '232px'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    setMobileSidebarOpen(false);
                    window.dispatchEvent(new CustomEvent('admin-change-password'));
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Icons.Key className="w-5 h-5" />
                  <span className="text-sm font-medium">修改密码</span>
                </button>
                <div className="border-t border-white/10" />
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    setMobileSidebarOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Icons.Logout className="w-5 h-5" />
                  <span className="text-sm font-medium">退出登录</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-4xl mx-auto">
          {renderContent()}
        </div>
      </div>

      {/* 模态框 */}
      {renderModal()}
    </div>
  );
};
