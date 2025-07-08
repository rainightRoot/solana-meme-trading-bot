/**
 * 价格格式化工具
 */

/**
 * 格式化价格为科学计数法可视化格式
 * 例如: 0.00000000027444 -> $0.0₉27444
 * @param price 价格数值
 * @param prefix 前缀，默认为 '$'
 * @param maxSignificantDigits 有效数字位数，默认为 5
 * @returns 格式化后的字符串
 */
export function formatPriceScientific(
  price: number, 
  prefix = '$', 
  maxSignificantDigits = 5
): string {
  if (price === 0) return `${prefix}0`;
  if (price < 0) return `-${formatPriceScientific(-price, prefix, maxSignificantDigits)}`;
  
  // 对于大于等于 1 的数字，使用常规格式
  if (price >= 1) {
    return `${prefix}${price.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 6 
    })}`;
  }
  
  // 对于大于等于 0.01 的数字，使用常规小数格式
  if (price >= 0.01) {
    return `${prefix}${price.toFixed(4)}`;
  }
  
  // 对于小于 0.01 的数字，使用科学计数法可视化格式
  const priceStr = price.toString();
  const [, decimal] = priceStr.split('.');
  
  if (!decimal) return `${prefix}${price}`;
  
  // 找到第一个非零数字的位置
  let zeroCount = 0;
  let significantPart = '';
  
  for (let i = 0; i < decimal.length; i++) {
    if (decimal[i] === '0') {
      zeroCount++;
    } else {
      // 取有效数字
      significantPart = decimal.substring(i, i + maxSignificantDigits);
      // 移除末尾的零
      significantPart = significantPart.replace(/0+$/, '');
      break;
    }
  }
  
  if (significantPart === '') return `${prefix}0`;
  
  // 生成下标数字
  const subscriptNumbers: { [key: string]: string } = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
    '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉'
  };
  
  const subscriptZeroCount = zeroCount.toString()
    .split('')
    .map(digit => subscriptNumbers[digit])
    .join('');
  
  return `${prefix}0.0${subscriptZeroCount}${significantPart}`;
}

/**
 * 格式化 SOL 价格
 * @param price SOL 价格
 * @param maxSignificantDigits 有效数字位数
 * @returns 格式化后的字符串
 */
export function formatSOLPrice(price: number, maxSignificantDigits = 5): string {
  if (price === 0) return '0 SOL';
  if (price < 0) return `-${formatSOLPrice(-price, maxSignificantDigits)}`;
  
  // 对于大于等于 0.01 的数字，使用常规格式
  if (price >= 0.01) {
    return `${price.toFixed(8)} SOL`;
  }
  
  // 对于小于 0.01 的数字，使用科学计数法格式但不加前缀
  const formatted = formatPriceScientific(price, '', maxSignificantDigits);
  return `${formatted} SOL`;
}

/**
 * 格式化数字显示（通用）
 * @param num 数字
 * @param decimals 小数位数
 * @returns 格式化后的字符串
 */
export function formatNumber(num: number, decimals = 6): string {
  return Number(num).toFixed(decimals);
} 
const subscriptMap: Record<string, string> = {
  '-': '₋', '0': '₀', '1': '₁', '2': '₂', '3': '₃',
  '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉'
};

function toSubscript(str: string): string {
  return str.split('').map(c => subscriptMap[c] || c).join('');
}

export function formatNumberSmart(num: number): string {
  if (Number.isNaN(num)) return 'NaN';
  if (!isFinite(num)) return num > 0 ? 'Infinity' : '-Infinity';

  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);

  // Normal numbers (not in scientific notation)
  if (!abs.toString().includes('e')) {
    // Integers >= 1
    if (abs >= 1) {
      return sign + abs.toLocaleString('en-US');
    }

    // Small decimals < 1
    const str = abs.toString(); // e.g. '0.003212312'
    const match = /^0\.(0*)(\d+)/.exec(str);
    if (match) {
      const leadingZeros = match[1].length;
      const digits = match[2].slice(0, 5); // 可调整精度
      return `${sign}0.0${toSubscript(leadingZeros.toString())}${digits}`;
    }

    return sign + str;
  }

  // Scientific notation
  const [baseStr, expStr] = abs.toExponential().split('e');
  const base = parseFloat(baseStr);
  const exp = parseInt(expStr);

  if (exp > 0) {
    return sign + Number(num).toLocaleString('en-US', {
      maximumFractionDigits: 20
    });
  }

  // e.g. 1.2e-10 → 0.0₉12
  const digits = baseStr.replace('.', '').slice(0, 5); // 保留前5位有效数字
  return `${sign}0.0${toSubscript((Math.abs(exp) - 1).toString())}${digits}`;
}