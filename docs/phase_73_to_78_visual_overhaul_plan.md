# Visual Overhaul: Procedural Pixel Art → AI-Generated Spritesheet Assets

**Status:** PLAN — all open design questions resolved (§6). Awaiting final go-ahead to begin implementation. No code written.
**Phases:** 73–78 (continues from Phase 72, the highest phase referenced in `src/`).
**Scope:** Replace the runtime-procedural pixel-art system in `src/scenes/BootScene.ts` with real, more-detailed image assets loaded through Phaser's normal texture pipeline. Rendering quality only — no gameplay, scale, camera, or tile-logic change.

---

## 0. Ground truth (verified by reading the code, not assumed)

Several facts differ from what `CLAUDE.md`'s changelog implies. These are what the code actually does today:

| Fact | Value | Source |
|---|---|---|
| `TILE_SIZE` | **32** (not 16) | `src/config/constants.ts:1` |
| Map size | **60 × 45** tiles (not 40×30) | `constants.ts:5-6` |
| Viewport | 960 × 640, `Scale.FIT`, internal res fixed | `gameConfig.ts` |
| Camera zoom range | 0.5 – 2.0 | `constants.ts:135-136` |
| Building count | **34** `BUILDING_DEFINITIONS` entries | `buildingConfig.ts` |
| Terrain tile types | **5** (Dirt, Gravel, Sand, Water, Rock) | `mapConfig.ts` `TileType` |
| External image assets today | **zero** — no `public/` dir exists | verified `ls` |
| Logical pixel grids | Buildings/tiles/vegetation 8×8 per tile → **4px/logical px**; small units 6×6 → **2px/logical px**; camps 8×8 → **3px/logical px** | `BootScene.ts:69-88` |

### The single most important rendering constraint

Buildings and vegetation are placed with `.setOrigin(0, 0)` at `tileX * TILE_SIZE, tileY * TILE_SIZE` and are **never** `setDisplaySize`d or `setScale`d (`MainScene.ts:2883-2891`, `:1276-1278`). They render at **native texture pixel size**. Small units (animals, villagers, cowboys, raiders, wildlife, carts, camps) are placed centred (default origin 0.5) and are also never resized.

**Consequence:** every new image must be authored at *exactly* the current frame dimensions, or the game visually breaks (buildings overhanging their footprint, units the wrong size). This is the hard constraint behind every recommendation below. Section 5(d) covers the mitigation for the resulting "12px is tiny for AI art" problem.

---

## 1. Full asset inventory

Dimensions below are **final on-disk pixel dimensions** — what each generated image must be after downscaling.

### 1a. Buildings — `BUILDING_ATLAS_KEY` (`'buildings-atlas'`)

Frame size = `size.width * 32` × `size.height * 32`.

**1×1 buildings (32×32 px) — 11 types:**

| Building | Frame key |
|---|---|
| Well | `building-Well` |
| House (Tier 1) | `building-House` |
| Road | `building-Road` |
| ChickenFarm | `building-ChickenFarm` |
| Fence | `building-Fence` |
| Gate | `building-Gate` |
| WoodenWall | `building-WoodenWall` |
| WoodenGate (open) | `building-WoodenGate` |
| Granary | `building-Granary` |
| Watchtower | `building-Watchtower` |
| WaterTower | `building-WaterTower` |

*(11 types: Well, House, Road, ChickenFarm, Fence, Gate, WoodenWall, WoodenGate, Granary, Watchtower, WaterTower. 11 + 23 two-by-twos = 34 total, matching `BUILDING_DEFINITIONS`.)*

**2×2 buildings (64×64 px) — 23 types:**
OstrichFarm, Butcher, PigFarm, CowRanch, Warehouse, Supermarket, Barracks, Sewery, Forestry, WoodCutter, PotatoField, Liquor, Saloon, Horsery, Bank, CactusMilker, Quarry, IronMine, CoalMine, Blacksmith, TradingPost, Church, Brothel.

**Extra variant frames (appended, not replacing):**

| Variant | Frame key | Size | Why |
|---|---|---|---|
| House Tier 2 | `building-House-tier2` | 32×32 | `buildingTextureKey(type, tier)` |
| House Tier 3 | `building-House-tier3` | 32×32 | same |
| WoodenGate closed | `building-WoodenGate-closed` | 32×32 | `buildingTextureKey(type, _, false)` |

**Buildings subtotal: 34 base + 3 variants = 37 frames.**

### 1b. Terrain tiles — `TILESET_KEY` (`'tiles-atlas'`)

Consumed as a **Phaser tilemap tileset** (`map.addTilesetImage('tiles', TILESET_KEY, 32, 32, 0, 0)`), so frame *order* is load-bearing: tile index = `TileType` enum value.

| Index | Type | Size |
|---|---|---|
| 0 | Dirt | 32×32 |
| 1 | Gravel | 32×32 |
| 2 | Sand | 32×32 |
| 3 | Water | 32×32 |
| 4 | Rock | 32×32 |

**Terrain subtotal: 5 frames** (see §5e — recommend generating 3 variants each = 15 source images, shipping 5 unless we add variant support).

### 1c. Vegetation — `VEGETATION_ATLAS_KEY` (`'vegetation-atlas'`)

Tile-sized (owns a whole tile), frame keys `vegetation-Tree`, `vegetation-Cactus`.

| Kind | Size |
|---|---|
| Tree | 32×32 |
| Cactus | 32×32 |

**Vegetation subtotal: 2 frames.**

### 1d. Animals — `ANIMALS_ATLAS_KEY` (`'animals-atlas'`)

Frame keys `animal-<AnimalKind>`; `AnimalKind` = `'Chicken' | 'Pig' | 'Cow' | 'Ostrich'`.

All **12×12 px** (`ANIMAL_SPRITE_SIZE = 12`).

**Animals subtotal: 4 frames.**

### 1e. Player units — one atlas each

| Unit | Atlas key | Frame key | Size |
|---|---|---|---|
| Cowboy | `cowboys-atlas` | `cowboy` | 12×12 |
| Cowboy on Horse | `mounted-cowboys-atlas` | `cowboy-on-horse` | **16×12** (non-square) |
| Brawler | `brawlers-atlas` | `brawler` | 12×12 |
| Dynamiter | `dynamiters-atlas` | `dynamiter` | 12×12 |

**Player units subtotal: 4 frames.**

### 1f. Villagers — `VILLAGERS_ATLAS_KEY` (`'villagers-atlas'`)

Single frame `villager`, **12×12 px**.

**Villagers subtotal: 1 frame.** *(Recommendation in §4: generate 3 villager variants as a low-cost visual-variety win — requires a small code change, flagged as optional.)*

### 1g. Raiders — `RAIDERS_ATLAS_KEY` (`'raiders-atlas'`)

Frame keys `raider-<RaiderFaction>`, all **12×12 px**.

| Faction | Frame key |
|---|---|
| Outlaws | `raider-Outlaws` |
| Rustlers | `raider-Rustlers` |
| Coyotes | `raider-Coyotes` |

**Raiders subtotal: 3 frames.**

### 1h. Raider camps — `RAIDER_CAMPS_ATLAS_KEY` (`'raider-camps-atlas'`)

Frame keys `raider-camp-<RaiderFaction>`, all **24×24 px** (`RAIDER_CAMP_SPRITE_SIZE`).

