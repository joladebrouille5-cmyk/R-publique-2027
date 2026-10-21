import { describe, expect, it } from 'vitest';
import { sha256Hex, utf8Encode } from './sha256';

describe('sha256', () => {
  it('respecte les vecteurs FIPS 180-4', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('encode correctement les caractères non ASCII', () => {
    expect(Array.from(utf8Encode('é€😀'))).toEqual([
      0xc3, 0xa9, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x98, 0x80,
    ]);
    expect(sha256Hex('é€😀')).toBe(
      'df9226927fd572c1ee66eec85de1bb139497614899f36e4e90474cb71f6ef9d0',
    );
  });
});
