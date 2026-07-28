import type { Readable } from "node:stream";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ByteRange, StorageDriver } from "./index";

export class S3StorageDriver implements StorageDriver {
  private readonly client: S3Client;
  // Separate client used only for signing GET URLs. In Docker Compose the
  // server reaches MinIO via the internal service hostname (e.g.
  // "http://minio:9000"), but a presigned URL is followed by the user's
  // browser, which can't resolve that hostname — it needs the publicly
  // reachable one (e.g. "http://localhost:9000"). Real S3 has one public
  // endpoint, so S3_PUBLIC_ENDPOINT defaults to S3_ENDPOINT there.
  private readonly presignClient: S3Client;
  private readonly bucket: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET ?? "videos";
    const credentials = {
      accessKeyId: process.env.S3_ACCESS_KEY ?? "",
      secretAccessKey: process.env.S3_SECRET_KEY ?? "",
    };
    const region = process.env.S3_REGION ?? "us-east-1";
    const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === "true";

    this.client = new S3Client({
      endpoint: process.env.S3_ENDPOINT || undefined,
      region,
      forcePathStyle,
      credentials,
    });

    this.presignClient = new S3Client({
      endpoint: process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT || undefined,
      region,
      forcePathStyle,
      credentials,
    });
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
  }

  async getObjectStream(key: string, range?: ByteRange): Promise<Readable> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: range ? `bytes=${range.start}-${range.end}` : undefined,
      })
    );
    return result.Body as Readable;
  }

  async getObjectSize(key: string): Promise<number> {
    const result = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key })
    );
    return result.ContentLength ?? 0;
  }

  async getPresignedGetUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.presignClient, command, { expiresIn: 3600 });
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
