import type { Category } from "../types";
import calculator from "./calculator";
import countdown from "./countdown";
import calendar from "./calendar";
import regex from "./regex";
import cron from "./cron";
import archive from "./archive";
import extract from "./extract";

const utility: Category = {
  id: "utility",
  name: "实用工具",
  tools: [calculator, countdown, calendar, regex, cron, archive, extract],
};

export default utility;
