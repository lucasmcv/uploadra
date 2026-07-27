import type { Readable } from "node:stream";
import { LocalStorageDriver } from "./local";
import { S3StorageDriver } from "./s3";

export interface ByteRange {
  start: number;
  end: number;
}

export interface StorageDriver {
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  getObjectStream(key: string, range?: ByteRange): Promise<Readable>;
  getObjectSize(key: string): Promise<number>;
  /** Returns a presigned GET URL, or null if the driver has no such concept (e.g. local disk). */
  getPresignedGetUrl(key: string): Promise<string | null>;
  deleteObject(key: string): Promise<void>;
}

let cachedDriver: StorageDriver | null = null;

export function getStorageDriver(): StorageDriver {
  if (cachedDriver) return cachedDriver;

  cachedDriver =
    process.env.STORAGE_DRIVER === "s3" ? new S3StorageDriver() : new LocalStorageDriver();

  return cachedDriver;
}
