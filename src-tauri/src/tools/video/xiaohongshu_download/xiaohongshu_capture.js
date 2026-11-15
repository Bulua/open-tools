// 在小红书页面内读取当前笔记，外部页面不授予程序 IPC 权限。
(() => {
  if (window.top !== window || window.__otXhsHooked) return;
  window.__otXhsHooked = true;
  let done = false;
  const send = (value) => {
    if (done) return;
    done = true;
    location.href = "https://open-tools.capture/?d=" + encodeURIComponent(JSON.stringify(value));
  };
  const scan = () => {
    if (done) return;
    const id = location.pathname.match(/^\/(?:explore|discovery\/item)\/([a-f\d]{24})\/?$/i)?.[1];
    if (!id) return;
    const state = window.__INITIAL_STATE__;
    const mobile = state?.noteData?.data?.noteData;
    const note = state?.note?.noteDetailMap?.[id]?.note || (mobile?.noteId === id ? mobile : null);
    if (!note) return;
    const images = note.type === "normal" || note.type === "image";
    if (!images && !note.video?.media?.stream) return;
    // 只返回当前笔记所需的数据，避免携带整页状态和推荐内容。
    send({ id, state: { note: { noteDetailMap: { [id]: { note: {
      type: note.type, title: note.title, desc: note.desc, time: note.time,
      user: { nickname: note.user?.nickname || note.user?.nickName }, imageList: images ? note.imageList : note.imageList?.slice(0, 1),
      video: images ? undefined : { basic: note.video.basic, media: { stream: note.video.media.stream } },
    } } } } } });
  };
  const timer = setInterval(() => {
    if (done) return clearInterval(timer);
    try { scan(); } catch { /* 页面状态尚未加载完成，等待下次读取。 */ }
  }, 500);
  setTimeout(() => send({ error: "unavailable" }), 25000);
})();
