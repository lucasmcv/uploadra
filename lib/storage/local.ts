import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import type { ByteRange, StorageDriver } from "./index";

export class LocalStorageDriver implements StorageDriver {
  private readonly rootDir: string;

  constructor() {
    this.rootDir = path.resolve(process.cwd(), process.env.LOCAL_STORAGE_DIR ?? "./data/uploads");
  }

  private resolvePath(key: string): string {
    const resolved = path.resolve(this.rootDir, key);
    if (!resolved.startsWith(this.rootDir)) {
      throw new Error("Invalid storage key");
    }
    return resolved;
  }

  async putObject(key: string, body: Buffer): Promise<void> {
    const filePath = this.resolvePath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, body);
  }

  async getObjectStream(key: string, range?: ByteRange): Promise<Readable> {
    return createReadStream(
      this.resolvePath(key),
      range ? { start: range.start, end: range.end } : undefined
    );
  }

  async getObjectSize(key: string): Promise<number> {
    const stat = await fs.stat(this.resolvePath(key));
    return stat.size;
  }

  async getPresignedGetUrl(): Promise<string | null> {
    return null;
  }

  async deleteObject(key: string): Promise<void> {
    await fs.rm(this.resolvePath(key), { force: true });
  }
}
