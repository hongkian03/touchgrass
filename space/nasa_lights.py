"""Seen from space: night-lights growth over three data center regions, from NASA GIBS.

    py space/nasa_lights.py            build (or load) space/cache/results.json and print it
    py space/nasa_lights.py --offline  use only space/cache/, fail if something is missing

GIBS (gibs.earthdata.nasa.gov) is NASA's free imagery service; it needs no key. We read its WMS
GetCapabilities, pick the best nighttime lights layer that is actually listed (LAYER_PREFERENCE),
and take its time dimension. For each region we average the clearest June–August nights in the
first full year of data and in the most recent full year, so both ends use the same season. Each
grey pixel is mapped back to radiance with the layer's GIBS colormap. Growth is
(latest - earliest) / earliest.

Everything NASA returns is cached in space/cache/ (capabilities, colormap, images, results.json),
so NASA is called at most once and the demo works offline afterwards. Delete the folder to refetch.

Brightness growth is a proxy for data center growth, not a measurement of it: housing, roads,
warehouses, lighting changes, snow, clouds, moonlight and sensor differences all move it too.
"""

import argparse
import io
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

CACHE = Path(__file__).resolve().parent / "cache"
WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
COLORMAPS = "https://gibs.earthdata.nasa.gov/colormaps/v1.3/"
TIMEOUT = 60
# Best first. VNP46A2 (gap-filled, BRDF and moonlight corrected) is the daily product closest to
# Black Marble quality with a 2012-today record; Black Marble itself is an annual composite but
# GIBS only has 2012 and 2016, before the recent data center build-out; raw Day/Night Band last.
LAYER_PREFERENCE = [
    "VIIRS_SNPP_GapFilled_BRDF_Corrected_DayNightBand_Radiance",
    "VIIRS_NOAA20_GapFilled_BRDF_Corrected_DayNightBand_Radiance",
    "VIIRS_Black_Marble",
    "VIIRS_SNPP_DayNightBand_At_Sensor_Radiance",
    "VIIRS_SNPP_DayNightBand",
]
# A night is used only if at least this share of its pixels has data in every box; otherwise it
# is treated as mostly missing or cloud-filled and dropped from the average.
MIN_VALID_SHARE = 0.9
# Same months on both ends, so season (snow, vegetation, sun angle) is not compared across years.
SEASON_MONTHS = (6, 7, 8)  # June–August
PIXELS_PER_DEGREE = 500  # about 220 m per pixel; VIIRS DNB is about 500 m

# Boxes are (west, south, east, north) in degrees. A region with two boxes is averaged over both,
# weighted by pixel count.
REGIONS = [
    {"id": "northern_virginia", "name": "Northern Virginia (Loudoun County, \"Data Center Alley\")",
     "boxes": {"ashburn": (-77.60, 38.93, -77.40, 39.08)}},
    {"id": "phoenix", "name": "Phoenix metro",
     "boxes": {"phoenix": (-112.40, 33.20, -111.60, 33.65)}},
    {"id": "oregon", "name": "Oregon (The Dalles and Hillsboro)",
     "boxes": {"the_dalles": (-121.25, 45.57, -121.10, 45.65),
               "hillsboro": (-123.02, 45.49, -122.87, 45.58)}},
]

NS = {"wms": "http://www.opengis.net/wms"}


class OfflineMiss(RuntimeError):
    """Offline mode and the file isn't in the cache."""


