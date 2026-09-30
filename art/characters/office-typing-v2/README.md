# Seated Keyboard Typing v2

Clip: `work.typing-back`; seated, straight back view, continuous loop.

Only the forearms and hands alternate. The head, torso and shoes remain stable.
Lift is deliberately readable at office scale, without whole-arm waving.
Phases: left lift (210ms), left press (110ms), right lift (210ms), right press
(110ms). The whole cycle remains 640ms. Movement, seating and conversation
retain their existing priority over typing.

Identity/edit reference: `../office-typing-v1/generated-v1.png`.
Contact-height reference: `../../../public/assets/office/desk.png`; never included
in the sprite artwork. The first sheet is the edit target; the desk is only a
pose/contact reference. Generation uses the built-in ImageGen tool.

Registration keeps the existing 256 x 384 canvas, pivot (128,344), seated foot
y=377 and each character's own back-view head measurements. Whole-body uniform
scaling only. Exact prompt: `prompt.txt`. The source and selected generation ID
are recorded in `registration.json`. Old typing frames are preserved; the new
files live in each character pack's `work/typing-back-v2/` directory. All four
typing frames use one common per-character scale to avoid a raised hand in the
head measurement band changing the body's scale. The targeted arm correction
is saved as `generated-v2-corrected.png` with `correction-prompt.txt`.

Acceptance: distinct alternating presses; visible lift at a common scene scale;
hands aligned with the tabletop; no head-size or outfit jump, no furniture
pixels, clean transparent gutters, and a seamless D-to-A loop. Numeric checks
must be supplemented by the real office preview.
