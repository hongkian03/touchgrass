"""Tests for "Seen from space", with the network blocked so they pass offline.

    py space/test_space.py        (or: py -m pytest space/test_space.py)

1. A synthetic GIBS cache (capabilities, colormap, PNGs with known greys) checks the layer choice,
   the radiance mapping, skipping nights with missing pixels, averaging the rest, and the growth math.
2. The real space/cache/, if it has been built (py space/nasa_lights.py): results load offline and
   rebuilding them from the cached images gives the same numbers.
3. GET /space/insight: your_share is null without insights and an estimate with them; every other
   field comes from the cache.
"""

import json
import shutil
import socket
import sys
import tempfile
import urllib.request
from contextlib import contextmanager
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))

from space import nasa_lights  # noqa: E402

REAL_CACHE = nasa_lights.CACHE
LAYER = nasa_lights.LAYER_PREFERENCE[0]


@contextmanager
def no_network():
    def refuse(*args, **kwargs):
        raise AssertionError("tried to reach the network")
    saved = urllib.request.urlopen, socket.create_connection
    urllib.request.urlopen = socket.create_connection = refuse
    try:
        yield
    finally:
        urllib.request.urlopen, socket.create_connection = saved


@contextmanager
def cache_dir(path):
    saved = nasa_lights.CACHE
    nasa_lights.CACHE = Path(path)
    try:
        yield
    finally:
        nasa_lights.CACHE = saved


def png(grey, size, missing_share=0.0):
    """A GIBS-like RGBA PNG: one grey level, with the first missing_share of pixels transparent."""
    w, h = size
    a = np.zeros((h * w, 4), dtype=np.uint8)
    a[:, :3], a[:, 3] = grey, 255
    a[: int(missing_share * h * w), 3] = 0
    out = tempfile.SpooledTemporaryFile()
    Image.fromarray(a.reshape(h, w, 4), "RGBA").save(out, "PNG")
    out.seek(0)
    return out.read()


def synthetic_cache(root):
    """June–August of 2012 and 2020 are full years in the layer range. Greys 7 (0.05), 13 (0.15),
    255 (saturated, 38.2). 2012-06-01 is half missing, so only 2012-06-02 and 2012-06-03 are averaged."""
    root.mkdir(parents=True, exist_ok=True)
    (root / "capabilities.xml").write_text(f"""<?xml version="1.0"?>
<WMS_Capabilities xmlns="http://www.opengis.net/wms" version="1.3.0"><Capability><Layer>
 <Layer><Name>VIIRS_SNPP_DayNightBand</Name><Dimension name="time">2012-03-01/2026-01-01/P1D</Dimension></Layer>
 <Layer><Name>{LAYER}</Name><Dimension name="time">2012-06-01/2012-06-03/P1D,2020-06-01/2020-08-31/P1D</Dimension></Layer>
 <Layer><Name>Something_Else</Name><Dimension name="time">2000-01-01/2001-01-01/P1D</Dimension></Layer>
</Layer></Capability></WMS_Capabilities>""", encoding="utf-8")
    (root / "colormap_VIIRS_DayNightBand_At_Sensor_Radiance.xml").write_text("""<?xml version="1.0"?>
<ColorMaps>
 <ColorMap title="No Data"><Entries><ColorMapEntry rgb="0,0,160" transparent="true" value="[-999.9,-999.9]" nodata="true"/></Entries></ColorMap>
 <ColorMap title="Radiance" units="nW/(cm² sr)"><Entries>
  <ColorMapEntry rgb="7,7,7" transparent="false" value="[0,0.1)"/>
  <ColorMapEntry rgb="13,13,13" transparent="false" value="[0.1,0.2)"/>
  <ColorMapEntry rgb="255,255,255" transparent="false" value="[38.2,999999.0)"/>
 </Entries></ColorMap>
</ColorMaps>""", encoding="utf-8")
    greys = {"2012-06-01": (7, 0.5), "2012-06-02": (7, 0.0), "2012-06-03": (7, 0.0),
             "2020-06-01": (13, 0.0), "2020-06-02": (13, 0.0)}
    for region in nasa_lights.REGIONS:
        for box_id, box in region["boxes"].items():
            url = nasa_lights.image_url(LAYER, "2012-06-01", box)
            w = int(url.split("WIDTH=")[1].split("&")[0])
            h = int(url.split("HEIGHT=")[1].split("&")[0])
            for day, (grey, missing) in greys.items():
                grey = 255 if region["id"] == "phoenix" and day.startswith("2020-") else grey
                (root / f"{LAYER}_{day}_{box_id}.png").write_bytes(png(grey, (w, h), missing))


