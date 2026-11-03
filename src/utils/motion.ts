/**
 * 动效小工具：选中状态（分段选择的底色、侧栏当前工具、分类下划线）从旧位置滑到新位置。
 *
 * 做法：在容器里临时放一个「滑块」，从旧选中项的位置移动到新选中项，动画期间容器带上
 * .gliding，组件据此隐藏选中项自己的底色，动画结束后移除滑块。容器需要 position: relative。
 * 曲线和时长与 theme.css 里的 --ease-out、--dur-slow 一致。
 */
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const DURATION = 280;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 元素相对于容器（offsetParent）的位置 */
export const boxOf = (el: HTMLElement): Box => ({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight });

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 在 container 里让一个带 kind 样式的滑块从 from 移到 to（kind 见 motion.css 的 .glide-*） */
export function glide(container: HTMLElement, from: Box, to: Box, kind: string) {
  if (reduceMotion()) return;
  // 上一次还没滑完时，从滑块当前的位置接着滑，连续切换时不会跳
  const running = container.querySelector<HTMLElement>(":scope > .glide");
  if (running) {
    from = boxOf(running);
    running.remove();
  }
  if (from.left === to.left && from.top === to.top && from.width === to.width && from.height === to.height) {
    container.classList.remove("gliding");
    return;
  }
  const ghost = document.createElement("span");
  ghost.className = `glide glide-${kind}`;
  container.append(ghost);
  container.classList.add("gliding");
  const frame = (b: Box) => ({ left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
  const anim = ghost.animate([frame(from), frame(to)], { duration: DURATION, easing: EASE, fill: "forwards" });
  const done = () => {
    ghost.remove();
    if (!container.querySelector(":scope > .glide")) container.classList.remove("gliding");
  };
  anim.onfinish = done;
  anim.oncancel = done;
}

/**
 * 所有工具里的分段选择（.seg）都用滑动的选中底色。
 * 用事件委托：点击时（捕获阶段，Vue 更新之前）记下旧选中按钮，下一帧找到新选中按钮再滑过去。
 */
export function installSegGlide() {
  document.addEventListener(
    "click",
    (e) => {
      const btn = (e.target as Element | null)?.closest?.(".seg > button");
      const seg = btn?.parentElement;
      const old = seg?.querySelector<HTMLElement>(":scope > button.on");
      if (!seg || !old || old === btn) return;
      const from = boxOf(old);
      requestAnimationFrame(() => {
        const now = seg.querySelector<HTMLElement>(":scope > button.on");
        if (now && now !== old) glide(seg, from, boxOf(now), "pill");
      });
    },
    true,
  );
}