Outlaws / Rustlers / Coyotes — today identical patterns differing only in tent-canvas colour; the new art should differentiate them properly (see §2).

**Raider camps subtotal: 3 frames.**

### 1i. Wildlife — `WILDLIFE_ATLAS_KEY` (`'wildlife-atlas'`)

Frame keys `wildlife-<WildlifeKind>`, all **12×12 px**.

| Kind | Frame key |
|---|---|
| Snake | `wildlife-Snake` |
| Coyote | `wildlife-Coyote` |
| MountainLion | `wildlife-MountainLion` |

Note: wildlife Coyote currently *reuses the raider Coyote pattern object verbatim* (`WILDLIFE_SPRITES.Coyote = COYOTE_SPRITE`). New art should give them distinct treatments (hostile-raid Coyote vs. ambient-wildlife Coyote) or deliberately share one image — a decision to make, flagged in §5.

**Wildlife subtotal: 3 frames.**

### 1j. Goods carts — `CARTS_ATLAS_KEY` (`'carts-atlas'`)

Single frame `goods-cart`, **14×10 px** (non-square).

**Carts subtotal: 1 frame.**

### 1k. Accents / details — `ACCENTS_ATLAS_KEY` (`'accents-atlas'`)

These are pieces **carved out of** their parent building sprite so `MainScene` can tween them independently. Sizes are derived from the pattern dimensions × 4 px (building `PIXEL_SIZE`).

| Accent | Frame key | Size (px) | Origin & motion (must be preserved) |
|---|---|---|---|
| WellCrank | `accent-WellCrank` | 16×4 | `setOrigin(0.5, 0.5)`, rotates ±15° |
| WarehouseDoor | `accent-WarehouseDoor` | 24×24 | `setOrigin(0.5, 0)` top-hinge swing 0→+8° |
| SupermarketAwning | `accent-SupermarketAwning` | 64×8 | `setOrigin(0.5, 0.5)`, `scaleX` sway |
| ChickenDoor | `accent-ChickenDoor` | 16×12 | `setOrigin(0.5, 1)`, `scaleY` 1.0→0.3 flap |
| HouseWindowLight | `accent-HouseWindowLight` | 12×12 | `setOrigin(0, 0)`, alpha-faded at dusk |
| Campfire | `accent-Campfire` | 12×12 | `setOrigin(0, 0)`, `scaleY` flicker + alpha |

**Accents subtotal: 6 frames.**

### 1l. Resource icons — `RESOURCE_ICONS_ATLAS_KEY` (`'resource-icons-atlas'`)

Frame keys `resource-icon-<ResourceKey>`, all **12×12 px**. 15 resources: rawMeat, meat, water, eggs, leather, clothes, logs, wood, potatoes, liquor, agaveJuice, stone, iron, tools, coal.

**Resolved: included, as Phase 78.** Not in the user's original stated scope (buildings/units/animals/wildlife) and they're HUD chrome rather than world art, but the user has confirmed including them so the HUD doesn't look visibly older than the upgraded world art.

**Resource icons subtotal: 15 frames.**

### Total asset count

| Category | Frames |
|---|---|
| Buildings (34 base + 3 variants) | 37 |
| Terrain tiles | 5 |
| Vegetation | 2 |
| Animals | 4 |
| Player units | 4 |
| Villagers | 1 |
| Raiders | 3 |
| Raider camps | 3 |
| Wildlife | 3 |
| Carts | 1 |
| Accents | 6 |
| **World-art total (in scope)** | **69** |
| Resource icons (optional Phase 78) | 15 |
| **Grand total** | **84** |

The user estimated ~50; the real number is **69 in-scope** (84 with HUD icons). The building count alone is 37 because the roster grew to 34 types. This materially affects the phasing in §4.

---

## 2. Art direction spec

### 2.1 Perspective / camera angle — **recommendation: keep top-down-with-slight-front-lean, do NOT switch to isometric**

The current art uses an implicit "top-down map, buildings drawn as front elevations" convention — a classic 2D builder cheat. Buildings show a *facade* (roof band on top rows, wall/window/door below) while terrain, roads and fences are pure top-down.

**Recommendation: preserve this exact convention.** Formalised as: **orthographic top-down at roughly a 30° downward lean** — you see a compressed roof at the top of the sprite and the front wall below it, with no side walls and no perspective vanishing point.

**Trade-offs, stated explicitly:**

- **Keeping it (recommended).** Zero code impact. All footprint math, occupancy grids, the tilemap, `findBlockingFence`'s half-tile sampling, enclosure BFS, minimap dots and placement previews assume a sprite occupies exactly its axis-aligned footprint rectangle. A 2×2 building is a 64×64 square, no overhang. Fences/roads/walls tile seamlessly in 4 directions because they're pure top-down.
- **Switching to true isometric.** Would break essentially everything: footprints become diamonds, sprite bounds no longer match tile bounds, `setOrigin(0,0)` placement math is wrong, the tilemap layer can't render diamond tiles without switching to an isometric tilemap orientation, depth sorting becomes a per-frame y-sort problem, and the minimap/enclosure/placement systems all assume square tiles. This is a total rewrite masquerading as an art change. **Reject.**
- **Middle option — taller buildings with vertical overhang** (e.g. a 2×2 building drawn 64×96 so a roof rises above its footprint). Tempting and it looks great, but it requires changing every building sprite's origin from `(0,0)` to a bottom-anchored origin, adding per-building y-offsets, and introduces overlap/depth-sort issues with buildings placed north of each other. **Reject for this overhaul**; note it as a possible future phase if the user later wants it, since it's an isolated (though non-trivial) `MainScene` change.

**Verdict: same top-down facade convention, same footprint, no overhang.** Every sprite must be fully contained in its frame with its "ground contact" filling the frame's bottom edge.

### 2.2 Art style — **recommendation: hand-painted high-detail pixel art**

Recommended style: **hand-painted pixel art in the style of a late-90s/2000s 2D isometric-builder** (think *The Settlers II* / *Caesar III* sprite quality, minus the isometry) — dense detail, painterly shading, readable silhouettes, no anti-aliased blur.

Rationale:
- The game already *is* pixel art. Switching to clean-vector or semi-realistic 3D-render style would clash with the tilemap, the HUD, and the whole existing identity.
- At 32×32 and 64×64, pixel art is the only style that survives downscaling with its detail intact. A semi-realistic painted render downscaled to 32px becomes mush.
- Pixel art has a hard requirement AI generators handle poorly (crisp 1px detail, limited palette) — mitigated by generating large and downscaling with nearest-neighbour, see §3.4.

**Rejected alternatives:**
- *Clean vector / flat-design*: would read as a mobile puzzle game, kills the Western grit.
- *Semi-realistic painted*: unreadable at 12px, and inconsistent between generations.
- *Cartoon/Cuphead-style*: strong identity but very hard to keep consistent across 69 generations and clashes with the tilemap's texture.

### 2.3 Palette — **preserve and formalise the existing Western palette**

The current palette is real and consistent. Extracted from `BootScene.ts` and `mapConfig.ts` `TILE_COLORS`, here is the canonical palette to lock into every prompt:

