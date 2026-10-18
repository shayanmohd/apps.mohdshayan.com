# Bundled art and sound: sources and licences

Every bundled asset is CC0 (Kenney) or SIL OFL 1.1 (fonts). Nothing is downloaded at runtime.

## Sprites: Kenney 1-Bit Pack 1.2, CC0

Source: https://kenney.nl/assets/1-bit-pack. Licence text: `Kenney-1-Bit-Pack-License.txt`.
`app/src/main/res/drawable-nodpi/sprite_atlas.png` is built by `tools/build_atlas.py` from
`Tilesheet/monochrome-transparent.png` (16 px tiles, 1 px gap), one tile per entry, forced to white so
the app tints it with theme tokens. Tiles (name, column, row): raider 25,0; runner 29,4; brute 30,6;
shieldbearer 28,0; swarmling 31,5; digger 26,4; jumper 24,3; flyer 26,8; oilskin 24,2; frostborn 31,2;
sapper 28,2; warlord 28,3; ember 28,11; frost 28,12; snare 2,15; oil 15,10; pusher 28,21; dart 35,5;
hammer 37,7; grinder 45,16; keep 43,20; rocks 20,5 and 19,5 and 0,2.

Drawn in code, not from any pack: spike plate, deadfall, walls, gates, route thread, combo links, the
Home maze strip, the launcher icon and the feature graphic.

## Sounds: Kenney Impact Sounds 1.0 and Interface Sounds 1.0, CC0

Sources: https://kenney.nl/assets/impact-sounds and https://kenney.nl/assets/interface-sounds.
Licence texts: `Kenney-Impact-Sounds-License.txt`, `Kenney-Interface-Sounds-License.txt`.
Files are copied byte for byte (verified by MD5) and renamed:

| app/src/main/res/raw | pack file |
|---|---|
| sfx_break.ogg | Impact Sounds, Audio/impactWood_heavy_000.ogg |
| sfx_combo.ogg | Interface Sounds, Audio/glass_002.ogg |
| sfx_dart.ogg | Impact Sounds, Audio/impactWood_light_000.ogg |
| sfx_deadfall.ogg | Impact Sounds, Audio/impactPlate_heavy_000.ogg |
| sfx_fire.ogg | Impact Sounds, Audio/impactSoft_medium_000.ogg |
| sfx_hammer.ogg | Impact Sounds, Audio/impactMetal_heavy_000.ogg |
| sfx_invalid.ogg | Interface Sounds, Audio/error_004.ogg |
| sfx_kill.ogg | Impact Sounds, Audio/impactPunch_medium_000.ogg |
| sfx_leak.ogg | Interface Sounds, Audio/bong_001.ogg |
| sfx_lost.ogg | Interface Sounds, Audio/error_006.ogg |
| sfx_place.ogg | Interface Sounds, Audio/drop_002.ogg |
| sfx_spike.ogg | Impact Sounds, Audio/impactMetal_light_000.ogg |
| sfx_tap.ogg | Interface Sounds, Audio/select_002.ogg |
| sfx_wall.ogg | Impact Sounds, Audio/impactMining_000.ogg |
| sfx_wave.ogg | Interface Sounds, Audio/maximize_004.ogg |
| sfx_won.ogg | Interface Sounds, Audio/confirmation_002.ogg |

## Fonts: SIL Open Font License 1.1

Bungee (https://github.com/djrrb/Bungee), `../OFL-Bungee.txt`.
Lexend (https://github.com/googlefonts/lexend), `../OFL-Lexend.txt`.
