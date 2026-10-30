# Daryl's interactive portrait

Thirty transparent source images generated with the built-in image_gen tool, using Daryl's original `../daryl.jpg` as the identity reference. Full-resolution PNGs are retained. The renderer loads 13 base portrait textures and 18 independent eye strips; the neutral source is reused for the resting eyes. Portrait WebPs are 768 pixels wide at quality 92; eye strips are 410 × 110 at quality 94, with full alpha quality. No original photo was overwritten.

The idle choreography is an original implementation inspired by [rameerez.com](https://rameerez.com/). No third-party portrait assets or animation code are bundled.

## Behaviors

- Immediate annoyed expression and a physical ripple when the cursor reaches opaque portrait pixels; transparent corners do not react. Cursor movement rubs the skin without a click.
- Startled grab, gritted teeth for a medium pull, open-mouth pain for a stronger pull.
- Spring mesh, ripple propagation, stretched shading, and whole-head sway on release.
- Dizzy recovery, and speechless disbelief after three substantial pulls within successive six-second intervals.
- Independent cursor tracking across 15 gaze directions, plus resting, half-closed, and closed eyes. Blinks pass through half-closed lids. Four distinct yawn stages.
- Seven idle acts: yawn, shifty eyes, eye roll, whistle, doze and wake, automatic cheek tug, and a fly that circles, lands on the nose, and is blown away on the second puff. The face stays annoyed or deadpan while the fly is visible, with puckered lips for the two puffs; smiling resumes only after it leaves.
- Hover, pointer movement, grabbing, scrolling, or keyboard input interrupts idle acts. Hidden tabs and reduced-motion preferences disable idle choreography.

A demonstration tug starts after four quiet seconds once all expression textures are loaded. Later acts play every 2–4.5 quiet seconds. Idle animations wait while the portrait is hovered or recovering from a real pull. Hover overrides recovery immediately. A tap or keyboard poke shows a brief startled reaction; activity interrupts dozing with a physical jolt awake.

For manual previews in the browser console:

```js
document.getElementById('face').playPortraitAct('fly');
// Also: yawn, shifty, eyeroll, whistle, doze, tug
```

## Verification and preview

Run `node --test tests/portrait.test.cjs` from the repository root. The regression tests drive the real renderer and idle controller with deterministic time, checking mesh displacement on hover, cursor rubbing, transparent hit areas, expression timing, all gaze directions, independent eye poses, tap reactions, wake-up, interruption, and optional mockup masks.

With the repository served as the web root, open `/tests/portrait-preview.html` to inspect every idle act, gaze direction, eyelid pose, and yawn stage. This preview is separate from Agent 1's mockups.

The hover bug was caused by a handler that changed the caption/texture without applying force to the mesh, and by pointer movement being ignored without an active grab. Recovery could also suppress the hover expression. Hover now injects a bounded local velocity impulse, movement continues to disturb the skin, and the existing springs propagate and settle the wave.

Source images are normalized to the master canvas with `sips -z 1422 1106` before packaging. Eye strips are packed with `cwebp -crop 330 455 410 110`; `eyes/manifest.json` records their registration against the 1106 × 1422 source. Only the eye areas are blended over compatible facial expressions, so the mouth, head and brows stay fixed while the gaze changes.

## Prompt set

### Neutral master: idle.png

Use case: identity-preserve. Edit target: the attached portrait of Daryl Yeo. Create a photorealistic transparent cutout avatar for an interactive stretchy face website. Preserve this exact man's recognizable identity, age, short black hair, facial proportions, skin tone, and pale blue collared shirt. Straight-on face, naturally friendly small smile with lips closed, eyes open at camera. Same head position and scale as the source photo, complete hair and ears, neck and shoulders, portrait 7:9 composition. Remove the gray studio backdrop completely, genuine alpha transparency, clean fine hair edges. Shoulders taper into a gently curved bottom silhouette. Soft natural studio light. No circle, no colored background, no text, no props. This is the neutral master frame for a set of facial expression swaps; keep head upright and centered.

### Shared expression instructions

Use case: identity-preserve. Edit the supplied transparent neutral portrait to create ONE matching facial expression frame for the SAME man's interactive photo avatar. Preserve exact recognizable identity and age, hair silhouette, ears, head placement, camera distance, lighting, skin texture, pale blue shirt, shoulders and curved bottom silhouette. Change facial expression ONLY. Match reference canvas dimensions and subject scale precisely so swapping textures produces no positional jump. Photorealistic, no cartoon rendering, no added text or props. Genuine transparent alpha background with clean edges, no gray or green backdrop.

### blink.png

Both eyelids completely closed in a relaxed natural blink. Keep the same gentle closed-mouth smile. Change only eyelids.

### hover.png

Comical side-eye disgust: eyes glance conspicuously toward viewer's right, eyebrows slightly furrowed and one raised, upper lip subtly curled, mouth closed, an unmistakable 'don't you dare' skeptical annoyed expression. Head stays perfectly frontal and fixed.

### grab.png

Startled when suddenly grabbed: eyebrows raised high, eyes wide open, small surprised O-shaped mouth. Funny and expressive, not frightened. Head stays perfectly frontal and fixed.

### grit.png

Comical discomfort as a cheek is pulled: eyes narrowed, brow tightly furrowed, lips drawn apart showing tightly clenched gritted teeth, corners of mouth stretched in a tense grimace. Head stays perfectly frontal and fixed.

### pain.png

Exaggerated playful cry of pain during a strong rubbery face pull: eyes tightly squeezed shut, eyebrows scrunched, mouth wide open crying 'aaah', upper and lower teeth visible. Funny rubber-face reaction, no injuries, no blood, no tears needed. Do not actually stretch the head; the website deforms it live. Head stays perfectly frontal and fixed.

### dizzy.png

Dazed and dizzy after a rubbery pull: eyelids droop unevenly, gaze slightly unfocused and cross-eyed, eyebrows uneven, mouth slightly open and slack. Recognizable funny disoriented expression. Head stays perfectly frontal and fixed. No stars or drawn symbols.

### speechless.png

Utterly speechless and unimpressed after being pulled three times: completely deadpan thousand-yard stare directly at camera, half-lidded tired eyes, flat straight closed lips, slightly raised eyebrows. Strong funny resigned disbelief. Head stays perfectly frontal and fixed.

### yawn-start.png

Sleepy beginning of a yawn: eyelids heavy and drooping, brows relaxed, mouth opening slightly, jaw beginning to drop. Clearly sleepy rather than surprised.

### yawn.png

At the peak of a big sleepy natural yawn: eyes gently squeezed shut, eyebrows relaxed not angry, mouth tall and wide open, jaw dropped. Definitely yawning with relaxed sleepy muscles, not screaming.

### whistle.png

Whistling or blowing a puff of air: lips tightly puckered into a small round opening protruding forward, cheeks slightly puffed, eyebrows relaxed, eyes open. Realistic and playful.

### whistle-puff.png

Blowing a stronger second puff of air: lips pursed into a small O protruding forward, cheeks more puffed, narrowed eyes with mildly annoyed brows. Realistic and playful.

### look-left.png

Only shift both irises and pupils conspicuously to viewer's left, eyes open, preserving neutral eyelids and eyebrows and gentle closed-mouth smile. No head movement. This is an eye gaze animation frame.

### look-right.png

Only shift both irises and pupils conspicuously to viewer's right, eyes open, preserving neutral eyelids and eyebrows and gentle closed-mouth smile. No head movement. This is an eye gaze animation frame.

### look-up.png

Only shift both irises and pupils conspicuously upward as if rolling his eyes toward the ceiling, eyes open, preserving neutral eyelids and eyebrows and gentle closed-mouth smile. No head movement. This is an eye gaze animation frame.

## Matching expansion prompts

Shared instruction: Use case: identity-preserve. Edit target: supplied transparent neutral portrait of Daryl Yeo. Create ONE matching facial expression frame for his interactive photoreal avatar. Preserve exact recognizable identity and age, skin texture and lighting, hair silhouette, ears, head placement and scale, camera perspective, pale blue collared shirt and curved shoulder silhouette. Change only facial expression or eye direction as requested. CRITICAL registration: retain the exact reference canvas size and positions of head, nose, eyes and shoulders. Genuine transparent alpha background. No green or gray background, no props, no symbols, no text, no cartoon style.

### look-ese.png

Eye-gaze frame: BOTH irises and pupils point in the same direction, toward the viewer’s RIGHT and DOWN. The exact normalized gaze vector in image coordinates (x right, y down) is (0.9239, 0.3827). The gaze is primarily horizontal. Keep both eyes open, the same gentle closed-mouth smile, neutral brows, eyelid shape and head position. Change ONLY iris and pupil direction; no head tilt.

### look-se.png

Eye-gaze frame: BOTH irises and pupils point in the same direction, toward the viewer’s RIGHT and DOWN. The exact normalized gaze vector in image coordinates (x right, y down) is (0.7071, 0.7071). The gaze is primarily horizontal. Keep both eyes open, the same gentle closed-mouth smile, neutral brows, eyelid shape and head position. Change ONLY iris and pupil direction; no head tilt.

### look-sse.png

Eye-gaze frame: BOTH irises and pupils point in the same direction, toward the viewer’s RIGHT and DOWN. The exact normalized gaze vector in image coordinates (x right, y down) is (0.3827, 0.9239). The gaze is primarily vertical. Keep both eyes open, the same gentle closed-mouth smile, neutral brows, eyelid shape and head position. Change ONLY iris and pupil direction; no head tilt.

### look-s.png

Eye-gaze frame: BOTH irises and pupils point in the same direction, horizontally centered and DOWN. The exact normalized gaze vector in image coordinates (x right, y down) is (0, 1). The gaze is primarily vertical. Keep both eyes open, the same gentle closed-mouth smile, neutral brows, eyelid shape and head position. Change ONLY iris and pupil direction; no head tilt.

### look-ssw.png

Eye-gaze frame: BOTH irises and pupils point in the same direction, toward the viewer’s LEFT and DOWN. The exact normalized gaze vector in image coordinates (x right, y down) is (-0.3827, 0.9239). The gaze is primarily vertical. Keep both eyes open, the same gentle closed-mouth smile, neutral brows, eyelid shape and head position. Change ONLY iris and pupil direction; no head tilt.

### look-sw.png

Eye-gaze frame: BOTH irises and pupils point in the same direction, toward the viewer’s LEFT and DOWN. The exact normalized gaze vector in image coordinates (x right, y down) is (-0.7071, 0.7071). The gaze is primarily horizontal. Keep both eyes open, the same gentle closed-mouth smile, neutral brows, eyelid shape and head position. Change ONLY iris and pupil direction; no head tilt.

### look-wsw.png

Eye-gaze frame: BOTH irises and pupils point in the same direction, toward the viewer’s LEFT and DOWN. The exact normalized gaze vector in image coordinates (x right, y down) is (-0.9239, 0.3827). The gaze is primarily horizontal. Keep both eyes open, the same gentle closed-mouth smile, neutral brows, eyelid shape and head position. Change ONLY iris and pupil direction; no head tilt.

### look-wnw.png

Eye-gaze frame: BOTH irises and pupils point in the same direction, toward the viewer’s LEFT and UP. The exact normalized gaze vector in image coordinates (x right, y down) is (-0.9239, -0.3827). The gaze is primarily horizontal. Keep both eyes open, the same gentle closed-mouth smile, neutral brows, eyelid shape and head position. Change ONLY iris and pupil direction; no head tilt.

### look-nw.png

Eye-gaze frame: BOTH irises and pupils point in the same direction, toward the viewer’s LEFT and UP. The exact normalized gaze vector in image coordinates (x right, y down) is (-0.7071, -0.7071). The gaze is primarily horizontal. Keep both eyes open, the same gentle closed-mouth smile, neutral brows, eyelid shape and head position. Change ONLY iris and pupil direction; no head tilt.

### look-nnw.png

Eye-gaze frame: BOTH irises and pupils point in the same direction, toward the viewer’s LEFT and UP. The exact normalized gaze vector in image coordinates (x right, y down) is (-0.3827, -0.9239). The gaze is primarily vertical. Keep both eyes open, the same gentle closed-mouth smile, neutral brows, eyelid shape and head position. Change ONLY iris and pupil direction; no head tilt.

### look-ne.png

Eye-gaze frame: BOTH irises and pupils point in the same direction, toward the viewer’s RIGHT and UP. The exact normalized gaze vector in image coordinates (x right, y down) is (0.7071, -0.7071). The gaze is primarily horizontal. Keep both eyes open, the same gentle closed-mouth smile, neutral brows, eyelid shape and head position. Change ONLY iris and pupil direction; no head tilt.

### look-ene.png

Eye-gaze frame: BOTH irises and pupils point in the same direction, toward the viewer’s RIGHT and UP. The exact normalized gaze vector in image coordinates (x right, y down) is (0.9239, -0.3827). The gaze is primarily horizontal. Keep both eyes open, the same gentle closed-mouth smile, neutral brows, eyelid shape and head position. Change ONLY iris and pupil direction; no head tilt.

### eyes-half.png

Both eyelids half closed, upper lids relaxed and sleepy but irises still partly visible. Keep identical gentle closed-mouth smile and all other features unchanged. This is the halfway frame of a natural blink.

### yawn-opening.png

Second stage of a sleepy yawn: mouth opening halfway into a tall oval, jaw dropping modestly, eyes half closed, brows relaxed. Less wide than a peak yawn. Clearly sleepy, not surprised or in pain.

### yawn-recovery.png

Final recovery stage of a sleepy yawn: eyes gently squeezed shut, lips closing into a relaxed small opening after exhaling, jaw rising, cheeks relaxed. A sleepy finishing yawn, not pain or annoyance.
