/**
 * 工具注册表。新增分类：在 tools/ 下新建文件夹并导出 Category，然后加到下面的数组里。
 * 数组顺序就是顶部分类的显示顺序。
 */
import type { Category } from "./types";
import json from "./json";
import encode from "./encode";
import convert from "./convert";

export const categories: Category[] = [json, encode, convert];

export * from "./types";
