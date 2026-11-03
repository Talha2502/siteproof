import {
  addDisabledReason,
  addPhotos,
  checkSubmit,
  emptyDraft,
  hasContent,
  photoCounterText,
  photoFailed,
  photoReady,
  removePhoto,
  setDescription,
  slotsLeft,
  type Draft,
} from './draft';
import type { NewImage } from './engine';

const image = (id: string): NewImage => ({
  id,
  localPath: `reports/d/${id}.jpg`,
  sizeBytes: 1000,
  width: 2048,
  height: 1536,
});

const pick = (...ids: string[]) =>
  ids.map(id => ({ id, previewUri: `file:///cache/${id}.jpg` }));

function readyDraft(count: number, description = 'Cracked lintel'): Draft {
  const ids = Array.from({ length: count }, (_, i) => `p${i + 1}`);
  let draft = setDescription(emptyDraft('d'), description);
  draft = addPhotos(draft, pick(...ids));
  for (const id of ids) draft = photoReady(draft, id, image(id));
  return draft;
}

describe('draft', () => {
  it('starts empty, with no content to lose', () => {
    const draft = emptyDraft('d');
    expect(hasContent(draft)).toBe(false);
    expect(photoCounterText(draft)).toBe('0 of 5 photos');
    expect(hasContent(setDescription(draft, '  x '))).toBe(true);
  });

  it('adds picked photos as processing, up to the limit of 5', () => {
    const draft = addPhotos(
      emptyDraft('d'),
      pick('a', 'b', 'c', 'd', 'e', 'f'),
    );
    expect(draft.photos.map(p => p.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(draft.photos.every(p => p.state === 'processing')).toBe(true);
    expect(slotsLeft(draft)).toBe(0);
    expect(addDisabledReason(draft)).toMatch(/maximum of 5/);
  });

  it('does not count failed photos toward the limit', () => {
    let draft = addPhotos(emptyDraft('d'), pick('a', 'b', 'c', 'd', 'e'));
    draft = photoFailed(draft, 'c', 'Too large');
    expect(slotsLeft(draft)).toBe(1);
    expect(photoCounterText(draft)).toBe('4 of 5 photos');
    expect(addDisabledReason(draft)).toBeUndefined();
  });

  it('removes a photo and frees its slot', () => {
    const draft = removePhoto(readyDraft(5), 'p2');
    expect(draft.photos.map(p => p.id)).toEqual(['p1', 'p3', 'p4', 'p5']);
    expect(slotsLeft(draft)).toBe(1);
  });

  describe('checkSubmit gives one reason, top of the form first', () => {
    it('needs a non-blank description', () => {
      expect(checkSubmit(readyDraft(1, '   '))).toEqual({
        ok: false,
        reason: 'Add a description to submit',
      });
    });

    it('says how much too long the description is', () => {
      expect(checkSubmit(readyDraft(1, 'x'.repeat(1003)))).toEqual({
        ok: false,
        reason: 'Shorten the description by 3 characters',
      });
      expect(checkSubmit(readyDraft(1, `  ${'x'.repeat(1000)}  `)).ok).toBe(
        true,
      );
    });

    it('needs at least one photo', () => {
      expect(checkSubmit(setDescription(emptyDraft('d'), 'x'))).toEqual({
        ok: false,
        reason: 'Add at least one photo to submit',
      });
    });

    it('waits for photos still processing', () => {
      let draft = setDescription(emptyDraft('d'), 'x');
      draft = addPhotos(draft, pick('a', 'b'));
      expect(checkSubmit(draft)).toEqual({
        ok: false,
        reason: 'Preparing 2 photos…',
      });
      draft = photoReady(draft, 'a', image('a'));
      expect(checkSubmit(draft)).toEqual({
        ok: false,
        reason: 'Preparing 1 photo…',
      });
    });

    it('asks to remove a photo that failed', () => {
      let draft = readyDraft(2);
      draft = photoFailed(draft, 'p2', 'Too large');
      expect(checkSubmit(draft)).toEqual({
        ok: false,
        reason: "Remove the photo that couldn't be processed",
      });
    });

    it('builds the report with a trimmed description and photos in order', () => {
      expect(checkSubmit(readyDraft(3, '  Cracked lintel  '))).toEqual({
        ok: true,
        report: {
          id: 'd',
          description: 'Cracked lintel',
          images: [image('p1'), image('p2'), image('p3')],
        },
      });
    });
  });
});
