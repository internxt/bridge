import AWS from 'aws-sdk';
import { existsSync, createReadStream } from 'fs';
import readline from 'readline';

export interface StorageObject {
  Key: string;
  Size: number;
  LastModified: Date;
}

export interface ObjectStorageReader {
  listObjects(pageSize: number): AsyncGenerator<StorageObject>;
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
}

