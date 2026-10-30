// 最新リリースの DMG を GitHub API から引いて、ダウンロードボタンの href と版を差し替える。
// API が使えないとき（レート制限など）はリリースページへのリンクのまま残す
(async () => {
  try {
    const res = await fetch("https://api.github.com/repos/karamage/prompt-code/releases/latest", {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return;
    const release = await res.json();
    const assets = release.assets || [];
    const find = (arch) => assets.find((a) => a.name.endsWith(".dmg") && a.name.includes(arch));
    for (const el of document.querySelectorAll("[data-arch]")) {
      const asset = find(el.dataset.arch);
      if (asset) el.href = asset.browser_download_url;
    }
    const version = release.tag_name || release.name;
    for (const el of document.querySelectorAll("[data-version]")) {
      el.textContent = version;
    }
  } catch {
    // リンクは既定のリリースページのまま
  }
})();
