/**
 * HTTP 请求历史模块前后端通信类型定义。
 */

export interface HttpKeyValue {
  enabled: boolean;
  key: string;
  value: string;
}

export type HttpBodyType = "none" | "json" | "text" | "form" | "multipart" | "binary";
export type HttpAuthType = "none" | "bearer" | "basic";

export interface HttpAuth {
  type: HttpAuthType;
  token: string;
  username: string;
  password: string;
}

export interface HttpRequestSnapshot {
  method: string;
  url: string;
  params: HttpKeyValue[];
  headers: HttpKeyValue[];
  auth: HttpAuth;
  bodyType: HttpBodyType;
  bodyText: string;
  textType: string;
  form: HttpKeyValue[];
  multipart: HttpKeyValue[];
  timeout: number;
  followRedirects: boolean;
  insecure: boolean;
}

export interface HttpHistoryRecord {
  id: string;
  time: string;
  status: number | null;
  request: HttpRequestSnapshot;
}

export interface HttpHistorySaveInput {
  status: number | null;
  request: HttpRequestSnapshot;
  updatedAt?: string;
}