def fetch(url, cache_name, offline=False):
    """Bytes for url, from space/cache/<cache_name> if present, else downloaded once and saved."""
    path = CACHE / cache_name
    if path.is_file():
        return path.read_bytes()
    if offline:
        raise OfflineMiss(f"{cache_name} is not in {CACHE}")
    req = urllib.request.Request(url, headers={"User-Agent": "PromptPrint-space/1.0"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        data = resp.read()
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return data


def capabilities(offline=False):
    """{layer name: [(start, end, period), ...]} for every layer with a time dimension."""
    url = WMS + "?" + urllib.parse.urlencode({"SERVICE": "WMS", "REQUEST": "GetCapabilities", "VERSION": "1.3.0"})
    root = ET.fromstring(fetch(url, "capabilities.xml", offline))
    layers = {}
    for layer in root.iter(f"{{{NS['wms']}}}Layer"):
        name = layer.find("wms:Name", NS)
        dim = layer.find("wms:Dimension[@name='time']", NS)
        if name is not None and dim is not None and dim.text:
            layers[name.text] = [tuple(part.split("/")) for part in dim.text.strip().split(",")]
    return layers


def pick_layer(layers):
    for name in LAYER_PREFERENCE:
        if name in layers:
            return name
    found = sorted(n for n in layers if re.search(r"DayNightBand|Black_Marble", n))
    raise RuntimeError(f"no known nighttime lights layer in GIBS capabilities; candidates: {found}")


def dates(ranges):
    """Every valid date of a time dimension, oldest first, as YYYY-MM-DD strings."""
    out = []
    for start, end, period in ranges:
        step = {"P1D": 1, "P1Y": 365, "P1M": 30}.get(period)
        a, b = (datetime.fromisoformat(d[:10]).date() for d in (start, end))
        if step is None or a == b:
            out.append(a.isoformat())
            continue
        for n in range(0, (b - a).days + 1, step):
            out.append(a.fromordinal(a.toordinal() + n).isoformat())
    return sorted(set(out))


def colormap(layer, offline=False):
    """{(r, g, b): radiance} from the layer's GIBS colormap, plus the units. Each bin maps to its
    midpoint; the open top bin (saturated) maps to its lower bound, so bright cores are undercounted."""
    names = [layer, "VIIRS_DayNightBand_At_Sensor_Radiance"]  # the corrected layers share this one
    last = None
    for name in names:
        try:
            xml = fetch(COLORMAPS + name + ".xml", f"colormap_{name}.xml", offline)
            root = ET.fromstring(xml)
            break
        except (OfflineMiss, urllib.error.HTTPError, ET.ParseError) as e:
            last = e
    else:
        raise RuntimeError(f"no GIBS colormap for {layer}: {last}")
    table, units = {}, None
    for cmap in root.iter("ColorMap"):
        for entry in cmap.iter("ColorMapEntry"):
            if entry.get("nodata") == "true" or entry.get("transparent") == "true":
                continue
            units = cmap.get("units")
            low, high = (float(v) for v in re.findall(r"-?[\d.]+", entry.get("value")))
            rgb = tuple(int(c) for c in entry.get("rgb").split(","))
            table[rgb] = low if high > 1e5 else (low + high) / 2
    if not table:
        raise RuntimeError(f"colormap for {layer} has no value entries")
    return table, units


def image_url(layer, date, box):
    west, south, east, north = box
    width = max(16, round((east - west) * PIXELS_PER_DEGREE))
    height = max(16, round((north - south) * PIXELS_PER_DEGREE))
    return WMS + "?" + urllib.parse.urlencode({
        "SERVICE": "WMS", "REQUEST": "GetMap", "VERSION": "1.1.1", "LAYERS": layer, "STYLES": "",
        "SRS": "EPSG:4326", "BBOX": f"{west},{south},{east},{north}", "WIDTH": width, "HEIGHT": height,
        "FORMAT": "image/png", "TRANSPARENT": "TRUE", "TIME": date})


def radiance(png, table):
    """Per-pixel radiance (NaN where there's no data) from a GIBS PNG and its colormap table."""
    rgba = np.asarray(Image.open(io.BytesIO(png)).convert("RGBA")).reshape(-1, 4)
    keys = np.array(list(table), dtype=np.int32)
    values = np.array(list(table.values()))
    out = np.full(len(rgba), np.nan)
    valid = rgba[:, 3] > 0
    # Nearest colormap entry, so a resampled in-between grey still maps to the closest bin.
    dist = np.abs(rgba[valid, None, :3].astype(np.int32) - keys[None]).sum(axis=2)
    out[valid] = values[dist.argmin(axis=1)]
    return out


def season_years(valid):
    """First and most recent full years whose June–August window sits inside the layer's dates."""
    first, last = (date.fromisoformat(valid[0]), date.fromisoformat(valid[-1]))
    years = []
    for year in range(first.year, last.year + 1):
        start, end = date(year, SEASON_MONTHS[0], 1), date(year, SEASON_MONTHS[-1], 31)
        if start >= first and end <= last and season_dates(valid, year):
            years.append(year)
    if not years:
        raise RuntimeError(f"no full June–August year in {valid[0]} .. {valid[-1]}")
    return years[0], years[-1]


def season_dates(valid, year):
    months = {f"{year}-{m:02d}" for m in SEASON_MONTHS}
    return [d for d in valid if d[:7] in months]


def night_brightness(layer, table, day, region, offline):
    """One night's stats, or None if any box is mostly missing or cloud-filled.

    OfflineMiss is swallowed so a rebuild from only the nights already in space/cache/ can skip
    dates that were never saved. Other fetch errors propagate.
    """
    top = max(table.values())
    pixels, images, shares = [], [], []
    for box_id, box in region["boxes"].items():
        url = image_url(layer, day, box)
        try:
            values = radiance(fetch(url, f"{layer}_{day}_{box_id}.png", offline), table)
        except (OfflineMiss, urllib.error.HTTPError, urllib.error.URLError):
            return None
        share = float(np.isfinite(values).mean())
        if share < MIN_VALID_SHARE:
            return None
        pixels.append(values[np.isfinite(values)])
        images.append({"box": box_id, "bbox": list(box), "url": url})
        shares.append(share)
    allpx = np.concatenate(pixels)
    return {"date": day, "brightness": float(allpx.mean()), "pixels": int(allpx.size),
            "saturated_share": float((allpx >= top).mean()), "valid_share": float(np.mean(shares)),
            "images": images}


def region_season_brightness(layer, table, valid, year, region, offline):
    """Mean brightness over the clearest June–August nights of `year` (equal weight per night)."""
    candidates = season_dates(valid, year)
    nights = []
    workers = 1 if offline else 8
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futs = [pool.submit(night_brightness, layer, table, day, region, offline) for day in candidates]
        for fut in as_completed(futs):
            night = fut.result()
            if night:
                nights.append(night)
    if not nights:
        raise RuntimeError(f"{region['id']}: no clear June–August night in {year} among {len(candidates)} dates")
    print(f"  {region['id']} {year}: {len(nights)} clear nights of {len(candidates)}", flush=True)
    # Highest valid-pixel share first; those nights are the least missing / cloud-filled.
    nights.sort(key=lambda n: (-n["valid_share"], n["date"]))
    brightness = float(np.mean([n["brightness"] for n in nights]))
    saturated = float(np.mean([n["saturated_share"] for n in nights]))
    pixels = int(round(float(np.mean([n["pixels"] for n in nights]))))
    preview = nights[0]  # clearest night's GIBS URLs, for the API
    return {
        "date": f"{year}-{SEASON_MONTHS[0]:02d}/{year}-{SEASON_MONTHS[-1]:02d}",
        "year": year,
        "nights": len(nights),
        "dates": [n["date"] for n in sorted(nights, key=lambda n: n["date"])],
        "brightness": round(brightness, 3),
        "pixels": pixels,
        "saturated_share": round(saturated, 3),
        "images": preview["images"],
    }


def build(offline=False):
    layers = capabilities(offline)
    layer = pick_layer(layers)
    valid = dates(layers[layer])
    table, units = colormap(layer, offline)
    early_year, late_year = season_years(valid)
    regions = []
    for region in REGIONS:
        early = region_season_brightness(layer, table, valid, early_year, region, offline)
        late = region_season_brightness(layer, table, valid, late_year, region, offline)
        e, l = early["brightness"], late["brightness"]
        regions.append({"id": region["id"], "name": region["name"], "earliest": early, "latest": late,
                        "growth_pct": round(100 * (l - e) / e, 1) if e > 0 else None})
    months = ", ".join(date(2000, m, 1).strftime("%B") for m in SEASON_MONTHS)
    return {
        "source": "NASA GIBS (gibs.earthdata.nasa.gov), WMS EPSG:4326 'best'",
        "layer": layer,
        "layer_dates": {"first": valid[0], "last": valid[-1]},
        "season": {"months": list(SEASON_MONTHS), "first_year": early_year, "last_year": late_year},
        "brightness_units": f"mean radiance, {units}",
        "method": "Grey pixels mapped to radiance with the layer's GIBS colormap (bin midpoints; the "
                  "saturated top bin counts as its lower bound, so saturated_share of the pixels are "
                  "undercounted and growth in bright cores is understated), averaged over pixels with data. "
                  f"Each end is the mean of the clearest {months} nights in that year (nights with "
                  f"under {MIN_VALID_SHARE:.0%} valid pixels in any box are skipped as missing or "
                  "cloud-filled). nights is how many nights went into that average. "
                  "growth_pct = (latest - earliest) / earliest * 100.",
        "caveat": "Night-light brightness growth is a proxy for data center growth, not a direct "
                  "measurement: homes, roads, warehouses and lighting changes brighten the same boxes.",
        "computed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "regions": regions,
    }


def load_or_build(offline=False):
    """The cached results, or build them (calling NASA only for files not in the cache)."""
    path = CACHE / "results.json"
    if path.is_file():
        return json.loads(path.read_text(encoding="utf-8"))
    results = build(offline)
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    return results


# Illustrative assumption for your_share, not a measured value: one large campus drawing 100 MW.
CAMPUS_MW = 100


def your_share(insights, job_id=None):
    """An estimate putting the user's latest totals (insights.json, from footprint.py) next to one
    data center campus. footprint.py's numbers are placeholder ranges until the real model lands."""
    from backend import footprint

    totals = insights.get("totals") or {}
    wh = totals.get("energy_wh") or {}
    low, high = wh.get("low"), wh.get("high")
    if low is None or high is None:
        return None
    exchanges = totals.get("exchanges")
    campus_s = [w / (CAMPUS_MW * 1e6) * 3600 for w in (low, high)]
    return {
        "estimate": True,
        "footprint_placeholder": bool(getattr(footprint, "PLACEHOLDER", False)),
        "job_id": job_id,
        "exchanges": exchanges,
        "energy_wh": {"low": round(low, 4), "high": round(high, 4)},
        "water_ml": {"low": round(footprint.water_ml(low), 4), "high": round(footprint.water_ml(high), 4)},
        "co2_g_us_east": {"low": round(footprint.co2_g(low, "us-east"), 4),
                          "high": round(footprint.co2_g(high, "us-east"), 4)},
        "campus_mw_assumed": CAMPUS_MW,
        "campus_seconds": {"low": round(campus_s[0], 6), "high": round(campus_s[1], 6)},
        "line": (f"Estimate: your {exchanges} exchanges used about {low:.2g} to {high:.2g} Wh, which a "
                 f"{CAMPUS_MW} MW campus like those in these boxes draws in {campus_s[0]:.1e} to "
                 f"{campus_s[1]:.1e} seconds. From footprint.py"
                 + (" (placeholder ranges, not a real estimate yet)" if getattr(footprint, "PLACEHOLDER", False) else "")
                 + f"; {CAMPUS_MW} MW is an illustrative assumption."),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--offline", action="store_true", help="use only space/cache/")
    args = ap.parse_args()
    results = load_or_build(args.offline)
    print(f"layer: {results['layer']} ({results['layer_dates']['first']} to {results['layer_dates']['last']})")
    season = results.get("season") or {}
    print(f"season: {season.get('first_year')} to {season.get('last_year')}, months {season.get('months')}")
    for r in results["regions"]:
        e, l = r["earliest"], r["latest"]
        print(f"{r['name']}: {e['date']} ({e['nights']} nights) {e['brightness']} -> "
              f"{l['date']} ({l['nights']} nights) {l['brightness']}  growth {r['growth_pct']}%")
    return 0


if __name__ == "__main__":
    sys.exit(main())
