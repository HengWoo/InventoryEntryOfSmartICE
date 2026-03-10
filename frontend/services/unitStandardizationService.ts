// 单位标准化服务
// v1.0 - 本地单位标准化（无 Gemini API 调用）
// 处理 OCR 错误、别名、带数量格式等，将非标准单位映射到数据库标准单位
// 单位是有限集合（~30 个），纯本地映射 + 编辑距离模糊匹配即可

import { ProcurementItem } from '../types';
import { getAllUnits } from './supabaseService';

// ============ OCR 常见错误映射 ============
// 形近字 / 同音字导致的 OCR 误识别
const OCR_ERROR_MAP: Record<string, string> = {
  '代': '袋',
  '仙': '斤',
  '痛': '桶',
  '相': '箱',
  '合': '盒',
  '瓶': '瓶',  // 正确，保留
  '平': '瓶',
  '屏': '瓶',
  '斥': '只',
  '包': '袋',  // v9.0: 包→袋 统一
  '拍': '排',
  '把': '把',  // 正确，保留
  '提': '提',  // 正确，保留
  '条': '条',  // 正确，保留
  '付': '副',
  '福': '副',  // 同音字 fú→fù
  '盆': '盆',  // 正确，保留
  '打': '打',  // 正确，保留
  '筒': '桶',
  '止': '支',  // 形近字
  '文': '支',  // OCR 误读
  '仓': '捆',  // OCR 误读
  '任': '提',  // OCR 误读
};

// ============ 别名 / 同义词映射 ============
// 常见的单位别名、英文缩写、大小写变体
const ALIAS_MAP: Record<string, string> = {
  // 重量
  'kg': '公斤',
  'KG': '公斤',
  'Kg': '公斤',
  '千克': '公斤',
  '公价': '公斤',  // OCR 多字误读
  'g': '克',
  'G': '克',
  'g。': '克',     // OCR 多余标点
  '市斤': '斤',
  'jin': '斤',
  '500g': '斤',    // 行业惯例 500g=1斤
  '500kg': '斤',   // OCR 把 g 误读为 kg
  '500克': '斤',   // 500克=1斤
  'liang': '两',
  '两': '两',
  'lb': '磅',
  'lbs': '磅',
  // 体积
  'L': '升',
  'l': '升',
  'ml': '毫升',
  'ML': '毫升',
  'mL': '毫升',
  // 数量
  '枝': '支',     // 同义词
  '个': '个',
  '只': '只',
  '枚': '枚',
  '根': '根',
  '颗': '颗',
  '粒': '粒',
  '头': '头',
  '尾': '尾',
  '条': '条',
  // 包装
  '袋': '袋',
  '包': '袋',  // v9.0: 包→袋 统一
  '盒': '盒',
  '箱': '箱',
  '桶': '桶',
  '瓶': '瓶',
  '罐': '罐',
  '听': '听',
  '提': '提',
  '打': '打',
  '板': '板',
  '排': '排',
  '扎': '扎',
  '捆': '捆',
  '小包': '袋',   // v9.0: 小包→袋
  // 其他
  '份': '份',
  '套': '套',
  '副': '副',
  '把': '把',
  '块': '块',
  '片': '片',
  '张': '张',
  '卷': '卷',
  '天': '天',
};

// ============ 带数量的格式检测 ============
// 匹配如 "500g", "2kg", "5斤" 等格式，提取单位部分
const WEIGHT_FORMAT_REGEX = /^(\d+(?:\.\d+)?)\s*(g|kg|克|公斤|斤|两|ml|升|毫升|磅|lbs?)$/i;

// ============ 规格格式检测（用于防反检测）============
// 匹配看起来像"规格"而非"单位"的值：数字+单位组合、"数字x数字"、带斜杠的包装描述
const SPEC_LIKE_REGEX = /^(\d+(\.\d+)?)\s*(g|kg|克|公斤|斤|两|ml|升|毫升|磅|lbs?)(\/|$)/i;

// ============ 编辑距离（Levenshtein） ============
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

// ============ 单位缓存 ============
let unitNamesCache: string[] | null = null;

async function getUnitNames(): Promise<string[]> {
  if (unitNamesCache) return unitNamesCache;
  const units = await getAllUnits();
  unitNamesCache = units.map(u => u.name);
  return unitNamesCache;
}

