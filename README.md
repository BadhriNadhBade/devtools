# devtools.badhrinadh.com

Developer tools that run entirely in the browser, at
[devtools.badhrinadh.com](https://devtools.badhrinadh.com).

A subdomain of [badhrinadh.com](https://github.com/BadhriNadhBade/badhrinadh.com),
built the same way — Jekyll on GitHub Pages, no framework, no bundler, no build
step beyond Jekyll's own.

## Running it

```sh
./start
```

That's `bundle` followed by `bundle exec jekyll server -w`. The site is served at
<http://localhost:4000>.

## Adding a tool

Two files, no registration step:

1. `_tools/<slug>.html` — front matter plus the tool's markup.
2. `assets/js/tools/<slug>.js` — the behaviour, an ES module.

The `tool` layout loads `/assets/js/tools/{{ page.slug }}.js` automatically, and
the index page is generated from the `_tools` collection, so a new file appears
in the list and in the search filter on its own.

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
CNAME                   the custom domain; must reach _site/ as-is
index.html              the tool index

_layouts/default.html   page shell, shared with badhrinadh.com
_layouts/tool.html      adds the status line, privacy note and script tag

_tools/                 one document per tool
_pages/                 colophon, accessibility statement, 404
_meta/                  robots.txt, humans.txt, sitemap.xml

assets/css/new.scss     theme; the palette block is copied from the main site
assets/img/             favicon
assets/js/index.js      the index page's filter
assets/js/lib/          shared modules (ui, md5, diff, lorem)
assets/js/tools/        one module per tool
```

`_tools`, `_pages` and `_meta` are Jekyll collections — a leading underscore
means Jekyll skips the directory unless it is declared in `_config.yml`. Every
document in them sets an explicit `permalink`, so moving a file between folders
never changes the URL it is served at.

Only `_config.yml`, `Gemfile` and `CNAME` genuinely have to sit at the root;
`index.html` stays there by convention.

## Where the tools came from

Ported from [True Devtools](https://github.com/dathoangnd/truedevtools.com) by
Dat Hoang, MIT licensed. The original is a React app built on Ant Design, Redux
and Monaco; the behaviour carried over, none of the stack did. Intentional
deviations are listed in [the colophon](https://devtools.badhrinadh.com/colophon).

## Keeping the theme in sync

`assets/css/new.scss` opens with the palette from
[badhrinadh.com's `assets/new.scss`](https://github.com/BadhriNadhBade/badhrinadh.com/blob/main/assets/new.scss),
copied verbatim. If a colour changes there, copy it here. Everything below that
block is built only from those variables, so light and dark both follow without
a second set of rules.

## Licence

MIT, same as the project it came from.
