// Only the standard API used here; no DOM or Node-specific types in core.
declare class TextDecoder {
  constructor(label: string, options: { fatal: boolean });
  decode(input: Uint8Array): string;
}
