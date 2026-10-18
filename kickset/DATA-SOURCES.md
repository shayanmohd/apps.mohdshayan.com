# Kickset table data sources

Every dimension bundled in `app/src/main/assets/tables/` was transcribed column by column from one published
manufacturer catalogue and compared with a second. The comparison is code, not a note: `tools/tables/build_tables.py`
holds each catalogue's column separately and writes a value to the JSON only when two catalogues agree (inch values
within 0.007 in, which absorbs two-decimal rounding of a 1/16 or 1/32 fraction). When two disagree, a third catalogue
must side with one of them, or the value is dropped. The app shows the same list on its Table sources screen.

Inch values are the published fractions. Millimetres are inch x 25.4, so they can differ by a fraction of a
millimetre from a metric chart that rounds to whole millimetres. Takeouts used in arithmetic come from the exact
inch fraction, never from the rounded millimetre column. Only dimensional facts are reproduced; no standard text.
Kickset is not affiliated with ASME or with any manufacturer named here.

## ASME B16.9 butt-weld fittings (90 LR, 90 SR, 45 LR, straight tee, concentric reducer)

| Source | Publication | Pages used | URL |
|---|---|---|---|
| Weldbend Corporation | Carbon Steel Weld Fitting and Weld Flange Catalog, 63rd edition, 2010 | 26, 29 to 37, 38, 49, 62 to 68 (schedule STD tables) | https://www.weldbend.com/catalog.pdf |
| Hackney Ladish, Inc. | Dimension Data, Straight Fitting Dimensions and Reducing Fittings, 2006 | 1 and 5 | https://www.hackneyladish.com/documents/AllData.pdf |

Coverage: NPS 1/2 to 24 (90 SR from NPS 1, reducers from NPS 3/4 by large end). NPS 22 is dropped: only Hackney
Ladish lists it. Reducer takeout is the end-to-end length H, measured to the far end of the reducer.

## ASME B16.11 socket-weld fittings, Class 3000 (90 elbow, 45 elbow, tee, coupling)

| Source | Publication | Pages used | URL |
|---|---|---|---|
| Bonney Forge | Forged Steel Fittings and Unions | 6, 7, 8, 14 | https://cad.bonneyforge.com/Asset/Forged-Steel-Fittings-and-Unions.pdf |
| Anvil International | Pipe Fittings catalogue, Forged Steel Fittings, Class 3000 Socket Weld, figures 2150, 2151, 2152, 2154 | 100 to 102 | https://www.apsupplies.com/wp-content/uploads/anvil-fittings.pdf |

Coverage: NPS 1/8 to 4. Dimension is centre to bottom of socket; a coupling's value is the gap between its socket
bottoms, and each side takes half.

## ASME B36.10M and B36.19M pipe walls

| Source | Publication | Pages used | URL |
|---|---|---|---|
| Weldbend Corporation | Carbon Steel Weld Fitting and Weld Flange Catalog, Dimensions of Steel Pipe, 2010 | 138 to 143 | https://www.weldbend.com/catalog.pdf |
| Hackney Ladish, Inc. | Dimension Data, Common Diameters and Wall Thicknesses, 2006 | 4 | https://www.hackneyladish.com/documents/AllData.pdf |
| Sandvik | Tube and pipe catalogue 2009, stainless steel pipe size and weight chart (ASTM B36.10 / B36.19) | 28 | https://www.salaty.com.my/wp-content/uploads/pdf/SANDVIK/PDS/Sandvik%20Tube-pipe%20Cat2009C.pdf |

Schedules 20 to 160, STD, XS and XXS are Weldbend against Hackney Ladish. Sch 10 is Weldbend against Sandvik's 10S
column (NPS 12 and below, where the walls are the same) and its Sch 10 column (NPS 14 and up). Coverage NPS 1/2 to
24 without 22. Weight is computed, not tabulated: kg/m = 0.0246615 x (D - t) x t (the B36.10M plain-end formula),
checked in a unit test against Weldbend's printed lb/ft for NPS 6 Sch 80.

## ASME B16.5 flange bolting, Class 150 and 300

| Source | Publication | Pages used | URL |
|---|---|---|---|
| Weldbend Corporation | Carbon Steel Weld Fitting and Weld Flange Catalog, 2010 | 86 (Class 150), 88 (Class 300) | https://www.weldbend.com/catalog.pdf |
| USA Fastener (MW Components) | Bolt Reference Charts for ASME B16.5 Flanges | 1 | https://info.mwcomponents.com/hubfs/PDFs/MW-COMPONENTS/MWC-Product-Resources-and-Technical-Data-PDFs/USA_Fastener_ASME_B16.5_Flange_Charts.pdf |
| Coastal Flange | Online catalogue, ANSI B16.5 Class 150 and Class 300 welding neck flanges (bolt circle and hole count, tie-break only) | item tables | https://catalog.coastalflange.com/category/ansi-b16-5-class-150-flanges |

Bolt count, stud diameter, bolt circle and raised-face stud length for NPS 1/2 to 24 without 22. No torque values.

## Cross-check log (output of tools/tables/build_tables.py)

```
B16.9 90 LR NPS 22: dropped, only one source or disagreement (None vs 33.00)
B16.9 90 SR NPS 22: dropped, only one source or disagreement (None vs 22.00)
B16.9 45 LR NPS 22: dropped, only one source or disagreement (None vs 13.50)
B16.9 tee NPS 22: dropped, only one source or disagreement (None vs 16.50)
B16.9 reducer NPS 22: dropped, only one source or disagreement (None vs 20)
B16.5 150 bolt circle NPS 10: sources disagree (14.25 vs 14 3/4), third source 14.25 confirms 14.25
B16.5 300 bolt circle NPS 16: sources disagree (22.50 vs 20 1/2), third source 22.50 confirms 22.5
B36.10M NPS 2 Sch XXS: sources disagree (Weldbend 0.436, Hackney 0.438), Sandvik 11.07 mm confirms 0.436
B36.10M NPS 3 1/2 Sch XXS: dropped (Weldbend None, Hackney 0.636)
counts: {'BW_90LR': 20, 'BW_90SR': 18, 'BW_45LR': 20, 'BW_TEE': 20, 'BW_REDUCER': 19, 'SW_90': 12, 'SW_45': 12, 'SW_TEE': 12, 'SW_COUPLING': 12} {150: 20, 300: 20} 184 pipe walls
```
