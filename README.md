# rishiraj38.github.io

My portfolio: https://rishiraj38.github.io

A static site. The hero is a 3D solar system where every planet is an organization I have contributed to and every moon is a merged pull request.

## Layout

- `src/page.html` is the page: markup, styles and the core script.
- `src/fx/` holds the animation modules (3D hero, backdrop, scroll scenes, project planets, cursor and Earth finale). Each is a plain `.js` and `.css` pair.
- `assets/` holds the imagery. Every folder has a `CREDITS.md` with sources and licences.
- `build.py` pulls my pull-request data from GitHub and writes `index.html`.

## Update the data

```sh
python3 build.py   # needs the gh CLI, logged in
```

Commit the new `index.html` and push. GitHub Pages serves the repository root.

## Run locally

```sh
python3 -m http.server 8000
```

Open http://localhost:8000. Opening `index.html` directly from disk will not load the 3D textures.

## Credits

Imagery: NASA, ESA/Hubble, ESO / S. Brunier. Planet textures © Solar System Scope, CC BY 4.0.
