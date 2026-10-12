export interface Preset {
  name: string;
  width: number;
  height: number;
}

const APPSTORE_PRESETS: Preset[] = [
  {
    name: "iphone_6_5_portrait",
    width: 1242,
    height: 2688,
  },
  {
    name: "iphone_6_5_landscape",
    width: 2688,
    height: 1242,
  },
  {
    name: "iphone_6_7_portrait",
    width: 1284,
    height: 2778,
  },
  {
    name: "iphone_6_7_landscape",
    width: 2778,
    height: 1284,
  },
];

const PAYWALL_PRESETS: Preset[] = [
  {
    name: "paywall",
    width: 640,
    height: 1136,
  },
];

export const PRESETS: Record<string, Preset[]> = {
  appstore: APPSTORE_PRESETS,
  appstore_all: APPSTORE_PRESETS,
  appstore_ready: APPSTORE_PRESETS,
  paywall: PAYWALL_PRESETS,
  iphone_6_5: [
    {
      name: "iphone_6_5_portrait",
      width: 1242,
      height: 2688,
    },
  ],
  iphone_6_7: [
    {
      name: "iphone_6_7_portrait",
      width: 1284,
      height: 2778,
    },
  ],
  all: [
    ...PAYWALL_PRESETS,
    {
      name: "iphone_6_5_portrait",
      width: 1242,
      height: 2688,
    },
    {
      name: "iphone_6_7_portrait",
      width: 1284,
      height: 2778,
    },
  ],
};

export const DEFAULT_PRESET_NAME = "appstore_all";
export const DEFAULT_MODE = "fill";
export const APPSTORE_PRESET_NAMES = new Set([
  "appstore",
  "appstore_all",
  "appstore_ready",
  "iphone_6_5",
  "iphone_6_7",
]);

const MAX_DIMENSION = 30000;
const SIZE_PATTERN = /^(\d+)\s*[x×]\s*(\d+)$/i;
const NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

function parseSingleSize(spec: string): Preset {
  const trimmed = spec.trim();

  if (!trimmed) {
    throw new Error("Empty size specification");
  }

  const separatorIndex = trimmed.lastIndexOf(":");
  const name =
    separatorIndex === -1 ? "custom" : trimmed.slice(0, separatorIndex).trim();
  const dimensions =
    separatorIndex === -1 ? trimmed : trimmed.slice(separatorIndex + 1).trim();

  if (!NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid size name "${name}" in "${trimmed}". Use letters, numbers, "_" or "-".`
    );
  }

  const match = SIZE_PATTERN.exec(dimensions);
  if (!match) {
    throw new Error(
      `Invalid size "${trimmed}". Expected WIDTHxHEIGHT, for example 1206x2622 or name:1206x2622.`
    );
  }

  const width = Number(match[1]);
  const height = Number(match[2]);

  if (width < 1 || height < 1) {
    throw new Error(`Invalid size "${trimmed}". Width and height must be at least 1.`);
  }

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new Error(
      `Invalid size "${trimmed}". Width and height must be at most ${MAX_DIMENSION}.`
    );
  }

  return { name, width, height };
}

/**
 * Parses custom size specs such as "1206x2622", "name:1206x2622", or a
 * comma-separated list of either form.
 */
export function parseCustomSizes(specs: string[]): Preset[] {
  const presets: Preset[] = [];
  const seen = new Set<string>();

  for (const spec of specs) {
    for (const part of spec.split(",")) {
      if (!part.trim()) {
        continue;
      }
      const preset = parseSingleSize(part);
      const key = `${preset.name}_${preset.width}x${preset.height}`;
      if (!seen.has(key)) {
        seen.add(key);
        presets.push(preset);
      }
    }
  }

  if (presets.length === 0) {
    throw new Error("No valid sizes provided");
  }

  return presets;
}

export function looksLikeSizeSpec(value: string): boolean {
  return value
    .split(",")
    .filter((part) => part.trim())
    .every((part) => {
      const separatorIndex = part.lastIndexOf(":");
      const dimensions =
        separatorIndex === -1 ? part : part.slice(separatorIndex + 1);
      return SIZE_PATTERN.test(dimensions.trim());
    });
}
