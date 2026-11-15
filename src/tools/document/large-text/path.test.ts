import { expect, it } from "vitest";
import { displayFilePath } from "./path";

it.each([
  [String.raw`\\?\C:\Users\27832\Desktop\random_900mb.txt`, String.raw`C:\Users\27832\Desktop\random_900mb.txt`],
  [String.raw`\\?\UNC\server\share\file.txt`, String.raw`\\server\share\file.txt`],
  [String.raw`C:\normal\file.txt`, String.raw`C:\normal\file.txt`],
  [String.raw`\\server\share\file.txt`, String.raw`\\server\share\file.txt`],
  ["/home/user/file.txt", "/home/user/file.txt"],
  [String.raw`\\?\Volume{example}\file.txt`, String.raw`\\?\Volume{example}\file.txt`],
  ["", ""],
])("界面路径整理：%s", (raw, displayed) => {
  expect(displayFilePath(raw)).toBe(displayed);
});
