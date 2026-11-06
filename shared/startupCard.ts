export const startupCardHtml = `
<!doctype html>
<html>
<head>
<meta charset="UTF-8">
<style>:root{--bg:#f3f5f8;--panel:#ffffff;--text:#20262e;--line:#c9d1db;--accent:#0f6cbd;color-scheme:light}
html[data-theme="dark"]{--bg:#1b1f27;--panel:#252a32;--text:#e8ecf2;--line:#3a4452;--accent:#60a5fa;color-scheme:dark}
html,body{margin:0;background:var(--bg);color:var(--text)}
#startup-status{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--text);font:14px system-ui}
#startup-status .startup-card{display:flex;flex-direction:column;align-items:center;gap:14px;width:max-content;max-width:calc(100% - 24px);padding:24px 32px;border:1px solid var(--line);border-radius:12px;background:var(--panel);color:var(--text);font-size:14px;font-weight:500;text-align:center;box-shadow:0 8px 28px rgb(0 0 0 / 16%)}
#startup-status .startup-spinner{width:32px;height:32px;border:3px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:startup-spin 0.8s linear infinite}
@keyframes startup-spin{to{transform:rotate(360deg)}
}
@media (prefers-reduced-motion: reduce){#startup-status .startup-spinner{animation:none}
}
</style>
</head>
<body>
<div id="startup-status" role="status">
<div class="startup-card">
<span class="startup-spinner" aria-hidden="true">
</span>
<span>正在加载资源…</span>
</div>
</div>
</body>
</html>
`;
