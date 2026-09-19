# Public lighting and pedestrian activity research

Verified on 2026-09-19. Scope: Virginia Tech Blacksburg campus and nearby town. This research adds public source files and documented extracts; it does not establish current route illumination or live pedestrian activity.

## Usable files

| Candidate | Saved files | Meaning and integration boundary |
| --- | --- | --- |
| OpenStreetMap lighting snapshot | `data/campus/research/lighting/osm-lighting-2026-09-19.json`, `observations.json`, `provenance.json` | Community mapping of lamps and `lit` tags. Suitable for a separately labeled map overlay. No measured lux, operating-status feed, route score, or safety claim. |
| Published 2015 pedestrian-count statistics | `data/campus/research/activity/blacksburg-pedestrian-count-study-2016.pdf`, `historical-pedestrian-summary-2015.json`, `provenance.json` | Four historical site summaries from a verified report table. Suitable for a historical-data panel. No guessed coordinates and no current route activity claim. |

Both provenance files include source URL, capture timestamp, SHA-256, and limitations. Only public infrastructure and aggregate counts were collected; no individual movement traces were used.

## OpenStreetMap lighting

The [Overpass API](https://overpass-api.de/api/interpreter) returned HTTP 200 and 1,179 elements for the bounded request below. The response's OSM base timestamp is `2026-09-19T13:42:17Z`; exact download capture time is in `lighting/provenance.json`. This bbox covers the campus area and central Blacksburg, not the entire municipality.

```overpass
[out:json][timeout:40];
(
  nwr["highway"="street_lamp"](37.205,-80.44,37.245,-80.395);
  nwr["lit"](37.205,-80.44,37.245,-80.395);
);
out meta geom;
```

Verified snapshot totals:

- 54 `highway=street_lamp` objects.
- 1,125 objects with a `lit` tag: 1,027 `yes`, 98 `no`.
- 248 nodes and 931 ways. The normalized file contains 248 points, 926 lines, and 5 explicitly tagged areas represented as polygons.
- 320 source objects are footways. The wider extract also contains roads, bus stops, cycleways, paths, pedestrian areas, and other mapped features; these counts are not a count of illuminated campus paths.

The normalized schema is an array of `{id, kind, lit, geometry, source_url, last_edited_at, source, verification}`. Coordinates use EPSG:4326 in longitude/latitude order. `kind` is `street_lamp` or `lit_tag`; `verification` is always `community_unverified`. Closed ways explicitly tagged `area=yes` become polygons, not route centerlines. Raw OSM tags and source metadata remain in the original response.

Examples that can be inspected directly: [Newman Library bus stop](https://www.openstreetmap.org/node/721634919) is tagged `lit=yes`; this describes the stop, not an entire adjoining route. [Pedestrian area 75792798](https://www.openstreetmap.org/way/75792798) is `lit=yes` and `area=yes`. Its proximity to both demo corridors does not establish lighting along those corridors. Most interior portions of the two stored campus routes have no corroborating lighting geometry in this extract.

Object edit timestamps range from 2017-09-02 to 2026-09-14. An edit timestamp does not identify when lighting was surveyed or when the lighting tag changed. A missing lamp or tag means unknown, not unlit. A mapped lamp does not prove the lamp is working, and `lit=yes` is not a brightness measurement.

Rights: [OpenStreetMap's copyright page](https://www.openstreetmap.org/copyright) identifies the database as ODbL and requires attribution. Display **© OpenStreetMap contributors** with the appropriate link, and retain the ODbL information when distributing the extracted data. Keep this source identifiable alongside official campus GIS data.

## Historical pedestrian counts

[Designing a Bicycle and Pedestrian Traffic Count Program to Estimate Performance Measures on Streets and Sidewalks in Blacksburg, VA](https://rosap.ntl.bts.gov/view/dot/34766), by Hankey, Lu, Mondschein, and Buehler, was published May 31, 2016. The [59-page source PDF](https://rosap.ntl.bts.gov/view/dot/34766/dot_34766_DS1.pdf) downloaded successfully. It describes 101 count sites in 2015: four continuous reference sites and 97 short-duration sites.

Table 16, printed page 34 / PDF page 41, was checked in extracted text and visually against a rendered page. The saved four-record JSON contains only its pedestrian rows:

| Site | Observed days in 2015 | Mean daily count | Median daily count | IQR | Standard deviation |
| --- | ---: | ---: | ---: | ---: | ---: |
| Draper Road | 263 | 103 | 96 | 47 | 41 |
| College Avenue | 225 | 4,424 | 4,120 | 3,154 | 2,115 |
| Giles Road | 102 | 168 | 156 | 45 | 51 |
| Huckleberry Trail | 336 | 514 | 502 | 321 | 244 |

These are published descriptive statistics of observed daily counts after the study's counter-processing methods. They are not raw hourly observations, current counts, unique-person counts, or forecasts. The report separately uses model imputation for annual estimates in Table 13; those modeled values were not substituted into this extract. No site coordinates were fabricated. Neither campus demo corridor has a verified count-site join. The report's distribution statement says “No restrictions”; that statement does not establish a license for a separate unavailable raw dataset.

## Official-source search and remaining leads

- [Town GIS data page](https://www.blacksburg.gov/departments/departments-a-k/engineering-and-gis/gis-data) links its current open-data portal and the VT Libraries archive. Directly inspected [town REST catalogs](https://tobmaps.blacksburg.gov/server/rest/services): transportation contains transit and Paths to the Future; Utilities_PublicWorks contains water/sewer-related services; public base layers and recreation services did not expose a street-light or counter layer in the inspected catalogs. `Hosted` and `publicservices` returned ArcGIS 499 “Token Required”; no private data was accessed. This is a bounded discovery result, not proof that the town holds no such data.
- The town's [broadband overview PDF](https://www.blacksburg.gov/home/showpublisheddocument/7368/637504642055870000) includes **Light Pole Locations**, Appendix H, PDF page 29. Search/open text verifies a July 7, 2016 map, VT Electric poles supplied in 2010, AEP poles collected by the town, and an incomplete-inventory caveat. Direct binary download returned HTTP 403 and screenshot retrieval failed, so no pole locations were digitized or imported. It remains a historical inventory lead, not a measured illumination source.
- [Investigating Lighting Quality](https://vtechworks.lib.vt.edu/items/cc47aee1-3278-4f83-93e9-7b791effa888), a 2014 Virginia Tech thesis, downloaded successfully through VTechWorks. It studies survey responses to nighttime campus scenes. The inspected supporting attachment is an IRB approval, not a raw lighting dataset. No current georeferenced lux dataset was located in this item. Subjective scene ratings should not become current route lighting values.
- The [town traffic-impact study lead](https://www.blacksburg.gov/home/showpublisheddocument/13795/638959528730400000) returned HTTP 403 on direct fetch, and web opening also failed during this pass. Its tables were not verified here and no count values were extracted.
- Targeted discovery searches of [Virginia Tech research data](https://data.lib.vt.edu/), VTechWorks, public ArcGIS items, and Figshare did not locate a directly usable current campus pedestrian-counter feed or the complete 2015 site/hour raw dataset in this pass. Broad Figshare searches return many unrelated items; they do not establish repository-wide absence.

## Import recommendation

Expose the OSM observations as **community-mapped lighting**, with provenance and attribution. Preserve validated route illumination as unknown. Show the four site summaries only under **historical pedestrian counts (2015)**. Preserve live/current foot traffic as unavailable.

The remaining requirements for route-level evidence are a maintained public outdoor-light inventory or measured illumination survey, verified route coverage, current lamp operating status if claimed, and public aggregate counters with documented locations, update cadence, quality controls, and reuse rights. Building LED status, buildings, sidewalks, nearby lamps, scheduled events, or transit activity do not by themselves satisfy those requirements.
