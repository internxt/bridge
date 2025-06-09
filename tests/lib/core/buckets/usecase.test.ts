import { restore, stub } from 'sinon';

import { BucketEntriesRepository } from '../../../../lib/core/bucketEntries/Repository';
import { FramesRepository } from '../../../../lib/core/frames/Repository';
import { MirrorsRepository } from '../../../../lib/core/mirrors/Repository';
import { ShardsRepository } from '../../../../lib/core/shards/Repository';
import { BucketsRepository } from '../../../../lib/core/buckets/Repository';
import { BucketEntryShardsRepository } from '../../../../lib/core/bucketEntryShards/Repository';
import { UsersRepository } from '../../../../lib/core/users/Repository';

import { MongoDBBucketsRepository } from '../../../../lib/core/buckets/MongoDBBucketsRepository';
import { MongoDBBucketEntriesRepository } from '../../../../lib/core/bucketEntries/MongoDBBucketEntriesRepository';
import { BucketNotFoundError, BucketsUsecase } from '../../../../lib/core/buckets/usecase';
import { MongoDBFramesRepository } from '../../../../lib/core/frames/MongoDBFramesRepository';
import { MongoDBMirrorsRepository } from '../../../../lib/core/mirrors/MongoDBMirrorsRepository';
import { MongoDBShardsRepository } from '../../../../lib/core/shards/MongoDBShardsRepository';
import { MongoDBContactsRepository } from '../../../../lib/core/contacts/MongoDBContactsRepository';
import { MongoDBBucketEntryShardsRepository } from '../../../../lib/core/bucketEntryShards/MongoDBBucketEntryShardsRepository';
import { MongoDBUsersRepository } from '../../../../lib/core/users';
import { MongoDBUploadsRepository } from '../../../../lib/core/uploads/MongoDBUploadsRepository';
import { MongoDBTokensRepository } from '../../../../lib/core/tokens/MongoDBTokensRepository';

import fixtures from '../fixtures';
import { StorageGateway } from '../../../../lib/core/storage/StorageGateway';
import { ContactsRepository } from '../../../../lib/core/contacts/Repository';
import { UploadsRepository } from '../../../../lib/core/uploads/Repository';
import { TokensRepository } from '../../../../lib/core/tokens/Repository';
import { Contact } from '../../../../lib/core/contacts/Contact';

