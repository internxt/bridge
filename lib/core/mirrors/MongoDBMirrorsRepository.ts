import { Mirror, MirrorWithContact } from './Mirror';
import { MirrorsRepository } from './Repository';
import { Contact } from '../contacts/Contact';
import { Contract, Shard } from '../shards/Shard';

const formatFromMongoToMirror = (mongoMirror: any): Mirror => {
  const id = mongoMirror._id.toString();
  const mirror = mongoMirror.toObject();

  delete mirror._id;
  return {
    ...mirror,
    id,
  };
};

const formatFromMongoToContactLocally = (mongoContact: any): Contact => {
  const id = mongoContact.nodeID;
  return {
    ...mongoContact,
    id,
  };
};

const formatFromMongoToMirrorWithContact = (mongoMirror: any): Mirror => {
  const id = mongoMirror._id.toString();
  const mirror = mongoMirror.toObject();
  if (mirror.contact) {
    mirror.contact = formatFromMongoToContactLocally(mirror.contact);
  }
  delete mirror._id;
  return {
    ...mirror,
    id,
  };
};
export class MongoDBMirrorsRepository implements MirrorsRepository {
  constructor(private model: any) {}

  findByShardHashesWithContacts(
    shardHashes: string[]
  ): Promise<MirrorWithContact[]> {
    return this.model
      .find({ shardHash: { $in: shardHashes } })
      .populate('contact')
      .exec()
      .then((mirrorsWithContact: any) =>
        mirrorsWithContact.map(formatFromMongoToMirrorWithContact)
      );
  }

  findByShardUuidsWithContacts(uuids: string[]): Promise<MirrorWithContact[]> {
    return this.model
      .find({ uuid: { $in: uuids } })
      .populate('contact')
      .exec()
      .then((mirrorsWithContact: any) =>
        mirrorsWithContact.map(formatFromMongoToMirrorWithContact)
      );
  }

  async create(data: Omit<Mirror, 'id'>): Promise<Mirror> {
    const rawModel = await new this.model({
      ...data,
      created: new Date(),
    }).save();

    return formatFromMongoToMirror(rawModel);
  }

  async getOrCreateMirrorsForShards(
    shards: Shard[]
  ): Promise<MirrorWithContact[]> {
    for (const shard of shards) {
      const shardHash = shard.hash;
      const mirror = await this.model.find({ shardHash });
      if (mirror.length === 0) {
        if (shard.contracts.length > 0) {
          for (const { contract, nodeID } of shard.contracts) {
            await this.create({
              isEstablished: true,
              shardHash,
              contact: nodeID,
              contract: { ...contract, data_hash: shardHash } as Contract,
              token: '',
            });
          }
        }
      }
    }
    return this.findByShardHashesWithContacts(shards.map((s) => s.hash));
  }

  deleteByIds(ids: string[]): Promise<void> {
    return this.model.deleteMany({ _id: { $in: ids } }).exec();
  }

  async insertMany(data: Omit<Mirror, 'id'>[]): Promise<void> {
    await this.model.insertMany(data);
  }
}
