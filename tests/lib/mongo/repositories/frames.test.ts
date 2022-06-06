import { config } from 'dotenv';
import {
  frames as frameDocuments,
  framesFixtures,
} from '../fixtures/frames.fixtures';
import { unloadLoadFixtures } from '../fixtures/init-fixtures';
import { setupAndValidateStorageForFixtures } from './utils';
import { MongoDBFramesRepository } from '../../../../lib/core/frames/MongoDBFramesRepository';

config();

const { storage, uri, BRIDGE_TEST_DB_NAME } =
  setupAndValidateStorageForFixtures();

let repository: MongoDBFramesRepository = new MongoDBFramesRepository(
  storage.models.Frame
);

const [frame1, frame2] = framesFixtures;

beforeEach((ready) => {
  unloadLoadFixtures(uri, BRIDGE_TEST_DB_NAME).then(() => {
    ready();
  });
});

afterAll((finish) => {
  unloadLoadFixtures(uri, BRIDGE_TEST_DB_NAME).then(() => {
    storage.connection.close();
    finish();
  });
});

describe('Frames repository', () => {
  describe('findOne', () => {
    it('findOne()', async () => {
      const frame = await repository.findOne({
        user: frame2.user,
      });

      expect(frame).toStrictEqual(frame2);
    });

    it('findOne() - not found', async () => {
      const frame = await repository.findOne({
        user: 'doesntexist@user.com',
      });

      expect(frame).toBeNull();
    });
  });

  it('findByIds()', async () => {
    const frames = await repository.findByIds([frame1.id, frame2.id]);

    expect(frames).toHaveLength(2);
    expect(frames[0]).toStrictEqual(frame1);
    expect(frames[1]).toStrictEqual(frame2);
  });

  it('getUserUsage()', async () => {});

  it('removeAll()', async () => {
    await repository.removeAll({});
    expect(repository.findByIds([frame1.id, frame2.id])).resolves.toHaveLength(
      0
    );
  });

  it('deleteByIds()', async () => {
    await repository.deleteByIds([frame1.id, frame2.id]);

    const bucketEntriesWithoutIt = await repository.findByIds([
      frame1.id,
      frame2.id,
    ]);

    expect(bucketEntriesWithoutIt).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: frame1.id,
        }),
      ])
    );
    expect(bucketEntriesWithoutIt).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: frame2.id,
        }),
      ])
    );
  });
});
