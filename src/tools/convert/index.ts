import { defineAsyncComponent } from "vue";
import { CaseSensitive, Clock, Hash, Palette } from "lucide-vue-next";
import type { Category } from "../types";

const convert: Category = {
  id: "convert",
  name: "转换",
  tools: [
    {
      id: "timestamp",
      name: "时间戳转换",
      desc: "Unix 时间戳（秒 / 毫秒）与日期互转，查看当前时间戳",
      icon: Clock,
      component: defineAsyncComponent(() => import("./components/TimestampConvert.vue")),
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
