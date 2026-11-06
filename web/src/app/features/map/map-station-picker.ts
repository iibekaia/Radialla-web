import { LocalizationService } from '../../core/localization/localization.service';
import { Station } from '../../shared/models/station';
import type { Map as LeafletMap, Popup } from 'leaflet';

/** Keep the card on screen without panning the map or triggering area playback. */
export function fitStationPicker(popup: Popup, map: LeafletMap) {
  const element = popup.getElement();
  if (!element) return;
  element.style.translate = '';
  const card = element.getBoundingClientRect();
  const viewport = map.getContainer().getBoundingClientRect();
  const inset = 12;
  const x = Math.max(
    viewport.left + inset - card.left,
    Math.min(0, viewport.right - inset - card.right),
  );
  const y = Math.max(
    viewport.top + inset - card.top,
    Math.min(0, viewport.bottom - inset - card.bottom),
  );
  element.style.translate = `${x}px ${y}px`;
  element.classList.toggle('is-repositioned', x !== 0 || y !== 0);
}

/** DOM content for Leaflet's popup, independent of marker placement and map navigation. */
export function createStationPicker(
  stations: Station[],
  active: string | undefined,
  title: string,
  notice: string,
  i18n: LocalizationService,
  select: (station: Station) => void,
) {
  const content = document.createElement('section');
  content.className = 'map-station-picker';
  const header = document.createElement('header');
  header.className = 'map-picker-header';
  const heading = document.createElement('h2');
  heading.textContent = title;
  const count = document.createElement('span');
  count.className = 'map-picker-count';
  count.textContent = i18n.t('%@ რადიოსადგური', stations.length);
  header.append(heading, count);
  content.append(header);

  if (notice) {
    const note = document.createElement('p');
    note.className = 'map-picker-notice';
    note.textContent = notice;
    content.append(note);
  }

  const list = document.createElement('div');
  list.className = 'map-picker-list';
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', i18n.t('stations'));
  for (const station of stations) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'map-picker-station';
    button.title = station.name;
    if (station.id === active) button.setAttribute('aria-current', 'true');

    const avatar = document.createElement('span');
    avatar.className = 'map-picker-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = Array.from(station.name.trim())[0]?.toLocaleUpperCase() || '♪';

    const info = document.createElement('span');
    info.className = 'map-picker-info';
    const name = document.createElement('strong');
    name.textContent = station.name;
    const detail = document.createElement('span');
    detail.textContent = [
      station.frequency ? `${station.frequency} FM` : '',
      station.genre || i18n.country(station.country, station.countryCode),
    ]
      .filter(Boolean)
      .join(' · ');
    info.append(name, detail);

    const play = document.createElement('span');
    play.className = 'map-picker-play';
    play.setAttribute('aria-hidden', 'true');
    button.append(avatar, info, play);
    button.addEventListener('click', () => select(station));
    list.append(button);
  }
  content.append(list);
  return content;
}
