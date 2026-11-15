import type { Category } from "../types";
import base64 from "./base64";
import textEscape from "./text-escape";
import hash from "./hash";
import jwt from "./jwt";
import password from "./password";
import passwordVault from "./password-vault";
import clipboardHistory from "./clipboard-history";
import idCard from "./id-card";

const encode: Category = {
  id: "encode",
  name: "编码 / 加密",
  tools: [base64, textEscape, hash, jwt, password, passwordVault, clipboardHistory, idCard],
};

export default encode;
