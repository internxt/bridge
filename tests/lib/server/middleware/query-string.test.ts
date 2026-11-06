import { Request, Response } from 'express';

import { querystring } from '../../../../lib/server/middleware/query-string';

const parseQuery = (requestUrl: string, query?: unknown) => {
  const req = { url: requestUrl, query } as unknown as Request;
  const next = jest.fn();

  querystring(req, {} as Response, next);

  return { query: { ...req.query }, next };
};

describe('Query string middleware', () => {
  it('When the query has simple parameters, then it should parse them', () => {
    expect(parseQuery('/contacts?address=x&page=2').query).toStrictEqual({ address: 'x', page: '2' });
  });

  it('When a parameter is repeated, then it should return a list of values', () => {
    expect(parseQuery('/contacts?a=1&a=2').query).toStrictEqual({ a: ['1', '2'] });
  });

  it.each([
    ['an operator', '/contacts?a[$ne]=1', { 'a[$ne]': '1' }],
    ['a nested key', '/contacts?a[b]=c', { 'a[b]': 'c' }],
    ['an empty array', '/contacts?a[]=1', { 'a[]': '1' }],
    ['array indexes', '/contacts?a[0]=1&a[1]=2', { 'a[0]': '1', 'a[1]': '2' }],
  ])('When a parameter uses brackets for %s, then it should keep them as part of a flat key', (_, requestUrl, expected) => {
    expect(parseQuery(requestUrl).query).toStrictEqual(expected);
  });

  it('When a value is encoded, then it should decode it', () => {
    expect(parseQuery('/contacts?a=1+2&b=%20c').query).toStrictEqual({ a: '1 2', b: ' c' });
  });

  it('When a parameter has no value, then it should be an empty string', () => {
    expect(parseQuery('/contacts?a=&b').query).toStrictEqual({ a: '', b: '' });
  });

  it('When the request has no query, then it should be empty', () => {
    expect(parseQuery('/contacts').query).toStrictEqual({});
  });

  it('When the url has a hash, then it should not be part of the query', () => {
    expect(parseQuery('/contacts?a=1#b').query).toStrictEqual({ a: '1' });
    expect(parseQuery('/contacts#b?a=1').query).toStrictEqual({});
  });

  it('When a value contains a question mark, then it should keep it', () => {
    expect(parseQuery('/contacts?a=1?b=2').query).toStrictEqual({ a: '1?b=2' });
  });

  it('When the query was already parsed with nested objects, then it should replace it', () => {
    const { query } = parseQuery('/contacts?a[$ne]=1', { a: { $ne: '1' } });

    expect(query).toStrictEqual({ 'a[$ne]': '1' });
  });

  it('When the query is parsed, then it should continue with the next middleware', () => {
    const { next } = parseQuery('/contacts?a=1');

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });
});
