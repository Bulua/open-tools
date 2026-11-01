/** 单位换算：温度、长度、重量等，纯计算，便于测试 */

export interface Unit {
  id: string;
  label: string;
  /** 换算成基准单位的系数（温度另行处理） */
  factor?: number;
}

export interface Quantity {
  id: string;
  label: string;
  units: Unit[];
  /** 默认输入单位 */
  default: string;
}

export const QUANTITIES: Quantity[] = [
  {
    id: "temperature",
    label: "温度",
    default: "c",
    units: [
      { id: "c", label: "摄氏度 °C" },
      { id: "f", label: "华氏度 °F" },
      { id: "k", label: "开尔文 K" },
      { id: "r", label: "兰氏度 °R" },
    ],
  },
  {
    id: "length",
    label: "长度",
    default: "m",
    units: [
      { id: "km", label: "千米 km", factor: 1000 },
      { id: "m", label: "米 m", factor: 1 },
      { id: "dm", label: "分米 dm", factor: 0.1 },
      { id: "cm", label: "厘米 cm", factor: 0.01 },
      { id: "mm", label: "毫米 mm", factor: 0.001 },
      { id: "um", label: "微米 μm", factor: 1e-6 },
      { id: "li", label: "里", factor: 500 },
      { id: "zhang", label: "丈", factor: 10 / 3 },
      { id: "chi", label: "尺", factor: 1 / 3 },
      { id: "cun", label: "寸", factor: 1 / 30 },
      { id: "mi", label: "英里 mi", factor: 1609.344 },
      { id: "nmi", label: "海里 nmi", factor: 1852 },
      { id: "yd", label: "码 yd", factor: 0.9144 },
      { id: "ft", label: "英尺 ft", factor: 0.3048 },
      { id: "in", label: "英寸 in", factor: 0.0254 },
    ],
  },
  {
    id: "weight",
    label: "重量",
    default: "kg",
    units: [
      { id: "t", label: "吨 t", factor: 1000 },
      { id: "kg", label: "千克 kg", factor: 1 },
      { id: "jin", label: "斤", factor: 0.5 },
      { id: "liang", label: "两", factor: 0.05 },
      { id: "g", label: "克 g", factor: 0.001 },
      { id: "mg", label: "毫克 mg", factor: 1e-6 },
      { id: "lb", label: "磅 lb", factor: 0.45359237 },
      { id: "oz", label: "盎司 oz", factor: 0.028349523125 },
      { id: "ct", label: "克拉 ct", factor: 0.0002 },
    ],
  },
  {
    id: "area",
    label: "面积",
    default: "m2",
    units: [
      { id: "km2", label: "平方千米 km²", factor: 1e6 },
      { id: "ha", label: "公顷 ha", factor: 1e4 },
      { id: "mu", label: "亩", factor: 10000 / 15 },
      { id: "m2", label: "平方米 m²", factor: 1 },
      { id: "dm2", label: "平方分米 dm²", factor: 0.01 },
      { id: "cm2", label: "平方厘米 cm²", factor: 1e-4 },
      { id: "acre", label: "英亩 acre", factor: 4046.8564224 },
      { id: "ft2", label: "平方英尺 ft²", factor: 0.09290304 },
      { id: "in2", label: "平方英寸 in²", factor: 0.00064516 },
    ],
  },
  {
    id: "volume",
    label: "体积",
    default: "l",
    units: [
      { id: "m3", label: "立方米 m³", factor: 1000 },
      { id: "l", label: "升 L", factor: 1 },
      { id: "ml", label: "毫升 mL", factor: 0.001 },
      { id: "galus", label: "美制加仑 gal", factor: 3.785411784 },
      { id: "galuk", label: "英制加仑 gal", factor: 4.54609 },
      { id: "floz", label: "美制液量盎司 fl oz", factor: 0.0295735295625 },
      { id: "cup", label: "杯（美制）", factor: 0.2365882365 },
    ],
  },
  {
    id: "data",
    label: "数据大小",
    default: "mb",
    units: [
      { id: "b", label: "比特 bit", factor: 1 / 8 },
      { id: "byte", label: "字节 B", factor: 1 },
      { id: "kb", label: "KB（1024）", factor: 1024 },
      { id: "mb", label: "MB（1024²）", factor: 1024 ** 2 },
      { id: "gb", label: "GB（1024³）", factor: 1024 ** 3 },
      { id: "tb", label: "TB（1024⁴）", factor: 1024 ** 4 },
      { id: "kb10", label: "kB（1000）", factor: 1000 },
      { id: "mb10", label: "MB（1000²，硬盘标称）", factor: 1000 ** 2 },
      { id: "gb10", label: "GB（1000³，硬盘标称）", factor: 1000 ** 3 },
    ],
  },
  {
    id: "speed",
    label: "速度",
    default: "kmh",
    units: [
      { id: "ms", label: "米/秒 m/s", factor: 1 },
      { id: "kmh", label: "千米/时 km/h", factor: 1000 / 3600 },
      { id: "mph", label: "英里/时 mph", factor: 0.44704 },
      { id: "kn", label: "节 kn", factor: 1852 / 3600 },
      { id: "mach", label: "马赫（海平面）", factor: 340.3 },
    ],
  },
  {
    id: "time",
    label: "时间",
    default: "h",
    units: [
      { id: "ms", label: "毫秒 ms", factor: 0.001 },
      { id: "s", label: "秒 s", factor: 1 },
      { id: "min", label: "分钟", factor: 60 },
      { id: "h", label: "小时", factor: 3600 },
      { id: "d", label: "天", factor: 86400 },
      { id: "w", label: "周", factor: 604800 },
      { id: "y", label: "年（365 天）", factor: 31536000 },
    ],
  },
  {
    id: "pressure",
    label: "压力",
    default: "kpa",
    units: [
      { id: "pa", label: "帕 Pa", factor: 1 },
      { id: "kpa", label: "千帕 kPa", factor: 1000 },
      { id: "mpa", label: "兆帕 MPa", factor: 1e6 },
      { id: "bar", label: "巴 bar", factor: 1e5 },
      { id: "atm", label: "标准大气压 atm", factor: 101325 },
      { id: "mmhg", label: "毫米汞柱 mmHg", factor: 133.322387415 },
      { id: "psi", label: "磅力/平方英寸 psi", factor: 6894.757293168 },
      { id: "kgfcm2", label: "千克力/平方厘米", factor: 98066.5 },
    ],
  },
  {
    id: "energy",
    label: "能量",
    default: "kcal",
    units: [
      { id: "j", label: "焦耳 J", factor: 1 },
      { id: "kj", label: "千焦 kJ", factor: 1000 },
      { id: "cal", label: "卡 cal", factor: 4.184 },
      { id: "kcal", label: "千卡（大卡）kcal", factor: 4184 },
      { id: "wh", label: "瓦时 Wh", factor: 3600 },
      { id: "kwh", label: "千瓦时（度）kWh", factor: 3.6e6 },
      { id: "ev", label: "电子伏 eV", factor: 1.602176634e-19 },
      { id: "btu", label: "英热单位 BTU", factor: 1055.05585262 },
    ],
  },
  {
    id: "power",
    label: "功率",
    default: "kw",
    units: [
      { id: "w", label: "瓦 W", factor: 1 },
      { id: "kw", label: "千瓦 kW", factor: 1000 },
      { id: "mw", label: "兆瓦 MW", factor: 1e6 },
      { id: "hp", label: "马力（公制）PS", factor: 735.49875 },
      { id: "hpi", label: "马力（英制）hp", factor: 745.69987158 },
      { id: "btuh", label: "BTU/时", factor: 0.29307107 },
      { id: "ton", label: "冷吨（空调匹数参考）", factor: 3516.8528421 },
    ],
  },
  {
    id: "angle",
    label: "角度",
    default: "deg",
    units: [
      { id: "deg", label: "度 °", factor: Math.PI / 180 },
      { id: "rad", label: "弧度 rad", factor: 1 },
      { id: "grad", label: "百分度 gon", factor: Math.PI / 200 },
      { id: "arcmin", label: "角分 ′", factor: Math.PI / 10800 },
      { id: "arcsec", label: "角秒 ″", factor: Math.PI / 648000 },
      { id: "turn", label: "圈", factor: 2 * Math.PI },
    ],
  },
  {
    id: "frequency",
    label: "频率",
    default: "mhz",
    units: [
      { id: "hz", label: "赫兹 Hz", factor: 1 },
      { id: "khz", label: "千赫 kHz", factor: 1e3 },
      { id: "mhz", label: "兆赫 MHz", factor: 1e6 },
      { id: "ghz", label: "吉赫 GHz", factor: 1e9 },
      { id: "rpm", label: "转/分 rpm", factor: 1 / 60 },
    ],
  },
];

/** 温度先换算成摄氏度，再换成目标单位 */
const toCelsius: Record<string, (v: number) => number> = {
  c: (v) => v,
  f: (v) => ((v - 32) * 5) / 9,
  k: (v) => v - 273.15,
  r: (v) => ((v - 491.67) * 5) / 9,
};
const fromCelsius: Record<string, (v: number) => number> = {
  c: (v) => v,
  f: (v) => (v * 9) / 5 + 32,
  k: (v) => v + 273.15,
  r: (v) => ((v + 273.15) * 9) / 5,
};

export function convertUnit(quantity: Quantity, value: number, from: string, to: string): number {
  if (quantity.id === "temperature") return fromCelsius[to](toCelsius[from](value));
  const f = quantity.units.find((u) => u.id === from)!.factor!;
  const t = quantity.units.find((u) => u.id === to)!.factor!;
  return (value * f) / t;
}

/** 显示用：最多 10 位有效数字，去掉浮点误差和多余的 0；特别大或小的数用科学计数法 */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e15 || abs < 1e-6) return n.toExponential(6).replace(/\.?0+e/, "e");
  return String(Number(n.toPrecision(10)));
}
