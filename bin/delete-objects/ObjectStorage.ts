import AWS from 'aws-sdk';
import { existsSync, createReadStream } from 'fs';
import readline from 'readline';
import { createHash } from 'crypto';

import { ShardsRepository } from '../../lib/core/shards/Repository';
import { Shard } from '../../lib/core/shards/Shard';
import { BucketEntryDocument, FrameDocument, MongoDBCollections, TempShardDocument } from './temp-shard.model';
import { ObjectId } from 'mongodb';

export interface StorageObject {
  Key: string;
  Size: number;
  LastModified: Date;
}

export interface ObjectStorageReader {
  listObjects(pageSize: number): AsyncGenerator<StorageObject>;
  find(key: string): Promise<StorageObject | null>;
}

/**
 * The source should be a list of objects listed from the object storage. 
 * Never use a list of unfinished multiparts as the source of truth for the
 * object storage. This will cause unintended deletion of objects that are
 * still being uploaded.
 */
export class FileListObjectStorageReader implements ObjectStorageReader {
  private readonly filename: string;
  
  /**
   * 
   * @param filename The file should be a list of objects in the format:
   * ```
   * 1234 /path/to/object
   * 5678 /path/to/another/object
   * ```
   */
  constructor(filename: string) {
    if (filename === '') {
      throw new Error('File name cannot be empty');
    }
    if (!existsSync(filename)) {
      throw new Error(`File ${filename} does not exist`);
    }
    this.filename = filename;
  }

  async* listObjects(pageSize: number): AsyncGenerator<StorageObject> {
    const fileStream = createReadStream(this.filename);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity // To recognize '\n' as a line delimiter
    });

    for await (const line of rl) {
      const [Size, Key] = line.split(' ');
      yield { Key, Size: parseInt(Size), LastModified: new Date() };
    }
  }

  async find(key: string): Promise<StorageObject | null> {
    const fileStream = createReadStream(this.filename);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity // To recognize '\n' as a line delimiter
    });

    for await (const line of rl) {
      const [Size, Key] = line.split(' ');
      if (Key === key) {
        return { Key, Size: parseInt(Size), LastModified: new Date() };
      }
    }
    return null;
  }
}

export class S3ObjectStorageReader implements ObjectStorageReader {
  private readonly s3: AWS.S3;
  private readonly bucket: string;
  
  constructor(
    endpoint: string, 
    region: string, 
    accessKey: string, 
    secretAccessKey: string,
    bucket: string,
  ) {
    this.s3 = new AWS.S3({
      endpoint,
      signatureVersion: 'v4',
      region,
      s3ForcePathStyle: true,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretAccessKey
      },
    });
    this.bucket = bucket;
  }

  async* listObjects(pageSize = 1000): AsyncGenerator<StorageObject> {
    let lastPointer: string | undefined;
    do {
      const response = await this.s3.listObjectsV2({
        Bucket: this.bucket,
        MaxKeys: pageSize,
        ContinuationToken: lastPointer
      }).promise();
      const objects = response.Contents ?? [];
      for (const object of objects) {
        yield object as StorageObject;
      }
      lastPointer = response.NextContinuationToken;
    } while (lastPointer);
  }

  async find(key: string): Promise<StorageObject | null> {
    try {
      const response = await this.s3.headObject({
        Bucket: this.bucket,
        Key: key,
      }).promise();
      
      return {
        Key: key,
        Size: response.ContentLength ?? 0,
        LastModified: response.LastModified ?? new Date(),
      };
    } catch (error) {
      if ((error as { code: string }).code === 'NotFound') {
        return null;
      }
      throw error;
    }
  }
}

export interface ShardsReader {
  list(pageSize: number): AsyncGenerator<Shard>;
  isV1(s: Shard): boolean;
}

interface TempShardsReader {
  list(pageSize: number): AsyncGenerator<TempShardDocument>;
}

interface TempShardsWriter {
  write(shard: Shard): Promise<void>;
}

function isValidShardHash(hash: string) {
  return !!hash.match(/^[a-f0-9]{40}$/);
}

