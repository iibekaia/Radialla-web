"""Build geographic country boxes from Natural Earth's public admin-0 GeoJSON.
Usage: python3 scripts/generate-country-regions.py /path/to/ne_110m_admin_0_countries.geojson
Source: https://github.com/nvkelso/natural-earth-vector
These are geographic bounds, not a snapshot of radio stations.
"""
import json
import sys
from pathlib import Path

source = json.loads(Path(sys.argv[1]).read_text())
regions = {}
for feature in source['features']:
    code = feature['properties'].get('ISO_A2_EH')
    if not isinstance(code, str) or len(code) != 2 or not code.isalpha():
        continue
    geometry = feature['geometry']
    polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
    boxes = regions.setdefault(code, [])
    for polygon in polygons:
        points = polygon[0]
        west, east = min(p[0] for p in points), max(p[0] for p in points)
        south, north = min(p[1] for p in points), max(p[1] for p in points)
        boxes.append([round(west, 3), round(south, 3), round(east, 3), round(north, 3)])
output = Path(__file__).resolve().parent.parent / 'web/src/app/shared/data/country-regions.json'
output.write_text(json.dumps(regions, separators=(',', ':'), sort_keys=True) + '\n')
print(f'Wrote geographic regions for {len(regions)} countries ({output.stat().st_size} bytes)')
