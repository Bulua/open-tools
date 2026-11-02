// Injected into the hidden Douyin window before the page's own scripts run.
// The page loads the post data itself (Douyin signs these requests in its own scripts);
// this script watches the page's fetch / XHR responses for the post detail, keeps only the fields
// the downloader needs, and hands them back by navigating to https://open-tools.capture/ which
// the Rust side intercepts (the external page gets no access to the app's IPC).
(() => {
  if (window.top !== window || window.__otHooked) return;
  window.__otHooked = true;

  // The window is hidden, so the page would think it is in the background and may hold back content:
  // report it as visible.
  try {
    Object.defineProperty(Document.prototype, "visibilityState", { configurable: true, get: () => "visible" });
    Object.defineProperty(Document.prototype, "hidden", { configurable: true, get: () => false });
    Document.prototype.hasFocus = () => true;
  } catch (e) {
    // ignore
  }

  const send = (key, value) => {
    if (window.__otDone) return;
    window.__otDone = true;
    location.href = "https://open-tools.capture/?" + key + "=" + encodeURIComponent(value);
  };

  const urls = (o) => {
    if (!o) return [];
    if (typeof o === "string") return [o];
    if (Array.isArray(o)) return o.map((x) => (typeof x === "string" ? x : x && (x.src || x.url))).filter(Boolean);
    return o.url_list || o.urlList || [];
  };

  const pick = (a) => {
    const v = a.video || {};
    const rates = (v.bit_rate || v.bitRateList || []).map((b) => ({
      urls: urls(b.play_addr || b.playAddr),
      bitrate: b.bit_rate || b.bitRate || 0,
      h265: !!(b.is_h265 || b.isH265),
      width: (b.play_addr || {}).width || b.width || 0,
      height: (b.play_addr || {}).height || b.height || 0,
    }));
    const images = (a.images || []).map((img) => ({
      urls: urls(img),
      width: img.width || 0,
      height: img.height || 0,
      live: urls(img.video && (img.video.play_addr || img.video.playAddr)),
    }));
    const music = a.music || {};
    return {
      id: String(a.aweme_id || a.awemeId || ""),
      desc: a.desc || "",
      author: (a.author || a.authorInfo || {}).nickname || "",
      createTime: a.create_time || a.createTime || 0,
      cover: urls(v.origin_cover || v.originCover || v.cover)[0] || "",
      duration: v.duration || a.duration || 0,
      width: v.width || 0,
      height: v.height || 0,
      video: urls(v.play_addr || v.playAddr),
      rates,
      images,
      music: { title: music.title || "", urls: urls(music.play_url || music.playUrl) },
    };
  };

  const consider = (url, text) => {
    if (!/aweme\/detail|aweme\/v1\/web\/aweme\/detail|iteminfo|slidesinfo/.test(url)) return;
    try {
      const j = JSON.parse(text);
      const a = j.aweme_detail || (j.aweme_details || [])[0] || (j.item_list || [])[0];
      if (a) send("d", JSON.stringify(pick(a)));
    } catch (e) {
      // not JSON
    }
  };

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const u = typeof args[0] === "string" ? args[0] : args[0] && args[0].url;
      if (u && /detail|iteminfo|slidesinfo/.test(u)) res.clone().text().then((t) => consider(u, t), () => {});
    } catch (e) {
      // ignore
    }
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__otUrl = String(url);
    return origOpen.call(this, method, url, ...rest);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", () => {
      try {
        if (/detail|iteminfo|slidesinfo/.test(this.__otUrl) && (this.responseType === "" || this.responseType === "text")) consider(this.__otUrl, this.responseText);
      } catch (e) {
        // ignore
      }
    });
    return origSend.apply(this, args);
  };

  // The desktop page usually renders the post on the server: the data is in the streamed page data
  // (self.__pace_f.push([1, "7:[...]"]), camelCase field names) or in RENDER_DATA, with no request to watch.
  const seen = new WeakSet();
  const find = (o, depth) => {
    if (!o || typeof o !== "object" || depth > 16 || seen.has(o)) return null;
    seen.add(o);
    if ((o.awemeId || o.aweme_id) && (o.video || o.images)) return o;
    for (const k of Object.keys(o)) {
      const hit = find(o[k], depth + 1);
      if (hit) return hit;
    }
    return null;
  };
  let scanned = 0;
  const scan = () => {
    if (window.__otDone) return;
    const chunks = window.__pace_f || [];
    for (; scanned < chunks.length; scanned++) {
      const c = chunks[scanned];
      const text = Array.isArray(c) && typeof c[1] === "string" ? c[1] : "";
      const m = text.match(/^[0-9a-f]+:([\[{][\s\S]*)$/);
      if (!m || !/awemeId|aweme_id/.test(m[1])) continue;
      try {
        const a = find(JSON.parse(m[1]), 0);
        if (a) return send("d", JSON.stringify(pick(a)));
      } catch (e) {
        // not JSON
      }
    }
    const el = document.getElementById("RENDER_DATA");
    if (el && !el.__otScanned) {
      el.__otScanned = true;
      try {
        const a = find(JSON.parse(decodeURIComponent(el.textContent)), 0);
        if (a) send("d", JSON.stringify(pick(a)));
      } catch (e) {
        // ignore
      }
    }
  };
  const timer = setInterval(() => (window.__otDone ? clearInterval(timer) : scan()), 800);

  setTimeout(() => {
    const text = (document.body && document.body.innerText) || "";
    send("e", /验证|captcha|安全检测/i.test(text) ? "captcha" : "nodata");
  }, 25000);
})();