// ============ 单位↔规格 防反检测 ============

/**
 * 检测并修复 OCR 导致的 unit↔specification 字段互换
 * 典型案例：绣球菌 unit="0.4kg" spec="盒" → 应该是 unit="盒" spec="0.4kg"
 * 判断条件：unit 像规格（数字+重量单位）AND specification 像单位（标准单位名或 OCR 变体）
 */
export async function detectAndFixUnitSpecSwap(items: ProcurementItem[]): Promise<ProcurementItem[]> {
  if (!items || items.length === 0) return items;

  const validUnits = await getUnitNames();
  const result: ProcurementItem[] = [];

  for (const item of items) {
    const unit = (item.unit || '').trim();
    const spec = (item.specification || '').trim();

    if (unit && spec && SPEC_LIKE_REGEX.test(unit) && isLikelyUnitName(spec, validUnits)) {
      console.log(`[单位防反] "${item.name}": unit="${unit}" ↔ spec="${spec}" → 交换`);
      result.push({ ...item, unit: spec, specification: unit });
    } else {
      result.push({ ...item });
    }
  }

  return result;
}

/**
 * 判断一个字符串是否像单位名（标准单位、OCR 变体、别名）
 */
function isLikelyUnitName(s: string, validUnits: string[]): boolean {
  if (validUnits.includes(s)) return true;
  if (OCR_ERROR_MAP[s] && OCR_ERROR_MAP[s] !== s) return true;
  if (ALIAS_MAP[s]) return true;
  return false;
}

// ============ 主标准化函数 ============

/**
 * 标准化单个单位字符串
 * 处理流程：trim → OCR纠错 → 别名映射 → 带数量格式提取 → 编辑距离模糊匹配
 * @returns 标准化后的单位名，如果无法匹配则返回原值
 */
export async function standardizeUnit(raw: string): Promise<string> {
  if (!raw || !raw.trim()) return raw;

  let unit = raw.trim();

  // 1. OCR 错误纠正（单字）
  if (unit.length === 1 && OCR_ERROR_MAP[unit]) {
    unit = OCR_ERROR_MAP[unit];
  }

  // 2. 别名映射（精确匹配）
  if (ALIAS_MAP[unit]) {
    unit = ALIAS_MAP[unit];
  }

  // 3. 带数量格式检测（如 "500g" → "克"）
  const weightMatch = unit.match(WEIGHT_FORMAT_REGEX);
  if (weightMatch) {
    const unitPart = weightMatch[2];
    if (ALIAS_MAP[unitPart]) {
      unit = ALIAS_MAP[unitPart];
    } else if (ALIAS_MAP[unitPart.toLowerCase()]) {
      unit = ALIAS_MAP[unitPart.toLowerCase()];
    }
  }

  // 4. 检查是否已经是有效单位
  const validUnits = await getUnitNames();
  if (validUnits.includes(unit)) {
    return unit;
  }

  // 5. 编辑距离模糊匹配（仅当距离 ≤ 1 时匹配）
  let bestMatch: string | null = null;
  let bestDistance = Infinity;
  for (const validUnit of validUnits) {
    const dist = levenshteinDistance(unit, validUnit);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestMatch = validUnit;
    }
  }

  if (bestDistance <= 1 && bestMatch) {
    console.log(`[单位标准化] 模糊匹配: "${raw}" → "${bestMatch}" (距离=${bestDistance})`);
    return bestMatch;
  }

  // 无法标准化，返回原值（strictSelection 会在表单层兜底）
  console.log(`[单位标准化] 无法匹配: "${raw}"，保留原值`);
  return unit;
}

/**
 * 批量标准化物品列表中的单位
 * @param items 物品列表（来自 OCR/语音解析结果）
 * @returns 单位标准化后的物品列表（新数组，不修改原数组）
 */
export async function standardizeUnitsInItems(items: ProcurementItem[]): Promise<ProcurementItem[]> {
  if (!items || items.length === 0) return items;

  const result: ProcurementItem[] = [];
  for (const item of items) {
    if (item.unit) {
      const standardized = await standardizeUnit(item.unit);
      if (standardized !== item.unit) {
        console.log(`[单位标准化] "${item.name}": "${item.unit}" → "${standardized}"`);
      }
      result.push({ ...item, unit: standardized });
    } else {
      result.push({ ...item });
    }
  }

  return result;
}
