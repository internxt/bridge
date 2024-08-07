import { ObjectId, Document, Collection, Db, MongoClient } from 'mongodb';
import { Frame } from '../../lib/core/frames/Frame';
import { BucketEntry } from '../../lib/core/bucketEntries/BucketEntry';

export interface MongoDBCollections {
  tempShards: Collection<TempShardDocument>;
  frames: Collection<FrameDocument>;
  bucketEntries: Collection<BucketEntryDocument>;
}

interface TempShard extends Document {
  hash: string;
  objectStorageHash: string;
  shardId: string;
  size: number;
}

export interface TempShardDocument extends Omit<TempShard, 'shardId'> {
  shardId: ObjectId;
}

export interface FrameDocument extends Omit<Frame, 'id'> {
  _id: ObjectId;
}

export interface BucketEntryDocument extends Omit<BucketEntry, 'id'> {
  _id: ObjectId;
  renewal: Date; 
  toObject(): Omit<BucketEntryDocument, 'toObject'>;
}

export class MongoDB {
  private uri: string;
  private db: Db | null;
  private client: MongoClient;

  constructor(uri: string) {
    this.uri = uri;
    this.db = null;
    this.client = new MongoClient(this.uri);
  }

  get URI() {
    return this.uri;
  }

  async connect(): Promise<MongoDB> {
    await this.client.connect();

    this.db = this.client.db('__inxt-network');

    return this;
  }

  getCollections(): MongoDBCollections {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return {
      tempShards: this.db.collection<TempShardDocument>('tempshards'),
      frames: this.db.collection<FrameDocument>('frames'),
      bucketEntries: this.db.collection<BucketEntryDocument>('bucketentries'),
    };
  }

  disconnect(): Promise<void> {
    return this.client.close();
  }
}