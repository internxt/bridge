import axios, { AxiosError } from 'axios';
import { v4 } from 'uuid';
import lodash from 'lodash';

import { Bucket } from './Bucket';
import { Frame } from '../frames/Frame';
import {
  Shard,
  ShardWithMultiUpload,
  ShardWithPossibleMultiUpload,
} from '../shards/Shard';
import { BucketEntry } from '../bucketEntries/BucketEntry';
import { BucketEntryShard } from '../bucketEntryShards/BucketEntryShard';
import crypto from 'crypto';
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
    super(`Bucket entry ${bucketEntryId ?? ''} not found`);

    Object.setPrototypeOf(this, BucketEntryNotFoundError.prototype);
  }
}

export class BucketNotFoundError extends Error {
  constructor(bucketId?: string) {
    super(`Bucket ${bucketId ?? ''} not found`);

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

export class InvalidUploadsError extends Error {
  constructor() {
    super('Uploads is not in an array format');

    Object.setPrototypeOf(this, InvalidUploadsError.prototype);
  }
}

export class InvalidUploadIndexes extends Error {
  constructor() {
    super('Invalid upload indexes');

    Object.setPrototypeOf(this, InvalidUploadIndexes.prototype);
  }
}
export class InvalidMultiPartValueError extends Error {
  constructor() {
    super('Multipart is not allowed for files smaller than 100MB');

    Object.setPrototypeOf(this, InvalidMultiPartValueError.prototype);
  }
}

export class ContactNotFound extends Error {
  constructor() {
    super('Contact not found');

    Object.setPrototypeOf(this, ContactNotFound.prototype);
  }
}

export class MaxSpaceUsedError extends Error {
  constructor() {
    super('Max space used');

    Object.setPrototypeOf(this, MaxSpaceUsedError.prototype);
  }
}

export class NoNodeFoundError extends Error {
  constructor() {
    super('No nodeID found');

    Object.setPrototypeOf(this, NoNodeFoundError.prototype);
  }
}

export class EmptyMirrorsError extends Error {
  constructor() {
    super('Empty mirrors');

    Object.setPrototypeOf(this, EmptyMirrorsError.prototype);
  }
}

export class BucketNameAlreadyInUse extends Error {
  constructor() {
    super('Name already used by another bucket');

    Object.setPrototypeOf(this, BucketNameAlreadyInUse.prototype);
  }
}

export class BucketsUsecase {
  private MAX_FILES_PER_RETRIEVAL = 20;

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

  /**
   * Retrieves file links in bulk.
   */
  async getFileLinks(fileIds: string[]) {
    const chunksOf = this.MAX_FILES_PER_RETRIEVAL;

    const fileLinks: { fileId: string, link: string, index: string }[] = [];

    for (let i = 0; i < fileIds.length; i += chunksOf) {
      const fileIdsToRetrieve = fileIds.slice(i, i+chunksOf);
      const files = await this.bucketEntriesRepository.findByIds(fileIdsToRetrieve);

      if (files.length === 0) continue;

      const bucketEntryShards = await this.bucketEntryShardsRepository.findByBucketEntries(fileIdsToRetrieve);

      if (bucketEntryShards.length === 0) continue;

      const shards = await this.shardsRepository.findByIds(bucketEntryShards.map(b => b.shard));

      if (shards.length === 0) continue;

      const shardsGroupedByContact = lodash.groupBy(shards, (s) => s.contracts[0].nodeID);
      const contacts = await this.contactsRepository.findByIds(Object.keys(shardsGroupedByContact));
      
      for (const contact of contacts) {
        const objectsKeys = shardsGroupedByContact[contact.id].map(s => s.uuid!);

        const links = await StorageGateway.getLinks(contact, objectsKeys);

        objectsKeys.forEach((key, keyIndex) => {
          const shard = shards.find(s => s.uuid === key) as Shard;
          const bucketEntryShard = bucketEntryShards.find(b => b.shard.toString() === shard.id)!;
          const fileId = bucketEntryShard.bucketEntry.toString();
          const index = files.find(f => f.id === fileId)?.index as string;

          fileLinks.push({
            fileId, link: links[keyIndex], index
          })
        });
      }
    }

    if (fileLinks.length > 0) {
      const sortedFileLinks = fileIds.map((fId) => fileLinks.find(fL => fL.fileId === fId.toString()));

      return sortedFileLinks;
    } else {
      return fileLinks;
    }
  }

  async deleteBucketByIdAndUser(bucketId: Bucket['id'], userId: User['uuid']) {
    const bucket = await this.bucketsRepository.findOne({id: bucketId, userId: userId});

    if(!bucket){
      throw new BucketNotFoundError(bucketId);
    }

    await this.bucketsRepository.removeByIdAndUser(bucket.id, userId);
  }

  async getFileInfo(bucketId: Bucket['id'], fileId: BucketEntry['id'], partSize?: number): Promise<
    Omit<BucketEntry, 'frame'> & {
      shards: {
        index: BucketEntryShard["index"];
        size: Shard["size"];
        hash: Shard["hash"];
        url: string;
      }[]
    } |
    BucketEntry & { frame: Frame['id'], size: Frame['size'] }
  > {
    const bucketEntry = await this.bucketEntriesRepository.findOneWithFrame({
      bucket: bucketId,
      id: fileId
    });

    if (!bucketEntry) {
      throw new BucketEntryNotFoundError(fileId);
    }

    if (bucketEntry.version && bucketEntry.version === 2) {
      try {
        const downloadLinks = await this.getBucketEntryDownloadLinks(bucketEntry.id, partSize);

        return { ...bucketEntry, shards: downloadLinks };
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError;
          if (axiosError.response?.status === 404) {
            throw new BucketEntryNotFoundError(fileId);
          }
        }
        throw error;
      }
    }

    if (!bucketEntry.frame) {
      throw new BucketEntryFrameNotFoundError();
    }

    return { ...bucketEntry, frame: bucketEntry.frame.id, size: bucketEntry.frame.size };
  }

  async getBucketEntryDownloadLinks(bucketEntryId: BucketEntry['id'], partSize?: number): Promise<{
    index: BucketEntryShard['index'],
    size: Shard['size'],
    hash: Shard['hash'],
    url: string
  }[]> {  
    const bucketEntryShards = await this.bucketEntryShardsRepository.findByBucketEntrySortedByIndex(bucketEntryId);
    const shards = await this.shardsRepository.findByIds(bucketEntryShards.map(b => b.shard));
    let mirrors = await this.mirrorsRepository.findByShardHashesWithContacts(shards.map(s => s.hash));

    const response: {
      index: BucketEntryShard['index'],
      size: Shard['size'],
      hash: Shard['hash'],
      url: string
    }[] = [];

    if (mirrors.length === 0) {
      // NOTE: This is a patch while we find out what is deleting the mirrors:
      mirrors = await this.mirrorsRepository.getOrCreateMirrorsForShards(
        shards
      );
      if(mirrors.length === 0){
        // If for some reason mirrors are still 0: 
        throw new EmptyMirrorsError();
      }
    }

    for (const { contact, shardHash } of mirrors) {
      const { address, port } = contact;

      const shard = shards.find(s => s.hash === shardHash) as Shard;
      const bucketEntryShard = bucketEntryShards.find(
        b => b.shard.toString() === shard.id.toString()
      ) as BucketEntryShard;

      let farmerUrl = `http://${address}:${port}/v2/download/link/${shard.uuid}`;

      if (partSize) {
        farmerUrl = `http://${address}:${port}/v2/download-multipart/link/${shard.uuid}?partSize=${partSize}`
      }

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

  async findById(id: Bucket['id']): Promise<Bucket | null> {
    const bucket = await this.bucketsRepository.findOne({ id });

    return bucket;
  }

  async findByIdAndUser(id: Bucket['id'], userId: Bucket['userId']): Promise<Bucket | null> {
    const bucket = await this.bucketsRepository.findOne({ id, userId });

    return bucket;
  }

  async findAllByUserAndCreatedSince(userId: Bucket['userId'], createdSince?: Date): Promise<Bucket[]> {
    const buckets = await this.bucketsRepository.findUserBucketsFromDate(userId, createdSince);

    return buckets;
  }


  async getUserUsage(user: Frame['user']): Promise<number> {
    const usage = await this.framesRepository.getUserUsage(user);

    return usage?.total || 0;
  } 

  async startUpload(
    userId: User['uuid'],
    bucketId: string,
    cluster: string[],
    uploads: { index: number; size: number }[],
    auth: { username: string; password: string },
    multiparts = 1
  ) {
    const [bucket, user] = await Promise.all([
      this.bucketsRepository.findOne({ id: bucketId }),
      this.usersRepository.findByUuid(userId),
    ]);

    if (!user) {
      throw new UserNotFoundError();
    }

    if (!bucket) {
      throw new BucketNotFoundError();
    }

    const isBucketOwnedByUser = bucket.userId === user.uuid;

    if (!isBucketOwnedByUser) {
      throw new BucketForbiddenError();
    }

    const uploadIndexesWithoutDuplicates = new Set(
      uploads.map((upload) => upload.index)
    );

    if (uploadIndexesWithoutDuplicates.size < uploads.length) {
      throw new InvalidUploadIndexes();
    }

    const bucketEntrySize = uploads.reduce((acc, { size }) => size + acc, 0);
    const MB100 = 100 * 1024 * 1024;
    if (bucketEntrySize < MB100 && multiparts > 1) {
      throw new InvalidMultiPartValueError();
    }

    if (user.migrated) {
      if (user.maxSpaceBytes < user.totalUsedSpaceBytes + bucketEntrySize) {
        throw new MaxSpaceUsedError();
      }
    } else {
      const usedSpaceBytes = await this.getUserUsage(user.email);

      if (
        user.maxSpaceBytes <
        user.totalUsedSpaceBytes + usedSpaceBytes + bucketEntrySize
      ) {
        throw new MaxSpaceUsedError();
      }
    }

    const uploadPromises = uploads.map(async (upload) => {
      const { index, size } = upload;

      const nodeID = lodash.sample(cluster);

      if (!nodeID) {
        throw new NoNodeFoundError();
      }

      const contracts = [
        {
          nodeID,
          contract: {
            version: 1,
            store_begin: new Date(),
            farmer_id: nodeID,
            data_size: size,
          },
        },
      ];

      const uuid = v4();

      const [contact] = await Promise.all([
        this.contactsRepository.findById(nodeID),
        this.uploadsRepository.create({
          uuid,
          index,
          contracts,
          data_size: size,
        }),
      ]);

      if (!contact) {
        throw new ContactNotFound();
      }

      if (multiparts > 1) {
        const { UploadId, urls } = await this.multiPartUpload(
          contact,
          uuid,
          auth,
          multiparts
        );
        return { index, uuid, url: null, urls, UploadId };
      }

      const objectStorageUrl = await this.singlePartUpload(contact, uuid, auth);
      return { index, uuid, url: objectStorageUrl, urls: null };
    });

    return Promise.all(uploadPromises);
  }

  async singlePartUpload(
    contact: Contact,
    uuid: string,
    auth: { username: string; password: string }
  ): Promise<string> {
    const { address, port } = contact;
    const farmerUrl = `http://${address}:${port}/v2/upload/link/${uuid}`;

    const { username, password } = auth;
    const farmerRes = await axios.get<{ result: string }>(farmerUrl, {
      auth: { username, password },
    });
    const objectStorageUrl = farmerRes.data.result;

    return objectStorageUrl;
  }

  async multiPartUpload(
    contact: Contact,
    uuid: string,
    auth: { username: string; password: string },
    parts: number
  ): Promise<{ urls: string[]; UploadId: string }> {
    const { address, port } = contact;
    const farmerUrl = `http://${address}:${port}/v2/upload-multipart/link/${uuid}?parts=${parts}`;

    const { username, password } = auth;
    const farmerRes = await axios.get<{ result: string[], UploadId: string }>(farmerUrl, {
      auth: { username, password },
    });
    const { result: objectStorageUrls, UploadId } = farmerRes.data;

    return { urls: objectStorageUrls, UploadId };
  }

  async completeUpload(
    userId: User['uuid'], 
    bucketId: Bucket['id'], 
    fileIndex: string, 
    shards: ShardWithPossibleMultiUpload[],
    auth: { username: string; password: string }
  ): Promise<BucketEntry> {
    const [bucket, user, uploads] = await Promise.all([
      this.bucketsRepository.findOne({ id: bucketId }),
      this.usersRepository.findByUuid(userId),
      this.uploadsRepository.findByUuids(shards.map((s) => s.uuid)),
    ]);

    if (!user) {
      throw new UserNotFoundError();
    }

    if (!bucket) {
      throw new BucketNotFoundError();
    }

    const isBucketOwnedByUser = bucket.userId === user.uuid;

    if (!isBucketOwnedByUser) {
      throw new BucketForbiddenError();
    }

    if (uploads.length !== shards.length) {
      throw new MissingUploadsError();
    }

    const bucketEntrySize = uploads.reduce(
      (acumm, { data_size }) => data_size + acumm,
      0
    );

    const isMultipartUpload = shards.some((shard) => shard.UploadId);

    if (user.migrated) {
      if (user.maxSpaceBytes < user.totalUsedSpaceBytes + bucketEntrySize) {
        if (isMultipartUpload) {
          await this.abortMultiPartUpload(
            shards as ShardWithMultiUpload[],
            uploads,
            auth
          );
        }
        throw new MaxSpaceUsedError();
      }
    } else {
      const usedSpaceBytes = await this.getUserUsage(user.email);

      if (
        user.maxSpaceBytes <
        user.totalUsedSpaceBytes + usedSpaceBytes + bucketEntrySize
      ) {
        if (isMultipartUpload) {
          await this.abortMultiPartUpload(
            shards as ShardWithMultiUpload[],
            uploads,
            auth
          );
        }
        throw new MaxSpaceUsedError();
      }
    }

    const shardAndMirrorsCreationPromises = uploads.map((upload) => {
      const shard = shards.find(
        (s) => s.uuid === upload.uuid
      ) as ShardWithPossibleMultiUpload;

      return this.createShardAndMirrors(upload, shard, auth, isMultipartUpload);
    });

    const bucketEntryCreation = this.bucketEntriesRepository.create({
      name: v4(),
      bucket: bucketId,
      index: fileIndex,
      version: 2,
      size: bucketEntrySize,
    });

    const [newBucketEntry, ...newShards] = await Promise.all([
      bucketEntryCreation,
      ...shardAndMirrorsCreationPromises,
    ]);

    const bucketEntryShards: Omit<BucketEntryShard, 'id'>[] = [];

    newShards.forEach((shard, index) => {
      bucketEntryShards.push({
        bucketEntry: newBucketEntry.id,
        shard: shard.id,
        index,
      });
    });

    await this.bucketEntryShardsRepository.insertMany(bucketEntryShards);
    await this.usersRepository.addTotalUsedSpaceBytes(user.uuid, bucketEntrySize);
    this.uploadsRepository
      .deleteManyByUuids(uploads.map((u) => u.uuid))
      .catch((err) => {
      // TODO: Move to EventBus
        console.log(
          'completeUpload/uploads-deletion: Failed due to %s. %s',
          err.message,
          err.stack
        );
    });

    return newBucketEntry;
  }

  async notifyUploadComplete(
    contact: Contact,
    auth: { username: string; password: string },
    shard: ShardWithMultiUpload
  ): Promise<void> {
      const { address, port } = contact;
      const farmerUrl = `http://${address}:${port}/v2/upload-multipart-complete/link/${shard.uuid}`;

      const { username, password } = auth;
      await axios.post(farmerUrl, shard, {
        auth: { username, password },
      });
  }

  async abortMultiPartUpload(
    shards: ShardWithMultiUpload[],
    uploads: Upload[],
    auth: { username: string; password: string }
  ): Promise<void> {
    const abortPromises = uploads.map(async (upload) => {
      const shard = shards.find(
        (s) => s.uuid === upload.uuid
      ) as ShardWithMultiUpload;

      const { contracts } = upload;

      const contactsThatStoreTheShard = await this.contactsRepository.findByIds(
        contracts.map((c) => c.nodeID)
      );

      for (const contact of contactsThatStoreTheShard) {
        const { address, port } = contact;
        const farmerUrl = `http://${address}:${port}/v2/upload-multipart-abort/link/${shard.uuid}`;

        const { username, password } = auth;
        await axios.post(farmerUrl, shard, {
          auth: { username, password },
        });
      }
    });
    await Promise.all(abortPromises);
  }

  async createShardAndMirrors(
    upload: Upload,
    shard: ShardWithPossibleMultiUpload,
    auth: { username: string; password: string },
    isMultipartUpload: boolean = false
  ): Promise<Shard> {
    const { uuid, contracts, data_size } = upload;
    const shardHash = v4().concat('$', shard.hash);
    shard.hash = shardHash;

    const contacts = await this.contactsRepository.findByIds(
      contracts.map((c) => c.nodeID)
    );
  
    const contactsThatStoreTheShard: Contact[] = [];

    for (const contact of contacts) {
      if (isMultipartUpload) {
        await this.notifyUploadComplete(
          contact,
          auth,
          shard as ShardWithMultiUpload
        );
      }

      if (contact.objectCheckNotRequired) {
        contactsThatStoreTheShard.push(contact);
      } else {
        const storesObject = await StorageGateway.stores(contact, uuid);

        if (storesObject) {
          contactsThatStoreTheShard.push(contact);
        }
      }
    }

    if (contactsThatStoreTheShard.length === 0) {
      console.log('createShardAndMirrors | object %s NOT FOUND in contacts', uuid, contracts.map(c => c.nodeID));
      throw new Error('Shard not uploaded');
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

  async listByUserId(userId: User['uuid'], limit: number, offset: number): Promise<Bucket[]> {
    const buckets = await this.bucketsRepository.findByUser(userId, limit, offset);

    return buckets;
  }

  async destroyByUser(userId: User['uuid']) {
    await this.bucketsRepository.destroyByUser(userId);
  }

  async create(user: User, newBucket: Bucket) {
    const payload = {
      ...newBucket,
      status: 'Active',
      pubkeys: newBucket.pubkeys,
      user: user.id,
      userId: user.uuid,
    };

    if (!payload.name) {
      payload['name'] = "Bucket-" + crypto.randomBytes(3).toString("hex");
    }

    const existentBucket = await this.bucketsRepository.findOne({ userId: user.uuid, name: payload.name });

    if (existentBucket) {
      throw new BucketNameAlreadyInUse();
    }

    return this.bucketsRepository.create(payload);
  }
}
