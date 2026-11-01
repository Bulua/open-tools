import { defineAsyncComponent } from "vue";
import { Calculator, FileArchive, FolderArchive, Regex } from "lucide-vue-next";
import type { Category } from "../types";

const archive = defineAsyncComponent(() => import("./components/ArchiveTool.vue"));

const utility: Category = {
  id: "utility",
  name: "实用工具",
  tools: [
    {
      id: "calculator",
      name: "计算器",
      desc: "输入算式即时计算，支持括号、乘方、开方、三角函数和历史记录",
      icon: Calculator,
      component: defineAsyncComponent(() => import("./components/CalculatorTool.vue")),
    },
    {
      id: "regex",
      name: "正则表达式测试",
      desc: "实时高亮匹配结果，查看分组，预览替换效果",
      icon: Regex,
      component: defineAsyncComponent(() => import("./components/RegexTester.vue")),
      sessions: true,
    },
    {
      id: "archive",
      name: "文件压缩",
      desc: "把文件或文件夹打包成 ZIP，保留目录结构，可选压缩程度",
      icon: FileArchive,
      component: archive,
      props: { mode: "compress" },
    },
    {
      id: "extract",
      name: "文件解压",
      desc: "查看并解压 ZIP、TAR、TGZ、GZ，正确显示中文文件名",
      icon: FolderArchive,
      component: archive,
      props: { mode: "extract" },
    },
  ],
};

export default utility;
