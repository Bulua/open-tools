import type { Category } from "../types";
import calculator from "./calculator";
import units from "./units";
import radix from "./radix";

const calc: Category = {
  id: "calc",
  name: "计算换算",
  tools: [calculator, units, radix],
};

export default calc;
