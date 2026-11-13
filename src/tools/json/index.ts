import type { Category } from "../types";
import jsonFormat from "./json-format";
import jsonDiff from "./json-diff";
import jsonEscape from "./json-escape";
import jsonConvert from "./json-convert";

const json: Category = {
  id: "json",
  name: "Json 工具",
  tools: [jsonFormat, jsonDiff, jsonEscape, jsonConvert],
};

export default json;
