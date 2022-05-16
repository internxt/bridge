import axios from 'axios';
import { v4 } from 'uuid';

import { Bucket } from './Bucket';
import { Frame } from '../frames/Frame';
import { Shard } from '../shards/Shard';
import { BucketEntry } from '../bucketEntries/BucketEntry';
import { BucketEntryShard } from '../bucketEntryShards/BucketEntryShard';

import { BucketEntriesRepository } from '../bucketEntries/Repository';
import { BucketEntryShardsRepository } from '../bucketEntryShards/Repository';
import { FramesRepository } from '../frames/Repository';
import { MirrorsRepository } from '../mirrors/Repository';
import { ShardsRepository } from '../shards/Repository';
import { BucketsRepository } from './Repository';
import { UploadsRepository } from '../uploads/Repository';
import { UsersRepository } from '../users/Repository';
import { UserNotFoundError } from '../users';
import { TokensRepository } from '../tokens/Repository';
import { User } from '../users/User';
import { ContactsRepository } from '../contacts/Repository';
import { StorageGateway } from '../storage/StorageGateway';
import { Contact } from '../contacts/Contact';
import { Upload } from '../uploads/Upload';

export class BucketEntryNotFoundError extends Error {
  constructor(bucketEntryId?: string) {
    super(`Bucket entry ${bucketEntryId || ''} not found`);

    Object.setPrototypeOf(this, BucketEntryNotFoundError.prototype);
  }
}

export class BucketNotFoundError extends Error {
  constructor(bucketId?: string) {
    super(`Bucket ${bucketId || ''} not found`);

    Object.setPrototypeOf(this, BucketNotFoundError.prototype);
  }
}

export class BucketEntryFrameNotFoundError extends Error {
  constructor() {
    super('Frame not found');

    Object.setPrototypeOf(this, BucketEntryFrameNotFoundError.prototype);
  }
}

export class BucketForbiddenError extends Error {
  constructor() {
    super('Unauthorized');

    Object.setPrototypeOf(this, BucketForbiddenError.prototype);
  }
}

export class MissingUploadsError extends Error {
  constructor() {
    super('Missing uploads to complete the upload');

    Object.setPrototypeOf(this, MissingUploadsError.prototype);
  }
}

export class MaxSpaceUsedError extends Error {
  constructor() {
    super('Max space used');

    Object.setPrototypeOf(this, MaxSpaceUsedError.prototype);
  }
}

export class BucketsUsecase {
  constructor(
    private bucketEntryShardsRepository: BucketEntryShardsRepository,
    private bucketEntriesRepository: BucketEntriesRepository,
    private mirrorsRepository: MirrorsRepository,
    private framesRepository: FramesRepository,
    private shardsRepository: ShardsRepository,
    private bucketsRepository: BucketsRepository,
    private uploadsRepository: UploadsRepository,
    private usersRepository: UsersRepository,
    private tokensRepository: TokensRepository,
    private contactsRepository: ContactsRepository
  ) {}

  async getFileInfo(bucketId: Bucket['id'], fileId: BucketEntry['id']): Promise<
    Omit<BucketEntry, 'frame'> & { shards: any[] } | 
    BucketEntry & { frame: Frame['id'], size: Frame['size'] }
  > {
    const bucketEntry = await this.bucketEntriesRepository.findOneWithFrame({
      bucket: bucketId,
      id: fileId
    });

    if (!bucketEntry) {
      throw new BucketEntryNotFoundError();
    }

    if (bucketEntry.version && bucketEntry.version === 2) {
      const downloadLinks = await this.getBucketEntryDownloadLinks(bucketEntry.id);

      return { ...bucketEntry, shards: downloadLinks };
    }

    if (!bucketEntry.frame) {
      throw new BucketEntryFrameNotFoundError();
    }

    return { ...bucketEntry, frame: bucketEntry.frame.id, size: bucketEntry.frame.size };
  }

  async getBucketEntryDownloadLinks(bucketEntryId: BucketEntry['id']): Promise<{
    index: BucketEntryShard['index'],
    size: Shard['size'],
    hash: Shard['hash'],
    url: string
  }[]> {  
    const bucketEntryShards = await this.bucketEntryShardsRepository.findByBucketEntrySortedByIndex(bucketEntryId);
    const shards = await this.shardsRepository.findByIds(bucketEntryShards.map(b => b.shard));
    const mirrors = await this.mirrorsRepository.findByShardHashesWithContacts(shards.map(s => s.hash));

    const response: {
      index: BucketEntryShard['index'],
      size: Shard['size'],
      hash: Shard['hash'],
      url: string
    }[] = [];

    for (const { contact, shardHash } of mirrors) {
      const { address, port } = contact;

      const shard = shards.find(s => s.hash === shardHash) as Shard;
      const bucketEntryShard = bucketEntryShards.find(
        b => b.shard.toString() === shard.id.toString()
      ) as BucketEntryShard;

      const farmerUrl = `http://${address}:${port}/v2/download/link/${shard.uuid}`;

      await axios.get(farmerUrl).then(res => {
        response.push({
          index: bucketEntryShard.index,
          size: shard.size,
          hash: shard.hash,
          url: res.data.result,
        });
      });
    }

    return response;
  }

