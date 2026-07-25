---
permalink: /accessibility-statement
title: Accessibility statement
layout: default
type: static
---

Same commitment as [the main site](https://badhrinadh.com/accessibility-statement): I want this to be usable by everyone.

## What I do

- Every control is a real form control with a label, reachable and operable by keyboard.
- Landmarks (`header`, `main`, `footer`, `nav`) are used properly, and every `nav` and radio group has an accessible name.
- Results announce themselves — each tool writes to a live region rather than silently changing the page.
- Colour is never the only signal. The diff view marks additions and removals with `+` and `-` when comparing line by line, and with underline and strikethrough when comparing word by word.
- The site respects `prefers-color-scheme`, and text reflows and stays readable when zoomed.

## Known gaps

This section is honest rather than aspirational.

- The tools need JavaScript. There is no server to fall back to, so with JavaScript off the pages explain that rather than pretending to work.
- Long output sits in a scrollable region. Reaching the far end of a very wide line means scrolling horizontally.

## Contact

If any part of this site is difficult for you to use, [open an issue](https://github.com/BadhriNadhBade/devtools/issues) and I will fix it.
