# syntax=docker/dockerfile:1

# Local development and build verification. Production does not use this file:
# Cloudflare Workers Builds runs `bundle exec jekyll build` and `wrangler
# deploy` on its own image, as the README describes. The point of this one is
# that the toolchain is Ruby and not everybody who works on the site has Ruby.
#
#   docker compose up                    serve at http://localhost:4000
#   docker build --target build .        just check that it builds
#   docker build --target site \
#     --output type=local,dest=_site .   write the built site to ./_site

ARG RUBY_VERSION=3.3

# ---------------------------------------------------------------------------
# The gems. On their own in the first stage, with only the two files that
# decide them, so that editing a page does not reinstall anything — this layer
# is rebuilt when Gemfile or Gemfile.lock changes and at no other time.
# ---------------------------------------------------------------------------
FROM ruby:${RUBY_VERSION}-alpine AS gems

# `commonmarker` is the one gem in the lockfile with no precompiled build, so a
# compiler has to exist while the bundle is installed — and only then, which is
# why it is confined to this stage. `nokogiri` and `ffi` both ship musl
# binaries; that is what the `*-linux-musl` platforms in Gemfile.lock are for,
# and without them bundler would try to build libxml2 here as well.
RUN apk add --no-cache build-base

ENV BUNDLE_PATH=/usr/local/bundle \
    BUNDLE_JOBS=4 \
    BUNDLE_RETRY=2 \
    # Refuse to quietly re-resolve. Gemfile.lock is committed on purpose —
    # `github-pages` is unpinned and its nokogiri requirement floats — so a
    # lockfile that does not match the Gemfile should stop the build rather
    # than produce an image built against something nobody chose.
    BUNDLE_FROZEN=1

WORKDIR /site
COPY Gemfile Gemfile.lock ./

RUN bundle install && rm -rf "${BUNDLE_PATH}/cache"

# ---------------------------------------------------------------------------
# The build. Separate from `serve` so `docker build --target build .` is a
# complete check that the site compiles, with nothing else running.
# ---------------------------------------------------------------------------
FROM gems AS build

COPY . .
RUN bundle exec jekyll build --trace

# ---------------------------------------------------------------------------
# Just the output, so it can be copied back out to the host:
#   docker build --target site --output type=local,dest=_site .
# ---------------------------------------------------------------------------
FROM scratch AS site
COPY --from=build /site/_site /

# ---------------------------------------------------------------------------
# The dev server. Last, so a bare `docker build .` produces it.
# ---------------------------------------------------------------------------
FROM ruby:${RUBY_VERSION}-alpine AS serve

# What the compiled extensions link against once the compiler is gone, plus the
# zone database: _config.yml names a timezone, and Ruby cannot resolve one on
# an image that carries no tzdata.
RUN apk add --no-cache libstdc++ tzdata

ENV BUNDLE_PATH=/usr/local/bundle \
    BUNDLE_FROZEN=1
COPY --from=gems /usr/local/bundle /usr/local/bundle

WORKDIR /site

# Copied so the image serves the site on its own; compose mounts the working
# tree over the top of this for editing, and then it is the host's files that
# are being served.
COPY . .

EXPOSE 4000 35729

# `--destination` keeps the build output inside the container. With the source
# bind-mounted that matters twice over: nothing writes into the working tree,
# and on Linux nothing lands there owned by root.
#
# `--force_polling` is not optional on a bind mount. Filesystem events do not
# cross the boundary from a Windows or macOS host, so without it the watcher
# sits there seeing nothing change.
#
# Note that the dev server does not apply `_headers`, so the production
# Content-Security-Policy is not in force here. A page that works locally and
# breaks in production is most likely to be an inline script or style.
CMD ["bundle", "exec", "jekyll", "serve", \
     "--host", "0.0.0.0", \
     "--destination", "/srv/_site", \
     "--watch", "--force_polling", "--livereload"]
