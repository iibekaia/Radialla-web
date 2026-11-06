export function stationIdFromLink(href: string): string | null;
export function stationLink(href: string, id: string): string;
export function facebookShareLink(url: string): string;
export function copyStationLink(
  url: string,
  browser?: Pick<Navigator, 'clipboard'>,
): Promise<'copied' | 'manual'>;
export function shareStationLink(
  url: string,
  title: string,
  browser?: Pick<Navigator, 'share' | 'clipboard'>,
): Promise<'shared' | 'cancelled' | 'copied' | 'manual'>;
