import { validateContract } from '../../../../lib/core/shards/validateContract';

describe('validateContract()', () => {
  it('When a contract only has valid values, then it should not throw', () => {
    const contract = {
      version: 0,
      renter_id: 'a'.repeat(40),
      data_hash: 'b'.repeat(40),
      data_size: 1024,
      store_begin: 1,
      store_end: 2,
      renter_hd_key: false,
    };

    expect(() => validateContract(contract)).not.toThrow();
  });

  it('When a contract has unknown fields, then it should ignore them', () => {
    expect(() => validateContract({ unknown: 'value' })).not.toThrow();
  });

  it('When a contract is empty, then it should be valid', () => {
    expect(() => validateContract(undefined)).not.toThrow();
  });

  it.each([
    ['store_end', 'invalid'],
    ['store_begin', -1],
    ['data_size', 1.5],
    ['data_hash', 'A'.repeat(40)],
    ['renter_id', 'not-hex'],
    ['renter_hd_index', 2147483648],
    ['version', null],
  ])('When %s has the value %p, then it should throw the contract error', (field, value) => {
    expect(() => validateContract({ [field]: value })).toThrow('Invalid contract specification was supplied');
  });
});