export function ripemd160(content: string) {
  if (!isValidShardHash(content)) {
    throw Error('Invalid hex string');
  }

  return createHash('ripemd160').update(Buffer.from(content, 'hex')).digest('hex');
}

export class DatabaseShardsReader implements ShardsReader {  
  constructor(private readonly shardsRepository: ShardsRepository) {}

  isV1(s: Shard): boolean {
    const doesNotHaveUuid = !s.uuid;

    return isValidShardHash(s.hash) && doesNotHaveUuid;
  }

  async* list(pageSize = 1000): AsyncGenerator<Shard> {
    let offset = 0;
    do {
      const shards = await this.shardsRepository.findWithNoUuid(
        pageSize,
        offset,
      );
      for (const shard of shards) {
        yield shard;
      }
      offset += shards.length;
    } while (offset % pageSize === 0);
  }
}

export class DatabaseTempShardsWriter implements TempShardsWriter {
  constructor(private readonly tempShards: MongoDBCollections['tempShards']) {}

  async write(shard: Shard): Promise<void> {
    await this.tempShards.insertOne({
      hash: shard.hash,
      objectStorageHash: ripemd160(shard.hash),
      shardId: new ObjectId(shard.id),
      size: shard.size,
    });
  }
}

export class DatabaseTempShardsReader implements TempShardsReader {
  constructor(private readonly tempShards: MongoDBCollections['tempShards']) {}

  async* list(pageSize = 1000): AsyncGenerator<TempShardDocument> {
    let offset = 0;
    do {
      const tempShards = await this.tempShards.find(
        {},
        { limit: pageSize, skip: offset },
      ).toArray();
      for (const tempShard of tempShards) {
        yield tempShard;
      }
      offset += tempShards.length;
    } while (offset % pageSize === 0);
  }
}

export interface Reader<T> {
  list(pageSize?: number): AsyncGenerator<T>;
}

export interface FramesReader extends Reader<FrameDocument> {}
export interface BucketEntriesReader extends Reader<BucketEntryDocument> {}

export class DatabaseFramesReader {
  constructor(private readonly frames: MongoDBCollections['frames']) {}

  async* list(pageSize = 50): AsyncGenerator<FrameDocument> {
    const pipeline = [
      {
        $lookup: {
          from: 'bucketentries',
          localField: '_id',
          foreignField: 'frame',
          as: 'matched_entries'
        }
      },
      {
        $match: {
          matched_entries: { $size: 0 }
        }
      },
    ];
    const cursor = this.frames.aggregate<FrameDocument>(pipeline);

    while (await cursor.hasNext()) {
      const frame = await cursor.next();

      if (frame) {
        yield frame;
      }
    }
  }
}

export class DatabaseFramesReaderWithoutOwner {
  constructor(private readonly frames: MongoDBCollections['frames']) {}

  async* list(pageSize = 50): AsyncGenerator<FrameDocument> {
    const pipeline = [
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user_info"
        }
      },
      {
        $match: {
          user_info: { $eq: [] } // Filtra los documentos donde no hay coincidencias en Users
        }
      },
    ];
    const cursor = this.frames.aggregate<FrameDocument>(pipeline);

    while (await cursor.hasNext()) {
      const frame = await cursor.next();

      if (frame) {
        yield frame;
      }
    }
  }
}

export class DatabaseBucketEntriesReaderWithoutBucket implements BucketEntriesReader {
  constructor(private readonly collection: MongoDBCollections['bucketEntries']) {}

  async* list(pageSize = 50): AsyncGenerator<BucketEntryDocument> {
    const pipeline = [
      {
        $match: {
          created: {
            $lt: new Date("2022-04-01T00:00:00Z") // Filtrar antes de abril de 2022
          }
        }
      },
      {
        $lookup: {
          from: "buckets",
          localField: "bucket",
          foreignField: "_id",
          as: "bucketInfo"
        }
      },
      {
        $match: {
          bucketInfo: { $size: 0 } // Filtra los documentos donde no hay coincidencias en Users
        }
      },
    ];
    const cursor = this.collection.aggregate<BucketEntryDocument>(pipeline);

    while (await cursor.hasNext()) {
      const doc = await cursor.next();

      if (doc) {
        yield doc;
      }
    }
  }
}
