'use client';

/**
 * Taking a photograph off the visitor's disk — one implementation, for every
 * surface that asks for one.
 *
 * There are two now. The hero's drop box (`<PhotoChooser>`) is where somebody
 * who arrived at the front door gives their picture, and the button on a style
 * page is where somebody who arrived *at a haircut* gives theirs. That second
 * one used to be a link into the flow, which asked for the photograph and the
 * two questions again and then had to carry the cut back — a round trip through
 * three screens for somebody who had already found what they came for.
 *
 * The reason this is a shared hook rather than a second copy of eight lines is
 * the reason `<PhotoChooser>` gives for having one component behind its own two
 * entry points: **two surfaces that describe the upload differently are two
 * different promises about somebody's face.** The size cap, the re-encode, the
 * refusal wording and the accepted types are decided here and nowhere else.
 *
 * What is *not* here is the layout or the label. A drop box and a button are
 * genuinely different controls, and the promise is in what happens to the file,
 * not in the shape of the thing that took it.
 */

import { useCallback, useRef, useState, type ChangeEvent, type RefObject } from 'react';

import { ACCEPTED_TYPES, PhotoError, preparePhoto } from './photo';
import { useSession } from './state/SessionContext';

/**
 * The accepted extensions, derived from the list the input actually enforces, so
 * a line of copy about them cannot come to disagree with it.
 */
export const PHOTO_EXTENSIONS = ACCEPTED_TYPES.map(
  (type) => `.${type.split('/')[1].replace('jpeg', 'jpg')}`,
).join(', ');

export interface PhotoIntake {
  /** Open the operating system's own picker. */
  choose: () => void;
  /** Take a file that arrived some other way — a drop, most of all. */
  accept: (file: File | null) => Promise<void>;
  /** A photograph is being decoded and re-encoded. Drives the button's spinner. */
  busy: boolean;
  /** Why the last file was refused, in the words the visitor should read. */
  error: string | null;
  /**
   * The hidden input, spread onto an `<input>` the caller renders once.
   *
   * It carries its own `className`, because an input that is *not* hidden is a
   * second, unstyled control for the same thing sitting next to the real one —
   * and a caller who forgets the class would not find out until it shipped.
   */
  inputProps: {
    ref: RefObject<HTMLInputElement | null>;
    type: 'file';
    accept: string;
    className: string;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  };
}

export function usePhotoIntake(): PhotoIntake {
  const { setPhoto } = useSession();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setError(null);
      setBusy(true);
      try {
        setPhoto(await preparePhoto(file));
      } catch (caught) {
        setError(
          caught instanceof PhotoError
            ? caught.message
            : 'that file could not be opened as an image',
        );
      } finally {
        setBusy(false);
      }
    },
    [setPhoto],
  );

  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      // Cleared before the file is used, not after: an input holding a file
      // fires no `change` when the same one is picked again, and "use a
      // different one" then "actually, that one" is a real thing somebody does.
      // The value is dropped, never the `File` — that reference is already ours.
      event.target.value = '';
      void accept(file);
    },
    [accept],
  );

  const choose = useCallback(() => input.current?.click(), []);

  return {
    choose,
    accept,
    busy,
    error,
    inputProps: {
      ref: input,
      type: 'file',
      accept: ACCEPTED_TYPES.join(','),
      className: 'sr-only',
      onChange,
    },
  };
}
