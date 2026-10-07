(() => {
  const buildMeta = document.querySelector('meta[name="app-build"]');
  const loadedBuild = buildMeta?.content || 'unknown';
  let updateBuild = null;
  let checking = false;
  let banner = null;

  function editingIsActive() {
    if (document.querySelector('dialog[open]')) return true;
    const active = document.activeElement;
    return !!active && ['INPUT','TEXTAREA','SELECT'].includes(active.tagName);
  }

  function freshUrl(build) {
    const url = new URL(window.location.href);
    url.searchParams.set('_build', build);
    return url.toString();
  }

  function reloadTo(build) {
    window.location.replace(freshUrl(build));
  }

  function showBanner(build) {
    if (banner) return;
    banner = document.createElement('div');
    banner.className = 'app-update-banner';
    banner.innerHTML = `
      <div>
        <strong>New version ready</strong>
        <span>Your Creativexteriors app has been updated.</span>
      </div>
      <button type="button">Reload</button>
    `;
    banner.querySelector('button').addEventListener('click', () => reloadTo(build));
    document.body.appendChild(banner);
  }

  async function checkForUpdate() {
    if (checking || document.visibilityState !== 'visible') return;
    checking = true;

    try {
      const url = new URL('index.html', window.location.href);
      url.searchParams.set('_update_check', Date.now().toString());

      const response = await fetch(url, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (!response.ok) return;
      const html = await response.text();
      const match = html.match(/<meta\s+name=["']app-build["']\s+content=["']([^"']+)["']/i)
        || html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']app-build["']/i);
      const remoteBuild = match?.[1];

      if (!remoteBuild || remoteBuild === loadedBuild) return;
      updateBuild = remoteBuild;

      if (editingIsActive()) {
        showBanner(remoteBuild);
        return;
      }

      window.setTimeout(() => {
        if (editingIsActive()) showBanner(remoteBuild);
        else reloadTo(remoteBuild);
      }, 1200);
    } catch (error) {
      console.debug('Update check skipped:', error);
    } finally {
      checking = false;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });

  window.addEventListener('focus', checkForUpdate);
  window.setInterval(checkForUpdate, 10000);
  window.setTimeout(checkForUpdate, 2500);
})();