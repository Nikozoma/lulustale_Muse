import type { ObjectRenderRule } from "./renderPlan";

export type SpriteCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ImageAsset = {
  key: string;
  sourcePath: string;
  href: string;
};

export type TileSprite = {
  imageKey: string;
  crop: SpriteCrop;
};

export type ObjectSprite = TileSprite & {
  note: string;
  render: ObjectRenderRule;
};

export type AssetManifest = {
  images: ImageAsset[];
  tiles: Record<string, TileSprite>;
  structures: Record<string, ObjectSprite>;
  objects: Record<string, ObjectSprite>;
};

const floors = imageAsset(
  "topDownFloorsWalls",
  "Top-Down_Retro_Interior/TopDownHouse_FloorsAndWalls.png",
  "/assets/top-down-retro-interior/TopDownHouse_FloorsAndWalls.png"
);
const doors = imageAsset(
  "topDownDoorsWindows",
  "Top-Down_Retro_Interior/TopDownHouse_DoorsAndWindows.png",
  "/assets/top-down-retro-interior/TopDownHouse_DoorsAndWindows.png"
);
const furniture = imageAsset(
  "topDownFurnitureState1",
  "Top-Down_Retro_Interior/TopDownHouse_FurnitureState1.png",
  "/assets/top-down-retro-interior/TopDownHouse_FurnitureState1.png"
);
const furnitureState2 = imageAsset(
  "topDownFurnitureState2",
  "Top-Down_Retro_Interior/TopDownHouse_FurnitureState2.png",
  "/assets/top-down-retro-interior/TopDownHouse_FurnitureState2.png"
);
const smallItems = imageAsset(
  "topDownSmallItems",
  "Top-Down_Retro_Interior/TopDownHouse_SmallItems.png",
  "/assets/top-down-retro-interior/TopDownHouse_SmallItems.png"
);
const modernInteriors = imageAsset(
  "modernInteriors32",
  "Modern_Interiors_Free_v2.2/Modern tiles_Free/Interiors_free/32x32/Interiors_free_32x32.png",
  "/assets/modern-interiors/Interiors_free_32x32.png"
);
const modernRoomBuilder = imageAsset(
  "modernRoomBuilder32",
  "Modern_Interiors_Free_v2.2/Modern tiles_Free/Room_Builder_free_32x32.png",
  "/assets/modern-interiors/Room_Builder_free_32x32.png"
);
const cityProps = imageAsset(
  "cityPropTiles",
  "City Prop Tileset update 2.png",
  "/assets/city/City Prop Tileset update 2.png"
);
const modernCity = imageAsset(
  "modernCityTiles",
  "modern pixel city tileset.png",
  "/assets/city/modern pixel city tileset.png"
);
export const ASSET_MANIFEST: AssetManifest = {
  images: [
    floors,
    doors,
    furniture,
    furnitureState2,
    smallItems,
    modernInteriors,
    modernRoomBuilder,
    cityProps,
    modernCity
  ],
  tiles: {
    home_floor: {
      imageKey: floors.key,
      crop: { x: 16, y: 80, width: 16, height: 16 }
    },
    home_wall: {
      imageKey: modernRoomBuilder.key,
      crop: { x: 0, y: 544, width: 32, height: 32 }
    },
    indoor_floor: {
      imageKey: floors.key,
      crop: { x: 144, y: 80, width: 16, height: 16 }
    },
    exterior_wall: {
      imageKey: floors.key,
      crop: { x: 80, y: 48, width: 16, height: 16 }
    },
    interior_wall: {
      imageKey: floors.key,
      crop: { x: 80, y: 48, width: 16, height: 16 }
    },
    window: {
      imageKey: doors.key,
      crop: { x: 96, y: 48, width: 32, height: 32 }
    },
    doorway: {
      imageKey: doors.key,
      crop: { x: 160, y: 80, width: 32, height: 48 }
    },
    entrance_exit: {
      imageKey: doors.key,
      crop: { x: 128, y: 80, width: 32, height: 48 }
    },
    street: {
      imageKey: cityProps.key,
      crop: { x: 224, y: 96, width: 32, height: 32 }
    },
    sidewalk: {
      imageKey: cityProps.key,
      crop: { x: 160, y: 224, width: 32, height: 32 }
    },
    parking_lot: {
      imageKey: cityProps.key,
      crop: { x: 320, y: 96, width: 32, height: 32 }
    },
    crosswalk: {
      imageKey: cityProps.key,
      crop: { x: 96, y: 64, width: 32, height: 32 }
    },
    grass: {
      imageKey: modernCity.key,
      crop: { x: 0, y: 208, width: 32, height: 32 }
    },
    player_apartment_building: {
      imageKey: cityProps.key,
      crop: { x: 0, y: 96, width: 32, height: 32 }
    },
    charles_jr_building: {
      imageKey: cityProps.key,
      crop: { x: 64, y: 256, width: 32, height: 32 }
    },
    apartment_building: {
      imageKey: cityProps.key,
      crop: { x: 0, y: 288, width: 32, height: 32 }
    },
    building_shell: {
      imageKey: cityProps.key,
      crop: { x: 0, y: 96, width: 32, height: 32 }
    },
    fence: {
      imageKey: modernCity.key,
      crop: { x: 416, y: 208, width: 32, height: 32 }
    },
    home_door: {
      imageKey: modernCity.key,
      crop: { x: 144, y: 0, width: 16, height: 32 }
    },
    charles_jr_door: {
      imageKey: cityProps.key,
      crop: { x: 192, y: 256, width: 32, height: 64 }
    }
  },
  structures: {
    player_apartment_building: {
      imageKey: modernCity.key,
      crop: { x: 304, y: 96, width: 128, height: 128 },
      render: { mode: "fillRegion", anchor: "bottom" },
      note: "Grouped large light building crop from modern pixel city tileset.png, used to make Lulu's home/apartment landmark read as one building instead of repeated wall blocks."
    },
    charles_jr_building: {
      imageKey: cityProps.key,
      crop: { x: 288, y: 256, width: 96, height: 64 },
      render: { mode: "fillRegion", anchor: "bottom" },
      note: "Grouped real orange storefront/sign crop from City Prop Tileset update 2.png, used to make the Charles Jr. destination distinct."
    },
    apartment_building: {
      imageKey: cityProps.key,
      crop: { x: 0, y: 96, width: 96, height: 128 },
      render: { mode: "fillRegion", anchor: "bottom" },
      note: "Grouped generic storefront/apartment facade crop from City Prop Tileset update 2.png."
    },
    building_shell: {
      imageKey: cityProps.key,
      crop: { x: 0, y: 96, width: 96, height: 128 },
      render: { mode: "fillRegion", anchor: "bottom" },
      note: "Generic grouped city facade fallback from City Prop Tileset update 2.png."
    }
  },
  objects: {
    booth_seat: {
      imageKey: furniture.key,
      crop: { x: 176, y: 160, width: 32, height: 32 },
      render: { mode: "tile", anchor: "center" },
      note: "Tiled booth seating using a square real sofa-back crop from TopDownHouse_FurnitureState1.png to avoid squeezed couch repeats."
    },
    bed: {
      imageKey: modernInteriors.key,
      crop: { x: 224, y: 2400, width: 64, height: 64 },
      render: { mode: "fit", widthTiles: 1.7, heightTiles: 2, anchor: "bottom" },
      note: "Legacy generic bed mapping retained for non-Home maps; Home uses the clearer home_bed crop below."
    },
    home_bed: {
      imageKey: modernInteriors.key,
      crop: { x: 224, y: 0, width: 64, height: 128 },
      render: { mode: "fit", widthTiles: 1.85, heightTiles: 2.15, anchor: "bottom" },
      note: "Home-only full bed crop from Interiors_free_32x32.png, chosen from the expanded public/assets set because it reads as an actual bed in Lulu's one-by-two bed footprint."
    },
    doorway: {
      imageKey: doors.key,
      crop: { x: 96, y: 80, width: 32, height: 48 },
      render: { mode: "fit", widthTiles: 1, heightTiles: 1.5, anchor: "bottom" },
      note: "Indoor open doorway frame from TopDownHouse_DoorsAndWindows.png for the home room divider."
    },
    couch: {
      imageKey: furniture.key,
      crop: { x: 0, y: 192, width: 32, height: 48 },
      render: { mode: "fit", widthTiles: 1, heightTiles: 1.75, anchor: "bottom" },
      note: "Vertical side-couch crop from TopDownHouse_FurnitureState1.png, fitted to the home couch footprint."
    },
    home_couch: {
      imageKey: furniture.key,
      crop: { x: 0, y: 192, width: 32, height: 64 },
      render: { mode: "fit", widthTiles: 1, heightTiles: 2, anchor: "bottom" },
      note: "Home-only full vertical couch crop from TopDownHouse_FurnitureState1.png; replaces the shorter generic crop so the two-cell couch footprint reads as one sofa."
    },
    table: {
      imageKey: furniture.key,
      crop: { x: 0, y: 32, width: 48, height: 32 },
      render: { mode: "fit", widthTiles: 1.75, heightTiles: 1.15, anchor: "center" },
      note: "Wide real table crop from TopDownHouse_FurnitureState1.png."
    },
    dining_table: {
      imageKey: furniture.key,
      crop: { x: 128, y: 0, width: 32, height: 32 },
      render: { mode: "fit", widthTiles: 1.25, heightTiles: 1.25, anchor: "center" },
      note: "Compact square table-and-chairs crop from TopDownHouse_FurnitureState1.png."
    },
    home_dining_table: {
      imageKey: furniture.key,
      crop: { x: 128, y: 0, width: 64, height: 32 },
      render: { mode: "fit", widthTiles: 2, heightTiles: 1, anchor: "center" },
      note: "Two-tile table-and-chair crop from TopDownHouse_FurnitureState1.png used only for Lulu's two-cell dining footprint."
    },
    refrigerator: {
      imageKey: furniture.key,
      crop: { x: 32, y: 192, width: 32, height: 64 },
      render: { mode: "fit", widthTiles: 1, heightTiles: 2, anchor: "bottom" },
      note: "Visible refrigerator from TopDownHouse_FurnitureState1.png."
    },
    home_refrigerator: {
      imageKey: furnitureState2.key,
      crop: { x: 32, y: 192, width: 32, height: 64 },
      render: { mode: "fit", widthTiles: 1, heightTiles: 2, anchor: "bottom" },
      note: "Home-only refrigerator from TopDownHouse_FurnitureState2.png with clearer interior detail for the dog-food objective."
    },
    stove: {
      imageKey: furniture.key,
      crop: { x: 64, y: 192, width: 32, height: 32 },
      render: { mode: "fit", widthTiles: 1, heightTiles: 1, anchor: "bottom" },
      note: "Visible stove from TopDownHouse_FurnitureState1.png."
    },
    sink: {
      imageKey: furniture.key,
      crop: { x: 96, y: 192, width: 32, height: 32 },
      render: { mode: "fit", widthTiles: 1, heightTiles: 1, anchor: "bottom" },
      note: "Visible sink from TopDownHouse_FurnitureState1.png."
    },
    home_sink: {
      imageKey: furnitureState2.key,
      crop: { x: 96, y: 192, width: 32, height: 32 },
      render: { mode: "fit", widthTiles: 1, heightTiles: 1, anchor: "bottom" },
      note: "Home-only sink from TopDownHouse_FurnitureState2.png, selected for stronger blue basin readability in the kitchen row."
    },
    counter_top: {
      imageKey: furniture.key,
      crop: { x: 128, y: 224, width: 32, height: 32 },
      render: { mode: "tile", anchor: "bottom" },
      note: "Tiled cabinet-front crop from TopDownHouse_FurnitureState1.png, using a full 32px cabinet cell for the fragmented home kitchen counters."
    },
    home_counter_top: {
      imageKey: furnitureState2.key,
      crop: { x: 128, y: 192, width: 32, height: 32 },
      render: { mode: "tile", anchor: "bottom" },
      note: "Home-only cabinet/counter tile from TopDownHouse_FurnitureState2.png for cleaner kitchen readability without changing semantic counter cells."
    },
    home_dog_bowl: {
      imageKey: smallItems.key,
      crop: { x: 64, y: 64, width: 16, height: 16 },
      render: { mode: "fit", widthTiles: 0.62, heightTiles: 0.45, anchor: "center" },
      note: "Small real bowl crop from TopDownHouse_SmallItems.png, used only for Home dog_bowl so the feed-dog objective has a visible prop."
    },
    cashier_counter: {
      imageKey: furniture.key,
      crop: { x: 96, y: 192, width: 96, height: 48 },
      render: { mode: "fillRegion", anchor: "bottom" },
      note: "Single stretched real kitchen-counter run from TopDownHouse_FurnitureState1.png for a cleaner cashier front."
    },
    furniture_appliance: {
      imageKey: furniture.key,
      crop: { x: 192, y: 192, width: 16, height: 48 },
      render: { mode: "fit", widthTiles: 1, heightTiles: 3, anchor: "bottom" },
      note: "Visible tall appliance/cabinet edge from TopDownHouse_FurnitureState1.png."
    },
    tree: {
      imageKey: cityProps.key,
      crop: { x: 448, y: 0, width: 64, height: 64 },
      render: { mode: "fit", widthTiles: 1.6, heightTiles: 2, anchor: "bottom" },
      note: "Outdoor tree crop from City Prop Tileset update 2.png, fitted over semantic tree cells."
    },
    bush: {
      imageKey: cityProps.key,
      crop: { x: 416, y: 256, width: 32, height: 32 },
      render: { mode: "fit", widthTiles: 1, heightTiles: 1, anchor: "center" },
      note: "Outdoor shrub/flower crop from City Prop Tileset update 2.png, clearer than the tiny nature-free decorative crop at overworld scale."
    }
  }
};

export type LoadedImages = Map<string, HTMLImageElement>;

export async function loadImages(manifest: AssetManifest): Promise<LoadedImages> {
  const loaded = new Map<string, HTMLImageElement>();

  await Promise.all(
    manifest.images.map(
      (asset) =>
        new Promise<void>((resolve, reject) => {
          const image = new Image();
          image.onload = () => {
            loaded.set(asset.key, image);
            resolve();
          };
          image.onerror = () => reject(new Error(`Unable to load real asset: ${asset.sourcePath}`));
          image.src = asset.href;
        })
    )
  );

  return loaded;
}

function imageAsset(key: string, sourcePath: string, href: string): ImageAsset {
  return {
    key,
    sourcePath,
    href
  };
}