describe('BucketEntriesUsecase', function () {
  let bucketEntriesRepository: BucketEntriesRepository = new MongoDBBucketEntriesRepository({});
  let mirrorsRepository: MirrorsRepository = new MongoDBMirrorsRepository({});
  let framesRepository: FramesRepository = new MongoDBFramesRepository({});
  let shardsRepository: ShardsRepository = new MongoDBShardsRepository({});
  let bucketsRepository: BucketsRepository = new MongoDBBucketsRepository({});
  let usersRepository: UsersRepository = new MongoDBUsersRepository({});
  let bucketEntryShardsRepository: BucketEntryShardsRepository = new MongoDBBucketEntryShardsRepository({});
  let contactsRepository: ContactsRepository = new MongoDBContactsRepository({});
  let uploadsRepository: UploadsRepository = new MongoDBUploadsRepository({});
  let tokensRepository: TokensRepository = new MongoDBTokensRepository({});

  let bucketsUsecase = new BucketsUsecase(
    bucketEntryShardsRepository,
    bucketEntriesRepository,
    mirrorsRepository,
    framesRepository,
    shardsRepository,
    bucketsRepository,
    uploadsRepository,
    usersRepository,
    tokensRepository,
    contactsRepository
  );
  
  beforeEach(() => {
    bucketEntriesRepository = new MongoDBBucketEntriesRepository({});
    mirrorsRepository = new MongoDBMirrorsRepository({});
    framesRepository = new MongoDBFramesRepository({});
    shardsRepository = new MongoDBShardsRepository({});
    bucketsRepository = new MongoDBBucketsRepository({});
    contactsRepository = new MongoDBContactsRepository({});
    uploadsRepository = new MongoDBUploadsRepository({});

    bucketsUsecase = new BucketsUsecase(
      bucketEntryShardsRepository,
      bucketEntriesRepository,
      mirrorsRepository,
      framesRepository,
      shardsRepository,
      bucketsRepository,
      uploadsRepository,
      usersRepository,
      tokensRepository,
      contactsRepository
    );

    restore();
  });

  describe('getFileLinks()', () => {
    describe('Should return an empty list when there is missing data', () => {
      it('If no files are found', async () => {
        const filesIdsList = ['file-id'];
        const findFiles = stub(bucketEntriesRepository, 'findByIds').resolves([]);
        const findBucketEntryShards = stub(bucketEntryShardsRepository, 'findByBucketEntries');
  
        const fileLinks = await bucketsUsecase.getFileLinks(filesIdsList);
  
        expect(findFiles.calledOnce).toBeTruthy();
        expect(findFiles.firstCall.args).toStrictEqual([filesIdsList]);
  
        expect(findBucketEntryShards.notCalled).toBeTruthy();
  
        expect(fileLinks).toStrictEqual([]);
      });

      it('If no bucket entry shards are found', async () => {
        const filesIdsList = ['file-id'];
        const files = filesIdsList.map(fId => fixtures.getBucketEntry({ id: fId }));
        const findFiles = stub(bucketEntriesRepository, 'findByIds').resolves(files);
        const findBucketEntryShards = stub(bucketEntryShardsRepository, 'findByBucketEntries').resolves([]);
        const findShards = stub(shardsRepository, 'findByIds');
  
        const fileLinks = await bucketsUsecase.getFileLinks(filesIdsList);
  
        expect(findFiles.calledOnce).toBeTruthy();
        expect(findFiles.firstCall.args).toStrictEqual([filesIdsList]);
  
        expect(findBucketEntryShards.calledOnce).toBeTruthy();
        expect(findBucketEntryShards.firstCall.args).toStrictEqual([files.map(f => f.id)]);
  
        expect(findShards.notCalled).toBeTruthy();
  
        expect(fileLinks).toStrictEqual([]);
      });

      it('If no shards are found', async () => {
        const filesIdsList = ['file-id'];
        const files = filesIdsList.map(fId => fixtures.getBucketEntry({ id: fId }));
        const bucketEntryShards = files.map(f => fixtures.getBucketEntryShard({ bucketEntry: f.id }));
  
        const findFiles = stub(bucketEntriesRepository, 'findByIds').resolves(files);
        const findBucketEntryShards = stub(bucketEntryShardsRepository, 'findByBucketEntries').resolves(bucketEntryShards);
        const findShards = stub(shardsRepository, 'findByIds').resolves([]);
  
        const fileLinks = await bucketsUsecase.getFileLinks(filesIdsList);
  
        expect(findFiles.calledOnce).toBeTruthy();
        expect(findFiles.firstCall.args).toStrictEqual([filesIdsList]);
  
        expect(findBucketEntryShards.calledOnce).toBeTruthy();
        expect(findBucketEntryShards.firstCall.args).toStrictEqual([files.map(f => f.id)]);
  
        expect(findShards.calledOnce).toBeTruthy();
        expect(findShards.firstCall.args).toStrictEqual([bucketEntryShards.map(be => be.shard)]);
  
        expect(fileLinks).toStrictEqual([]);
      });
    });

    it('Should try to find shard contacts', async () => {
      const filesIdsList = ['file-id'];
      const files = filesIdsList.map(fId => fixtures.getBucketEntry({ id: fId }));
      const bucketEntryShards = files.map(f => fixtures.getBucketEntryShard({ bucketEntry: f.id }));
      const shards = bucketEntryShards.map(be => fixtures.getShard({ id: be.shard }));

      stub(bucketEntriesRepository, 'findByIds').resolves(files);
      stub(bucketEntryShardsRepository, 'findByBucketEntries').resolves(bucketEntryShards);
      stub(shardsRepository, 'findByIds').resolves(shards);
      const findContacts = stub(contactsRepository, 'findByIds').rejects(new Error());

      try {
        await bucketsUsecase.getFileLinks(filesIdsList);
        expect(true).toBeFalsy();
      } catch {
        expect(findContacts.calledOnce).toBeTruthy();
        expect(findContacts.firstCall.args).toStrictEqual([shards.map(s => s.contracts[0].nodeID)]);
      }
    });

    it('Should try to get links from each contact', async () => {
      const filesIdsList = ['file-id'];
      const files = filesIdsList.map(fId => fixtures.getBucketEntry({ id: fId }));
      const bucketEntryShards = files.map(f => fixtures.getBucketEntryShard({ bucketEntry: f.id }));
      const shards = bucketEntryShards.map(be => fixtures.getShard({ id: be.shard }));
      const contacts = shards.map(s => fixtures.getContact({ id: s.contracts[0].nodeID }));

      stub(bucketEntriesRepository, 'findByIds').resolves(files);
      stub(bucketEntryShardsRepository, 'findByBucketEntries').resolves(bucketEntryShards);
      stub(shardsRepository, 'findByIds').resolves(shards);
      stub(contactsRepository, 'findByIds').resolves(contacts);

      const getLinks = stub(StorageGateway, 'getLinks').callsFake((contact, objectKeys) => {
        return Promise.resolve(objectKeys.map(() => contact.address));
      });

      await bucketsUsecase.getFileLinks(filesIdsList);

      expect(getLinks.callCount).toBe(contacts.length);

      contacts.forEach((c, i) => {
        expect(getLinks.getCalls()[i].args).toStrictEqual([
          c,
          shards.filter(s => s.contracts[0].nodeID === c.id).map(s => s.uuid)
        ]);
      });
    });

    describe('The links are obtained', () => {
      it('When shards are from same contact', async () => {
        const filesIdsList = ['file-id', 'file-id-2'];
        const contactId = 'contact-id';
        const contact = fixtures.getContact({ id: contactId });
        const files = filesIdsList.map(fId => fixtures.getBucketEntry({ id: fId }));
        const bucketEntryShards = files.map(f => fixtures.getBucketEntryShard({ bucketEntry: f.id }));
        const shards = bucketEntryShards.map(be => fixtures.getShard({ id: be.shard }, contactId));
        const contacts = [contact];

        const getLink = () => contact.address;
  
        stub(bucketEntriesRepository, 'findByIds').resolves(files);
        stub(bucketEntryShardsRepository, 'findByBucketEntries').resolves(bucketEntryShards);
        stub(shardsRepository, 'findByIds').resolves(shards);
        stub(contactsRepository, 'findByIds').resolves(contacts);
  
        const getLinks = stub(StorageGateway, 'getLinks').callsFake((contact, objectKeys) => {
          return Promise.resolve(objectKeys.map(getLink));
        });
  
        const links = await bucketsUsecase.getFileLinks(filesIdsList);
  
        expect(getLinks.calledOnce).toBeTruthy();
  
        contacts.forEach((_, i) => {
          expect(getLinks.getCalls()[i].args).toStrictEqual([
            contact,
            shards.map(s => s.uuid)
          ]);
        });

        expect(links).toStrictEqual(filesIdsList.map((fileId, i) => {
          return { fileId, link: getLink(), index: files[i].index }
        }));
      });

      it('When shards are from different contacts', async () => {
        const filesIdsList = ['file-id', 'file-id-2'];
        const contactIds = ['contact-id-1', 'contact-id-2'];
        const contacts = contactIds.map(cId => fixtures.getContact({ id: cId }));
        const files = filesIdsList.map(fId => fixtures.getBucketEntry({ id: fId }));
        const bucketEntryShards = files.map(f => fixtures.getBucketEntryShard({ bucketEntry: f.id }));
        const shards = bucketEntryShards.map((be, i) => fixtures.getShard({ id: be.shard }, contactIds[i]));
        const getLink = (contact: Contact) => contact.address;

        stub(bucketEntriesRepository, 'findByIds').resolves(files);
        stub(bucketEntryShardsRepository, 'findByBucketEntries').resolves(bucketEntryShards);
        stub(shardsRepository, 'findByIds').resolves(shards);
        stub(contactsRepository, 'findByIds').resolves(contacts);
  
        const getLinks = stub(StorageGateway, 'getLinks').callsFake((contact, objectKeys) => {
          return Promise.resolve(objectKeys.map(() => getLink(contact)));
        });
  
        const received = await bucketsUsecase.getFileLinks(filesIdsList);
        const expected = filesIdsList.map((fileId, i) => {
          return { fileId, link: getLink(contacts[i]), index: files[i].index }
        });
  
        expect(getLinks.callCount).toBe(contacts.length);
  
        contacts.forEach((c, i) => {
          expect(getLinks.getCalls()[i].args).toStrictEqual([
            c,
            shards.filter(s => s.contracts[0].nodeID === c.id).map(s => s.uuid)
          ]);
        });

        expect(received).toStrictEqual(expected);
      });
    });
  });

  describe('deleteBucketByIdAndUser()', () => {
    const user = fixtures.getUser()
    const bucket = fixtures.getBucket({userId: user.uuid})

    it('Should throw if bucket is not found', async () => {
      stub(bucketsRepository, 'findOne').resolves(null);

      await expect(bucketsUsecase.deleteBucketByIdAndUser(bucket.id, user.uuid)).rejects.toThrow(BucketNotFoundError);
    });

    it('Should remove the bucket if bucket is found', async () => {
      stub(bucketsRepository, 'findOne').resolves(bucket);
      jest.spyOn(bucketsRepository, 'removeByIdAndUser').mockResolvedValue(undefined);

      await bucketsUsecase.deleteBucketByIdAndUser(bucket.id, user.uuid)

      expect(bucketsRepository.removeByIdAndUser).toHaveBeenCalledWith(bucket.id, user.uuid)
    });
  });

  describe('findByIdAndUser()', () => {
  const user = fixtures.getUser();
  const bucket = fixtures.getBucket({ userId: user.uuid });

  it('When called, then it should return the specific bucket', async () => {
    jest.spyOn(bucketsRepository, 'findOne').mockResolvedValueOnce(bucket);

    const result = await bucketsUsecase.findByIdAndUser(bucket.id, user.uuid);

    expect(bucketsRepository.findOne).toHaveBeenCalledWith({ id: bucket.id, userId: user.uuid });
    expect(result).toStrictEqual(bucket);
  });
});

describe('findAllByUserAndCreatedSince()', () => {
  const user = fixtures.getUser();
  const buckets = [
    fixtures.getBucket({ userId: user.uuid }),
    fixtures.getBucket({ userId: user.uuid })
  ];

  it('When called, then it should fetch buckets with specified date', async () => {
    const createdSince = new Date('2024-01-01');
    jest.spyOn(bucketsRepository, 'findUserBucketsFromDate').mockResolvedValueOnce(buckets);

    const result = await bucketsUsecase.findAllByUserAndCreatedSince(user.uuid, createdSince);

    expect(bucketsRepository.findUserBucketsFromDate).toHaveBeenCalledWith(user.uuid, createdSince);
    expect(result).toStrictEqual(buckets);
  });
});
});
