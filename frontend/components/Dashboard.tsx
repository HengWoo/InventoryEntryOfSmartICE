/**
 * Dashboard 仪表板组件
 * v5.1 - 店长端改版优化：
 *   - 删除支出趋势图
 *   - 价格趋势默认显示明细（多条线），添加汇总/明细切换
 *   - 异常报警独立于品类筛选
 *
 * v5.0 - 店长端改版：移除供应商饼图和物品追踪，新增价格趋势和异常报警
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend
} from 'recharts';
import { GlassCard } from './ui';
import {
  getCategories, getDashboardStats,
  getStoreManagerPriceTrend, getStoreManagerAnomalies, resolveAnomaly,
  Category, DashboardStats,
  StorePriceTrendResponse, PriceAnomaly
} from '../services/dashboardService';

interface DashboardProps {
  restaurantId?: string;
  userId?: string;
}

const TIME_OPTIONS = [{ label: '7天', value: 7 }, { label: '30天', value: 30 }, { label: '90天', value: 90 }];
const CHART_COLORS = ['#5BA3C0', '#6B9E8A', '#E8A54C', '#E85A4F', '#9B7EDE', '#4ECDC4', '#FF6B6B', '#48DBFB', '#FF9FF3', '#54A0FF'];

export const Dashboard: React.FC<DashboardProps> = ({ restaurantId, userId }) => {
  // 全局筛选（默认30天）
  const [days, setDays] = useState(30);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | undefined>();
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  // 统计数据
  const [stats, setStats] = useState<DashboardStats>({ totalSpend: 0, totalItems: 0, supplierCount: 0 });

  // 价格趋势数据
  const [priceTrend, setPriceTrend] = useState<StorePriceTrendResponse | null>(null);
  const [priceTrendLoading, setPriceTrendLoading] = useState(false);
  // 价格趋势视图模式：detail=明细（多条线），summary=汇总（单条线）
  const [priceViewMode, setPriceViewMode] = useState<'detail' | 'summary'>('detail');
  // 高亮的物料名称（点击图例时设置）
  const [highlightedMaterial, setHighlightedMaterial] = useState<string | null>(null);

  // 异常报警数据
  const [anomalies, setAnomalies] = useState<PriceAnomaly[]>([]);
  const [anomalyLoading, setAnomalyLoading] = useState(false);

  // 加载品类列表
  useEffect(() => {
    if (!restaurantId) return;
    getCategories(restaurantId).then(cats => {
      setCategories(cats);
      // 默认选择第一个品类
      if (cats.length > 0 && !selectedCategory) {
        setSelectedCategory(cats[0].id);
      }
    });
  }, [restaurantId]);

  // 加载统计数据
  useEffect(() => {
    if (!restaurantId) return;
    getDashboardStats(restaurantId, selectedCategory, days).then(setStats);
  }, [restaurantId, selectedCategory, days]);

  // 加载价格趋势（需要选择分类）
  useEffect(() => {
    if (!restaurantId || !selectedCategory) {
      setPriceTrend(null);
      return;
    }
    setPriceTrendLoading(true);
    getStoreManagerPriceTrend(restaurantId, selectedCategory, days)
      .then(setPriceTrend)
      .finally(() => setPriceTrendLoading(false));
  }, [restaurantId, selectedCategory, days]);

  // 加载异常报警（独立于品类筛选）
  useEffect(() => {
    if (!restaurantId) return;
    setAnomalyLoading(true);
    getStoreManagerAnomalies(restaurantId, 20)
      .then(setAnomalies)
      .finally(() => setAnomalyLoading(false));
  }, [restaurantId]);

  // 构建明细图表数据（多条线合并到同一数据集）
  const detailChartData = useMemo(() => {
    if (!priceTrend || priceTrend.materialTrends.length === 0) return [];

    // 收集所有日期
    const dateSet = new Set<string>();
    priceTrend.materialTrends.forEach(mat => {
      mat.data.forEach(d => dateSet.add(d.date));
    });

    // 按日期排序
    const dates = Array.from(dateSet).sort();

    // 构建数据
    return dates.map(date => {
      const point: Record<string, string | number> = { date };
      priceTrend.materialTrends.forEach(mat => {
        const dataPoint = mat.data.find(d => d.date === date);
        if (dataPoint) {
          point[mat.materialName] = dataPoint.avgPrice;
        }
      });
      return point;
    });
  }, [priceTrend]);

  // 处理异常
  const handleResolveAnomaly = async (id: number, action: 'confirm' | 'resolve') => {
    if (!userId) return;
    const result = await resolveAnomaly(id, action, userId);
    if (result.success) {
      setAnomalies(prev => prev.filter(a => a.id !== id));
    }
  };

  // 样式
  const segmentClass = (active: boolean) => `px-3 py-1.5 text-xs rounded-lg transition-all ${active ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'}`;

  // 空状态组件
  const EmptyState = ({ text }: { text: string }) => (
    <div className="flex-1 flex items-center justify-center text-white/40 text-sm py-8">{text}</div>
  );

  // 格式化日期
  const formatDate = (v: string) => `${new Date(v).getMonth()+1}/${new Date(v).getDate()}`;

  // 格式化大数字
  const formatNumber = (n: number) => n >= 10000 ? `${(n/10000).toFixed(1)}万` : n.toLocaleString();

  return (
    <div className="h-full flex flex-col gap-4 animate-slide-in pb-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between pt-2 flex-shrink-0 flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-primary tracking-tight mb-1">数据看板</h2>
          <p className="text-sm text-secondary">采购数据分析</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {/* 时间筛选 */}
          <div className="flex bg-white/10 rounded-xl p-1 h-[34px] items-center">
            {TIME_OPTIONS.map(t => (
              <button key={t.value} onClick={() => setDays(t.value)}
                className={segmentClass(days === t.value)}>{t.label}</button>
            ))}
          </div>
          {/* 品类筛选 */}
          <div className={`relative ${showCategoryDropdown ? 'isolate z-[9999]' : ''}`}>
            <button
              onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
              className="h-[34px] px-3 bg-white/10 border border-white/20 rounded-xl text-sm text-white flex items-center gap-2 hover:border-white/30 transition-colors"
            >
              <span>{selectedCategory ? categories.find(c => c.id === selectedCategory)?.name : '选择品类'}</span>
              <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${showCategoryDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showCategoryDropdown && (
              <div
                className="absolute right-0 z-[9999] overflow-y-auto py-2 rounded-[20px] border border-white/12"
                style={{
                  top: '100%',
                  marginTop: '4px',
                  minWidth: '8rem',
                  maxHeight: '15rem',
                  background: 'linear-gradient(145deg, rgba(25,25,30,0.98) 0%, rgba(25,25,30,0.95) 100%)',
                  backdropFilter: 'blur(48px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(48px) saturate(180%)',
                  boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
                }}
              >
                {categories.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setSelectedCategory(c.id); setShowCategoryDropdown(false); }}
                    className={`w-full px-4 py-2.5 text-left transition-colors text-sm ${selectedCategory === c.id ? 'text-white bg-white/10' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════ 统计卡片 ═══════════ */}
      <div className="text-xs text-white/40 uppercase tracking-wider">统计概览</div>

      <div className="grid grid-cols-3 gap-2 md:gap-3">
        <GlassCard padding="sm" className="flex flex-col items-center justify-center min-h-[70px] md:min-h-[80px]">
          <span className="text-xs md:text-sm text-white/70">总采购额</span>
          <p className="text-base md:text-2xl font-light text-white">¥{formatNumber(stats.totalSpend)}</p>
        </GlassCard>
        <GlassCard padding="sm" className="flex flex-col items-center justify-center min-h-[70px] md:min-h-[80px]">
          <span className="text-xs md:text-sm text-white/70">入库数量</span>
          <p className="text-base md:text-2xl font-light text-white">{formatNumber(stats.totalItems)}</p>
        </GlassCard>
        <GlassCard padding="sm" className="flex flex-col items-center justify-center min-h-[70px] md:min-h-[80px]">
          <span className="text-xs md:text-sm text-white/70">供应商数</span>
          <p className="text-base md:text-2xl font-light text-white">{stats.supplierCount}</p>
        </GlassCard>
      </div>

      {/* ═══════════ 价格趋势板块 ═══════════ */}
      <div className="text-xs text-white/40 uppercase tracking-wider mt-2">价格趋势</div>

      <GlassCard padding="md" className="flex flex-col">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h3 className="text-base font-bold text-white">
            {priceTrend?.categoryName || '价格走势'}
            {priceViewMode === 'summary' && ' (汇总)'}
          </h3>
          {/* 汇总/明细切换 */}
          <div className="flex bg-white/10 rounded-xl p-1">
            <button onClick={() => setPriceViewMode('detail')} className={segmentClass(priceViewMode === 'detail')}>明细</button>
            <button onClick={() => setPriceViewMode('summary')} className={segmentClass(priceViewMode === 'summary')}>汇总</button>
          </div>
        </div>
        {!selectedCategory ? (
          <EmptyState text="请选择品类查看价格趋势" />
        ) : priceTrendLoading ? (
          <EmptyState text="加载中..." />
        ) : priceViewMode === 'summary' ? (
          // 汇总视图（单条线）
          priceTrend?.aggregatedTrend.length === 0 ? (
            <EmptyState text="暂无价格数据" />
          ) : (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={priceTrend?.aggregatedTrend || []} margin={{ top: 5, right: 5, left: 0, bottom: 0 }} style={{ outline: 'none' }}>
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} tickFormatter={formatDate} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} tickFormatter={(v: number) => `¥${v}`} width={45} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(25,25,30,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', color: '#FFF' }}
                    itemStyle={{ color: '#FFF' }} labelStyle={{ color: '#FFF' }}
                    formatter={(v: number) => [`¥${v}`, '均价']} />
                  <Line type="monotone" dataKey="avgPrice" stroke="#E8A54C" strokeWidth={2} dot={{ fill: '#E8A54C', r: 3 }} style={{ outline: 'none' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )
        ) : (
          // 明细视图（多条线）
          detailChartData.length === 0 ? (
            <EmptyState text="暂无价格数据" />
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={detailChartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }} style={{ outline: 'none' }}>
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} tickFormatter={formatDate} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} tickFormatter={(v: number) => `¥${v}`} width={45} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'rgba(25,25,30,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', color: '#FFF', maxHeight: '200px', overflow: 'auto' }}
                    itemStyle={{ color: '#FFF' }}
                    labelStyle={{ color: '#FFF' }}
                    formatter={(v: number, name: string) => [`¥${v}`, name]}
                  />
                  <Legend
                    wrapperStyle={{ paddingTop: '10px', cursor: 'pointer' }}
                    onClick={(e: { dataKey?: string }) => {
                      if (e.dataKey) {
                        setHighlightedMaterial(prev => prev === e.dataKey ? null : e.dataKey!);
                      }
                    }}
                    formatter={(value: string) => {
                      const isHighlighted = highlightedMaterial === value;
                      const isDimmed = highlightedMaterial && highlightedMaterial !== value;
                      return (
                        <span style={{
                          color: isDimmed ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.8)',
                          fontSize: '11px',
                          fontWeight: isHighlighted ? 600 : 400,
                          textDecoration: isHighlighted ? 'underline' : 'none'
                        }}>
                          {value.length > 6 ? value.slice(0, 6) + '...' : value}
                        </span>
                      );
                    }}
                  />
                  {priceTrend?.materialTrends.slice(0, 10).map((mat, idx) => {
                    const isHighlighted = highlightedMaterial === mat.materialName;
                    const isDimmed = highlightedMaterial && highlightedMaterial !== mat.materialName;
                    const color = CHART_COLORS[idx % CHART_COLORS.length];
                    return (
                      <Line
                        key={mat.materialName}
                        type="monotone"
                        dataKey={mat.materialName}
                        stroke={color}
                        strokeWidth={isHighlighted ? 3 : 2}
                        strokeOpacity={isDimmed ? 0.2 : 1}
                        connectNulls={true}
                        dot={{
                          fill: color,
                          r: isHighlighted ? 4 : 3,
                          strokeWidth: 0,
                          fillOpacity: isDimmed ? 0.2 : 1
                        }}
                        activeDot={{
                          fill: color,
                          r: 5,
                          strokeWidth: 2,
                          stroke: '#fff'
                        }}
                        style={{ outline: 'none' }}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )
        )}
      </GlassCard>

      {/* ═══════════ 异常报警板块（独立于品类筛选） ═══════════ */}
      <div className="text-xs text-white/40 uppercase tracking-wider mt-2">异常报警 (全品类)</div>

      <GlassCard padding="md" className="flex flex-col">
        <h3 className="text-base font-bold text-white mb-3">
          价格异常 {anomalies.length > 0 && <span className="text-red-400 text-sm ml-2">({anomalies.length})</span>}
        </h3>
        {anomalyLoading ? (
          <EmptyState text="加载中..." />
        ) : anomalies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-white/50">
            <svg className="w-12 h-12 mb-2 text-green-400/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm">暂无价格异常</span>
          </div>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {anomalies.map(a => (
              <div key={a.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-red-400/20">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium truncate">{a.itemName}</span>
                    <span className="text-red-400 text-xs px-2 py-0.5 bg-red-400/10 rounded-full">
                      +{a.deviationPercent}%
                    </span>
                  </div>
                  <div className="text-white/50 text-xs mt-1">
                    {a.priceDate} · ¥{a.unitPrice}/{a.unit} (中位数 ¥{a.medianPrice})
                    {a.supplierName && ` · ${a.supplierName}`}
                  </div>
                </div>
                <div className="flex gap-2 ml-3">
                  <button
                    onClick={() => handleResolveAnomaly(a.id, 'confirm')}
                    className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                  >
                    确认
                  </button>
                  <button
                    onClick={() => handleResolveAnomaly(a.id, 'resolve')}
                    className="px-3 py-1.5 text-xs bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors"
                  >
                    已修改
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* 点击外部关闭下拉 */}
      {showCategoryDropdown && (
        <div className="fixed inset-0 z-[9998]" onClick={() => setShowCategoryDropdown(false)} />
      )}
    </div>
  );
};
