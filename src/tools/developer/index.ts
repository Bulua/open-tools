import type { Category } from "../types";
import jsonFormat from "./json-format";
import jsonDiff from "./json-diff";
import jsonEscape from "./json-escape";
import jsonConvert from "./json-convert";
import base64 from "./base64";
import textEscape from "./text-escape";
import hash from "./hash";
import jwt from "./jwt";
import naming from "./naming";
import regex from "./regex";
import mcpInspector from "./mcp-inspector";

const developer: Category = {
  id: "developer",
  name: "开发工具",
  tools: [
    jsonFormat,
    jsonDiff,
    jsonEscape,
    jsonConvert,
    base64,
    textEscape,
    hash,
    jwt,
    naming,
    regex,
    mcpInspector,
  ],
};

export default developer;
