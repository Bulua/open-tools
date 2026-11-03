import { defineModuleLocales } from "@/locales/types";

/** 编码 / 加密模块的多语言文案，写法见 docs/DEVELOPMENT.md「多语言文案」 */
export default defineModuleLocales({
  tools: {
    base64: { name: "Base64 Encode / Decode", desc: "Convert text, images or any file to and from Base64; download decoded results" },
    "text-escape": { name: "URL / Unicode / HTML Encode", desc: "URL-encode parameters, convert text to \\uXXXX, escape HTML characters — live, both ways" },
    hash: { name: "Hash (MD5 / SHA)", desc: "Compute MD5, SHA-1, SHA-256 and SHA-512 of text or files" },
    jwt: { name: "JWT Decoder", desc: "Inspect a JWT's header, payload and expiry time" },
    password: { name: "Password Generator", desc: "Choose character types, length and charset; uses secure randomness and can generate in bulk" },
    "password-vault": { name: "Password Vault", desc: "Store your accounts and passwords on this device, encrypted with a master password that cannot be recovered" },
  },
});
