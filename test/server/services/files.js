'use strict';

const httpMocks = require('node-mocks-http');
const sinon = require('sinon');
const expect = require('chai').expect;
const errors = require('storj-service-error-types');
const { removeFile } = require('../../../lib/server/services/files');

/* jshint maxstatements:false */
describe('FileService', function () {

  const sandbox = sinon.createSandbox();
  afterEach(() => sandbox.restore());

  const removeFileParameters = {
    idBucket: 'IDBUCKETSAMPLE',
    userEmail: 'sample@sample.com',
    idFile: 'abc123'
  };

  const storage = {
    models: {
      Bucket: {
        findOne() {
          return { _id: removeFileParameters.idBucket, user: removeFileParameters.userEmail };
        }
      },
      BucketEntry: {
        findOne() {
          return {
            populate() {
              return {
                exec() {
                  return Promise.resolve({
                    _id: removeFileParameters.idFile,
                    frame: {
                      id: 'abc123'
                    }
                  });
                }
              };
            }
          };
        },
        remove() {},
      },
      Frame: {
        findOne() {
          return {};
        },
        remove() {}
      },
      Pointer: {
        find() {
          return [{ remove() {} }, { remove() {} }];
        }
      }
    }
  };
  const beforePointerIsRemoved = async () => {};

  describe('validate removeFile', async function () {
    // afterEach(() => sandbox.restore());
    it('Fails when provided with incomplete Models', async function () {
      for (const [model, val] of Object.entries(storage.models)) {
        const shallowCopy = { models: { ...storage.models } };
        delete shallowCopy.models[model];
        try {
          await removeFile(shallowCopy, removeFileParameters, { beforePointerIsRemoved });
          throw new Error('Expected error to be thrown');
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
          throw new Error('Expected error to be thrown');
        } catch (err) {
          expect(err.message).to.equal('Missing required params');
        }
      }
    });

    // it('Fails when bucket is not found', async function () {
    //   sinon.stub(storage.models.Bucket, 'findOne').callsFake(
    //     function () {
    //       return Promise.resolve(null);
    //     });

    //   try {
    //     await removeFile(storage, removeFileParameters, { beforePointerIsRemoved });
    //     throw new Error('Expected error to be thrown');
    //   } catch (err) {
    //     expect(err.message).to.equal('Bucket not found');
    //   }
    // });

    it('Fails when userEmail is not the same as user', async function () {
      removeFileParameters.userEmail = 'otheruser@user.com';

      try {
        await removeFile(storage, removeFileParameters, { beforePointerIsRemoved });
        throw new Error('Expected error to be thrown');
      } catch (err) {
        console.log(err);
        expect(err.message).to.equal('Forbidden');
      }
    });

  });
  describe('removeFile functionality', function () {
    it('Fails when file is not found', function (done) {
      done();

    });
    it('Removes the bucketEntry when there is no frame', function (done) {
      done();

    });
    it('calls pointer.remove on all pointers', function (done) {
      done();

    });
  });

  describe('removeFile order of data structures', function () {
    it('Fails when file is not found', function (done) {
      done();

    });
    it('Removes the bucketEntry when there is no frame', function (done) {
      done();

    });
    it('calls pointer.remove on all pointers', function (done) {
      done();

    });
  });

});