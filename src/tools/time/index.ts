import type { Category } from "../types";
import timestamp from "./timestamp";
import timezone from "./timezone";
import cron from "./cron";
import clock from "./clock";
import calendar from "./calendar";

const time: Category = {
  id: "time",
  name: "时间",
  tools: [timestamp, timezone, cron, clock, calendar],
};

export default time;
