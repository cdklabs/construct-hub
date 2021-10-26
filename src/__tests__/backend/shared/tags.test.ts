import { isTagApplicable } from '../../../backend/shared/tags';
import { TagCondition } from '../../../package-tag';

describe('Tag conditional logic', () => {
  test('Simple equality', () => {
    // GIVEN
    const key = 'STRING_KEY';
    const value = 'STRING_VALUE';
    const packageJson = {
      [key]: value,
    };

    // THEN
    const condition = TagCondition.field(key).eq(value).bind();
    expect(isTagApplicable(condition, packageJson)).toBe(true);
  });

  test('Nested field access', () => {
    // GIVEN
    const keys = ['STRING_KEY_1', 'STRING_KEY_2'];
    const value = 'STRING_VALUE';
    const packageJson = {
      [keys[0]]: {
        [keys[1]]: value,
      },
    };

    // THEN
    const condition = TagCondition.field(...keys).eq(value).bind();
    expect(isTagApplicable(condition, packageJson)).toBe(true);
  });

  test('Array item access', () => {
    // GIVEN
    const key = 'STRING_KEY_1';
    const value = 'STRING_VALUE';
    const packageJson = {
      [key]: [value],
    };

    // THEN
    const condition = TagCondition.field(key, '0').eq(value).bind();
    expect(isTagApplicable(condition, packageJson)).toBe(true);
  });

  test('False equality', () => {
    // GIVEN
    const key = 'STRING_KEY';
    const packageJson = {
      [key]: 'STRING_VALUE',
    };

    // THEN
    const condition = TagCondition.field(key).eq('SOMETHING_ELSE').bind();
    expect(isTagApplicable(condition, packageJson)).toBe(false);
  });

  describe('String includes', () => {
    test('positive', () => {
      // GIVEN
      const key = 'STRING_KEY';
      const substring = 'SOME_THING';
      const value = `BEGINNING_${substring}_MORE`;
      const packageJson = {
        [key]: value,
      };

      // THEN
      const condition = TagCondition.field(key).includes(substring).bind();
      expect(isTagApplicable(condition, packageJson)).toBe(true);
    });

    test('negative', () => {
      // GIVEN
      const key = 'STRING_KEY';
      const value = `STRING_VALUE`;
      const packageJson = {
        [key]: value,
      };

      // THEN
      const condition = TagCondition.field(key).includes('SOME_SUBSTRING').bind();
      expect(isTagApplicable(condition, packageJson)).toBe(false);
    });
  });

  describe('Array includes', () => {
    test('positive', () => {
      // GIVEN
      const key = 'STRING_KEY';
      const item = 'SOME_THING';
      const value = ['SOME', item, 'ANOTHER_THING'];
      const packageJson = {
        [key]: value,
      };

      // THEN
      const condition = TagCondition.field(key).includes(item).bind();
      expect(isTagApplicable(condition, packageJson)).toBe(true);
    });

    test('negative', () => {
      // GIVEN
      const key = 'STRING_KEY';
      const value = ['SOME', 'ANOTHER_THING'];
      const packageJson = {
        [key]: value,
      };

      // THEN
      const condition = TagCondition.field(key).includes('NOT_IN_THE_ARRAY').bind();
      expect(isTagApplicable(condition, packageJson)).toBe(false);
    });
  });

  test('String starts with', () => {
    // GIVEN
    const key = 'STRING_KEY';
    const prefix = 'SOME_THING';
    const value = `${prefix}_MORE`;
    const packageJson = {
      [key]: value,
    };

    // THEN
    const condition = TagCondition.field(key).startsWith(prefix).bind();
    expect(isTagApplicable(condition, packageJson)).toBe(true);
  });


  describe('Logic operators', () => {
    // GIVEN
    const key = 'STRING_KEY';
    const value = 'STRING_VALUE';
    const packageJson = {
      [key]: value,
    };
    const t = TagCondition.field(key).eq(value);
    const f = TagCondition.field(key).eq('SOMETHING_ELSE');

    test('Not !', () => {
      // THEN
      const fcondition = TagCondition.not(t).bind();
      const tcondition = TagCondition.not(f).bind();
      expect(isTagApplicable(fcondition, packageJson)).toBe(false);
      expect(isTagApplicable(tcondition, packageJson)).toBe(true);
    });

    test('Or ||', () => {
      //THEN
      const tconditions = [TagCondition.or(t, f).bind(), TagCondition.or(t, t).bind()];
      const fcondition = TagCondition.or(f, f).bind();
      tconditions.forEach(c => {
        expect(isTagApplicable(c, packageJson)).toBe(true);
      });
      expect(isTagApplicable(fcondition, packageJson)).toBe(false);
    });

    test('And &&', () => {
      //THEN
      const tcondition = TagCondition.and(t, t).bind();
      const fconditions = [TagCondition.and(t, f).bind(), TagCondition.and(f, f).bind()];
      fconditions.forEach(c => {
        expect(isTagApplicable(c, packageJson)).toBe(false);
      });
      expect(isTagApplicable(tcondition, packageJson)).toBe(true);
    });
  });
});
