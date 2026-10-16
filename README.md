# Sharp Sharp

A 3D Lagos delivery-rider game for [start.ng](https://start.ng). Work in progress.

## Run

ES modules and the import map need HTTP, not `file://`:

```sh
python3 -m http.server 8080
```

Open http://localhost:8080. No build step and no `node_modules`: the game is plain static files, with three.js r186 vendored in `vendor/`.

## Test

```sh
npm test
```
