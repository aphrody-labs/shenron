export { hashFile, hashBuffer, dHash, hammingDistance } from "./hash";
export { bestVariant, variantScore, coversResolution, type ImageVariant } from "./variants";
export {
  dbPathToDisk,
  diskToDbPath,
  dbPathToUrlPath,
  normalizeDbPath,
  isImagePath,
  IMAGE_EXTENSIONS,
  type AssetRoots,
} from "./resolve";
export { provePixelEquality, prouverEgalitePixels, psnr, type PixelEqualityResult } from "./pixels";
export { toWebp, type ToWebpOptions, type ToWebpResult } from "./webp";
export {
  DEFAULT_IMAGE_CLASS,
  ENCODE_PROFILES,
  convertWithProof,
  isMonochrome,
  plannedVariants,
  supportedImageEncoders,
  toAvif,
  type AvifSettings,
  type ConvertOptions,
  type ConvertResult,
  type EncodeProfile,
  type EncoderSupport,
  type ImageClass,
  type ModernImageFormat,
  type ToAvifOptions,
  type WebpSettings,
} from "./encode";
export {
  selectionnerIllustration,
  selectIllustration,
  scoreCandidate,
  type IllustrationSource,
  type IllustrationEntity,
  type IllustrationCandidate,
  type IllustrationProvider,
  type SelectIllustrationInput,
  type SelectedIllustration,
} from "./select";
