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

- **Base64** decodes through `TextDecoder` rather than guessing between UTF-8 and UTF-16, and understands the URL-safe alphabet.
- **UUIDs** are v4 and v7. The original offered v1, v3, v4 and v5; v7 is time-ordered like v1 but leaks no MAC address, and the name-based versions are rarely reached for.
- **Hashes** come from Web Crypto instead of a bundled crypto library. MD5 is the exception — Web Crypto deliberately omits it, so it is implemented [in the repo](https://github.com/BadhriNadhBade/devtools/blob/main/assets/js/lib/md5.js).
- **Random values** use `crypto.getRandomValues` with rejection sampling rather than `Math.random`, which is neither uniform nor unpredictable.

One tool came from somewhere else entirely. The **JSON / YAML converter** follows the [Backstage toolbox plugin](https://github.com/drodil/backstage-plugin-toolbox), also MIT, down to the sample data. That plugin converts through the [`yaml`](https://github.com/eemeli/yaml) package, which is far larger than everything else on this site put together, so the reader and writer here are [written out by hand](https://github.com/BadhriNadhBade/devtools/blob/main/assets/js/lib/yaml.js) instead. They cover the YAML that configuration files are actually made of — block and flow collections, every scalar style, anchors, aliases and merge keys — they were built by checking both directions against `yaml` itself over a pile of real configuration files, and where they cannot read something they say so rather than guessing.

The **JSON / YAML formatter** is not a port of anything. The obvious way to reformat JSON is to parse it and print it again, and doing that silently damages documents: keys that look like integers come back reordered, whole numbers past 2<sup>53</sup> come back rounded, and a duplicate key disappears without a word. So the [reader here](https://github.com/BadhriNadhBade/devtools/blob/main/assets/js/lib/json.js) keeps every scalar as the characters you wrote and only ever changes the whitespace between them. It is strict about what it accepts — a trailing comma or a comment is a mistake worth naming rather than quietly tolerating — and it points at the line and column where it gave up.

## Type

Body text is [IBM Plex Sans](https://fonts.google.com/specimen/IBM+Plex+Sans). Everything a tool reads or writes is set in whatever monospace your system provides.

## Colour

The palette is copied from badhrinadh.com and adapts to your system light/dark preference via `prefers-color-scheme`. There is no theme toggle, on purpose — your OS already knows.

## JavaScript

Unavoidable here, unlike on the main site: a tool that formats text has to run something. It all runs in your tab. Nothing you type is uploaded, stored, or logged, and there is no analytics script on any page.
