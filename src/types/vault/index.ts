/**
 * 密码本模块前后端通信类型定义。
 */

export interface VaultFile {
  path: string;
  data: string | null;
}

export interface VaultEntry {
  id: string;
  /** 名称，例如「GitHub」「公司邮箱」 */
  title: string;
  username: string;
  password: string;
  url: string;
  note: string;
  updatedAt: number;
}
