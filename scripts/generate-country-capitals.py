"""Bundle capital/admin-seat coordinates: GeoNames cities15000.zip + REST Countries JSON.
Usage: python3 scripts/generate-country-capitals.py cities15000.zip countriesV3.1.json
Sources and attribution: README.md. No runtime network dependency.
"""
import json
from pathlib import Path
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
with zipfile.ZipFile(sys.argv[1]) as archive:
    rows = [line.split('\t') for line in archive.read('cities15000.txt').decode().splitlines()]
rest = {row['cca2']: row for row in json.loads(Path(sys.argv[2]).read_text())}
capitals = {row[8]: row for row in rows if row[7] == 'PPLC'}
# Administrative seats not classified as PPLC in GeoNames.
for code, name in {'EH': 'Laayoune', 'IL': 'Jerusalem', 'PS': 'Ramallah', 'LK': 'Sri Jayewardenepura Kotte'}.items():
    capitals[code] = next(row for row in rows if row[8] == code and row[1] == name)
path = root / 'web/src/app/shared/data/countries.json'
countries = json.loads(path.read_text())
for country in countries:
    code = country['code']
    row = capitals.get(code)
    capital = None
    if row:
        capital = {'name': row[1], 'latitude': float(row[4]), 'longitude': float(row[5])}
    elif code in ('IO', 'TK'):
        source = rest[code]
        lat, lon = source['capitalInfo']['latlng']
        capital = {'name': source['capital'][0], 'latitude': lat, 'longitude': lon}
    if capital:
        country['capital'] = capital
        # Existing small-territory bounds can exclude their administrative seats.
        west, south, east, north = country['bounds']
        lat, lon = capital['latitude'], capital['longitude']
        if not (west <= lon <= east and south <= lat <= north):
            country['bounds'] = [min(west, lon - .05), min(south, lat - .05), max(east, lon + .05), max(north, lat + .05)]
# Keep bounds compact, matching the existing data file.
text = json.dumps(countries, ensure_ascii=False, indent=2)
import re
text = re.sub(r'"bounds": \[\s*([^\]]+)\]', lambda m: '"bounds": [' + ', '.join(v.strip() for v in m[1].split(',')) + ']', text)
path.write_text(text + '\n')
print(f'Bundled {sum("capital" in c for c in countries)} capitals/admin seats')
