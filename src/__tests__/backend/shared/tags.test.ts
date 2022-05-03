import { isTagApplicable } from '../../../backend/shared/tags';
import { TagCondition } from '../../../package-tag';

describe('Tag conditional logic', () => {
  test('Simple equality', () => {
    // GIVEN
    const key = 'STRING_KEY';
    const value = 'STRING_VALUE';
    const pkg = {
      [key]: value,
    };
    const readme = '';

    // THEN
    const condition = TagCondition.field(key).eq(value).bind();
    expect(isTagApplicable(condition, { pkg, readme })).toBe(true);
  });

  test('Nested field access', () => {
    // GIVEN
    const keys = ['STRING_KEY_1', 'STRING_KEY_2'];
    const value = 'STRING_VALUE';
    const pkg = {
      [keys[0]]: {
        [keys[1]]: value,
      },
    };
    const readme = '';

    // THEN
    const condition = TagCondition.field(...keys)
      .eq(value)
      .bind();
    expect(isTagApplicable(condition, { pkg, readme })).toBe(true);
  });

  test('Array item access', () => {
    // GIVEN
    const key = 'STRING_KEY_1';
    const value = 'STRING_VALUE';
    const pkg = {
      [key]: [value],
    };
    const readme = '';

    // THEN
    const condition = TagCondition.field(key, '0').eq(value).bind();
    expect(isTagApplicable(condition, { pkg, readme })).toBe(true);
  });

  test('False equality', () => {
    // GIVEN
    const key = 'STRING_KEY';
    const pkg = {
      [key]: 'STRING_VALUE',
    };
    const readme = '';

    // THEN
    const condition = TagCondition.field(key).eq('SOMETHING_ELSE').bind();
    expect(isTagApplicable(condition, { pkg, readme })).toBe(false);
  });

  describe('String includes', () => {
    test('positive', () => {
      // GIVEN
      const key = 'STRING_KEY';
      const substring = 'SOME_THING';
      const value = `BEGINNING_${substring}_MORE`;
      const pkg = {
        [key]: value,
      };
      const readme = '';

      // THEN
      const condition = TagCondition.field(key).includes(substring).bind();
      expect(isTagApplicable(condition, { pkg, readme })).toBe(true);
    });

    test('negative', () => {
      // GIVEN
      const key = 'STRING_KEY';
      const value = 'STRING_VALUE';
      const pkg = {
        [key]: value,
      };
      const readme = '';

      // THEN
      const condition = TagCondition.field(key)
        .includes('SOME_SUBSTRING')
        .bind();
      expect(isTagApplicable(condition, { pkg, readme })).toBe(false);
    });
  });

  describe('Readme includes', () => {
    test('positive', () => {
      // GIVEN
      const value = 'SOME_THING';
      const readme = `BEGINNING_${value}_MORE`;
      const pkg = {};

      // THEN
      const condition = TagCondition.readme().includes(value).bind();
      expect(isTagApplicable(condition, { pkg, readme })).toBe(true);
    });

    test('negative', () => {
      // GIVEN
      const value = 'SOME_THING';
      const readme = 'UNRELATED_STRING';
      const pkg = {};

      // THEN
      const condition = TagCondition.readme().includes(value).bind();
      expect(isTagApplicable(condition, { pkg, readme })).toBe(false);
    });

    test('at least - positive', () => {
      // GIVEN
      const value = 'VERY';
      const readme = `THE_${value}_${value}_${value}_LONG_STRING`;
      const options = { atLeast: 3 };
      const pkg = {};

      // THEN
      const condition = TagCondition.readme().includes(value, options).bind();
      expect(isTagApplicable(condition, { pkg, readme })).toBe(true);
    });

    test('at least - negative', () => {
      // GIVEN
      const value = 'VERY';
      const readme = `THE_${value}_LONG_STRING`;
      const options = { atLeast: 3 };
      const pkg = {};

      // THEN
      const condition = TagCondition.readme().includes(value, options).bind();
      expect(isTagApplicable(condition, { pkg, readme })).toBe(false);
    });

    test('case sensitive - positive', () => {
      // GIVEN
      const value = 'VERY';
      const readme = `THE_${value}_LONG_STRING`;
      const options = { caseSensitive: true };
      const pkg = {};

      // THEN
      const condition = TagCondition.readme().includes(value, options).bind();
      expect(isTagApplicable(condition, { pkg, readme })).toBe(true);
    });

    test('case sensitive - negative', () => {
      // GIVEN
      const value = 'VERY';
      const readme = `THE_${value.toLowerCase()}_LONG_STRING`;
      const options = { caseSensitive: true };
      const pkg = {};

      // THEN
      const condition = TagCondition.readme().includes(value, options).bind();
      expect(isTagApplicable(condition, { pkg, readme })).toBe(false);
    });
  });

  describe('Array includes', () => {
    test('positive', () => {
      // GIVEN
      const key = 'STRING_KEY';
      const item = 'SOME_THING';
      const value = ['SOME', item, 'ANOTHER_THING'];
      const pkg = {
        [key]: value,
      };
      const readme = '';

      // THEN
      const condition = TagCondition.field(key).includes(item).bind();
      expect(isTagApplicable(condition, { pkg, readme })).toBe(true);
    });

    test('negative', () => {
      // GIVEN
      const key = 'STRING_KEY';
      const value = ['SOME', 'ANOTHER_THING'];
      const pkg = {
        [key]: value,
      };
      const readme = '';

      // THEN
      const condition = TagCondition.field(key)
        .includes('NOT_IN_THE_ARRAY')
        .bind();
      expect(isTagApplicable(condition, { pkg, readme })).toBe(false);
    });
  });

  test('String starts with', () => {
    // GIVEN
    const key = 'STRING_KEY';
    const prefix = 'SOME_THING';
    const value = `${prefix}_MORE`;
    const pkg = {
      [key]: value,
    };
    const readme = '';

    // THEN
    const condition = TagCondition.field(key).startsWith(prefix).bind();
    expect(isTagApplicable(condition, { pkg, readme })).toBe(true);
  });

  describe('Logic operators', () => {
    // GIVEN
    const key = 'STRING_KEY';
    const value = 'STRING_VALUE';
    const pkg = {
      [key]: value,
    };
    const readme = '';
    const t = TagCondition.field(key).eq(value);
    const f = TagCondition.field(key).eq('SOMETHING_ELSE');

    test('Not !', () => {
      // THEN
      const fcondition = TagCondition.not(t).bind();
      const tcondition = TagCondition.not(f).bind();
      expect(isTagApplicable(fcondition, { pkg, readme })).toBe(false);
      expect(isTagApplicable(tcondition, { pkg, readme })).toBe(true);
    });

    test('Or ||', () => {
      //THEN
      const tconditions = [
        TagCondition.or(t, f).bind(),
        TagCondition.or(t, t).bind(),
      ];
      const fcondition = TagCondition.or(f, f).bind();
      tconditions.forEach((c) => {
        expect(isTagApplicable(c, { pkg, readme })).toBe(true);
      });
      expect(isTagApplicable(fcondition, { pkg, readme })).toBe(false);
    });

    test('And &&', () => {
      //THEN
      const tcondition = TagCondition.and(t, t).bind();
      const fconditions = [
        TagCondition.and(t, f).bind(),
        TagCondition.and(f, f).bind(),
      ];
      fconditions.forEach((c) => {
        expect(isTagApplicable(c, { pkg, readme })).toBe(false);
      });
      expect(isTagApplicable(tcondition, { pkg, readme })).toBe(true);
    });
  });
});
