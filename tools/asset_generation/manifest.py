"""
Asset manifest for Western Village's AI art generation pipeline.

Transcribed directly from docs/ASSET_GENERATION_CHECKLIST.md (the source of
truth for frame names, sizes, and per-asset descriptions). If that checklist
changes (a building added/removed/resized, a resource added, etc.), update
this file to match — generate_assets.py has no independent knowledge of the
game's real asset requirements.

Each category becomes exactly one atlas file in public/art/. `terrain=True`
(tiles only) means: generate opaque (no magenta background, no chroma-key
step) and skip the "seamless tileable" instruction is added separately, not
the magenta/background rules that apply to every other category.

`gen` is the "generate at" hint from the checklist (a square or WxH pixel
size to ask the model for before downscaling to the exact final frame size).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Frame:
    name: str  # exact Phaser atlas frame name (must match buildingConfig.ts etc. verbatim)
    w: int
    h: int
    gen: int | tuple[int, int]  # square generation size, or (w, h) for non-square
    subject: str  # per-asset SUBJECT line for the shared prompt template


@dataclass(frozen=True)
class Category:
    key: str  # short id used on the CLI, e.g. "buildings"
    atlas_basename: str  # public/art/<atlas_basename>-atlas.png/.json
    frames: tuple[Frame, ...]
    terrain: bool = False  # opaque, no chroma-key, "seamless tileable" instruction
    write_json: bool = True  # tiles-atlas.json is docs-only but still written for consistency


# --- 1. Terrain tiles (docs/ASSET_GENERATION_CHECKLIST.md §3) ---------------

TILES = Category(
    key="tiles",
    atlas_basename="tiles",
    terrain=True,
    frames=(
        Frame("tile-Dirt", 128, 128, 1024,
              "Dry cracked-earth ground texture, base tone #9C7B52, sparse dark cracks."),
        Frame("tile-Gravel", 128, 128, 1024,
              "Gravel ground texture, base tone #8A8172, small scattered pebbles/stones."),
        Frame("tile-Sand", 128, 128, 1024,
              "Sand ground texture, base tone #D2B48C, fine wind-swept ripple texture."),
        Frame("tile-Water", 128, 128, 1024,
              "Water surface texture, base tone #2F7FBF, gentle ripple pattern, #6EC6FF highlights."),
        Frame("tile-Rock", 128, 128, 1024,
              "Cracked stone/bedrock ground texture, base tone #6B6560."),
    ),
)

# --- 2. Buildings (§4) -------------------------------------------------------
# Order mirrors tools/generate-placeholder-buildings.mjs's BUILDINGS table
# (BUILDING_DEFINITIONS declaration order) purely for diffability; packing
# order has no functional effect since frames are looked up by name.

BUILDINGS = Category(
    key="buildings",
    atlas_basename="buildings",
    frames=(
        Frame("building-OstrichFarm", 64, 64, 1024,
              "Farm building with a tall bird-silhouette roofline motif, distinct from the coop-style Chicken Farm."),
        Frame("building-Butcher", 64, 64, 1024,
              "Timber building with a meat-processing counter/cleaver window."),
        Frame("building-Well", 32, 32, 512,
              "Wooden well with a peaked roof frame and a hand-crank winch/bucket assembly."),
        Frame("building-House", 32, 32, 512,
              "Small modest wooden frontier house (Tier 1), single window, simple door."),
        Frame("building-Road", 32, 32, 512,
              "Dirt wagon-wheel-rut road tile, two parallel dark rut lines running through, must connect visually with itself when tiled."),
        Frame("building-ChickenFarm", 32, 32, 512,
              "Small wooden coop with a chicken-wire opening/flap door."),
        Frame("building-PigFarm", 64, 64, 1024,
              "Timber pig pen/sty with a low mud-yard fence section."),
        Frame("building-CowRanch", 64, 64, 1024,
              "Larger ranch building with longhorn-horns motif and a hitching rail, distinct from other cattle-type farms."),
        Frame("building-Fence", 32, 32, 512,
              "Simple wooden rail fence, horizontal rails with visible gaps (reads as passable/low)."),
        Frame("building-Gate", 32, 32, 512,
              "A gap in a fence line with a visibly open lane down the middle, simple posts."),
        Frame("building-WoodenWall", 32, 32, 512,
              "Solid, tightly-packed vertical wood planks with a cap rail — must read as visually SOLID and impassable, no gaps, distinct from the Fence's open-rail look."),
        Frame("building-WoodenGate", 32, 32, 512,
              "An openable gate in a wall line, shown in its OPEN state — visibly open lane."),
        Frame("building-Warehouse", 64, 64, 1024,
              "Large barn-style storage building, wide sliding hay-loft door, planked walls."),
        Frame("building-Granary", 32, 32, 512,
              "Tall narrow conical-roofed grain silo, corrugated banding, small chute at the base."),
        Frame("building-Supermarket", 64, 64, 1024,
              "General-store style building with barrel/crate displays."),
        Frame("building-Barracks", 64, 64, 1024,
              "Fortified timber garrison building."),
        Frame("building-Sewery", 64, 64, 1024,
              "Cloth-bolt and hide-drying-rack workshop."),
        Frame("building-Forestry", 64, 64, 1024,
              "Open-air pine-tree stand with a log pile, no walls."),
        Frame("building-WoodCutter", 64, 64, 1024,
              "Grey tin-roofed mill with a circular saw blade and stacked logs."),
        Frame("building-PotatoField", 64, 64, 1024,
              "Open tilled furrows with potato sprigs/tubers visible, no walls."),
        Frame("building-Liquor", 64, 64, 1024,
              "Copper still with stacked barrels, a Butcher-style processing window."),
        Frame("building-Saloon", 64, 64, 1024,
              "Stepped false-front parapet, hanging sign, upstairs window row with balcony rail, batwing doors."),
        Frame("building-Horsery", 64, 64, 1024,
              "Stable/corral — rail fence, hay bale, horse-head silhouette motif."),
        Frame("building-Bank", 64, 64, 1024,
              "Stone-colonnade facade, distinct cool-grey palette from every other (mostly warm-wood) building."),
        Frame("building-CactusMilker", 64, 64, 1024,
              "Open-air desert stall for harvesting cactus juice, agave/cactus motif."),
        Frame("building-Watchtower", 32, 32, 512,
              "Tall lookout cabin raised on stilts."),
        Frame("building-Quarry", 64, 64, 1024,
              "Open-air rock-face pit with a stone pile and a leaning pickaxe, no walls."),
        Frame("building-IronMine", 64, 64, 1024,
              "Dark mine-shaft entrance with visible ore in the wall window, small ore-cart rail yard."),
        Frame("building-CoalMine", 64, 64, 1024,
              "Dark coal-seam open pit with a black coal pile, distinct from Iron Mine's ore-cart look."),
        Frame("building-Blacksmith", 64, 64, 1024,
              "Forge workshop, anvil in an open window, glowing forge fire visible."),
        Frame("building-TradingPost", 64, 64, 1024,
              "Open-sided market stall, candy-striped tent roof, hanging balance scale, counter crates/sacks."),
        Frame("building-WaterTower", 32, 32, 512,
              "Cone-roofed water tank on a two-post wooden frame, small gauge window."),
        Frame("building-Church", 64, 64, 1024,
              "Small frontier chapel — steeple with a cross, arched window, double doors."),
        Frame("building-Brothel", 64, 64, 1024,
              "Two-storey false front, balcony, hanging lantern, upstairs window row, plain double doors, rose/dusky-pink accent."),
        Frame("building-Gunsmith", 64, 64, 1024,
              "Frontier gunsmith workshop — a walled workshop with a wide front "
              "window displaying racked long rifles, a workbench with gun parts, "
              "a hanging painted rifle sign over the door. Clearly a weapons shop, "
              "distinct from the Blacksmith's open anvil-and-forge look."),
        Frame("building-MarketStall", 32, 32, 512,
              "Tiny one-tile open market stall — a small wooden counter under a "
              "short striped awning, a couple of crates/baskets of eggs and produce "
              "on the counter, a simple hanging price board. Humble and cheap-looking, "
              "clearly a smaller/poorer sibling of the big Trading Post tent."),
        # Extra texture-variant frames (buildingTextureKey()) — always 1x1.
        Frame("building-House-tier2", 32, 32, 512,
              "The same frontier House, upgraded to Tier 2 — a second window row, painted trim stripe, more prosperous look."),
        Frame("building-House-tier3", 32, 32, 512,
              "The same frontier House, upgraded to Tier 3 — twin windows, a small balcony rail, flagged parapet, gold trim accent, most prosperous."),
        Frame("building-WoodenGate-closed", 32, 32, 512,
              "The same Wooden Gate, shown CLOSED — the lane visibly filled/barred, reading as sealed like the Wooden Wall."),
    ),
)

if len(BUILDINGS.frames) != 39:
    raise RuntimeError(f"Expected 39 building frames, found {len(BUILDINGS.frames)}")

# --- 3. Player units — one atlas per unit type (§5) --------------------------

_UNIT_POSE = (
    "Pose: standing still, side-on/three-quarter view, facing RIGHT, neutral idle "
    "stance, both feet on the ground, arms at sides. NOT mid-stride, NOT attacking — "
    "a single static frame. Bold, instantly-readable silhouette (renders very small). "
    "Avoid strongly asymmetric details unless fine with them swapping sides when the "
    "game flips the sprite to face left."
)

COWBOYS = Category(
    key="cowboys",
    atlas_basename="cowboys",
    frames=(
        Frame("cowboy", 18, 18, 768,
              f"Classic cowboy — wide-brim hat, vest, holstered revolver. {_UNIT_POSE}"),
    ),
)

MOUNTED_COWBOYS = Category(
    key="mounted-cowboys",
    atlas_basename="mounted-cowboys",
    frames=(
        Frame("cowboy-on-horse", 24, 18, (1024, 768),
              f"Cowboy mounted on a horse — wider frame to fit horse+rider silhouette. {_UNIT_POSE}"),
    ),
)

BRAWLERS = Category(
    key="brawlers",
    atlas_basename="brawlers",
    frames=(
        Frame("brawler", 18, 18, 768,
              f"Melee tank — bulky build, bare knuckles visible on both sides of the torso. {_UNIT_POSE}"),
    ),
)

DYNAMITERS = Category(
    key="dynamiters",
    atlas_basename="dynamiters",
    frames=(
        Frame("dynamiter", 18, 18, 768,
              "Demolitions unit — dark hat, a bandolier/satchel strapped diagonally across "
              f"the chest, single bright lit-fuse spark above the hat. {_UNIT_POSE}"),
    ),
)

# --- 4. Villager (§6) ---------------------------------------------------------

VILLAGERS = Category(
    key="villagers",
    atlas_basename="villagers",
    frames=(
        Frame("villager", 18, 18, 768,
              "Ordinary frontier townsperson — simple everyday clothing, distinct "
              f"silhouette from the armed player units (no visible weapon/holster). {_UNIT_POSE}"),
    ),
)

# --- 5. Animals (§7) -----------------------------------------------------------

ANIMALS = Category(
    key="animals",
    atlas_basename="animals",
    frames=(
        Frame("animal-Chicken", 18, 18, 768, f"Small chicken, side profile. {_UNIT_POSE}"),
        Frame("animal-Pig", 18, 18, 768, f"Small pig, side profile. {_UNIT_POSE}"),
        Frame("animal-Cow", 18, 18, 768, f"Cow with visible longhorns, side profile. {_UNIT_POSE}"),
        Frame("animal-Ostrich", 18, 18, 768,
              f"Tall ostrich silhouette, side profile, clearly taller/leaner than the other three farm animals. {_UNIT_POSE}"),
    ),
)

# --- 6. Raiders (§8) -----------------------------------------------------------

RAIDERS = Category(
    key="raiders",
    atlas_basename="raiders",
    frames=(
        Frame("raider-Outlaws", 18, 18, 768,
              f"Gunslinger-style hostile outlaw, dark clothing, holstered weapon. {_UNIT_POSE}"),
        Frame("raider-Rustlers", 18, 18, 768,
              f"Cattle-thief styled hostile raider, rope/lasso motif. {_UNIT_POSE}"),
        Frame("raider-Coyotes", 18, 18, 768,
              "A HUMAN raider faction named 'Coyotes' (a gang name), NOT the wildlife "
              "animal — scrappy/ragged bandit look. Give it a small red bandana marker "
              "worn on the face/neck, to visually distinguish this hostile human faction "
              f"from the separate ambient wildlife coyote animal. {_UNIT_POSE}"),
    ),
)

# --- 7. Raider camps (§9) -------------------------------------------------------

RAIDER_CAMPS = Category(
    key="raider-camps",
    atlas_basename="raider-camps",
    frames=(
        Frame("raider-camp-Outlaws", 24, 24, 768,
              "Outlaws faction camp — two-peaked tent camp over a small campfire; "
              "distinguishing detail: stacked rifles or a hitching post. Stationary "
              "structure, not a unit, viewed top-down with slight forward lean."),
        Frame("raider-camp-Rustlers", 24, 24, 768,
              "Rustlers faction camp — same tent-camp base shape as the Outlaws camp but "
              "a different tent-canvas color; distinguishing detail: a small cattle pen / "
              "roped stock. Stationary structure, top-down with slight forward lean."),
        Frame("raider-camp-Coyotes", 24, 24, 768,
              "Coyotes faction camp — same tent-camp base shape, different tent-canvas "
              "color, scrappier/rougher lean-to feel; distinguishing detail: a small bone "
              "pile. Stationary structure, top-down with slight forward lean."),
    ),
)

# --- 8. Wildlife (§10) -----------------------------------------------------------

WILDLIFE = Category(
    key="wildlife",
    atlas_basename="wildlife",
    frames=(
        Frame("wildlife-Snake", 18, 18, 768,
              f"Coiled/low snake silhouette, desert rattlesnake styling. {_UNIT_POSE}"),
        Frame("wildlife-Coyote", 18, 18, 768,
              "Plain wild coyote, side profile, NO bandana/marker — this is the ordinary "
              "ambient animal, visually distinct from the human raider faction's coyote "
              "unit (which wears a bandana), though it should share the same base animal "
              f"palette so the connection is still recognizable. {_UNIT_POSE}"),
        Frame("wildlife-MountainLion", 18, 18, 768,
              "Larger, more imposing wild cat silhouette — should read as visibly more "
              f"dangerous/bigger than the Snake or Coyote. {_UNIT_POSE}"),
    ),
)

# --- 9. Vegetation (§11) -----------------------------------------------------------

VEGETATION = Category(
    key="vegetation",
    atlas_basename="vegetation",
    frames=(
        Frame("vegetation-Tree", 32, 32, 512,
              "Single pine/desert tree, full tile-height, base touching the bottom of the frame."),
        Frame("vegetation-Cactus", 32, 32, 512,
              "Single saguaro-style cactus, full tile-height, base touching the bottom of the frame."),
    ),
)

# --- 10. Goods cart (§12) -----------------------------------------------------------

CARTS = Category(
    key="carts",
    atlas_basename="carts",
    frames=(
        Frame("goods-cart", 14, 10, (896, 640),
              "Small wagon/cart — tan cargo crates over a dark wood bed, two visible "
              "wheel hubs, wider than tall."),
    ),
)

# --- 11. Accents (§13) -----------------------------------------------------------
# Small decorative pieces that render on top of a specific building at a
# hardcoded pivot — exact width/height must be respected. "gen" here is
# roughly 16x each accent's own size, matching its own aspect ratio.

ACCENTS = Category(
    key="accents",
    atlas_basename="accents",
    frames=(
        Frame("accent-WellCrank", 16, 4, (256, 64),
              "A thin horizontal wooden crank-bar/handle, matching the Well building's "
              "material/style. In-game this rotates back and forth like a crank being turned."),
        Frame("accent-WarehouseDoor", 24, 24, 384,
              "A hay-loft door panel, matching the Warehouse's plank material. In-game "
              "this swings open/closed on a top hinge."),
        Frame("accent-SupermarketAwning", 64, 8, (1024, 128),
              "A long thin striped fabric awning strip. In-game this sways side to side."),
        Frame("accent-ChickenDoor", 16, 12, (256, 192),
              "A small coop door/flap opening. In-game this flaps open and closed."),
        Frame("accent-HouseWindowLight", 12, 12, 192,
              "A small glowing window-light square, warm lamplight color (#FFD54F family). "
              "In-game this fades in/out at night — should look good as a glowing warm "
              "square even static."),
        Frame("accent-Campfire", 12, 12, 192,
              "A small campfire — orange/red flame over dark logs. In-game this flickers "
              "(slight scale pulse) and fades with the day/night cycle."),
    ),
)

# --- 12. Resource icons (§14) -----------------------------------------------------------

RESOURCE_ICONS = Category(
    key="resource-icons",
    atlas_basename="resource-icons",
    frames=(
        Frame("resource-icon-rawMeat", 12, 12, 768, "Red/pink raw meat cut. Simplified/iconic HUD icon."),
        Frame("resource-icon-meat", 12, 12, 768, "Reddish-brown cooked/cured meat. Simplified/iconic HUD icon."),
        Frame("resource-icon-water", 12, 12, 768, "Blue droplet or bucket. Simplified/iconic HUD icon."),
        Frame("resource-icon-eggs", 12, 12, 768, "Cream/white egg(s). Simplified/iconic HUD icon."),
        Frame("resource-icon-leather", 12, 12, 768, "Tan/brown hide. Simplified/iconic HUD icon."),
        Frame("resource-icon-clothes", 12, 12, 768, "Folded fabric, a neutral cloth color. Simplified/iconic HUD icon."),
        Frame("resource-icon-logs", 12, 12, 768, "Rough-cut brown log. Simplified/iconic HUD icon."),
        Frame("resource-icon-wood", 12, 12, 768, "Processed wood planks, distinguishable from raw Logs. Simplified/iconic HUD icon."),
        Frame("resource-icon-potatoes", 12, 12, 768, "Brown/tan potato. Simplified/iconic HUD icon."),
        Frame("resource-icon-liquor", 12, 12, 768, "Amber bottle. Simplified/iconic HUD icon."),
        Frame("resource-icon-agaveJuice", 12, 12, 768, "Green-tinted liquid/jug. Simplified/iconic HUD icon."),
        Frame("resource-icon-stone", 12, 12, 768, "Grey rock chunk. Simplified/iconic HUD icon."),
        Frame("resource-icon-iron", 12, 12, 768, "Rust-orange ore chunk. Simplified/iconic HUD icon."),
        Frame("resource-icon-tools", 12, 12, 768, "Hammer or wrench silhouette. Simplified/iconic HUD icon."),
        Frame("resource-icon-coal", 12, 12, 768, "Black/dark-grey coal chunk. Simplified/iconic HUD icon."),
        Frame("resource-icon-rifles", 12, 12, 768, "A single lever-action rifle in side profile, brown stock and dark barrel. Simplified/iconic HUD icon."),
    ),
)

if len(RESOURCE_ICONS.frames) != 16:
    raise RuntimeError(f"Expected 16 resource icon frames, found {len(RESOURCE_ICONS.frames)}")

# -----------------------------------------------------------------------------

CATEGORIES: tuple[Category, ...] = (
    TILES,
    BUILDINGS,
    COWBOYS,
    MOUNTED_COWBOYS,
    BRAWLERS,
    DYNAMITERS,
    VILLAGERS,
    ANIMALS,
    RAIDERS,
    RAIDER_CAMPS,
    WILDLIFE,
    VEGETATION,
    CARTS,
    ACCENTS,
    RESOURCE_ICONS,
)

CATEGORIES_BY_KEY = {c.key: c for c in CATEGORIES}

_TOTAL_FRAMES = sum(len(c.frames) for c in CATEGORIES)
if _TOTAL_FRAMES != 87:
    raise RuntimeError(f"Expected 87 total frames across all categories, found {_TOTAL_FRAMES}")
