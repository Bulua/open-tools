import type { Category } from "../types";
import units from "./units";
import timestamp from "./timestamp";
import timezone from "./timezone";
import radix from "./radix";
import color from "./color";
import naming from "./naming";

const convert: Category = {
  id: "convert",
  name: "转换",
  tools: [units, timestamp, timezone, radix, color, naming],
};

export default convert;
