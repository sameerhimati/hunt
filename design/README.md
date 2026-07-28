# design/

Committed mockups exported from the design tool. These are ground truth for
layout — `docs/SCREENS.md` names which file drives which screen, and ~20 source
docblocks cite them by name.

**`support.js` is required, not vendored cruft.** Every `.dc.html` loads it with
`<script src="./support.js">`; without it the mockups do not render. It is 66 KB
of the design tool's own runtime, which is why it is excluded from eslint
(`eslint.config.mjs`) and from the Docker image (`.dockerignore`). It looked like
1,800 lines of dead weight during a debloat pass — it is not. Leave it.

Open any `.dc.html` directly in a browser. Nothing builds or imports these.
