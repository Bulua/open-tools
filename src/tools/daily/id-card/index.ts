import { defineAsyncComponent } from "vue";
import { IdCard } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "id-card",
  name: "身份证号解析",
  desc: "校验身份证号，列出地区、出生日期、年龄、性别、生肖、星座等信息；15 位老号码可升级为 18 位",
  icon: IdCard,
  component: defineAsyncComponent(() => import("./IdCardParser.vue")),
};

export default tool;
