'use strict';

const sinon = require('sinon');
const expect = require('chai').expect;
const { removeFile } = require('../../../lib/server/services/files');
const { storage } = require('../../_fixtures/router-opts');


describe('FileService', function () {
  after(() => {
    storage.connection.close();
  });

  const removeFileParameters = {
    bucketId: 'bucketIdSAMPLE',
    userEmail: 'sample@sample.com',
    idFile: 'abc123'
  };

  const requiredModels = ['Bucket', 'BucketEntry', 'Frame', 'Pointer'];

  const beforePointerIsRemoved = sinon.stub();

  describe('validate removeFile', function () {
    const sandbox = sinon.createSandbox();
    afterEach(() => sandbox.restore());
    it('Fails when provided with incomplete Models', async function () {

      const requiredStorageModels = {};
      requiredModels.forEach(model => {
        requiredStorageModels[model] = storage.models[model];
      });

      for (const requiredModel of requiredModels) {
        const shallowCopyStorage = { models: { ...requiredStorageModels } } ;
        delete shallowCopyStorage.models[requiredModel];
        try {
          await removeFile(shallowCopyStorage, removeFileParameters, { beforePointerIsRemoved });
          expect(true).toBe(false);
        } catch (err) {
          expect(err.message).to.equal('Missing required storage models');
        }
      }
    });

    it('Fails when provided with incomplete parameters', async function () {
      for (const [parameter, val] of Object.entries(removeFileParameters)) {
        const shallowCopy = { ...removeFileParameters };
        delete shallowCopy[parameter];
        try {
          await removeFile(storage, shallowCopy, { beforePointerIsRemoved });
          expect(true).toBe(false);
        } catch (err) {
          expect(err.message).to.equal('Missing required params');
        }
      }
    });

    it('Fails when bucket is not found', async function () {
      sandbox.stub(storage.models.Bucket, 'findOne').callsFake(() => Promise.resolve(null));

      try {
        await removeFile(storage, removeFileParameters, { beforePointerIsRemoved });
        expect(true).toBe(false);
      } catch (err) {
        expect(err.message).to.equal('Bucket not found');
      }
    });

    it('Fails when userEmail is not the same as user', async function () {
      sandbox.stub(storage.models.Bucket, 'findOne').callsFake(() => Promise.resolve({ user: 'different@email.com' }));

      try {
        await removeFile(storage, removeFileParameters, { beforePointerIsRemoved });
        expect(true).toBe(false);
      } catch (err) {
        console.log(err);
        expect(err.message).to.equal('Forbidden');
      }
    });
  });

  describe('removeFile functionality', function () {

    const sandbox = sinon.createSandbox();
    afterEach(() => sandbox.restore());
    beforeEach(() => {
      sandbox.stub(storage.models.Bucket, 'findOne').callsFake(
        () => Promise.resolve({
          user: removeFileParameters.userEmail,
          _id: removeFileParameters.bucketId
        })
      );
    });

    it('Fails when file is not found', async function () {
      sandbox.stub(storage.models.BucketEntry, 'findOne').callsFake(
        () => ({
          populate() {
            return {
              exec(cb) {
                cb(null, null);
              }
            };
          }
        })
      );

      try {
        await removeFile(storage, removeFileParameters, { beforePointerIsRemoved });
        expect(true).toBe(false);
      } catch (err) {
        expect(err.message).to.equal('File not found');
      }

    });

    it('Removes the bucketEntry when there is no frame', async function () {
      const removeBucketEntryFunction = sinon.stub();
      sandbox.stub(storage.models.BucketEntry, 'findOne').callsFake(
        () => ({
          populate() {
            return {
              exec(cb) {
                cb(null, {
                  remove: removeBucketEntryFunction,
                  frame: {
                    id: 'abc123'
                  } });
              }
            };
          }
        })
      );
      sandbox.stub(storage.models.Frame, 'findOne').callsFake(() => Promise.resolve(null));

      try {
        await removeFile(storage, removeFileParameters, { beforePointerIsRemoved });
        expect(true).toBe(false);
      } catch (err) {
        expect(removeBucketEntryFunction.called).to.equal(true);
      }
    });

    it('calls pointer.remove on all pointers, and removes frame and bucketentry', async function () {
      const removeFileFunction = sinon.stub();
      sandbox.stub(storage.models.BucketEntry, 'findOne').callsFake(
        () => ({
          populate() {
            return {
              exec(cb) {
                cb(null, {
                  remove: removeFileFunction,
                  frame: {
                    id: 'abc123'
                  } });
              }
            };
          }
        })
      );

      const removeFrameFunction = sinon.stub();
      sandbox.stub(storage.models.Frame, 'findOne').callsFake(
        () => Promise.resolve({
          remove: removeFrameFunction,
          shards: [
            {
              id: 'shard1'
            },
            {
              id: 'shard2'
            }
          ]
        })
      );

      const pointer1 = sinon.stub({ remove: () => {}, id: 'pointer1' });
      const pointer2 = sinon.stub({ remove: () => {}, id: 'pointer2' });
      sandbox.stub(storage.models.Pointer, 'find').callsFake(
        () => Promise.resolve([pointer1, pointer2])
      );

      try {
        await removeFile(storage, removeFileParameters, { beforePointerIsRemoved });

        expect(pointer1.remove.called).to.equal(true);
        expect(pointer2.remove.called).to.equal(true);
        expect(beforePointerIsRemoved.getCall(0).args[0]).to.equal(pointer1);
        expect(beforePointerIsRemoved.getCall(1).args[0]).to.equal(pointer2);
        expect(removeFrameFunction.calledOnce).to.equal(true);
        expect(removeFileFunction.calledOnce).to.equal(true);
      } catch (err) {
        expect(true).toBe(false);
      }
    });
  });
});
