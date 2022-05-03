import { PreloadFile } from '../preload-file';
import { TempFile } from '../temp-file';

const SAMPLE = 'console.log("This is sample code");';

test('PreloadFile.fromCode', () => {
  // GIVEN
  const data = PreloadFile.fromCode(SAMPLE);
  // THEN
  expect(data.bind()).toEqual(SAMPLE);
});

test('PreloadFile.fromFile', () => {
  // GIVEN
  const file = new TempFile('preload-test.js', SAMPLE);
  const data = PreloadFile.fromFile(file.path);
  // THEN
  expect(data.bind()).toEqual(SAMPLE);
});
