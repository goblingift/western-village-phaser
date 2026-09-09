# Western Village — Asset Generation Checklist

**Purpose:** this is the exact, complete list of image assets the game's rendering pipeline expects, verified directly against the shipped code and placeholder atlas files (not just the original planning document). Generate each asset with your AI tool of choice, following the shared style rules below, then drop the finished files into `public/art/` at the exact paths named in each table. No code changes should be needed once real art replaces the placeholders — the pipeline already loads from these exact paths/filenames/frame layouts.

**Total: 84 individual images, packed into 14 atlas files.**

Run `npm run verify:art` after replacing any atlas to confirm dimensions and frame layout are still correct before testing in-game.

---

> ## ⚠️ NON-NEGOTIABLE CONSTRAINTS — READ BEFORE GENERATING ANYTHING
>
> Two mistakes will silently break the game with **no error message at all** — the sprite just renders wrong, misaligned, or with a solid magenta box around it, forever, until someone notices and re-checks the source file. Both are checked by `npm run verify:art`, but only *after* you've generated the art — catch them before that:
>
> 1. **Every non-terrain asset needs a real transparent alpha channel before it ships**, not a magenta background left in place. Generate on solid magenta `#FF00FF` (§2.6), then chroma-key it out (ImageMagick, remove.bg, your editor's "replace color with transparency") and confirm the saved PNG has an actual alpha channel — not just magenta pixels that merely *look* like background. Terrain tiles are the one exception: they must stay fully opaque with zero transparency (§2.6, §3).
> 2. **Final pixel dimensions must match exactly** — not "close enough," not "1px off because the AI tool rounded oddly." A building sprite is rendered at native texture size with `setOrigin(0, 0)` and is never rescaled — a 31×32 frame where 32×32 is expected doesn't error, it just silently drifts off the tile grid forever (§2.9).
>
> **You do not have to finish all 84 assets before you can see any of them in-game.** Each of the 14 atlas files is loaded independently by the game (`BootScene.preload()`), so you can, for example, finish only `buildings-atlas.png`/`buildings-atlas.json`, drop those two files into `public/art/`, run `npm run verify:art` followed by `npm run dev`, and see real building art next to placeholder art everywhere else. Iterate one category (one row of the §15 table) at a time rather than generating all 84 images before testing anything.

---

## 1. How this works — read this first

The game does **not** load one file per sprite. Each category is a single PNG "atlas" (a sprite sheet) with a matching `.json` file describing where each individual image sits inside it. You have two ways to work:

- **Option A (recommended): generate each individual asset as its own image**, at the exact pixel size listed in the tables below, then use any free spritesheet packer (e.g. [free-tex-packer](https://free-tex-packer.com/app/), TexturePacker, or a simple manual grid layout) to combine them into the atlas PNG, and export/hand-edit the matching JSON. This is far easier to iterate on and is what the tables below are organized for.
- **Option B: generate the whole atlas as one image** in one AI generation (e.g. "a sprite sheet with 4 chicken/pig/cow/ostrich icons side by side, each in its own 18x18 cell") — harder to get pixel-perfect boundaries, not recommended unless your tool is specifically good at grid layouts.

**The JSON format** (Phaser "JSONHash" atlas format) looks like this — you do not need to write these by hand if you use a packer tool, but here's the shape so you know what a packer needs to produce:

```json
{
  "frames": {
    "cowboy": {
      "frame": { "x": 0, "y": 0, "w": 18, "h": 18 },
      "sourceSize": { "w": 18, "h": 18 },
      "spriteSourceSize": { "x": 0, "y": 0, "w": 18, "h": 18 }
    }
  }
}
```

Every "frame name" listed in the tables below (e.g. `building-Well`, `animal-Chicken`, `raider-Outlaws`) **must appear exactly as spelled** as a key in that atlas's JSON — the code looks up sprites by these exact string names. Do not rename, abbreviate, or change capitalization.

**File naming:** every atlas has a `.png` and a `.json`, both living directly in `public/art/` — except that the terrain tileset's `.json` is documentation/tooling only and isn't actually loaded by the game (see §3 for why). Files live directly in `public/art/`, e.g.:
```
public/art/buildings-atlas.png
public/art/buildings-atlas.json
```

---

## 2. Shared style guide (apply to every asset)

### 2.1 Perspective
**Top-down with a slight forward lean (~30° downward angle).** You see a compressed roof/top surface at the top of the sprite and the front face below it. No side walls visible. No isometric diamond shape. No perspective vanishing point — the sprite is square-on and axis-aligned to the viewer. (This matches the game's existing tile-based engine — a true isometric or 3D-perspective angle would look broken next to the flat tilemap.)

### 2.2 Art style
**Hand-painted, detailed pixel art**, in the spirit of a late-1990s/2000s 2D settlement-building game (think *The Settlers II* or *Caesar III* sprite quality — dense, readable detail, painterly shading, crisp hard pixel edges). No anti-aliasing/blur, no smooth gradients, no photorealistic rendering.

### 2.3 Palette — Western / frontier, warm and sun-bleached

Lock every asset to this palette family so nothing looks like it's from a different game:

**Terrain / ground**
| Role | Hex |
|---|---|
| Dirt base | `#9C7B52` |
| Dirt shadow | `#836542` |
| Dirt highlight | `#B09067` |
| Gravel base | `#8A8172` |
| Gravel pebble | `#A9A094` |
| Sand base | `#D2B48C` |
| Sand highlight | `#E8D0A9` |
| Water mid | `#2F7FBF` |
| Water highlight | `#6EC6FF` |
| Rock base | `#6B6560` |

**Timber / structures (the dominant material — most buildings are wood-framed)**
| Role | Hex |
|---|---|
| Darkest wood / outline | `#3E2723` |
| Deep brown frame | `#4E342E` |
| Mid brown beam | `#5D4037` |
| Warm plank | `#6D4C41` |
| Light plank | `#8D6748` |
| Weathered tan | `#C9A063` |
| Bone / whitewash | `#D7CCC8` |

**Accent colors — use AT MOST ONE saturated accent per asset, sparingly**
| Role | Hex |
|---|---|
| Barn red / danger | `#B71C1C` |
| Brass / gold / lamplight | `#FFD54F` |
| Forge / fire orange | `#FF7043` |
| Sage / cactus green | `#689F38` |
| Sky-blue glass | `#90CAF9` |

**Rules:**
- No pure black (`#000000`) and no pure white (`#FFFFFF`), except tiny 1-pixel specular highlights.
- Overall feel: warm, dusty, sun-faded desert frontier. Anything cool/blue should only be water, glass, or the Bank building.

### 2.4 Lighting — the single most important consistency rule
**One light source, upper-left, high angle** (roughly a 10 o'clock position), applied identically to every single asset:
- Top and left-facing surfaces are lit/highlighted.
- Bottom and right-facing surfaces are in shadow.
- Cast shadows fall toward the **lower-right**.
- Shadows are warm brown-tinted, never neutral grey or blue.

If you generate assets across multiple sessions/days, re-paste this rule into every prompt — inconsistent light direction is the #1 giveaway that sprites came from different batches.

### 2.5 Outline
A thin (1px at final size) outline around each sprite's outer silhouette only, in a **darker shade of that part's own color** — not flat black. No outline on interior details.

### 2.6 Background — CRITICAL, read carefully
- **Every non-terrain asset must be generated on a solid, flat, uniform magenta background: `#FF00FF`.** This is a color that appears nowhere else in the palette, so it can be reliably "chroma-keyed" (made transparent) afterward in any image editor or with a free tool like [remove.bg](https://www.remove.bg/) or ImageMagick (`convert in.png -fuzz 12% -transparent '#FF00FF' out.png`). AI image tools are much more reliable at "solid flat background" than "transparent background" — asking for magenta and keying it out afterward gets a cleaner result than asking for transparency directly.
- **Terrain tiles are the one exception** — they must be fully opaque, edge-to-edge, with NO transparency at all (see §3).
- The final saved file must have a real alpha channel (transparent, not magenta) before it goes into `public/art/`.
- A soft, semi-transparent dark shadow-ellipse at the base of a sprite (grounding it visually) is welcome, as long as it stays fully inside the frame.

### 2.7 Framing
Single subject, centered, filling most of the frame with a small margin. No text, no watermark, no UI chrome, no border, no background scenery beyond the subject's own contact shadow.

### 2.8 File format
**Author in PNG**, with an alpha channel (RGBA), for every asset except the terrain tileset (opaque RGB is fine there too, but RGBA is safe/preferred everywhere).

**Then convert to WebP — this is a required final step (Phase 90).** The game only ever requests `.webp`; a PNG dropped into `public/art/` will simply 404 at load. Every filename written `*.png` throughout this document therefore means "author it as `.png`, ship it as `.webp`":

```bash
python3 tools/asset_generation/convert_to_webp.py   # converts every PNG under public/art/, deletes the PNGs
npm run verify:art                                  # fails with a "run convert_to_webp.py" hint if any category is still PNG-only
```

Why: the whole art set is eagerly preloaded before the game starts, and 7.84 MB of PNG became 2.34 MB of WebP (70% smaller) at quality 90 with a **bit-exact alpha plane** — measured on the real assets, indistinguishable side-by-side at 3× magnification, and the game renders these downscaled anyway. Quality is one constant (`WEBP_QUALITY`) in that script if it ever needs retuning.

### 2.9 Generate large, downscale to exact size
AI tools produce their best detail at large canvas sizes. Generate at a large size (roughly 16-64x the final target — see the per-category "generate at" hint in each table) then downscale to the **exact final pixel dimensions listed** using a sharp/pixel-preserving downscale (nearest-neighbor or a two-step bicubic-then-nearest — avoid a single soft blur-downscale, it will muddy fine pixel detail). **The final dimensions must match exactly** — even 1 pixel off will misalign a building on the game's tile grid.

### 2.10 Reusable prompt template

Paste this before every generation, filling in the bracketed fields:

```
STYLE: Hand-painted detailed pixel art game sprite, in the style of a
classic late-1990s 2D settlement-building strategy game (Settlers II /
Caesar III sprite quality). Dense readable detail, painterly dithered
shading, crisp hard pixel edges, no anti-aliasing, no blur, no gradients.

PERSPECTIVE: Orthographic top-down with a slight downward front lean
(approx 30 degrees). Compressed roof/top surface at the top of the
sprite, front face below it. NO side walls visible. NO isometric
diamond. NO perspective vanishing point. Square-on to the viewer.

LIGHTING: Single light source from the upper LEFT, high angle. Top and
left surfaces lit, bottom and right surfaces in shadow, cast shadows
fall to the lower right. Shadows are warm brown-tinted, never grey/blue.

OUTLINE: Thin 1-pixel selective outline around the outer silhouette
only, in a darker shade of each part's own local color (NOT flat
black). No outline on interior details.

PALETTE: Restricted, sun-bleached American Old West / desert frontier
palette. Wood tones #3E2723 #4E342E #5D4037 #6D4C41 #8D6748 #C9A063.
Ground tones #9C7B52 #8A8172 #D2B48C. Bone/cream #D7CCC8. Use AT MOST
ONE saturated accent from: barn red #B71C1C, brass gold #FFD54F, forge
orange #FF7043, sage green #689F38, sky-blue glass #90CAF9. NO pure
black, NO pure white, NO neon colors. Warm, dusty, sun-faded overall.

BACKGROUND: Solid flat magenta #FF00FF background, completely uniform,
no gradient, no texture. Subject must not touch the frame edges. Clean
hard edges against the magenta for easy removal.

FRAMING: Single object, centered, filling the frame. No text, no
labels, no watermark, no UI, no border.

SUBJECT: [fill in — see per-asset description below]

CANVAS: [fill in — generation size from the table]
```

### 2.11 Consistency tips
1. Generate the first 3-4 buildings, pick your favorites, and **use one of them as an image reference** for every subsequent generation if your tool supports reference images — this does more for consistency than the text prompt alone.
2. Generate everything within one category (e.g. all buildings) in one sitting/session rather than spread over days — AI models drift subtly over time/sessions.
3. Generate each asset 2-3 times and pick the best result.
4. After finishing a category, lay all its outputs side by side and eyeball them for light-direction or palette drift before finalizing.

---

## 3. Terrain tiles — `tiles-atlas.png`

**Special case — this is the one category NOT loaded via `this.load.atlas()`, and that's intentional, not an oversight.** Every other category in this doc is loaded as a named-frame JSON atlas (`this.load.atlas(key, png, json)`), which any `add.image(x, y, key, 'frame-name')` call can look up by name. The terrain tileset instead feeds Phaser's tilemap system (`Tilemap.addTilesetImage()`), which needs a texture it can slice into a uniform grid **by numeric tile index** — it was built for classic spritesheet-style tilesets, not arbitrarily-packed named atlas frames. Investigation during Phase 79 (see `src/scenes/BootScene.ts`'s `preload()` comment for the full trace through Phaser's own source) confirmed switching this to `this.load.atlas()` would add real risk (an atlas loader is optimized for arbitrary frame packing, not the fixed left-to-right grid `addTilesetImage` expects) for zero practical benefit, since the tilemap code path never reads named JSON frames in the first place. So: **`tiles-atlas.png` is loaded as a plain image** (`this.load.image(...)`), and the 5 tiles must sit **left-to-right in this exact order** in one image, each exactly 32×32px, laid edge-to-edge with no gaps or borders between them.

A companion `public/art/tiles-atlas.json` does exist in the repo (frame names `tile-Dirt` through `tile-Rock`) — but it is **documentation/tooling only**. It's there so this category can still be inspected/verified the same way every other atlas is (`npm run verify:art` checks it), and so a spritesheet-packer tool has an accurate frame map to work from if you use one to lay out the PNG. The running game never loads or reads this JSON file. When you replace `tiles-atlas.png` with real art, you do **not** need to hand-edit `tiles-atlas.json` to match — its frame positions are fixed by the tile order/size above and won't change unless that 5-tile layout itself changes.

**Final file:** `public/art/tiles-atlas.png` — exactly **160×32px** (5 tiles × 32px, 1 row, 32px tall).

**These tiles are opaque, edge-to-edge, no transparency, and must tile seamlessly** — the same tile repeats up to hundreds of times across the map, so any vignette, centered-composition, or lighting falloff will create a visible grid pattern. Add to every terrain prompt: *"Seamless tileable texture, uniform lighting across the entire tile, no vignette, no centered subject, detail spread evenly to all four edges."* Test by tiling the image 3×3 in an editor before finalizing — if you can see the tile boundary, it needs more even detail distribution.

| Order | Terrain | Generate at | Final size | Notes |
|---|---|---|---|---|
| 1st (leftmost) | Dirt | 512×512 | 32×32 | Base tone `#9C7B52`, dry cracked-earth texture, sparse dark cracks |
| 2nd | Gravel | 512×512 | 32×32 | Base tone `#8A8172`, small scattered pebbles/stones |
| 3rd | Sand | 512×512 | 32×32 | Base tone `#D2B48C`, fine wind-swept ripple texture |
| 4th | Water | 512×512 | 32×32 | Base tone `#2F7FBF`, gentle ripple pattern, `#6EC6FF` highlights |
| 5th (rightmost) | Rock | 512×512 | 32×32 | Base tone `#6B6560`, cracked stone/bedrock texture |

---

## 4. Buildings — `buildings-atlas.png` + `buildings-atlas.json`

**34 building types + 3 texture-variant frames = 37 total frames.**

Frame size depends on the building's footprint: **1×1 buildings are 32×32px. 2×2 buildings are 64×64px.** The building's base/foundation must touch the bottom edge of its frame, with the roof at the top — the whole structure must read as occupying exactly its square plot of land, nothing overhanging the frame.

Generate at: **512×512 for 1×1 buildings, 1024×1024 for 2×2 buildings**, then downscale.

Grouped below by the game's own building-bar categories, so you can batch similar buildings together for visual consistency within a trade/purpose. Frame name is exactly what must appear as the JSON key.

### 4.1 Housing & Storage (6 buildings, 1 gets 2 extra tier variants)

| Frame name | Building | Size | Description |
|---|---|---|---|
| `building-Well` | Well | 32×32 | Wooden well with a peaked roof frame and a hand-crank winch/bucket assembly |
| `building-House` | House (Tier 1) | 32×32 | Small modest wooden frontier house, single window, simple door |
| `building-House-tier2` | House (Tier 2) | 32×32 | Same house, upgraded — a second window row, painted trim stripe, more prosperous look |
| `building-House-tier3` | House (Tier 3) | 32×32 | Same house, further upgraded — twin windows, a small balcony rail, flagged parapet, gold trim accent, most prosperous |
| `building-Warehouse` | Warehouse | 64×64 | Large barn-style storage building, wide sliding hay-loft door, planked walls |
| `building-Granary` | Granary | 32×32 | Tall narrow conical-roofed grain silo, corrugated banding, small chute at the base |
| `building-WaterTower` | Water Tower | 32×32 | Cone-roofed water tank on a two-post wooden frame, small gauge window |
| `building-Church` | Church | 64×64 | Small frontier chapel — steeple with a cross, arched window, double doors |

### 4.2 Roads & Walls (5 buildings)

| Frame name | Building | Size | Description |
|---|---|---|---|
| `building-Road` | Road | 32×32 | Dirt wagon-wheel-rut road tile, two parallel dark rut lines running through, must connect visually with itself when tiled |
| `building-Fence` | Fence | 32×32 | Simple wooden rail fence, horizontal rails with visible gaps (reads as passable/low) |
| `building-Gate` | Gate (legacy, always-open) | 32×32 | A gap in a fence line with a visibly open lane down the middle, simple posts |
| `building-WoodenWall` | Wooden Wall | 32×32 | Solid, tightly-packed vertical wood planks with a cap rail — must read as visually SOLID and impassable, no gaps, distinct from the Fence's open-rail look |
| `building-WoodenGate` | Wooden Gate (open) | 32×32 | An openable gate in a wall line, shown in its OPEN state — visibly open lane |
| `building-WoodenGate-closed` | Wooden Gate (closed) | 32×32 | The SAME gate, shown CLOSED — the lane visibly filled/barred, reading as sealed like the Wooden Wall |

### 4.3 Livestock (4 buildings)

| Frame name | Building | Size | Description |
|---|---|---|---|
| `building-ChickenFarm` | Chicken Farm | 32×32 | Small wooden coop with a chicken-wire opening/flap door |
| `building-PigFarm` | Pig Farm | 64×64 | Timber pig pen/sty with a low mud-yard fence section |
| `building-CowRanch` | Cow Ranch | 64×64 | Larger ranch building with longhorn-horns motif and a hitching rail, distinct from Cattle-type farms |
| `building-OstrichFarm` | Ostrich Farm | 64×64 | Farm building with a tall bird-silhouette roofline motif, distinct from the coop-style Chicken Farm |

### 4.4 Farming & Forestry (6 buildings)

| Frame name | Building | Size | Description |
|---|---|---|---|
| `building-Forestry` | Forestry | 64×64 | Open-air pine-tree stand with a log pile, no walls |
| `building-PotatoField` | Potato Field | 64×64 | Open tilled furrows with potato sprigs/tubers visible, no walls |
| `building-CactusMilker` | Cactus Milker | 64×64 | Open-air desert stall for harvesting cactus juice, agave/cactus motif |
| `building-Quarry` | Quarry | 64×64 | Open-air rock-face pit with a stone pile and a leaning pickaxe, no walls |
| `building-IronMine` | Iron Mine | 64×64 | Dark mine-shaft entrance with visible ore in the wall window, small ore-cart rail yard |
| `building-CoalMine` | Coal Mine | 64×64 | Dark coal-seam open pit with a black coal pile, distinct from Iron Mine's ore-cart look |

### 4.5 Industry (5 buildings)

| Frame name | Building | Size | Description |
|---|---|---|---|
| `building-Butcher` | Butcher | 64×64 | Timber building with a meat-processing counter/cleaver window |
| `building-Sewery` | Sewery | 64×64 | Cloth-bolt and hide-drying-rack workshop |
| `building-WoodCutter` | Wood Cutter | 64×64 | Grey tin-roofed mill with a circular saw blade and stacked logs |
| `building-Liquor` | Liquor Still | 64×64 | Copper still with stacked barrels, a Butcher-style processing window |
| `building-Blacksmith` | Blacksmith | 64×64 | Forge workshop, anvil in an open window, glowing forge fire visible |

### 4.6 Commerce (5 buildings)

| Frame name | Building | Size | Description |
|---|---|---|---|
| `building-Supermarket` | Supermarket | 64×64 | General-store style building with barrel/crate displays |
| `building-Saloon` | Saloon | 64×64 | Stepped false-front parapet, hanging sign, upstairs window row with balcony rail, batwing doors |
| `building-Bank` | Bank | 64×64 | Stone-colonnade facade, distinct cool-grey palette from every other (mostly warm-wood) building |
| `building-TradingPost` | Trading Post | 64×64 | Open-sided market stall, candy-striped tent roof, hanging balance scale, counter crates/sacks |
| `building-Brothel` | Brothel | 64×64 | Two-storey false front, balcony, hanging lantern, upstairs window row, plain double doors, rose/dusky-pink accent |

### 4.7 Military (3 buildings)

| Frame name | Building | Size | Description |
|---|---|---|---|
| `building-Barracks` | Barracks | 64×64 | Fortified timber garrison building |
| `building-Horsery` | Horsery | 64×64 | Stable/corral — rail fence, hay bale, horse-head silhouette motif |
| `building-Watchtower` | Watchtower | 32×32 | Tall lookout cabin raised on stilts |

---

## 5. Player units — one atlas file per unit type

All at **18×18px** except Cowboy on Horse, which is non-square. **Pose: standing still, side-on/three-quarter view, facing RIGHT, neutral idle stance, both feet on the ground, arms at sides. NOT mid-stride, NOT attacking — a single static frame.** Because these render very small, prioritize a bold, instantly-readable silhouette over fine detail — strong value contrast, simple clear shapes.

**Mirroring note:** the game flips these sprites horizontally to face left. Avoid strongly asymmetric details (e.g. an item only on the right hip) unless you're fine with it "swapping sides" when facing left — center or duplicate identity-defining details on both sides where possible.

Generate at: **768×768** (1024×768 for the non-square mounted unit).

| Atlas file | Frame name | Size | Description |
|---|---|---|---|
| `public/art/cowboys-atlas.png/.json` | `cowboy` | 18×18 | Classic cowboy — wide-brim hat, vest, holstered revolver |
| `public/art/mounted-cowboys-atlas.png/.json` | `cowboy-on-horse` | 24×18 | Cowboy mounted on a horse — wider frame to fit horse+rider silhouette |
| `public/art/brawlers-atlas.png/.json` | `brawler` | 18×18 | Melee tank — bulky build, bare knuckles visible on both sides of the torso |
| `public/art/dynamiters-atlas.png/.json` | `dynamiter` | 18×18 | Demolitions unit — dark hat, a bandolier/satchel strapped diagonally across the chest, single bright lit-fuse spark above the hat |

---

## 6. Villager — `villagers-atlas.png` + `villagers-atlas.json`

Generate at: **768×768**.

| Frame name | Size | Description |
|---|---|---|
| `villager` | 18×18 | Ordinary frontier townsperson — simple everyday clothing, distinct silhouette from the armed player units (no visible weapon/holster) |

---

## 7. Animals — `animals-atlas.png` + `animals-atlas.json`

Same pose/readability rules as player units (§5) — small, simple, strong silhouette. Generate at: **768×768** each.

| Frame name | Animal | Size | Description |
|---|---|---|---|
| `animal-Chicken` | Chicken | 18×18 | Small chicken, side profile |
| `animal-Pig` | Pig | 18×18 | Small pig, side profile |
| `animal-Cow` | Cow | 18×18 | Cow with visible longhorns, side profile |
| `animal-Ostrich` | Ostrich | 18×18 | Tall ostrich silhouette, side profile, clearly taller/leaner than the other three |

---

## 8. Raiders — `raiders-atlas.png` + `raiders-atlas.json`

Hostile human enemies, one per faction. Same pose rules as §5. Generate at: **768×768** each.

| Frame name | Faction | Size | Description |
|---|---|---|---|
| `raider-Outlaws` | Outlaws | 18×18 | Gunslinger-style outlaw, dark clothing, holstered weapon |
| `raider-Rustlers` | Rustlers | 18×18 | Cattle-thief styled raider, rope/lasso motif |
| `raider-Coyotes` | Coyotes (faction) | 18×18 | **This is a human raider faction named "Coyotes" (a gang name), NOT the wildlife animal below** — scrappy/ragged bandit look. Give it a small red bandana marker (worn on the face/neck) to visually distinguish this HOSTILE FACTION version from the separate ambient wildlife Coyote animal in §9, since both are conceptually "coyotes" but must read as different things in-game |

---

## 9. Raider camps — `raider-camps-atlas.png` + `raider-camps-atlas.json`

Larger stationary structures (not units) — a raiding faction's home base on the map. All **24×24px**. Generate at: **768×768** each.

| Frame name | Faction | Size | Description |
|---|---|---|---|
| `raider-camp-Outlaws` | Outlaws camp | 24×24 | Two-peaked tent camp over a small campfire; distinguishing detail: stacked rifles or a hitching post |
| `raider-camp-Rustlers` | Rustlers camp | 24×24 | Same tent-camp base shape, different tent-canvas color; distinguishing detail: a small cattle pen / roped stock |
| `raider-camp-Coyotes` | Coyotes camp | 24×24 | Same tent-camp base shape, different tent-canvas color, scrappier/rougher lean-to feel; distinguishing detail: a small bone pile |

---

## 10. Wildlife — `wildlife-atlas.png` + `wildlife-atlas.json`

Ambient hostile animals that roam the map (distinct from the Raiders faction system in §8). Same pose rules as §5. Generate at: **768×768** each.

| Frame name | Animal | Size | Description |
|---|---|---|---|
| `wildlife-Snake` | Snake | 18×18 | Coiled/low snake silhouette, desert rattlesnake styling |
| `wildlife-Coyote` | Coyote (ambient wildlife) | 18×18 | Plain wild coyote, side profile, **NO bandana/marker** — this is the ordinary ambient animal, visually distinct from the `raider-Coyotes` HUMAN faction unit in §8 which does have a bandana; both should still read as "the same base animal palette" so the connection is recognizable, just without the human-faction marker |
| `wildlife-MountainLion` | Mountain Lion | 18×18 | Larger, more imposing wild cat silhouette — should read as visibly more dangerous/bigger than the Snake or Coyote |

---

## 11. Vegetation — `vegetation-atlas.png` + `vegetation-atlas.json`

Tile-sized, **32×32px** each. Generate at: **512×512** each.

| Frame name | Kind | Size | Description |
|---|---|---|---|
| `vegetation-Tree` | Tree | 32×32 | Single pine/desert tree, full tile-height, base touching the bottom of the frame |
| `vegetation-Cactus` | Cactus | 32×32 | Single saguaro-style cactus, full tile-height, base touching the bottom of the frame |

---

## 12. Goods cart — `carts-atlas.png` + `carts-atlas.json`

One non-square frame. Generate at: **896×640**.

| Frame name | Size | Description |
|---|---|---|
| `goods-cart` | 14×10 | Small wagon/cart — tan cargo crates over a dark wood bed, two visible wheel hubs, wider than tall |

---

## 13. Accents — `accents-atlas.png` + `accents-atlas.json`

**These are small decorative pieces that visually attach to and animate on top of specific buildings** (a well's crank that rotates, a door that swings, etc). Each has a fixed, unusual shape/aspect ratio — respect the exact width/height given, since the game code positions and pivots each one at a hardcoded spot on its parent building. Generate at roughly 16x the target size (see individual notes), matching each accent's own aspect ratio.

| Frame name | Belongs to | Size | Description | Motion in-game (for context only, doesn't affect the image) |
|---|---|---|---|---|
| `accent-WellCrank` | Well | 16×4 | A thin horizontal wooden crank-bar/handle, matching the Well building's material/style | Rotates back and forth like a crank being turned |
| `accent-WarehouseDoor` | Warehouse | 24×24 | A hay-loft door panel, matching the Warehouse's plank material | Swings open/closed on a top hinge |
| `accent-SupermarketAwning` | Supermarket | 64×8 | A long thin striped fabric awning strip | Sways side to side |
| `accent-ChickenDoor` | Chicken Farm | 16×12 | A small coop door/flap opening | Flaps open and closed |
| `accent-HouseWindowLight` | House | 12×12 | A small glowing window-light square, warm lamplight color (`#FFD54F`-family) | Fades in/out at night — should look good as a glowing warm square even static |
| `accent-Campfire` | Barracks (in its yard, not on the roof) | 12×12 | A small campfire — orange/red flame over dark logs | Flickers (slight scale pulse) and fades with the day/night cycle |

**Important:** each accent should be styled to visually match the material/palette of the building it belongs to (e.g. `accent-WarehouseDoor` should use the same plank-wood tones as `building-Warehouse`), since in-game it renders directly on top of that building.

---

## 14. Resource icons — `resource-icons-atlas.png` + `resource-icons-atlas.json`

Small HUD icons, one per resource type, **12×12px** each. These appear in the resource bar UI, not the game world — can be a bit more simplified/iconic than the world sprites, but should still follow the same style/lighting/outline rules. Generate at: **768×768** each.

| Frame name | Resource | Size | Suggested color association |
|---|---|---|---|
| `resource-icon-rawMeat` | Raw Meat | 12×12 | Red/pink raw meat cut |
| `resource-icon-meat` | Meat | 12×12 | Reddish-brown cooked/cured meat |
| `resource-icon-water` | Water | 12×12 | Blue droplet or bucket |
| `resource-icon-eggs` | Eggs | 12×12 | Cream/white egg(s) |
| `resource-icon-leather` | Leather | 12×12 | Tan/brown hide |
| `resource-icon-clothes` | Clothes | 12×12 | Folded fabric, a neutral cloth color |
| `resource-icon-logs` | Logs | 12×12 | Rough-cut brown log |
| `resource-icon-wood` | Wood | 12×12 | Processed wood planks, distinguishable from raw Logs |
| `resource-icon-potatoes` | Potatoes | 12×12 | Brown/tan potato |
| `resource-icon-liquor` | Liquor | 12×12 | Amber bottle |
| `resource-icon-agaveJuice` | Agave Juice | 12×12 | Green-tinted liquid/jug |
| `resource-icon-stone` | Stone | 12×12 | Grey rock chunk |
| `resource-icon-iron` | Iron | 12×12 | Rust-orange ore chunk |
| `resource-icon-tools` | Tools | 12×12 | Hammer or wrench silhouette |
| `resource-icon-coal` | Coal | 12×12 | Black/dark-grey coal chunk |

---

## 15. Complete checklist summary

| # | Atlas file(s) | Frames | Individual asset size(s) |
|---|---|---|---|
| 1 | `tiles-atlas.png` (+ docs-only JSON, see §3) | 5 | 32×32 each, 160×32 total strip |
| 2 | `buildings-atlas.png/.json` | 37 | 32×32 (1×1 buildings) or 64×64 (2×2 buildings) |
| 3 | `cowboys-atlas.png/.json` | 1 | 18×18 |
| 4 | `mounted-cowboys-atlas.png/.json` | 1 | 24×18 |
| 5 | `brawlers-atlas.png/.json` | 1 | 18×18 |
| 6 | `dynamiters-atlas.png/.json` | 1 | 18×18 |
| 7 | `villagers-atlas.png/.json` | 1 | 18×18 |
| 8 | `animals-atlas.png/.json` | 4 | 18×18 each |
| 9 | `raiders-atlas.png/.json` | 3 | 18×18 each |
| 10 | `raider-camps-atlas.png/.json` | 3 | 24×24 each |
| 11 | `wildlife-atlas.png/.json` | 3 | 18×18 each |
| 12 | `vegetation-atlas.png/.json` | 2 | 32×32 each |
| 13 | `carts-atlas.png/.json` | 1 | 14×10 |
| 14 | `accents-atlas.png/.json` | 6 | various (see §13 table) |
| 15 | `resource-icons-atlas.png/.json` | 15 | 12×12 each |
| | **Total** | **84 frames / 14 atlas files** | |

---

## 16. When you're done

1. Replace each `public/art/<name>-atlas.png` (and its `.json`, where applicable) with your finished versions — **keep the exact same filenames and frame names**, just swap the content.
2. Run `npm run verify:art` from the project root — this checks every expected frame name exists at the correct size and will tell you exactly what's wrong if something doesn't match.
3. Run `npm run dev` and look at the game in the browser to confirm everything renders correctly, at a few different zoom levels.

No code changes should be required — the loading pipeline already expects exactly these files, names, and sizes.

### 16.1 Reading a `npm run verify:art` failure

`npm run verify:art` runs 7 separate check scripts in sequence (whole-file dimension checks, then one per-frame-name/size check per atlas category) and always runs all of them, even after an early one fails — so a single run gives you the complete picture, not just the first problem. Every failing line is prefixed `[FAIL]`; a fully passing run ends with `All 7 art pipeline checks passed.` The failure message tells you which of four things went wrong:

- **`[FAIL] public/art/<name>-atlas.png: file does not exist.`**
  The PNG (or, for a per-frame check, the `.json`) is missing entirely from `public/art/` — you forgot to add it, or it's named/placed wrong. Double-check the exact filename against the table for that category (case-sensitive, and note the `-atlas.png`/`-atlas.json` suffix on every file).

- **`[FAIL] public/art/<name>-atlas.png: expected WxHpx (...), found W'xH'px.`**
  The whole PNG file's overall pixel dimensions don't match what's expected for that atlas — usually because one or more individual frames inside it were generated at the wrong size, or the frames weren't packed edge-to-edge with no gaps/borders between them. This is a **whole-file** check (`verify-asset-dimensions.mjs`); it can't tell you *which* frame is wrong, only that the total doesn't add up — the frame-name checks (see below) narrow it down further for every category except the terrain tileset.

- **`[FAIL] <atlas>.json: missing frame "<frame-name>".`**
  The PNG loaded fine, but its companion `.json` doesn't have an entry with that exact key. This is almost always a **naming mismatch** — a typo, wrong capitalization, or an abbreviated/renamed key produced by a spritesheet-packer tool that didn't preserve your intended names. Frame names must match **exactly** as spelled in each category's table (§4-§14) — re-check the JSON's `"frames"` object keys against the table.

- **`[FAIL] <atlas>.json: frame "<frame-name>" expected width/height Npx, found N'px.`**
  The frame exists under the right name, but its packed rectangle in the JSON (the `frame.w`/`frame.h` values) is the wrong size — the individual source image was generated at the wrong pixel dimensions before packing, or a packer tool auto-trimmed/padded it. Width and height are checked independently (not combined into an area check), specifically so a non-square asset's width/height getting swapped (e.g. the 14×10 goods cart becoming 10×14) is still caught even though the total pixel count would be identical.

- **`[FAIL] Could not parse <atlas>.json as JSON: <parser error>`**
  The `.json` file is present but not valid JSON — usually a corrupted/truncated save, a stray trailing comma, or a packer tool's export not actually finishing. Open the file in a text editor and check it's complete, well-formed JSON (the parser error message will usually point at roughly where it broke).

- **`[FAIL] <path>: could not read PNG dimensions (<error>).`**
  The PNG file exists but isn't readable as a valid PNG — usually a corrupted or truncated download/save, or a file that was accidentally saved in a different format with a `.png` extension. Re-export/re-save the file and confirm it opens correctly in an image viewer first.

After fixing whatever the message points at, just re-run `npm run verify:art` — it's cheap and fully re-checks everything, so there's no need to track down and re-run just the one script that failed.
