---
permalink: /colophon
title: Colophon
layout: default
type: static
---

This is a subdomain of [badhrinadh.com](https://badhrinadh.com), built the same way: [Jekyll](https://jekyllrb.com/) on [GitHub Pages](https://pages.github.com/), no framework, no bundler, no client-side router.

## Where the tools came from

The tools are ports of [True Devtools](https://github.com/dathoangnd/truedevtools.com) by Dat Hoang, which is MIT licensed. That project is a React application built on Ant Design, Redux and the Monaco editor. None of that survived the port — the interface here is hand-written HTML and a few dozen lines of JavaScript per tool, so the pages match the rest of this site and load in a few kilobytes rather than a few hundred.

What did carry over is the behaviour: which tools exist, what options they take, and how they treat edge cases. Some things were deliberately changed:

- **Base64** decodes through `TextDecoder` rather than guessing between UTF-8 and UTF-16, understands the URL-safe alphabet, and takes a whole file as readily as a line of text — what it decodes does not have to be text at all.
- **UUIDs** are v4, v7 and v5, plus ULIDs. The original offered v1, v3, v4 and v5; v7 is time-ordered like v1 but leaks no MAC address, and v3 is v5 with a worse hash. The tool reads an identifier as well as writing one — version, variant and, where there is one, the time inside it.
- **Hashes** come from Web Crypto instead of a bundled crypto library. MD5 and CRC32 are the exceptions — Web Crypto deliberately omits both, so they are implemented in the repo ([md5.js](https://github.com/BadhriNadhBade/devtools/blob/main/assets/js/lib/md5.js), [crc32.js](https://github.com/BadhriNadhBade/devtools/blob/main/assets/js/lib/crc32.js)). HMAC is offered only for the algorithms Web Crypto will key, rather than hand-rolling the rest for the sake of a tidy list.
- **Random values** use `crypto.getRandomValues` with rejection sampling rather than `Math.random`, which is neither uniform nor unpredictable.
- **The JWT decoder** verifies, which the original did not. Give it the secret or the public key and it checks the signature here in the tab; give it nothing and it says plainly that it has checked nothing.

One tool came from somewhere else entirely. The **structured data converter** follows the [Backstage toolbox plugin](https://github.com/drodil/backstage-plugin-toolbox), also MIT, down to the sample data — though it has since grown TOML, XML, CSV, `.env` and query strings alongside the original pair. That plugin converts through the [`yaml`](https://github.com/eemeli/yaml) package, which is far larger than everything else on this site put together, so the reader and writer here are [written out by hand](https://github.com/BadhriNadhBade/devtools/blob/main/assets/js/lib/yaml.js) instead. They cover the YAML that configuration files are actually made of — block and flow collections, every scalar style, anchors, aliases and merge keys — they were built by checking both directions against `yaml` itself over a pile of real configuration files, and where they cannot read something they say so rather than guessing.

The **JSON / YAML formatter** is not a port of anything. The obvious way to reformat JSON is to parse it and print it again, and doing that silently damages documents: keys that look like integers come back reordered, whole numbers past 2<sup>53</sup> come back rounded, and a duplicate key disappears without a word. So the [reader here](https://github.com/BadhriNadhBade/devtools/blob/main/assets/js/lib/json.js) keeps every scalar as the characters you wrote and only ever changes the whitespace between them. It is strict about what it accepts — a trailing comma or a comment is a mistake worth naming rather than quietly tolerating — and it points at the line and column where it gave up.

## Moving between tools

Several of the tools answer a question that another one asks. A Base64 payload turns out to be JSON; a substitution produces a list that wants sorting; placeholder text exists to be measured against a limit. Where that chain is a real one, the output pane carries a **Send to** menu, and the tool you pick opens with the text already in it.

What is being carried never goes into the address bar. It is held in `sessionStorage`, which belongs to this one tab, and it is read exactly once and deleted on arrival — so a reload shows the document you have been editing since, not the one you came in with. A query string would instead put whatever you were working on into your history, and into the logs of anything that sees a URL.

For the same reason, links work in one direction only. A tool reads its state out of the query string if there is one, so `/regex-tester?pattern=\d%2B` opens with that pattern loaded and a link can carry a worked example to somebody else. No page here ever *writes* the address bar while you type.

Two pages opt out of all of it. The **JWT decoder** holds a credential and the key to check it; the **random string generator** produces secrets. Neither remembers a field between visits, neither accepts one from a link, and neither offers to pass anything on.

## Keyboard

Every tool binds the same two keys: <kbd>Ctrl</kbd> or <kbd>Cmd</kbd> + <kbd>Enter</kbd> runs it, <kbd>Esc</kbd> clears it, and both work from inside whichever box you are typing in. On the index, <kbd>/</kbd> jumps to the filter.

Replacing the contents of a box — loading a sample, dropping a file, swapping two sides — is an undoable edit, so <kbd>Ctrl</kbd>+<kbd>Z</kbd> brings back what was there before. Clicking *Sample* over something you had pasted is not meant to be the end of it.

## Type

Body text is [IBM Plex Sans](https://fonts.google.com/specimen/IBM+Plex+Sans). Everything a tool reads or writes is set in whatever monospace your system provides.

## Colour

The palette is copied from badhrinadh.com and adapts to your system light/dark preference via `prefers-color-scheme`. There is no theme toggle, on purpose — your OS already knows.

## JavaScript

Unavoidable here, unlike on the main site: a tool that formats text has to run something. It all runs in your tab. Nothing you type is uploaded, stored, or logged, and there is no analytics script on any page.
