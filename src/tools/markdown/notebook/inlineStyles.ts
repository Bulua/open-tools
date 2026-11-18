import type { Parent, Text } from "mdast";
import type { Extension as FromMarkdown, Handle } from "mdast-util-from-markdown";
import type { Options as ToMarkdown } from "mdast-util-to-markdown";
import type { Construct, Extension as Micromark } from "micromark-util-types";
import { markRule } from "@milkdown/prose";
import { $inputRule, $markSchema, $remark } from "@milkdown/utils";
import { remarkHighlightMark } from "remark-highlight-mark";

interface NotebookScript extends Parent {
  type: "notebookSub" | "notebookSup";
  children: Text[];
}

declare module "mdast" {
  interface PhrasingContentMap {
    notebookScript: NotebookScript;
  }
  interface RootContentMap {
    notebookScript: NotebookScript;
  }
}

declare module "micromark-util-types" {
  interface TokenTypeMap {
    notebookSub: "notebookSub";
    notebookSup: "notebookSup";
  }
}

/** 单个 ~ 或 ^ 围住一段上下标文字。双 ~ 留给 GFM 删除线。 */
function scriptToken(type: NotebookScript["type"], delimiter: number): Construct {
  return {
    previous: code => code !== delimiter,
    tokenize(effects, ok, nok) {
      return start;
      function start(code: number | null) {
        effects.enter(type);
        effects.consume(code);
        return first;
      }
      function first(code: number | null) {
        return code === delimiter ? nok(code) : content(code);
      }
      function content(code: number | null) {
        if (code === null || code <= 32) return nok(code);
        effects.consume(code);
        if (code === delimiter) {
          effects.exit(type);
          return after;
        }
        return code === 92 ? escaped : content;
      }
      function escaped(code: number | null) {
        if (code === null || code < 0) return nok(code);
        effects.consume(code);
        return content;
      }
      function after(code: number | null) {
        return code === delimiter ? nok(code) : ok(code);
      }
    },
  };
}

const scripts = $remark("notebookScripts", () => function () {
  const syntax: Micromark = {
    text: { 126: scriptToken("notebookSub", 126), 94: scriptToken("notebookSup", 94) },
  };
  const fromMarkdown: FromMarkdown = {
    enter: {
      notebookSub(token) {
        this.enter({ type: "notebookSub", children: [] }, token);
      },
      notebookSup(token) {
        this.enter({ type: "notebookSup", children: [] }, token);
      },
    },
    exit: {
      notebookSub: endScript,
      notebookSup: endScript,
    },
  };
  const toMarkdown: ToMarkdown = {
    unsafe: [{ character: "^", inConstruct: "phrasing" }],
    handlers: {
      notebookSub: node => wrapScript(node as NotebookScript, "~"),
      notebookSup: node => wrapScript(node as NotebookScript, "^"),
    },
  };
  const data = this.data();
  (data.micromarkExtensions ??= []).push(syntax);
  (data.fromMarkdownExtensions ??= []).push(fromMarkdown);
  (data.toMarkdownExtensions ??= []).push(toMarkdown);
});

const endScript: Handle = function (token) {
  const value = this.sliceSerialize(token).slice(1, -1).replace(/\\([~^ \\])/g, "$1");
  (this.stack[this.stack.length - 1] as NotebookScript).children.push({ type: "text", value });
  this.exit(token);
};

function wrapScript(node: NotebookScript, marker: string) {
  const text = node.children.map(child => child.value).join("").replace(/[~^ \\]/g, "\\$&");
  return marker + text + marker;
}

function inlineMark(name: string, tag: string, pattern: RegExp) {
  const mark = $markSchema(name, () => ({
    parseDOM: [{ tag }],
    toDOM: () => [tag, 0],
    parseMarkdown: {
      match: node => node.type === name,
      runner: (state, node, type) => {
        state.openMark(type).next(node.children).closeMark(type);
      },
    },
    toMarkdown: {
      match: value => value.type.name === name,
      runner: (state, value) => { state.withMark(value, name); },
    },
  }));
  return [...mark, $inputRule(ctx => markRule(pattern, mark.type(ctx)))];
}

export const inlineStyles = [
  ...scripts, ...$remark("notebookHighlight", () => function () { remarkHighlightMark.call(this); }),
  ...inlineMark("highlight", "mark", /(?<![\\=])==([^=\s](?:[^=\n]*?[^=\s])?)==$/),
  ...inlineMark("notebookSub", "sub", /(?<![\\~])~([^~\s]+)~$/),
  ...inlineMark("notebookSup", "sup", /(?<![\\^])\^([^\^\s]+)\^$/),
];
