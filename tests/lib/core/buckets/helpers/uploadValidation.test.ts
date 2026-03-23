import * as requestContext from '../../../../../lib/requestContext';
import { shouldEnforceUploadValidation } from '../../../../../lib/core/buckets/helpers/uploadValidation';

describe('shouldEnforceUploadValidation()', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  const mockContext = (clientId: string | undefined, version: string | undefined) => {
    jest.spyOn(requestContext, 'getContext').mockReturnValue({ clientId, version });
  };

  describe('When there are no client headers', () => {
    it('When clientId is missing, then it should enforce', () => {
      mockContext(undefined, '1.0.0');
      expect(shouldEnforceUploadValidation()).toBe(true);
    });

    it('When version is missing, then it should enforce', () => {
      mockContext('internxt-cli', undefined);
      expect(shouldEnforceUploadValidation()).toBe(true);
    });

    it('When both are missing, then it should enforce', () => {
      mockContext(undefined, undefined);
      expect(shouldEnforceUploadValidation()).toBe(true);
    });
  });

  describe('When the client is not in the exempt list', () => {
    it('When called with an unknown client, then it should enforce', () => {
      mockContext('some-unknown-client', '9.9.9');
      expect(shouldEnforceUploadValidation()).toBe(true);
    });
  });

  describe('When the client is drive-desktop-linux (all versions exempt)', () => {
    it('When called with any version, then it should not enforce', () => {
      mockContext('drive-desktop-linux', '0.0.1');
      expect(shouldEnforceUploadValidation()).toBe(false);
    });

    it('When called with a high version, then it should not enforce', () => {
      mockContext('drive-desktop-linux', '99.99.99');
      expect(shouldEnforceUploadValidation()).toBe(false);
    });
  });

  describe('When the client is internxt-cli (exempt up to 1.6.3)', () => {
    it('When version is below the exempt threshold, then it should not enforce', () => {
      mockContext('internxt-cli', '1.6.2');
      expect(shouldEnforceUploadValidation()).toBe(false);
    });

    it('When version equals the exempt threshold, then it should not enforce', () => {
      mockContext('internxt-cli', '1.6.3');
      expect(shouldEnforceUploadValidation()).toBe(false);
    });

    it('When version is above the exempt threshold, then it should enforce', () => {
      mockContext('internxt-cli', '1.6.4');
      expect(shouldEnforceUploadValidation()).toBe(true);
    });

    it('When minor version is above the exempt threshold, then it should enforce', () => {
      mockContext('internxt-cli', '1.7.0');
      expect(shouldEnforceUploadValidation()).toBe(true);
    });

    it('When major version is above the exempt threshold, then it should enforce', () => {
      mockContext('internxt-cli', '2.0.0');
      expect(shouldEnforceUploadValidation()).toBe(true);
    });
  });

  describe('When the client is drive-desktop-windows (exempt up to 2.6.6)', () => {
    it('When version is below the exempt threshold, then it should not enforce', () => {
      mockContext('drive-desktop-windows', '2.6.5');
      expect(shouldEnforceUploadValidation()).toBe(false);
    });

    it('When version equals the exempt threshold, then it should not enforce', () => {
      mockContext('drive-desktop-windows', '2.6.6');
      expect(shouldEnforceUploadValidation()).toBe(false);
    });

    it('When version is above the exempt threshold, then it should enforce', () => {
      mockContext('drive-desktop-windows', '2.6.7');
      expect(shouldEnforceUploadValidation()).toBe(true);
    });
  });
});
