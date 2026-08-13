import { describe, it, expect } from 'vitest';
import { getSuggestContext } from '../../src/editor/attributeSuggest';

const labels = (line: string) => getSuggestContext(line)?.items.map((i) => i.label) ?? null;

describe('getSuggestContext', () => {
  it('returns null outside a grid/split tag', () => {
    expect(getSuggestContext('just some text')).toBeNull();
    expect(getSuggestContext('# heading dim')).toBeNull();
  });

  it('returns null once the tag is closed', () => {
    expect(getSuggestContext('<grid dimension="60 30">content ')).toBeNull();
  });

  it('suggests grid attribute names', () => {
    expect(labels('<grid ')).toEqual([
      'dim',
      'pos',
      'style',
      'class',
      'shape',
      'frag',
      'animate',
    ]);
  });

  it('filters attribute names by prefix', () => {
    expect(labels('<grid di')).toEqual(['dim']);
  });

  it('suggests split attribute names', () => {
    expect(labels('<split ')).toEqual(['even', 'gap', 'left', 'right', 'wrap', 'no-margin']);
  });

  it('replaces only the typed prefix', () => {
    const context = getSuggestContext('<grid di');
    expect(context?.start).toBe('<grid '.length);
    expect(context?.query).toBe('di');
  });

  it('inserts an opening quote for value attributes, nothing for boolean ones', () => {
    expect(getSuggestContext('<grid ')?.items.find((i) => i.label === 'dim')?.insert).toBe('dim="');
    expect(getSuggestContext('<split ')?.items.find((i) => i.label === 'even')?.insert).toBe('even');
  });

  it('suggests position keywords inside an open quote', () => {
    expect(labels('<grid pos="')).toContain('bottomright');
    expect(labels('<grid pos="top')).toEqual(['top', 'topleft', 'topright']);
  });

  it('offers the same values for the long and advanced-slides spellings', () => {
    expect(labels('<grid position="top')).toEqual(['top', 'topleft', 'topright']);
    expect(labels('<grid drop="top')).toEqual(['top', 'topleft', 'topright']);
  });

  it('suggests every built-in shape', () => {
    expect(labels('<grid shape="hex')).toEqual(['hexagon']);
  });

  it('closes the quote when inserting a value', () => {
    const context = getSuggestContext('<grid pos="cen');
    expect(context?.items[0].insert).toBe('center"');
    expect(context?.start).toBe('<grid pos="'.length);
  });

  it('returns null for attributes with no value list', () => {
    expect(getSuggestContext('<grid style="colo')).toBeNull();
  });

  it('keeps working on the second attribute of a tag', () => {
    expect(labels('<grid dim="60 30" po')).toEqual(['pos']);
  });
});
