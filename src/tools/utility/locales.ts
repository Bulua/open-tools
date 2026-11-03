import { defineModuleLocales } from "@/locales/types";

/** 实用工具模块的多语言文案，写法见 docs/DEVELOPMENT.md「多语言文案」 */
export default defineModuleLocales({
  tools: {
    calculator: { name: "Calculator", desc: "Type an expression for instant results, with parentheses, powers, roots, trigonometry and history" },
    countdown: { name: "Countdown", desc: "Count down to a time or run a timer, with repeat reminders; kept until deleted and alerts you when due" },
    regex: { name: "Regex Tester", desc: "Highlight matches live, inspect groups and preview replacements" },
    cron: { name: "Cron Expression", desc: "Explain a cron expression in plain words and list its next run times; supports Linux / Spring / Quartz" },
    archive: { name: "Zip Files", desc: "Pack files or folders into a ZIP, keeping the folder structure, with a choice of compression level" },
    extract: { name: "Extract Archive", desc: "View and extract ZIP, TAR, TGZ and GZ, with Chinese file names shown correctly" },
  },
});
