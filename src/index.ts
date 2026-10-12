#!/usr/bin/env node

import { Command } from "commander";
import path from "path";
import fs from "fs";
import {
  APPSTORE_PRESET_NAMES,
  DEFAULT_MODE,
  DEFAULT_PRESET_NAME,
  PRESETS,
  Preset,
  looksLikeSizeSpec,
  parseCustomSizes,
} from "./presets";
import { getImageFiles, getFileName } from "./file-utils";
import { resizeImage, ResizeMode } from "./image";

const program = new Command();

program
  .name("storeshot")
  .description("Generate App Store-ready screenshots from source images")
  .version("0.1.0")
  .argument("[inputDir]", "Input directory containing screenshots")
  .option("-i, --input <dir>", "Input directory containing screenshots")
  .option("-o, --output <dir>", "Output directory (default: ./output)")
  .option(
    "-p, --preset <name>",
    `Preset: ${Object.keys(PRESETS).join(", ")}, or a size like 1206x2622 (default: ${DEFAULT_PRESET_NAME})`
  )
  .option(
    "-s, --size <size>",
    'Custom size "WIDTHxHEIGHT" or "name:WIDTHxHEIGHT". Repeatable and comma-separated. Overrides --preset.',
    (value: string, previous: string[] = []) => previous.concat(value),
    [] as string[]
  )
  .option(
    "-m, --mode <mode>",
    "Resize mode: fill, fit, fit-blur, fit-edge (default: fill)"
  )
  .option("-f, --format <format>", "Force output format: png, jpg (default: png)")
  .option(
    "-b, --background <color>",
    "Background color for fit mode and alpha flattening (default: #ffffff)"
  )
  .option("--dry-run", "Preview without saving")
  .action(async (inputArg: string | undefined, options: any) => {
    try {
      const inputDir = inputArg || options.input || "./screenshots";
      const outputDir = options.output || "./output";
      const presetName = options.preset || DEFAULT_PRESET_NAME;
      const sizeSpecs: string[] = options.size || [];
      const mode: ResizeMode = (options.mode || DEFAULT_MODE) as ResizeMode;
      const isDryRun = options.dryRun || false;
      const forceFormat = options.format ? options.format.toLowerCase() : "png";
      const backgroundColor = options.background || "#ffffff";

      // Validate inputs
      if (!inputDir) {
        console.error("Error: --input directory is required");
        process.exit(1);
      }

      // Custom sizes take priority, then a preset name, then dimensions passed
      // through --preset as a convenience.
      let customPresets: Preset[] | null = null;

      if (sizeSpecs.length > 0) {
        try {
          customPresets = parseCustomSizes(sizeSpecs);
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exit(1);
        }
      } else if (!PRESETS[presetName] && looksLikeSizeSpec(presetName)) {
        try {
          customPresets = parseCustomSizes([presetName]);
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exit(1);
        }
      } else if (!PRESETS[presetName]) {
        console.error(
          `Error: Unknown preset "${presetName}". Available: ${Object.keys(PRESETS).join(", ")}. You can also pass a size like 1206x2622.`
        );
        process.exit(1);
      }

      const isCustom = customPresets !== null;

      if (!["fill", "fit", "fit-blur", "fit-edge"].includes(mode)) {
        console.error(
          `Error: Unknown mode "${mode}". Use: fill, fit, fit-blur, or fit-edge`
        );
        process.exit(1);
      }

      if (forceFormat && !["jpg", "jpeg", "png"].includes(forceFormat)) {
        console.error(`Error: Unknown format "${forceFormat}". Use: jpg or png`);
        process.exit(1);
      }

      // Get image files
      const imageFiles = await getImageFiles(inputDir);
      if (imageFiles.length === 0) {
        console.log("No image files found in", inputDir);
        return;
      }

      const presets = customPresets ?? PRESETS[presetName];

      console.log(`Found ${imageFiles.length} image(s)`);
      console.log(
        isCustom
          ? `Sizes: ${presets.map((preset) => `${preset.width}x${preset.height}`).join(", ")}`
          : `Preset: ${presetName}`
      );
      console.log(`Mode: ${mode}`);
      console.log(`Format: ${forceFormat}`);

      if (
        !isCustom &&
        APPSTORE_PRESET_NAMES.has(presetName) &&
        mode === "fit"
      ) {
        console.warn(
          "Warning: fit mode preserves borders with a solid background. Use fit-edge if you need padding without white bars or blur."
        );
      }

      if (isDryRun) {
        console.log("DRY RUN MODE - No files will be saved\n");
      }

      let processedCount = 0;

      // Process each image
      for (const imagePath of imageFiles) {
        const fileName = getFileName(imagePath);
        // Custom sizes are explicit, so orientation filtering is skipped.
        let selectedPresets = presets;
        if (!isCustom && APPSTORE_PRESET_NAMES.has(presetName)) {
          const imageMetadata = await resizeImageMetadata(imagePath);
          const isLandscapeSource = imageMetadata.width > imageMetadata.height;
          selectedPresets = presets.filter(
            (preset) => preset.width > preset.height === isLandscapeSource
          );
        }

        // Mirror folder structure from input
        const relativeDir = path.relative(inputDir, path.dirname(imagePath));
        const outputSubDir = path.join(outputDir, relativeDir);

        // Resize for each preset dimension
        for (const preset of selectedPresets) {
          const fileExtToUse = forceFormat === "jpg" || forceFormat === "jpeg" ? "jpg" : forceFormat;
          const outputFileName = `${fileName}_${preset.name}_${preset.width}x${preset.height}.${fileExtToUse}`;
          const outputPath = path.join(outputSubDir, outputFileName);

          try {
            if (!isDryRun) {
              fs.mkdirSync(outputSubDir, { recursive: true });
              await resizeImage(imagePath, outputPath, preset, {
                mode,
                backgroundColor,
              });
              console.log(`[OK] ${outputFileName}`);
            } else {
              console.log(`[PREVIEW] ${path.join(relativeDir, outputFileName)} (not saved in dry-run)`);
            }
            processedCount++;
          } catch (err) {
            console.error(`Failed to process ${outputFileName}:`, err);
          }
        }
      }

      console.log(`Processed ${processedCount} file(s)`);
      if (!isDryRun) {
        console.log(`Output: ${outputDir}`);
      }
    } catch (err) {
      console.error("Error:", err);
      process.exit(1);
    }
  });

// Help
program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}

async function resizeImageMetadata(inputPath: string): Promise<{ width: number; height: number }> {
  const { getImageDimensions } = await import("./image");
  return getImageDimensions(inputPath);
}