def test_synthetic_cache():
    tmp = Path(tempfile.mkdtemp(prefix="space_test_"))
    try:
        synthetic_cache(tmp)
        with no_network(), cache_dir(tmp):
            results = nasa_lights.load_or_build(offline=True)
            assert (tmp / "results.json").is_file()
            again = nasa_lights.load_or_build(offline=True)
        assert results["layer"] == LAYER, results["layer"]
        assert results["layer_dates"] == {"first": "2012-06-01", "last": "2020-08-31"}
        assert results["season"] == {"months": [6, 7, 8], "first_year": 2012, "last_year": 2020}
        by_id = {r["id"]: r for r in results["regions"]}
        assert set(by_id) == {"northern_virginia", "phoenix", "oregon"}
        va = by_id["northern_virginia"]
        assert va["earliest"]["date"] == "2012-06/2012-08"
        assert va["earliest"]["nights"] == 2, "should skip the half-missing 2012-06-01"
        assert va["earliest"]["dates"] == ["2012-06-02", "2012-06-03"]
        assert va["latest"]["date"] == "2020-06/2020-08" and va["latest"]["nights"] == 2
        assert va["earliest"]["brightness"] == 0.05 and va["latest"]["brightness"] == 0.15
        assert va["growth_pct"] == 200.0, va["growth_pct"]
        assert by_id["phoenix"]["latest"]["brightness"] == 38.2
        assert by_id["phoenix"]["latest"]["saturated_share"] == 1.0
        assert len(by_id["oregon"]["latest"]["images"]) == 2
        assert all("gibs.earthdata.nasa.gov" in img["url"] and f"LAYERS={LAYER}" in img["url"]
                   for r in results["regions"] for d in ("earliest", "latest") for img in r[d]["images"])
        assert again == results
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_offline_miss_raises():
    tmp = Path(tempfile.mkdtemp(prefix="space_test_"))
    try:
        with no_network(), cache_dir(tmp):
            try:
                nasa_lights.load_or_build(offline=True)
            except nasa_lights.OfflineMiss:
                return
        raise AssertionError("an empty cache in offline mode should raise OfflineMiss")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_real_cache():
    if not (REAL_CACHE / "results.json").is_file():
        print("  (skipped: space/cache/ not built; run py space/nasa_lights.py once)")
        return
    tmp = Path(tempfile.mkdtemp(prefix="space_test_"))
    try:
        with no_network():
            cached = nasa_lights.load_or_build(offline=True)
            for f in REAL_CACHE.iterdir():  # rebuild from the cached files, without results.json
                if f.name != "results.json":
                    shutil.copy(f, tmp / f.name)
            with cache_dir(tmp):
                rebuilt = nasa_lights.build(offline=True)
        assert cached["layer"] == rebuilt["layer"]
        for a, b in zip(cached["regions"], rebuilt["regions"]):
            assert a["growth_pct"] == b["growth_pct"], (a["id"], a["growth_pct"], b["growth_pct"])
            assert a["earliest"]["date"] == b["earliest"]["date"] and a["latest"]["date"] == b["latest"]["date"]
        for r in cached["regions"]:
            print(f"  {r['id']}: {r['earliest']['date']} ({r['earliest']['nights']} nights) "
                  f"{r['earliest']['brightness']} -> {r['latest']['date']} "
                  f"({r['latest']['nights']} nights) {r['latest']['brightness']} ({r['growth_pct']:+}%)")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_endpoint():
    from fastapi.testclient import TestClient

    from backend import main

    tmp = Path(tempfile.mkdtemp(prefix="space_test_"))
    saved = main.store.latest_succeeded, main.executor.insights_path
    try:
        cache = REAL_CACHE
        if not (REAL_CACHE / "results.json").is_file():
            synthetic_cache(tmp / "cache")
            cache = tmp / "cache"
        insights = tmp / "insights.json"
        insights.write_text(json.dumps({"totals": {"exchanges": 12, "energy_wh": {"low": 2.0, "high": 8.0}}}),
                            encoding="utf-8")
        client = TestClient(main.app)
        with no_network(), cache_dir(cache):
            main.store.latest_succeeded = lambda kind: None
            empty = client.get("/space/insight")
            main.store.latest_succeeded = lambda kind: "testjob"
            main.executor.insights_path = lambda job_id: insights
            full = client.get("/space/insight")
        assert empty.status_code == 200 and empty.json()["your_share"] is None
        body = full.json()
        assert full.status_code == 200 and len(body["regions"]) == 3
        share = body["your_share"]
        assert share["estimate"] is True and share["job_id"] == "testjob" and share["exchanges"] == 12
        assert share["energy_wh"] == {"low": 2.0, "high": 8.0}
        assert share["campus_seconds"]["low"] == round(2.0 / 100e6 * 3600, 6)
        assert share["line"].startswith("Estimate:")
        for r in body["regions"]:
            for d in ("earliest", "latest"):
                assert r[d]["date"] and r[d]["brightness"] is not None and r[d]["images"] and r[d]["nights"] >= 1
            assert "growth_pct" in r and r["name"]
    finally:
        main.store.latest_succeeded, main.executor.insights_path = saved
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    failed = 0
    for name, fn in [(k, v) for k, v in dict(globals()).items() if k.startswith("test_")]:
        try:
            fn()
            print(f"PASS  {name}")
        except Exception as e:
            failed += 1
            print(f"FAIL  {name}: {type(e).__name__}: {e}")
    sys.exit(1 if failed else 0)
