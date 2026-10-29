import { describe, expect, it } from 'vitest';
import { describeIndicatorChange, ECONOMIC_INDICATORS, signedHundredths } from './economie';

// Variations d'indicateurs dans les textes du moteur (phase 15) : français, sans identifiant
// interne, indépendantes des réglages régionaux du système.

describe('variations des indicateurs en clair', () => {
  it('signe les centièmes à la française, avec un vrai signe moins', () => {
    expect(signedHundredths(60)).toBe('+0,6');
    expect(signedHundredths(-4)).toBe('−0,04');
    expect(signedHundredths(-150)).toBe('−1,5');
    expect(signedHundredths(200)).toBe('+2');
    expect(signedHundredths(0)).toBe('0');
  });

  it('nomme chaque indicateur et son unité, jamais par son identifiant', () => {
    expect(describeIndicatorChange('deficit', -4)).toBe('solde public −0,04 pt de PIB');
    expect(describeIndicatorChange('chomage', -2)).toBe('chômage −0,02 pt');
    expect(describeIndicatorChange('tensions', 150)).toBe('tensions sociales +1,5');
    for (const indicator of ECONOMIC_INDICATORS) {
      const text = describeIndicatorChange(indicator, 10);
      expect(text).not.toMatch(/pouvoirAchat|chomage|deficit/);
      expect(text).toMatch(/ \+0,1( pt( de PIB)?)?$/);
    }
  });
});
