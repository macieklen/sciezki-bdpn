"""
Buduje podkład mapy (PMTiles) dla obszaru parku z danych OpenStreetMap.

    python map/build_map.py               # z katalogu repozytorium
    python map/build_map.py --buffer 3000 --maxzoom 15

Kroki:
 1. granica parku (Shapefile, EPSG:2180) + bufor → wielokąt przycięcia (.poly) i zasięg,
 2. pobranie wycinka OSM (Geofabrik, województwo podkarpackie) i Planetilera — raz, do map/.cache,
 3. Planetiler z własnym schematem (map/schema.yml) → map/out/bdpn.pmtiles.

Wymaga: Python 3.10+ (pyshp, pyproj, shapely), Java 21+.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

import shapefile
from pyproj import Transformer
from shapely.geometry import MultiPolygon, Polygon, shape
from shapely.ops import transform, unary_union

HERE = Path(__file__).resolve().parent
CACHE = HERE / ".cache"
OUT = HERE / "out"

# Lustro OSM France (Geofabrik: https://download.geofabrik.de/europe/poland/podkarpackie-latest.osm.pbf)
OSM_URL = "https://download.openstreetmap.fr/extracts/europe/poland/podkarpackie-latest.osm.pbf"
PLANETILER_URL = "https://github.com/onthegomap/planetiler/releases/latest/download/planetiler.jar"


def download(url: str, target: Path) -> None:
    if target.exists():
        return
    print(f"Pobieram {url} …")
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".part")
    with urllib.request.urlopen(url) as r, open(tmp, "wb") as f:
        shutil.copyfileobj(r, f)
    tmp.rename(target)


def clip_area(boundary: Path, buffer_m: float) -> MultiPolygon | Polygon:
    """Granica parku z buforem, w WGS84."""
    reader = shapefile.Reader(str(boundary))
    park = unary_union([shape(s.__geo_interface__) for s in reader.shapes()])
    area = park.buffer(buffer_m).simplify(25)
    to_wgs = Transformer.from_crs(2180, 4326, always_xy=True).transform
    return transform(to_wgs, area)


def write_poly(geom: Polygon | MultiPolygon, path: Path) -> None:
    """Format .poly (Osmosis), którego Planetiler używa do przycięcia kafelków."""
    polys = list(geom.geoms) if isinstance(geom, MultiPolygon) else [geom]
    lines = ["bdpn"]
    for i, p in enumerate(polys, 1):
        lines.append(str(i))
        lines += [f"   {x:.7f}   {y:.7f}" for x, y in p.exterior.coords]
        lines.append("END")
        for j, hole in enumerate(p.interiors, 1):
            lines.append(f"!{i}_{j}")
            lines += [f"   {x:.7f}   {y:.7f}" for x, y in hole.coords]
            lines.append("END")
    lines.append("END")
    path.write_text("\n".join(lines) + "\n")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--boundary", type=Path, default=HERE / "data" / "granica_bdpn_uproszczona.shp")
    ap.add_argument("--buffer", type=float, default=2000, help="bufor wokół granicy parku [m]")
    ap.add_argument("--maxzoom", type=int, default=15)
    ap.add_argument("--out", type=Path, default=OUT / "bdpn.pmtiles")
    args = ap.parse_args()
    args.out = args.out.resolve()
    args.boundary = args.boundary.resolve()
    if not args.boundary.with_suffix(".prj").exists():
        print(f"Brak pliku {args.boundary.with_suffix('.prj').name} z układem współrzędnych granicy.", file=sys.stderr)
        return 1

    if not shutil.which("java"):
        print("Brak Javy (wymagana wersja 21+). Zainstaluj np. Temurin 21.", file=sys.stderr)
        return 1

    osm = CACHE / "podkarpackie.osm.pbf"
    jar = CACHE / "planetiler.jar"
    download(OSM_URL, osm)
    download(PLANETILER_URL, jar)

    area = clip_area(args.boundary, args.buffer)
    poly = CACHE / "obszar.poly"
    write_poly(area, poly)
    w, s, e, n = area.bounds
    print(f"Obszar: {w:.4f},{s:.4f},{e:.4f},{n:.4f} (bufor {args.buffer:.0f} m)")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "java", "-Xmx2g", "-jar", str(jar), "generate-custom",
        f"--schema={HERE / 'schema.yml'}",
        f"--osm_path={osm}",
        f"--boundary_path={args.boundary}",
        f"--polygon={poly}",
        f"--bounds={w},{s},{e},{n}",
        f"--maxzoom={args.maxzoom}",
        f"--output={args.out}",
        f"--tmpdir={CACHE / 'tmp'}",
        "--force",
    ]
    r = subprocess.run(cmd, cwd=HERE)
    if r.returncode != 0:
        return r.returncode
    size = args.out.stat().st_size
    print(f"\nGotowe: {args.out} — {size / 1e6:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
