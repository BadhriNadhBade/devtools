# devtools.badhrinadh.com

Developer tools that run entirely in the browser, at
[devtools.badhrinadh.com](https://devtools.badhrinadh.com).

A subdomain of [badhrinadh.com](https://github.com/BadhriNadhBade/badhrinadh.com),
built the same way — Jekyll on GitHub Pages, no framework, no bundler, no build
step beyond Jekyll's own.

## Running it

With Ruby on the machine:

```sh
./start
```

That's `bundle` followed by `bundle exec jekyll server -w`. The site is served at
<http://localhost:4000>.

Without it, the same thing in a container:

```sh
docker compose up
```

Also <http://localhost:4000>, also watching — the working tree is mounted, so an
edit on the host is picked up and the page reloads. The build output is written
inside the container rather than into `./_site`, so nothing lands in the working
tree and, on Linux, nothing lands there owned by root.

Two other things the same `Dockerfile` does:

```sh
docker build --target build .                            # does it build?
docker build --target site --output type=local,dest=_site .   # build it, here
```

The first is the whole check and nothing else — useful before a push, since
Cloudflare runs the same `jekyll build` and there is no second chance at it.
The second writes the built site to `./_site`, which is what the deploy
uploads.

It is a multi-stage build because `commonmarker` is the one gem in the lockfile
with no precompiled binary: a compiler has to exist while the bundle is
installed and has no business existing afterwards. Confining it to the first
stage is the difference between a 254 MB image and a 671 MB one.

One difference from production worth knowing: the dev server does not apply
`_headers`, so the Content-Security-Policy is not in force locally. An inline
script or style will work here and silently fail once deployed.

## Adding a tool

Two files, no registration step:

1. `_tools/<slug>.html` — front matter plus the tool's markup.
2. `assets/js/tools/<slug>.js` — the behaviour, an ES module.

The `tool` layout loads `/assets/js/tools/{{ page.slug }}.js` automatically, and
the index page is generated from the `_tools` collection, so a new file appears
in the list and in the search filter on its own.

`assets/js/lib/ui.js` is where most of a tool's plumbing already lives. Reach
for it before writing any of this again:

| | |
|---|---|
| `$` `$$` | element lookup |
| `live` `segment` | re-run on input; read a segmented control |
| `status` `clearStatus` | the one status line the layout renders |
| `copyButton` `pasteButton` `clearButton` `download` | the pane-head buttons |
| `setField` `clearField` | replace a field's contents undoably |
| `dropZone` `filePicker` `readFileText` `readFileBytes` | files in, by drop, picker or paste |
| `remember` `readStore` `writeStore` | throw-safe `localStorage` |
| `prefill` | read the tool's state out of the query string |
| `sendTo` `receive` | hand a result to another tool, and take one |
| `shortcuts` | Ctrl/Cmd+Enter to run, Escape to clear |
| `bytes` `encoder` `decoder` | formatting and text codecs |

Four of those are worth a sentence each, because getting them wrong is quiet
rather than loud:

`setField` exists because assigning to `field.value` throws away the browser's
undo history along with the old text. Every path that overwrites something
somebody typed — a sample, a file load, a swap, "use as input" — goes through
it, so <kbd>Ctrl</kbd>+<kbd>Z</kbd> puts back what was there. `clearField` is
`setField(field, '')`.

`prefill` reads controls out of the query string by `id`, or by `name` for a
radio group, so `/regex-tester?pattern=\w%2B&op=replace` arrives set up. It is
read-only by design: nothing in this site ever writes state into the address
bar, because that would put what you pasted into history and into anything that
logs a URL. Call it *after* `remember`, so an explicit link beats the last
session.

`sendTo` fills a `<select>` in a pane head with destinations and carries the
result there; `receive` takes delivery at the other end. The payload travels in
`sessionStorage` — tab-scoped, read once, deleted on arrival — for the same
reason `prefill` only reads.

The JWT decoder and the random string generator call none of the four state
helpers. A token is a credential and a generated secret is a secret, so neither
page remembers, accepts a link, or leaves anything behind for the next one.

The rest of `lib/` is one module per problem: `md5`, `crc32`, `diff`, `json`,
`yaml`, `formats` (TOML, XML, CSV, `.env`, query strings), `jsonpath`, `lorem`,
`wordlist`, and two pairs that each share one implementation between the page
and a worker — `regex-match` with `regex-worker`, and `digest` with
`hash-worker`. Both workers exist for the same reason: a pattern that backtracks
and a 32 MB file hashed by a JavaScript MD5 would each freeze the tab, status
line included.

Nothing is remembered unless the tool asks. `remember` is opt-in per page, and
the two pages that handle secrets — the JWT decoder and the random string
generator — deliberately do not call it.

Front matter looks like this:

```yaml
---
layout: tool
title: Base64 Encoder / Decoder
slug: base64-encoder-decoder      # must match both filenames
permalink: /base64-encoder-decoder
category: Encoding                # must appear in tool_categories in _config.yml
description: One sentence, shown on the index and as the meta description.
keywords: base64 b64 encode decode btoa atob
---
```

## Layout

```
_config.yml             Jekyll config; must live at the root
wrangler.jsonc          Cloudflare Worker: serves _site, owns the custom domain
Dockerfile              local dev and build checking; no part of the deploy
compose.yaml            the containerised `./start`
index.html              the tool index

_layouts/default.html   page shell, shared with badhrinadh.com
_layouts/tool.html      adds the status line, privacy note and script tag

_tools/                 one document per tool
_pages/                 colophon, accessibility statement, 404
_meta/                  robots.txt, humans.txt, sitemap.xml

assets/css/new.scss     theme; the palette block is copied from the main site
assets/img/             favicon
assets/js/index.js      the index page's filter
assets/js/lib/          shared modules (see below)
assets/js/tools/        one module per tool
```

`_tools`, `_pages` and `_meta` are Jekyll collections — a leading underscore
means Jekyll skips the directory unless it is declared in `_config.yml`. Every
document in them sets an explicit `permalink`, so moving a file between folders
never changes the URL it is served at.

Only `_config.yml`, `Gemfile` and `wrangler.jsonc` genuinely have to sit at the
root; `index.html` stays there by convention.

## Deploying

Cloudflare Workers Builds, on every push to `main`. The dashboard runs
`bundle exec jekyll build` and then `npx wrangler deploy`; `wrangler.jsonc`
points the Worker's asset directory at the resulting `_site` and claims
`devtools.badhrinadh.com` as a custom domain. There is no `CNAME` file and
GitHub Pages is disabled — Cloudflare answers for this hostname, not GitHub.

`Gemfile.lock` is committed on purpose: `github-pages` is unpinned, and its
`nokogiri` requirement floats within `>= 1.16.2, < 2.0`, so without a lockfile
an upstream gem release can change what a deploy builds with no commit here.
Regenerate it with `bundle lock --add-platform x86_64-linux` so the Linux
native gems resolve on the build image.

## Where the tools came from

Ported from [True Devtools](https://github.com/dathoangnd/truedevtools.com) by
Dat Hoang, MIT licensed. The original is a React app built on Ant Design, Redux
and Monaco; the behaviour carried over, none of the stack did. Intentional
deviations are listed in [the colophon](https://devtools.badhrinadh.com/colophon).

The JSON / YAML converter comes instead from the
[Backstage toolbox plugin](https://github.com/drodil/backstage-plugin-toolbox)
(MIT), which is where Backstage keeps its converters.

## Keeping the theme in sync

`assets/css/new.scss` opens with the palette from
[badhrinadh.com's `assets/new.scss`](https://github.com/BadhriNadhBade/badhrinadh.com/blob/main/assets/new.scss),
copied verbatim. If a colour changes there, copy it here. Everything below that
block is built only from those variables, so light and dark both follow without
a second set of rules.

## Licence

MIT, same as the project it came from.
