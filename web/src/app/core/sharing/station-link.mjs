export function stationIdFromLink(href) {
  try {
    const id = new URL(href).searchParams.get('station');
    return id && id.trim() && id.length <= 200 ? id : null;
  } catch {
    return null;
  }
}

export function stationLink(href, id) {
  const url = new URL(href);
  url.searchParams.set('station', id);
  return url.href;
}

export function facebookShareLink(url) {
  const share = new URL('https://www.facebook.com/sharer/sharer.php');
  share.searchParams.set('u', url);
  return share.href;
}

export async function copyStationLink(url, browser = navigator) {
  try {
    await browser.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'manual';
  }
}

export async function shareStationLink(url, title, browser = navigator) {
  if (browser.share) {
    try {
      await browser.share({ title, url });
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
    }
  }
  return copyStationLink(url, browser);
}
