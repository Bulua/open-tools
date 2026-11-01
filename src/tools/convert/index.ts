import { defineAsyncComponent } from "vue";
import { CaseSensitive, Clock, Globe2, Hash, Palette, Ruler } from "lucide-vue-next";
import type { Category } from "../types";

const convert: Category = {
  id: "convert",
  name: "转换",
  tools: [
    {
      id: "units",
      name: "单位换算",
      desc: "温度、长度、重量、面积、体积、数据、速度、时间、压力、能量、功率、角度、频率换算",
      icon: Ruler,
      component: defineAsyncComponent(() => import("./components/UnitConvert.vue")),
    },
    {
      id: "timestamp",
      name: "时间戳转换",
      desc: "Unix 时间戳（秒 / 毫秒）与日期互转，查看当前时间戳",
      icon: Clock,
      component: defineAsyncComponent(() => import("./components/TimestampConvert.vue")),
    },
    {
      id: "timezone",
      name: "时区转换 / 世界时间",
      desc: "任意时区的时间互相换算，同时查看多个城市的当前时间和 24 小时对照",
      icon: Globe2,
      component: defineAsyncComponent(() => import("./components/TimezoneConvert.vue")),
    },
    {
      id: "radix",
      name: "进制转换",
      desc: "二进制、八进制、十进制、十六进制及任意进制互转",
      icon: Hash,
      component: defineAsyncComponent(() => import("./components/RadixConvert.vue")),
    },
    {
      id: "color",
      name: "颜色转换 HEX/RGB/HSL",
      desc: "颜色格式互转，带取色器",
      icon: Palette,
      component: defineAsyncComponent(() => import("./components/ColorConvert.vue")),
    },
    {
      id: "naming",
      name: "命名风格转换",
      desc: "变量名在驼峰、下划线、短横线、常量等写法之间转换",
      icon: CaseSensitive,
      component: defineAsyncComponent(() => import("./components/NamingConvert.vue")),
    },
  ],
};

export default convert;