**Terrain / ground**
| Role | Hex |
|---|---|
| Dirt base | `#9C7B52` |
| Dirt crack (shadow) | `#836542` |
| Dirt highlight | `#B09067` |
| Gravel base | `#8A8172` |
| Gravel pebble | `#A9A094` |
| Gravel shadow | `#6D6558` |
| Sand base | `#D2B48C` |
| Sand shadow | `#B08968` |
| Sand highlight | `#E8D0A9` |
| Water mid | `#2F7FBF` |
| Water deep | `#1C5C8F` |
| Water highlight | `#6EC6FF` |
| Rock base | `#6B6560` |
| Rock face | `#827C76` |
| Rock crack | `#4A4542` |

**Timber / structures (the dominant Western identity)**
| Role | Hex |
|---|---|
| Darkest wood / outline | `#3E2723` |
| Deep brown frame | `#4E342E` |
| Mid brown beam | `#5D4037` |
| Warm plank | `#6D4C41` |
| Light plank | `#8D6748` |
| Pale plank | `#A1887F` |
| Weathered tan | `#C9A063` |
| Bone / whitewash | `#D7CCC8` |
| Cream / paper | `#EFEBE9` |

**Accents (used sparingly, one per building for identity)**
| Role | Hex |
|---|---|
| Barn red / danger | `#B71C1C`, `#8D3B2F`, `#C62828` |
| Brass / gold / lamplight | `#FFD54F`, `#FFB300`, `#B87333` |
| Forge / fire | `#FF7043`, `#FFCA28` |
| Sage / cactus green | `#689F38`, `#7CB342`, `#2E7D32` |
| Sky-blue glass | `#90CAF9` |
| Cool stone (Bank only) | `#90A4AE`, `#CFD8DC`, `#37474F` |
| Rose (Brothel only) | `#8D3B5A`, `#C98AA3` |

**Palette rules for prompting:**
1. Every asset is built from the timber/ground families above; the accent colours are the *only* saturated hues and each building gets at most one.
2. No pure black (`#000000`) and no pure white (`#FFFFFF`) except tiny specular pixels.
3. Overall cast: warm, sun-bleached, dusty. Anything that reads cool/blue is either water, glass, or the Bank.

### 2.4 Canvas size / aspect per category

**Generate large, downscale to target** (see §3.4). Generation canvas should be a clean integer multiple of the target so nearest-neighbour downscaling lands exactly on pixel boundaries.

| Category | Final size | Generate at | Ratio |
|---|---|---|---|
| Buildings 1×1 | 32×32 | 512×512 | 16× |
| Buildings 2×2 | 64×64 | 1024×1024 | 16× |
| Terrain tiles | 32×32 | 512×512 | 16× |
| Vegetation | 32×32 | 512×512 | 16× |
| Raider camps | 24×24 | 768×768 | 32× |
| Small units (12×12) | 12×12 | 768×768 | 64× |
| Cowboy-on-Horse | 16×12 | 1024×768 | 64× |
| Goods cart | 14×10 | 896×640 | 64× |
| Accents | various | 16× the target | 16× |
| Resource icons | 12×12 | 768×768 | 64× |

Note the 12×12 assets are generated at 64× and then hand-authored down (see §5d) — a 64× downscale of a detailed render is *not* going to produce a readable 12px sprite automatically.

### 2.5 Background / transparency

**Hard requirement: fully transparent background, no shadow baked into the alpha edge except where noted.**

- Every generated image must be produced on a **flat magenta `#FF00FF` background** (AI generators handle "solid uniform background" far more reliably than "transparent background"), then keyed out in post-processing. Magenta because it appears nowhere in the palette.
- **Terrain tiles are the exception** — they are fully opaque, edge-to-edge, no transparency at all, and must tile seamlessly (see §5e).
- **Road, Fence, Gate, WoodenWall, WoodenGate** are drawn over terrain and need transparency *around* their structure, but their structural elements must run edge-to-edge so adjacent tiles connect visually. Road specifically must have its wheel ruts at fixed columns so ruts align across neighbouring road tiles (current `ROAD_SPRITE` keeps columns 2 and 5 dark on every row).
- **A soft contact shadow is desirable** on buildings, units, animals and vegetation — a semi-transparent dark ellipse at the sprite's base — because it grounds the sprite on the terrain. It must stay *inside* the frame bounds.

### 2.6 Outline and lighting treatment

**Outline:** selective dark outline. Every sprite gets a 1-pixel (at final resolution) outline in a *darker shade of its own local colour* (not a uniform black) on its outer silhouette. Interior detail lines are unoutlined. This is what keeps a 12px unit readable against the dirt terrain while avoiding the "sticker" look of a uniform black keyline.

