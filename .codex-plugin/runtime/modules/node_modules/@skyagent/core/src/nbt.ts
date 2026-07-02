import nbt from "prismarine-nbt";

export class NbtDecodeError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "NbtDecodeError";
    this.code = code;
  }
}

export type DecodedNbtPayload = {
  root: unknown;
  simplified: unknown;
  encoding: "base64-gzip-nbt";
  parser: string;
};

export function payloadData(payload: unknown): string | null {
  if (!payload) {
    return null;
  }
  if (typeof payload === "string") {
    return payload;
  }
  if (typeof payload === "object" && typeof (payload as { data?: unknown }).data === "string") {
    return (payload as { data: string }).data;
  }
  return null;
}

export async function decodeHypixelNbt(payload: unknown): Promise<DecodedNbtPayload> {
  const data = payloadData(payload);
  if (!data) {
    throw new NbtDecodeError("missing_nbt_payload", "NBT payload is missing or does not contain a data string.");
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(data, "base64");
  } catch (error) {
    throw new NbtDecodeError("invalid_base64", `NBT payload is not valid base64: ${(error as Error).message}`);
  }

  if (!buffer.length) {
    throw new NbtDecodeError("empty_nbt_payload", "NBT payload decoded to an empty buffer.");
  }

  try {
    const parsed = await nbt.parse(buffer);
    return {
      root: parsed.parsed,
      simplified: nbt.simplify(parsed.parsed),
      encoding: "base64-gzip-nbt",
      parser: "prismarine-nbt",
    };
  } catch (error) {
    throw new NbtDecodeError("corrupt_nbt_payload", `NBT payload could not be parsed: ${(error as Error).message}`);
  }
}

