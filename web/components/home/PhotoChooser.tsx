'use client';

/**
 * Where the photograph comes in — the first thing on the site, and the only
 * control in the hero.
 *
 * One component for both ways of giving it, a file picked from disk and a file
 * dragged onto the box, because there is one wording and one promise. Two entry
 * points that describe the upload differently are two different promises about
 * somebody's face.
 *
 * The style page asks for a photograph too, and it does *not* use this: a drop
 * box in the middle of a haircut's page would be a second front door. What it
 * shares is the part the promise is actually made of — `usePhotoIntake`, which
 * owns the decode, the cap, the accepted types and the refusal wording.
 *
 * Everything else that used to be in here — a heading, a paragraph of framing
 * advice — moved out to the hero around it, which now says those things once at
 * the size they deserve. A box that restates the headline above it is a box
 * competing with its own page.
 *
 * ## What is actually uploaded
 *
 * Not the file that was chosen. `preparePhoto` decodes it, caps the longest edge
 * at 1536 and re-encodes as JPEG, so a 12-megapixel photo becomes a few hundred
 * kilobytes of exactly the detail the model uses.
 *
 * ## There is no "here is your photo" state
 *
 * Deliberately, and it is not an omission. Choosing a photograph moves the flow
 * straight into the two questions, so a preview state here would be a frame
 * nobody ever sees. What confirms the picture instead is the thumbnail in the
 * dialogue's own header and the one in the summary row after it — both of them
 * on screens the visitor actually stops on.
 */

import { useState, type DragEvent } from 'react';

import { PHOTO_EXTENSIONS, usePhotoIntake } from '../../lib/usePhotoIntake';
import { Button } from '../ui';

export function PhotoChooser() {
  const { choose, accept, busy, error, inputProps } = usePhotoIntake();
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void accept(event.dataTransfer.files?.[0] ?? null);
  };

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={
          'grid place-items-center rounded-[20px] border border-dashed px-6 py-9 text-center ' +
          'transition-colors duration-300 sm:py-11 ' +
          (dragging
            ? 'border-violet bg-violet/10'
            : 'border-white/18 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.05]')
        }
      >
        <div>
          <Button size="lg" onClick={choose} loading={busy}>
            {busy ? null : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden focusable="false">
                <path
                  d="M12 16V5m0 0L8 9m4-4 4 4M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {busy ? 'Reading your photo…' : 'Upload a photo'}
          </Button>

          <p className="mt-3 text-[12px] text-faint">{PHOTO_EXTENSIONS}</p>

          <p className="mt-1.5 hidden text-[12px] text-muted sm:block">
            or drop one here — face the camera, decent light, hair off your forehead
          </p>
        </div>

        <input {...inputProps} />
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