**Lighting:** a single consistent light source, **top-left, high angle** (roughly 10 o'clock). Every asset in the game must obey this:
- Top and left faces catch the highlight.
- Bottom and right faces sit in shadow.
- Cast shadows fall to the **bottom-right**.
- Ambient fill is warm (sunlit desert bounce), so shadows are warm-brown-tinted, never neutral grey or blue.

This one rule does more for cross-generation consistency than anything else — inconsistent light direction is the single most obvious tell that sprites came from different generations.

### 2.7 Reusable prompt template

Two templates — one for structures, one for small units — plus a shared style block.

**SHARED STYLE BLOCK (paste verbatim into every prompt):**

```
STYLE: Hand-painted pixel art game sprite, in the style of a classic late-1990s
2D settlement-building strategy game (Settlers II / Caesar III sprite quality).
Dense readable detail, painterly dithered shading, crisp hard pixel edges,
no anti-aliasing, no blur, no gradients.

PERSPECTIVE: Orthographic top-down with a slight downward front lean (approx 30
degrees). You see a compressed roof/top surface at the top of the sprite and the
front face below it. NO side walls visible. NO perspective vanishing point. NO
isometric diamond. Sprite is axis-aligned and square-on to the viewer.

LIGHTING: Single light source from the upper LEFT, high angle. Top and left
surfaces are lit, bottom and right surfaces are in shadow, cast shadows fall
to the lower right. Shadows are warm brown-tinted, never grey or blue.

OUTLINE: 1-pixel selective outline around the outer silhouette only, drawn in a
darker shade of each local color (NOT uniform black). Interior details have no
outline.

PALETTE: Restricted, sun-bleached American Old West / desert frontier palette.
Base wood tones #3E2723 #4E342E #5D4037 #6D4C41 #8D6748 #A1887F #C9A063.
Ground tones #9C7B52 #8A8172 #D2B48C. Bone/cream #D7CCC8 #EFEBE9.
Use AT MOST ONE saturated accent color from: barn red #B71C1C, brass gold
#FFD54F, forge orange #FF7043, sage green #689F38, sky-blue glass #90CAF9.
NO pure black, NO pure white, NO neon, NO purple unless specified.
Overall cast is warm, dusty and sun-faded.

BACKGROUND: Solid flat magenta #FF00FF background, completely uniform, no
gradient, no texture, no vignette. The subject must not touch the frame edges
except where specified. Subject must be fully opaque with clean hard edges
against the magenta for easy chroma-keying.

FRAMING: Single object, centered, filling the frame. No text, no labels, no
watermark, no UI, no border, no drop shadow onto the background, no ground
plane extending beyond the subject.
```

**TEMPLATE A — Buildings / structures:**

```
[SHARED STYLE BLOCK]

SUBJECT: {BUILDING_NAME} — {ONE_SENTENCE_DESCRIPTION}.

DISTINGUISHING SILHOUETTE: {THE_ONE_THING_THAT_MAKES_IT_RECOGNIZABLE}.

MATERIALS: {MATERIAL_LIST}.

ACCENT COLOR: {SINGLE_ACCENT_HEX_AND_NAME}, used only on {WHERE}.

FOOTPRINT: The building must fit entirely within a {W}x{H} square frame, with
its base/foundation touching the bottom edge of the frame and the roof at the
top. It must read as a single self-contained structure occupying exactly this
square plot of land.

CANVAS: {GEN_W}x{GEN_H} pixels.
```

Worked example (Blacksmith, 2×2):

```
[SHARED STYLE BLOCK]

SUBJECT: Blacksmith — a frontier forge workshop where ore and stone are worked
into iron tools.

DISTINGUISHING SILHOUETTE: A slate-grey shingled roof over a timber workshop,
with a large open forge window on the front face showing a glowing fire, and a
dark anvil silhouetted in front of it.

MATERIALS: Weathered timber plank walls, slate-grey shingle roof, dark iron
anvil, stone forge chimney.

ACCENT COLOR: Forge orange #FF7043 with a #FFD54F hot core, used only on the
forge fire glow.

FOOTPRINT: The building must fit entirely within a 2x2 square frame, with its
base/foundation touching the bottom edge of the frame and the roof at the top.
It must read as a single self-contained structure occupying exactly this square
plot of land.

CANVAS: 1024x1024 pixels.
```

**TEMPLATE B — Small units / creatures:**

```
[SHARED STYLE BLOCK]

SUBJECT: {UNIT_NAME} — {ONE_SENTENCE_DESCRIPTION}.

POSE: Standing still, side-on / three-quarter view, facing RIGHT. Neutral idle
stance, both feet on the ground, arms at sides. NOT mid-stride, NOT running,
NOT attacking. This is a single static frame.

DISTINGUISHING SILHOUETTE: {THE_ONE_SHAPE_CUE}.

READABILITY: This sprite will be displayed extremely small ({FINAL_W}x{FINAL_H}
pixels). The silhouette alone must be instantly identifiable. Use bold simple
shapes and strong value contrast between the subject and its own parts.
Avoid fine detail that would vanish at that size.

CANVAS: {GEN_W}x{GEN_H} pixels.
```

Worked example (Dynamiter, 12×12):

```
[SHARED STYLE BLOCK]

SUBJECT: Dynamiter — a frontier demolitions man carrying a bandolier of
dynamite sticks.

POSE: Standing still, side-on / three-quarter view, facing RIGHT. Neutral idle
stance, both feet on the ground, arms at sides. NOT mid-stride, NOT running,
NOT attacking. This is a single static frame.

DISTINGUISHING SILHOUETTE: A dark slate hat, a bulky satchel/bandolier strapped
diagonally across the chest, and a single bright orange lit-fuse spark visible
above the hat brim.

READABILITY: This sprite will be displayed extremely small (12x12 pixels). The
silhouette alone must be instantly identifiable. Use bold simple shapes and
strong value contrast between the subject and its own parts. Avoid fine detail
that would vanish at that size.

CANVAS: 768x768 pixels.
```

**Consistency protocol (as important as the template):**
1. Generate one **reference sheet first** — a single image containing 4 already-designed buildings side by side in the target style. Approve it. Then feed it as an image-reference / style-reference to every subsequent generation.
2. Generate **within a category in one batch/session**, not scattered over time — models drift.
3. Generate each asset **3 times**, pick the best. Budget for ~200 generations to ship 69 assets.
4. After each batch, lay all outputs on one contact sheet and eyeball for light-direction and palette drift before downscaling.

---

## 3. Technical pipeline plan

### 3.1 Folder structure (new — nothing exists today)

```
public/
  assets/
    tiles/
      terrain.png              # 5-frame strip, 160x32
    buildings/
      buildings.png            # packed atlas
      buildings.json           # Phaser JSONHash atlas
    units/
      units.png                # cowboy, mounted, brawler, dynamiter, villager
      units.json
    creatures/
      creatures.png            # animals, raiders, wildlife
      creatures.json
    world/
      world.png                # vegetation, camps, carts, accents
      world.json
    icons/
      icons.png                # resource icons (Phase 78)
      icons.json
```

`public/` is Vite's static dir — files there are served at `/assets/...` in dev and copied verbatim into `dist/` on build. No Vite config change needed. **Note:** `dist/assets/` already exists as Vite's bundle output dir; using `public/assets/` means built output lands in `dist/assets/` too. To avoid any ambiguity with Vite's hashed bundle chunks, use **`public/art/`** instead of `public/assets/` — recommended, zero-risk rename of the above tree.

### 3.2 Format

- **PNG-8 with alpha** where the palette allows (most assets are <64 colours after the palette restriction), else PNG-24+alpha.
- Run every final PNG through `oxipng -o4` / `pngquant --quality 70-90`. Expected savings 40-60%.
- **No WebP.** PNG is universally supported, and at these file sizes the WebP win is negligible against the compatibility cost.

### 3.3 Atlas strategy — **RESOLVED: keep 13 separate atlases, one per existing texture key**

Today's code has 13 separate generated textures. A consolidation into 5 loaded atlases grouped by category was considered:

| New atlas file | Replaces (current texture keys) |
|---|---|
| `terrain.png` (plain spritesheet, not JSON atlas) | `tiles-atlas` |
| `buildings.png/json` | `buildings-atlas` |
| `units.png/json` | `cowboys-atlas`, `mounted-cowboys-atlas`, `brawlers-atlas`, `dynamiters-atlas`, `villagers-atlas` |
| `creatures.png/json` | `animals-atlas`, `raiders-atlas`, `wildlife-atlas` |
| `world.png/json` | `vegetation-atlas`, `raider-camps-atlas`, `carts-atlas`, `accents-atlas` |
| `icons.png/json` (Phase 78) | `resource-icons-atlas` |

**Why hand-packed atlases over individual `this.load.image()` per sprite:**
- 69 individual HTTP requests vs. 5. Even with HTTP/2 this matters on the first load.
- Phaser batches draw calls per texture. 69 textures = worst-case 69 batch flushes per frame; 5 textures = at most 5. With hundreds of sprites on screen this is a real frame-time difference and directly serves the project's stated performance rules.

**Critical caveat — atlas consolidation is a breaking change to texture keys.** Merging `cowboys-atlas` + `brawlers-atlas` + ... into one `units` atlas means every `this.add.image(x, y, COWBOYS_ATLAS_KEY, COWBOY_TEXTURE_KEY)` call site needs its atlas-key argument changed.

**Decision: do NOT consolidate.** Keep **one new atlas file per existing atlas key**, preserving all 13 texture keys and all frame names *exactly*. This makes the migration a pure `preload()` swap with **zero changes to any consuming call site**. Consolidation remains available as a separate optional future cleanup phase if request-count ever becomes a measured problem, but is out of scope here.

**File structure (final):**

```
public/art/
  tiles-atlas.png                    # 160x32 strip, no JSON (spritesheet load)
  buildings-atlas.png + .json
  animals-atlas.png + .json
  accents-atlas.png + .json
  villagers-atlas.png + .json
  cowboys-atlas.png + .json
  mounted-cowboys-atlas.png + .json
  brawlers-atlas.png + .json
  dynamiters-atlas.png + .json
  carts-atlas.png + .json
  raiders-atlas.png + .json
  raider-camps-atlas.png + .json
  wildlife-atlas.png + .json
  vegetation-atlas.png + .json
  resource-icons-atlas.png + .json   # Phase 78
```

Single-frame atlases (cowboys, villagers, carts, etc.) can skip the JSON entirely and use `this.load.image(KEY, 'art/cowboys-atlas.png')` — but then `this.add.image(x, y, KEY, FRAME)` breaks, because a plain image has no named frames. **Therefore: use a JSON atlas even for single-frame textures**, so the `(atlasKey, frameKey)` two-argument form every call site uses keeps working verbatim. This is the key decision that makes migration zero-touch.

### 3.4 Generation → shipping pipeline

Per asset:
1. **Generate** at the large canvas size per §2.4, magenta background.
2. **Chroma-key** the magenta to alpha (ImageMagick: `-fuzz 12% -transparent '#FF00FF'`), then despeckle the edge.
3. **Downscale** to target size. For buildings/tiles/vegetation (16× reduction), use a two-step: bicubic to 2× target, then **nearest-neighbour / point** to target — this preserves crisp pixel edges. For 12px units, downscaling alone will not work (see §5d) — those get hand-cleanup.
4. **Palette-quantise** to the locked palette (ImageMagick `-remap palette.png`) so no asset drifts off-palette.
5. **Verify dimensions exactly match the target** — this is the one automated check that must never be skipped, because a 1px-off building silently misaligns on the map.
6. **Pack** into the category atlas with a packer (`free-tex-packer-cli` or `texturepacker`), exporting Phaser 3 JSONHash format (Phaser 4 reads it).
7. **Optimise** the PNG.

Recommend committing a small `tools/` script (Node or shell) automating steps 2–7 so re-generating one asset is one command. This isn't game code, so it doesn't violate the "no code" constraint of this planning task, but it is itself an implementation task in Phase 73.

### 3.5 `BootScene.ts` changes

Currently `preload()` calls 15 `generate*` methods and `create()` calls `publishBuildingIcons()` then starts MainScene.

**New `preload()`:**

```
preload():
  this.load.setPath('art/');
  this.load.spritesheet(TILESET_KEY, 'tiles-atlas.png',
                        { frameWidth: TILE_SIZE, frameHeight: TILE_SIZE });
  this.load.atlas(BUILDING_ATLAS_KEY,  'buildings-atlas.png',  'buildings-atlas.json');
  this.load.atlas(ANIMALS_ATLAS_KEY,   'animals-atlas.png',    'animals-atlas.json');
  ... one line per remaining atlas ...
```

**What gets deleted:** all 15 `generate*Atlas` / `generateTilesetTexture` methods, `drawPixelSprite`, the `PixelSprite`/`PixelPalette` types, `PIXEL_GRID`/`PIXEL_SIZE`/`ANIMAL_PIXEL_*`/`CAMP_PIXEL_*` constants, and all ~60 `*_SPRITE` pattern definitions. `BootScene.ts` drops from 1919 lines to roughly 80.

**What stays unchanged:** `TILESET_KEY` export, `publishBuildingIcons()` (see below), `create()`'s `scene.start('MainScene')`.

**`publishBuildingIcons()` needs one verification, not a rewrite.** It reads `this.textures.get(BUILDING_ATLAS_KEY).getSourceImage()` and requires it to be an `HTMLCanvasElement` or `HTMLImageElement`. A loaded PNG gives an `HTMLImageElement`, which the existing check already accepts. It then `canvas.toDataURL()`s each frame. **Risk:** `toDataURL()` on a canvas that has drawn a *cross-origin* image throws a SecurityError (tainted canvas). Since assets are same-origin from `public/`, this is fine in dev and in any normal deployment — but the existing `try/catch` already degrades gracefully to text labels, so worst case is cosmetic. **Verify in Phase 74; no code change anticipated.**

**Loading screen:** the game currently has an instant boot. Loading ~1-3 MB of PNGs introduces a visible gap. Add a minimal progress bar in `BootScene.preload()` using `this.load.on('progress', ...)` — a Graphics bar plus a "Loading…" text, destroyed in `create()`. Small addition, worth doing in Phase 73.

### 3.6 Exact texture-key → new-asset mapping

This is the contract. Every row must hold or a call site breaks.

| Category | Texture key (unchanged) | Frame key (unchanged) | New file | Frame px |
|---|---|---|---|---|
| Tiles | `tiles-atlas` | *index 0-4* | `tiles-atlas.png` | 32×32 ×5 |
| Buildings | `buildings-atlas` | `building-<Type>` (34) | `buildings-atlas.png/json` | 32×32 or 64×64 |
| Buildings | `buildings-atlas` | `building-House-tier2` | same | 32×32 |
| Buildings | `buildings-atlas` | `building-House-tier3` | same | 32×32 |
| Buildings | `buildings-atlas` | `building-WoodenGate-closed` | same | 32×32 |
| Animals | `animals-atlas` | `animal-Chicken\|Pig\|Cow\|Ostrich` | `animals-atlas.png/json` | 12×12 |
| Accents | `accents-atlas` | `accent-WellCrank` | `accents-atlas.png/json` | 16×4 |
| Accents | `accents-atlas` | `accent-WarehouseDoor` | same | 24×24 |
| Accents | `accents-atlas` | `accent-SupermarketAwning` | same | 64×8 |
| Accents | `accents-atlas` | `accent-ChickenDoor` | same | 16×12 |
| Accents | `accents-atlas` | `accent-HouseWindowLight` | same | 12×12 |
| Accents | `accents-atlas` | `accent-Campfire` | same | 12×12 |
| Villager | `villagers-atlas` | `villager` | `villagers-atlas.png/json` | 12×12 |
| Cowboy | `cowboys-atlas` | `cowboy` | `cowboys-atlas.png/json` | 12×12 |
| Mounted | `mounted-cowboys-atlas` | `cowboy-on-horse` | `mounted-cowboys-atlas.png/json` | 16×12 |
| Brawler | `brawlers-atlas` | `brawler` | `brawlers-atlas.png/json` | 12×12 |
| Dynamiter | `dynamiters-atlas` | `dynamiter` | `dynamiters-atlas.png/json` | 12×12 |
| Cart | `carts-atlas` | `goods-cart` | `carts-atlas.png/json` | 14×10 |
| Raiders | `raiders-atlas` | `raider-Outlaws\|Rustlers\|Coyotes` | `raiders-atlas.png/json` | 12×12 |
| Camps | `raider-camps-atlas` | `raider-camp-<Faction>` | `raider-camps-atlas.png/json` | 24×24 |
| Wildlife | `wildlife-atlas` | `wildlife-Snake\|Coyote\|MountainLion` | `wildlife-atlas.png/json` | 12×12 |
| Vegetation | `vegetation-atlas` | `vegetation-Tree\|Cactus` | `vegetation-atlas.png/json` | 32×32 |
| Icons | `resource-icons-atlas` | `resource-icon-<ResourceKey>` (15) | `resource-icons-atlas.png/json` | 12×12 |

**Frame names are generated by pure functions in `buildingConfig.ts` / `vegetationConfig.ts` / `wildlifeConfig.ts`** (`buildingTextureKey`, `animalTextureKey`, `accentTextureKey`, `raiderTextureKey`, `raiderCampTextureKey`, `wildlifeTextureKey`, `vegetationTextureKey`, `resourceIconTextureKey`). As long as the atlas JSON uses exactly those strings as its frame names, **zero code outside `BootScene.preload()` changes.**

### 3.7 Variant-swap call sites — all satisfiable with named frames, no new code

| Behaviour | Call site | Mechanism today | Under new pipeline |
|---|---|---|---|
| House tier swap | `MainScene.ts:4072` | `setTexture(BUILDING_ATLAS_KEY, buildingTextureKey(type, tier))` | **Unchanged** — 3 named frames in the atlas |
| WoodenGate open/closed | `MainScene.ts:4103-4105` | `setTexture(..., buildingTextureKey(type, tier, gateOpen))` | **Unchanged** — 2 named frames |
| Placement preview | `:2376, :2477, :2480` | `add.image` / `setTexture` + `setTint(VALID/INVALID)` | **Unchanged** — tint multiplies the texture; works on any image |
| Accent tweens | `:3037-3101` | `add.image(ACCENTS_ATLAS_KEY, accentTextureKey(k))` + origin + tween | **Unchanged** *if* accent frames keep their exact dimensions and internal alignment |
| Vegetation night tint | `:1282, :3825-3827` | `setTint(0x6F86B8)` / `clearTint()` | **Unchanged** — but see §5b, tint on detailed art looks different |
| House tier upgrade cue | `:4076-4080` | `setScale(1.25)` pop / `setTint(0xFF8A80)` flash | **Unchanged** |
| Building icons (DOM bar) | `BootScene.publishBuildingIcons` | `toDataURL` per building frame | **Unchanged**, verify (§3.5) |

**Verdict: every variant-swap call site is satisfied by simply shipping multiple named frames per entity. No new code is required for any of them.** The only real work is authoring discipline — the accents in particular (§5b).

---

## 4. Phased implementation sequence

Six phases. Each is independently shippable and the game is fully playable mid-migration with mixed new/old art, because each atlas is swapped independently and texture keys don't change.

### Phase 73 — Pipeline foundation + terrain tiles
**Asset count: 5** (+ 15 source generations if doing tile variants)
- Create `public/art/`, the `tools/` processing script, `palette.png` reference, and the approved style reference sheet.
- Generate + ship the 5 terrain tiles.
- Replace `generateTilesetTexture()` with `this.load.spritesheet(TILESET_KEY, ...)`.
- Add the loading progress bar.
- **Why first:** smallest category, and terrain is the highest-risk *technical* case (tilemap tileset load path, seamless tiling) while being the lowest-risk *artistic* case. If the pipeline is wrong, we find out with 5 assets instead of 37.
- **Dependencies:** none.
- **Ship criterion:** map renders, `npm run build` passes, all other art still procedural.

### Phase 74 — Buildings
**Asset count: 37** (34 base + 3 variants)
- Generate all 34 buildings + House T2/T3 + WoodenGate-closed.
- Replace `generateBuildingAtlas()` with `this.load.atlas(BUILDING_ATLAS_KEY, ...)`.
- Verify `publishBuildingIcons()` still produces DOM bar icons.
- Verify House tier swap and WoodenGate open/closed swap in-game.
- **Why second:** biggest and highest-value category; the game's whole look is buildings.
- **Dependencies:** Phase 73 (pipeline + style reference).
- **Sub-batching recommended within the phase:** 74a Livestock+Farming (9), 74b Industry+Commerce (11), 74c Housing/Infrastructure/Barriers (10), 74d Military+Religion/Misc (4). Each sub-batch is one generation session, keeping style drift low; ship the atlas once at the end.
- **Ship criterion:** all buildings render at correct footprint, no overhang, tier/gate swaps work.

### Phase 75 — Player units, villagers, animals
**Asset count: 9** (4 player units + 1 villager + 4 animals)
- Raise `ANIMAL_SPRITE_SIZE` and its unit-size aliases (`VILLAGER_SPRITE_SIZE`, `COWBOY_SPRITE_SIZE`, `BRAWLER_SPRITE_SIZE`, `DYNAMITER_SPRITE_SIZE`) from 12px to **18px** (§5d, resolved) before generating art; Cowboy-on-Horse scales proportionally to 24×18. Adjust `getAnimalSlotPosition` spacing and `UNIT_SPRITE_HALF_HEIGHT_PX` for the new size.
- Generate the first unit (Cowboy) and do a quick in-game visual check at zoom 0.5/1.0/2.0 as ordinary QC before mass-producing the rest of the category — not a design go/no-go, the size decision is already made.
- Replace `generateCowboyAtlas`, `generateMountedCowboyAtlas`, `generateBrawlerAtlas`, `generateDynamiterAtlas`, `generateVillagerAtlas`, `generateAnimalAtlas`.
- **Dependencies:** Phase 73. (Independent of 74 — could run in parallel.)
- **Ship criterion:** units readable at zoom 1.0, `setFlipX` facing still reads correctly (§5b), animal wander tweens unaffected, no visual overlap from the larger sprite size around multi-animal farm footprints.

### Phase 76 — Raiders, raider camps, wildlife
**Asset count: 9** (3 raiders + 3 camps + 3 wildlife)
- Raider/wildlife sprites also generate at the new 18px size (`RAIDER_SPRITE_SIZE`/`WILDLIFE_SPRITE_SIZE`), matching Phase 75's unit scale.
- Give the raid-faction Coyote a subtle distinguishing marker vs. the ambient wildlife Coyote (§5f, resolved — differentiate).
- Differentiate the 3 camps beyond tent colour.
- Replace `generateRaiderAtlas`, `generateRaiderCampAtlas`, `generateWildlifeAtlas`.
- **Dependencies:** Phase 75 (same small-unit style must match the player units exactly — hostile units must read as *the same art style, different faction*).
- **Ship criterion:** raiders visually distinct from player units at a glance; camps readable at 24px.

### Phase 77 — Vegetation, carts, accents
**Asset count: 9** (2 vegetation + 1 cart + 6 accents)
- Accents are the fiddliest assets in the project — each must align pixel-for-pixel with the hole left in its parent building sprite, and each has a specific origin/pivot (§1k). Author these *against the Phase 74 building art*, which is why they come last.
- Replace `generateVegetationAtlas`, `generateCartAtlas`, `generateAccentAtlas`.
- Verify all 6 accent tweens (crank rotation, warehouse door hinge, awning sway, chicken-door flap, window light fade, campfire flicker).
- **Dependencies:** Phase 74 (building art must exist to align accents to), Phase 73.
- **Ship criterion:** all idle animations play, nothing misaligned, night accents fade correctly.
- **At the end of this phase `BootScene.ts` has no procedural art left** — `drawPixelSprite` and all `*_SPRITE` definitions get deleted here.

### Phase 78 — Resource icons (HUD polish)
**Asset count: 15**
- Replace `generateResourceIconAtlas()`.
- **Dependencies:** none beyond Phase 73's pipeline.
- **Why last:** ships once the pipeline is proven on the higher-value categories; keeps the HUD visually consistent with the upgraded world art. Confirmed in-scope (§6, item 4).

### Phase summary

| Phase | Scope | Assets | Depends on |
|---|---|---|---|
| 73 | Pipeline + terrain | 5 | — |
| 74 | Buildings | 37 | 73 |
| 75 | Player units, villager, animals (18px) | 9 | 73 |
| 76 | Raiders, camps, wildlife (18px) | 9 | 73, 75 |
| 77 | Vegetation, carts, accents | 9 | 73, 74 |
| 78 | Resource icons | 15 | 73 |
| | **Total** | **84** | |

---

## 5. Risks and open questions

### (a) AI-generation consistency across ~69 generations — **HIGH RISK, primary project risk**

Every image is generated independently; models drift in palette, light direction, detail density and style between sessions.

**Mitigations, in order of effectiveness:**
1. **Approved style reference sheet used as an image reference on every single generation.** This is the single highest-leverage control. Generate 4 hero buildings first, iterate until they're right, and never generate anything afterwards without attaching that sheet.
2. **The locked light-direction rule** (upper-left, warm shadows to lower-right). Inconsistent lighting is the most visible failure mode and this one line in the prompt fixes most of it.
3. **Hard palette quantisation in post-processing** (`-remap palette.png`). Even if a generation drifts in hue, remapping to the locked palette forces it back. This makes palette drift a *solved* problem rather than a managed one — strongly recommended and cheap.
4. **Batch by category, in one session.**
5. **Contact-sheet review before downscaling** — lay out every asset in a category as a grid and reject outliers before investing in processing.
6. **3 generations per asset, pick 1.**

**Residual risk:** even with all of the above, expect ~15% of assets to need regeneration after seeing them in-game. Budget a rework pass at the end of each phase.

### (b) Runtime texture behaviours that are hard to replicate with static images — **MEDIUM**

Five specific behaviours, found by reading `MainScene.ts`:

1. **`setFlipX` facing.** Units and animals fake direction by horizontally mirroring one frame (`startAnimalWander`, `startVillagerWander`, cart travel). This works fine on the current symmetric-ish pixel art. **Detailed art with a strongly asymmetric feature (a holster on the right hip, a lit fuse on one side, a rider's visible arm) will look wrong when mirrored** — a left-handed cowboy. **Mitigation:** author every mirrorable unit with its identity cues either centred or duplicated on both sides. Explicitly call this out in the unit prompts. This is a real authoring constraint, not a code problem.

2. **Accent carve-out alignment (`accents-atlas`).** Six accents are pieces cut out of their parent building, positioned at hardcoded offsets in `MainScene` (e.g. WellCrank at `originX+16, originY+2`; Campfire at `originX+4, originY+46`). New building art must leave a *hole* exactly where the accent goes, and the accent art must fill it exactly. **Mitigation:** author building + its accent as one image, then split it — never generate them independently. Phase 77 ordering (after buildings) exists for this reason. Note `Campfire` sits at `originY+46` which is *outside* the Barracks' 64×64 footprint (in its yard) — this must be preserved.

3. **`setTint` on detailed art.** `VEGETATION_NIGHT_TINT (0x6F86B8)` multiplies over vegetation at night, and placement preview tints buildings green/red. Tint multiplies per-channel, so a *flat*-coloured pixel sprite tints predictably, but **richly-shaded detailed art goes muddy and dark under a multiply tint** — a green validity tint over a detailed brown building may read as sludge rather than "valid". **Mitigation:** after Phase 74, re-evaluate the preview tint values; may need lighter tint colours or switching the preview to a tint + alpha combination. Small, contained `MainScene` change. **Flag as a likely follow-up, not a blocker.**

4. **House tier upgrade `setScale(1.25)` pop.** Scaling a detailed sprite up 25% momentarily will show interpolation blur unless the texture filter is `NEAREST`. **Mitigation:** ensure `Phaser.Textures.FilterMode.NEAREST` is set on loaded textures (either globally via `render: { pixelArt: true }` in `gameConfig`, or per-texture). **This is a genuine required change** — `gameConfig.ts` currently sets no `pixelArt`/`antialias` flag, so Phaser defaults to linear filtering. With procedurally-generated textures rendered 1:1 this was invisible; with loaded PNGs and camera zoom (0.5–2.0), linear filtering will blur everything. **Add `pixelArt: true` to `gameConfig` in Phase 73.** This is the second-most-important technical item in the plan after frame dimensions.

5. **Camera zoom 0.5–2.0.** At zoom 2.0 a 12px unit is drawn at 24 screen px (fine), at 0.5 it's 6px (already nearly invisible today). Detailed art doesn't change this, but §5d's mitigation interacts with it.

### (c) File size and load time — **LOW-MEDIUM, but genuinely new**

The game currently loads **zero images**. This overhaul introduces a real network cost.

**Estimate:**

| Atlas | Raw px | Est. optimised PNG |
|---|---|---|
| buildings-atlas | ~1400×64 | 60–120 KB |
| tiles-atlas | 160×32 | 3–6 KB |
| vegetation | 64×32 | 2–4 KB |
| animals / raiders / wildlife | ~48×12 each | 1–3 KB each |
| unit atlases (5 files) | ~12-16×12 each | 1–2 KB each |
| camps | 72×24 | 3–5 KB |
| accents | ~150×24 | 3–6 KB |
| carts | 14×10 | <1 KB |
| icons (Phase 78) | 180×12 | 3–6 KB |
| **Total** | | **~90–180 KB** |

This is **small** — these are tiny sprites, not HD textures. Compare: `phaser` itself is ~1.2 MB minified. The added load is under 15% of the existing bundle.

**But:** it's 14 additional HTTP requests (28 with JSON files). On a cold cache over slow mobile that's the real cost, not bytes.

**Mitigations:**
- Loading progress bar (Phase 73) so the gap is visible rather than a frozen screen.
- Assets are static and cacheable indefinitely — set long cache headers in whatever deployment is used.
- If request count becomes a problem, the atlas-consolidation cleanup (§3.3) drops 28 requests to 10. Available as a lever, not needed up front.
- **Do NOT inline as base64 data URLs** — that defeats caching and inflates the JS bundle by ~33%.

**Resolved:** the game is always served over HTTP (dev server or a deployed web host), never opened as a local `file://` URL. Standard PNG + `fetch`/`XHR` asset loading applies with no base64-inlining workaround needed.

### (d) "Same footprint" at 12px — **RESOLVED: unit sprite sizes will be raised**

**The problem, stated plainly:** the game has **13 assets at 12×12 pixels** (4 animals, 4 player units, 3 raiders, 3 wildlife — plus 15 icons, which stay small by nature as HUD glyphs). A 12×12 sprite has **144 pixels total** — not enough for "AI-generated detailed art" in any meaningful sense. Downscaling a detailed 768×768 render to 12×12 produces indistinct mush.

**Decision (user-approved, supersedes original decision #3 for this category only):** raise the small-unit texture-generation sizes from 12px to **18px** (a middle point in the plan's suggested 16-20 range — 324 pixels, a 2.25× improvement in usable detail) for all 12×12 categories: animals, player units (Cowboy/Brawler/Dynamiter — Cowboy-on-Horse scales proportionally to 24×18), villagers, raiders, and wildlife. Buildings, tiles, vegetation, camps, and carts are unaffected — this decision is scoped to the 12px small-unit class only.

Checked against the code: `ANIMAL_SPRITE_SIZE` and its aliases (`VILLAGER_SPRITE_SIZE`, `COWBOY_SPRITE_SIZE`, `BRAWLER_SPRITE_SIZE`, `DYNAMITER_SPRITE_SIZE`, `RAIDER_SPRITE_SIZE`, `WILDLIFE_SPRITE_SIZE`) are used for **texture generation dimensions only** — sprites are placed centred and never `setDisplaySize`d, so a larger texture simply draws larger with no other rendering-path change. Confirmed small, contained follow-up edits required in Phase 75/76:
- `getAnimalSlotPosition`'s slot spacing (animals arranged around a farm footprint need slightly more spacing so enlarged sprites don't overlap).
- `UNIT_SPRITE_HALF_HEIGHT_PX` (HP bar vertical offset above a unit) needs to scale with the new size.
- Visual crowding check: with `BROTHEL_MAX_LADIES`-style multi-animal farms (up to 6 animals) and multiple wandering villagers/animals near one footprint, verify 18px sprites don't visually overlap more than is acceptable — a quick in-game check in Phase 75, not a design change.
- Raider camps (24×24, unaffected) and mounted units' HP-bar/slot math should be spot-checked for the new 18px baseline consistency.

No readability spike is required before proceeding — the decision is made; Phase 75 should still do a quick in-game visual check of the first generated unit before mass-producing the rest of the category, as ordinary quality control (see §4 Phase 75), not as a go/no-go gate.

### (e) Terrain tiles must tile seamlessly — **MEDIUM, easy to get wrong**

Tiles are painted edge-to-edge across a 60×45 grid via `layer.putTileAt`. Two failure modes:

1. **Non-seamless edges** — a generated tile with a vignette, a centred composition, or lighting falloff will produce visible grid lines across the whole map. **Mitigation:** prompt explicitly for "seamless tileable texture, uniform lighting across the entire tile, no vignette, no centred subject, detail evenly distributed to all four edges", then verify by tiling 3×3 in an image editor before shipping. Add this check to the `tools/` script.

2. **Visible repetition** — a distinctive feature (a big crack, a bright pebble) repeated 2700 times reads as wallpaper. The current procedural tiles avoid this by being nearly featureless. **Mitigation:** keep detail low-contrast and high-frequency.

**Resolved: ship 5 tiles as-is (one per terrain type) for v1.** No variant system, no code change to `buildTilemap`/the tileset frame lookup. The 3-variants-per-type enhancement remains available as a future follow-up if the map reads as too repetitive in practice, but is explicitly out of scope for this overhaul.

### (f) Raider-Coyote and wildlife-Coyote currently share one sprite object — **RESOLVED: differentiate**

`WILDLIFE_SPRITES.Coyote = COYOTE_SPRITE` — the exact same pattern object powering `RAIDER_SPRITES[RaiderFaction.Coyotes]`. They're rendered from different atlases (`wildlife-atlas` vs `raiders-atlas`) so they're two frames today, just identical art.

**Decision:** give the raid-faction Coyote a subtle distinguishing marker (a bandana or scar) so a player can visually tell "this is part of a scripted raid" from "this wandered in ambiently" — the ambient wildlife Coyote stays the plain animal. One extra generation in Phase 76.

### (g) The three raider camps are currently identical but for tent colour — **LOW**

All three use the same `CAMP_PATTERN`, differing only in the `C` palette entry. At 24×24 there's room to genuinely differentiate (Outlaws: rifles stacked / a hitching post; Rustlers: a cattle pen / roped stock; Coyotes: a bone pile / a scrappier lean-to). **Recommendation: differentiate them.** Free visual improvement in Phase 76.

### (h) `pixelArt: true` is currently absent from `gameConfig` — **HIGH, must not be missed**

Covered in §5b.4 but repeated here because it's the most likely silent failure: `gameConfig.ts` sets no `render` block, so Phaser uses linear texture filtering. Today that's invisible (textures render 1:1 from a Graphics canvas). With loaded PNGs plus camera zoom 0.5–2.0 and the `setScale(1.25)` tier-pop, **every sprite will be visibly blurry**. Add `render: { pixelArt: true }` (which sets `antialias: false` and `NEAREST` filtering, and also sets `roundPixels`) in Phase 73 and verify at all three zoom levels.

Secondary consideration: `pixelArt: true` affects the **whole renderer**, including the existing `Graphics`-based HUD, minimap, HP bars, selection rings and overlays. These are all axis-aligned rectangles and lines, so the impact should be nil-to-positive (crisper), but it needs a visual check across the HUD in Phase 73.

### (i) Frame-dimension mismatch is a silent, high-impact failure — **MEDIUM, fully preventable**

Because buildings use `setOrigin(0,0)` and native size, a building shipped at 63×64 instead of 64×64 does not error — it just renders 1px short, forever, and nobody notices until it's shipped. **Mitigation: an automated dimension assertion in the `tools/` pipeline (step 5 of §3.4) that hard-fails the build if any frame's dimensions don't match the expected value derived from `BUILDING_DEFINITIONS[type].size * TILE_SIZE`.** Cheap, and it eliminates an entire class of bug.

### (j) `CLAUDE.md` is stale on TILE_SIZE and map size — **LOW, documentation only**

The changelog describes a 40×30 map and implies TILE_SIZE 16; the code says 60×45 and 32. Worth correcting in the Phase 73 changelog entry, since anyone generating art from the docs rather than the code would author every asset at half size.

---

## 6. Decisions (all resolved — user-approved)

All open questions raised during planning have been decided. No further design input is required before implementation begins.

| # | Question | Decision |
|---|---|---|
| 1 | 12px unit sprite sizing (§5d) | **Raise now** — `ANIMAL_SPRITE_SIZE` and its unit-size aliases go from 12px to **18px**. Supersedes original decision #3 for this category only. No readability spike required; ordinary Phase 75 QC applies. |
| 2 | `file://` support (§5c) | Game is **always served over HTTP** — standard PNG + fetch pipeline, no base64 inlining needed. |
| 3 | Terrain tile variants (§5e) | **Ship 5 tiles as-is** for v1 — no variant system, no code change. Available as a future follow-up. |
| 4 | Resource icons (Phase 78) | **Included.** Phase 78 ships as part of this overhaul, not a separate later decision. |
| 5 | Raider vs. wildlife Coyote (§5f) | **Differentiated** — raid-faction Coyote gets a subtle marker (bandana/scar); ambient wildlife Coyote stays the plain animal. |
| 6 | Art production route | **Pure AI generation + automated downscale pipeline** (§3.4) for all categories, including the now-18px small units — no separate hand pixel-art pass. |
| 7 | Atlas consolidation (§3.3) | **Keep 13 separate atlases**, one per existing texture key — zero-touch `preload()`-only migration. Consolidation to 5 atlases remains available as a future optional cleanup, out of scope here. |

This plan is ready for implementation. All 6 phases (73–78) as sequenced in §4 are in scope, including the optional Phase 78 (now confirmed in-scope) and the 18px unit-size adjustment folded into Phases 75–76.

---

## 7. Definition of done (per phase)

- `npm run build` (`tsc --noEmit && vite build`) passes.
- `npm run lint` passes.
- Game renders correctly at camera zoom 0.5, 1.0 and 2.0.
- Every frame's dimensions match the expected value (automated check).
- All variant swaps in the phase's scope verified in-game (house tiers, gate open/close, accent tweens, night tint).
- No procedural sprite definitions remain for the migrated category.
- `CLAUDE.md` Feature History row added.
- A `docs/phase_NN_*.md` written per the project convention.
