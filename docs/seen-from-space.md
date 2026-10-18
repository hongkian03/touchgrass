# Seen from space

Night-lights growth over three data-center regions from [NASA GIBS](https://gibs.earthdata.nasa.gov), plus an optional `your_share` next to the user's latest insights.

Code: [`space/nasa_lights.py`](../space/nasa_lights.py). Test: [`space/test_space.py`](../space/test_space.py). Endpoint: `GET /space/insight`.

## Data

Free, no key. We read WMS GetCapabilities and take the first preferred layer that exists. Today that is **`VIIRS_SNPP_GapFilled_BRDF_Corrected_DayNightBand_Radiance`** (VIIRS on Suomi NPP, Day/Night Band; NASA Black Marble VNP46A2). Valid dates from the layer time dimension. Pixels map to radiance via the GIBS colormap (nW/(cm² sr)).

For each region we average the clearest June–August nights in 2012 and in 2026 (first and latest full years in the layer). Drop a night if any box has under 90% valid pixels. Growth = (latest − earliest) / earliest.

| Region | 2012 Jun–Aug | 2026 Jun–Aug | Growth |
| --- | --- | --- | --- |
| Northern Virginia (Loudoun / "Data Center Alley") | 14.4 | 20.0 | **+38.8%** |
| Phoenix metro | 19.5 | 22.2 | **+13.8%** |
| Oregon (The Dalles + Hillsboro, pooled) | 12.1 | 12.8 | **+5.2%** |

Brightness is mean radiance. Boxes are about 220 m per pixel. See [`nasa_lights.py`](../space/nasa_lights.py) for exact west/south/east/north bounds.

## `your_share`

Takes totals from the latest insights (same file as `/insights/latest`, via [`footprint.py`](../backend/footprint.py)) and states the user's energy, water, and us-east CO₂ next to how many seconds a 100 MW campus takes to draw the same energy. Marked `"estimate": true`. With no insights yet, `your_share` is `null`. While `footprint.py` is placeholder ranges, the response says so.

## Caching

Everything NASA returns lives in `space/cache/` (gitignored). Rebuild:

```sh
py space/nasa_lights.py          # delete cache/ first for a full rebuild
py space/nasa_lights.py --offline  # refuse network
py space/test_space.py             # network blocked; synthetic + real-cache checks
```

## Honest limits

Night-light growth is a **proxy** for data-center growth, not a measurement of it. Homes, roads, warehouses, and LED street-light changes brighten the same boxes. Clouds, moonlight, and the colormap still move the number. A chunk of pixels sit in the open top bin, so growth in the brightest cores is understated. Treat the percentages as a picture of change, not as a count of new facilities.
