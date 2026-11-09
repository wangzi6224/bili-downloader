'use client';

import { useEffect, useId, useRef, useState } from 'react';

const RELEASES = 'https://github.com/wangzi6224/bili-downloader/releases/latest';
const LATEST_RELEASE_API = 'https://api.github.com/repos/wangzi6224/bili-downloader/releases/latest';
let lookupPending = false;
const lookupListeners = new Set();

function setLookupPending(pending) {
  lookupPending = pending;
  lookupListeners.forEach(listener => listener(pending));
}

async function getLatestRelease() {
  const response = await fetch(LATEST_RELEASE_API, {
    cache: 'no-store',
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error(`GitHub release lookup failed: ${response.status}`);
  return response.json();
}

function getMacArchitecture() {
  const hints = navigator.userAgentData;
  if (!hints?.getHighEntropyValues) return Promise.resolve(null);

  return hints.getHighEntropyValues(['architecture']).then(({ architecture }) => {
    if (architecture === 'arm') return 'arm64';
    if (architecture === 'x86') return 'x64';
    return null;
  });
}

function findMacAssets(assets) {
  return {
    arm64: assets.find(asset => /-arm64\.dmg$/i.test(asset.name)),
    x64: assets.find(asset => /-x64\.dmg$/i.test(asset.name)),
  };
}

function findPlatformAsset(assets, platform) {
  if (platform === 'windows') return assets.find(asset => /-x64\.exe$/i.test(asset.name));
  if (platform === 'linux') return assets.find(asset => /-x86_64\.AppImage$/i.test(asset.name));
  return undefined;
}

export default function PlatformDownloadLink({
  platform,
  href = RELEASES,
  ariaLabel,
  appleSiliconLabel,
  intelLabel,
  children,
}) {
  const [busy, setBusy] = useState(false);
  const [macAssets, setMacAssets] = useState(null);
  const menuId = useId();
  const controlRef = useRef(null);
  const triggerRef = useRef(null);
  const firstOptionRef = useRef(null);
  const optionRefs = useRef([]);

  useEffect(() => {
    const updateBusy = pending => setBusy(pending);
    lookupListeners.add(updateBusy);
    updateBusy(lookupPending);
    return () => {
      lookupListeners.delete(updateBusy);
    };
  }, []);

  useEffect(() => {
    if (!macAssets) return undefined;

    const closeOnOutsideClick = event => {
      if (!controlRef.current?.contains(event.target)) setMacAssets(null);
    };
    const handleMenuKeyDown = event => {
      if (event.key === 'Escape' && controlRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        setMacAssets(null);
        triggerRef.current?.focus();
        return;
      }

      if (event.key === 'Tab' && controlRef.current?.contains(document.activeElement)) {
        setMacAssets(null);
        return;
      }

      if (!controlRef.current?.contains(document.activeElement)) return;

      let nextIndex;
      const focusedIndex = optionRefs.current.indexOf(document.activeElement);
      if (event.key === 'ArrowDown') nextIndex = (focusedIndex + 1) % optionRefs.current.length;
      if (event.key === 'ArrowUp') nextIndex = (focusedIndex - 1 + optionRefs.current.length) % optionRefs.current.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = optionRefs.current.length - 1;
      if (nextIndex !== undefined) {
        event.preventDefault();
        optionRefs.current[nextIndex]?.focus();
      }
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', handleMenuKeyDown);
    firstOptionRef.current?.focus();

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', handleMenuKeyDown);
    };
  }, [macAssets]);

  const handleClick = async event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();

    if (platform === 'mac' && macAssets) {
      setMacAssets(null);
      return;
    }

    if (lookupPending) return;
    setLookupPending(true);
    try {
      const release = await getLatestRelease();
      if (platform === 'mac') {
        const options = findMacAssets(release.assets ?? []);
        const architecture = await getMacArchitecture().catch(() => null);
        const asset = architecture ? options[architecture] : undefined;

        if (asset?.browser_download_url) {
          window.location.assign(asset.browser_download_url);
          return;
        }

        if (options.arm64?.browser_download_url && options.x64?.browser_download_url) {
          setMacAssets(options);
          return;
        }

        throw new Error('macOS installers are unavailable');
      }

      const asset = findPlatformAsset(release.assets ?? [], platform);
      if (!asset?.browser_download_url) throw new Error(`${platform} installer is unavailable`);
      window.location.assign(asset.browser_download_url);
    } catch {
      window.location.assign(RELEASES);
    } finally {
      setLookupPending(false);
    }
  };

  return (
    <div className="hero-platform-control" ref={controlRef}>
      <a
        className="button button-primary hero-platform-button"
        href={href}
        aria-label={ariaLabel}
        aria-busy={busy || undefined}
        aria-disabled={busy || undefined}
        aria-haspopup={platform === 'mac' ? 'menu' : undefined}
        aria-expanded={platform === 'mac' ? Boolean(macAssets) : undefined}
        aria-controls={platform === 'mac' ? menuId : undefined}
        ref={triggerRef}
        onClick={handleClick}
      >
        {children}
      </a>
      {macAssets && (
        <div id={menuId} className="platform-download-menu" role="menu" aria-label={ariaLabel}>
          <a className="platform-download-option" role="menuitem" href={macAssets.arm64.browser_download_url} ref={element => {
            firstOptionRef.current = element;
            optionRefs.current[0] = element;
          }}>
            <span>{appleSiliconLabel}</span><small>DMG</small>
          </a>
          <a className="platform-download-option" role="menuitem" href={macAssets.x64.browser_download_url} ref={element => { optionRefs.current[1] = element; }}>
            <span>{intelLabel}</span><small>DMG</small>
          </a>
        </div>
      )}
    </div>
  );
}