  async getUserUsage(user: User['id']): Promise<number> {
    const usage = await this.framesRepository.getUserUsage(user);

    return (usage && usage.total) || 0;
  } 

  async completeUpload(
    userId: string, 
    bucketId: string, 
    fileIndex: string, 
    shards: Pick<Required<Shard>, 'hash' | 'uuid'>[]
  ): Promise<BucketEntry> {
    const [bucket, user, uploads] = await Promise.all([
      this.bucketsRepository.findOne({ id: bucketId }),
      this.usersRepository.findById(userId),
      this.uploadsRepository.findByUuids(shards.map(s => s.uuid))
    ]);

    if (!user) {
      throw new UserNotFoundError();
    }

    if (!bucket) {
      throw new BucketNotFoundError();
    }

    if (bucket.user !== userId) {
      throw new BucketForbiddenError();
    }

    if (uploads.length !== shards.length) {
      throw new MissingUploadsError();
    }

    const bucketEntrySize = uploads.reduce((acumm, upload) => upload.data_size + acumm, 0);

    if (user.migrated) {
      if (user.maxSpaceBytes < user.totalUsedSpaceBytes + bucketEntrySize) {
        throw new MaxSpaceUsedError();
      }
    } else {
      const usedSpaceBytes = await this.getUserUsage(user.id);

      if (user.maxSpaceBytes < (user.totalUsedSpaceBytes + usedSpaceBytes + bucketEntrySize)) {
        throw new MaxSpaceUsedError();
      }
    }

    const shardAndMirrorsCreationPromises = uploads.map((upload) => {
      const shard = shards.find(s => s.uuid === upload.uuid) as Pick<Shard, 'hash' | 'uuid'>;

      return this.createShardAndMirrors(upload, shard);
    });

    const bucketEntryCreation = this.bucketEntriesRepository.create({
      name: v4(),
      bucket: bucketId,
      index: fileIndex,
      version: 2,
      size: bucketEntrySize
    });

    const [newBucketEntry, ...newShards] = await Promise.all([
      bucketEntryCreation,
      ...shardAndMirrorsCreationPromises
    ]);

    const bucketEntryShards: Omit<BucketEntryShard, 'id'>[] = [];

    newShards.forEach((shard, index) => {
      bucketEntryShards.push({
        bucketEntry: newBucketEntry.id,
        shard: shard.id,
        index
      });
    });

    await this.bucketEntryShardsRepository.insertMany(bucketEntryShards);
    await this.usersRepository.addTotalUsedSpaceBytes(userId, bucketEntrySize);
    this.uploadsRepository.deleteManyByUuids(uploads.map(u => u.uuid)).catch((err) => {
      // TODO: Move to EventBus
      console.log('completeUpload/uploads-deletion: Failed due to %s. %s', err.message, err.stack);
    });

    return newBucketEntry;
  }

  async createShardAndMirrors(upload: Upload, shard: Pick<Shard, 'hash' | 'uuid'>): Promise<Shard> {
    const { uuid, contracts, data_size } = upload;

    const contacts = await this.contactsRepository.findByIds(contracts.map(c => c.nodeID));
  
    const contactsThatStoreTheShard: Contact[] = [];

    for (const contact of contacts) {
      const storesObject = await StorageGateway.stores(contact, uuid);

      if (storesObject) {
        contactsThatStoreTheShard.push(contact);
      }
    }

    if (contactsThatStoreTheShard.length === 0) {
      throw new Error('Shard not uploaded');
      // throw new ShardNotUploadedError();
    }

    const contractsOfContactsThatStoreTheShard = contracts.filter((contract) => {
      return contactsThatStoreTheShard.find((contact) => {
        return (contact as any).nodeID === contract.nodeID;
      });
    });

    if (contractsOfContactsThatStoreTheShard.length === 0) {
      throw new Error('No contracts found for shard');
    }

    const mirrorsToInsert = [];
    for (const contract of contractsOfContactsThatStoreTheShard) {
      mirrorsToInsert.push({
        isEstablished: true,
        shardHash: shard.hash,
        contact: contract.nodeID,
        contract: { ...contract.contract, data_hash: shard.hash },
        token: '',
      });
    }

    const mirrorsCreation = this.mirrorsRepository.insertMany(mirrorsToInsert);
    const shardCreation = this.shardsRepository.create({
      hash: shard.hash, 
      uuid, 
      size: data_size,
      contracts: contractsOfContactsThatStoreTheShard.map(({ nodeID, contract }: any) => ({
        nodeID, 
        contract: {
          ...contract,
          data_hash: shard.hash
        }
      }))
    });

    const [newShard] = await Promise.all([shardCreation, mirrorsCreation]);

    return newShard;
  } 
}
