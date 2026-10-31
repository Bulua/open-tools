import { CaseSensitive, Clock, Hash, Palette } from "lucide-vue-next";
import type { Category } from "../types";
import * as t from "./transforms";

const convert: Category = {
  id: "convert",
  name: "转换",
  tools: [
    { id: "timestamp", name: "时间戳", desc: "Unix 时间戳与日期互转", icon: Clock },
    { id: "radix", name: "进制转换", desc: "二、八、十、十六进制互转", icon: Hash },
    { id: "color", name: "颜色转换", desc: "HEX / RGB / HSL 互转", icon: Palette },
    {
      id: "case",
      name: "大小写转换",
      desc: "大写、小写、驼峰、下划线",
      icon: CaseSensitive,
      actions: [
        { label: "大写", primary: true, run: t.toUpper },
        { label: "小写", run: t.toLower },
        { label: "驼峰", run: t.toCamel },
        { label: "下划线", run: t.toSnake },
      ],
    },
  ],
};

export default convert;
