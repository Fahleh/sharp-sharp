# Sharp Sharp

A 3D Lagos delivery-rider game for [start.ng](https://start.ng). Ride a bike through a stylised district, collect orders from vendors, deliver them to customers before the tip runs out, and keep the bike in one piece for a five-minute shift. "Sharp sharp" is Nigerian slang for "quickly".

Your start.ng character rides the bike. Signed-in players save `earnings` and `deliveries` to the start.ng leaderboard.

**Status: Pass A (foundation).** The city, the bike, orders, guidance, start.ng sign-in and scores are in. Traffic, pedestrians, banter, sound, rain and the other extras come in later passes.

## Play

- Keyboard: arrows or WASD to ride, Space to brake, R to get back on the road if you are stuck, P or Escape to pause.
- Touch: the bike rides itself. Use the arrow buttons to steer and hold Brake to slow down.
- Pick up at the amber marker, deliver at the green marker. The tip starts at 60% of the fare and drains to zero over the delivery time budget. Late deliveries pay 60% with no tip.

## Run

ES modules and the import map need HTTP, not `file://`:

```sh
python3 -m http.server 8080
```

Open http://localhost:8080. No build step and no `node_modules`: the game is plain static files, with three.js r186.1 vendored in `vendor/` (from the npm tarball, integrity-checked against the registry).

## Test

```sh
npm test
```

That runs `node --test` over `tests/`: seeded RNG, routing and A*, bike kinematics, collisions and near-miss, orders and payout, start.ng reply validation, the map and generated city (every road rideable end to end), and the shift state machine. Browser checks were run with Playwright installed outside this repo and are not committed.

## How it is published

- Name and address: `sharp-sharp`, which plays at `sharp-sharp.start.ng`.
- start.ng serves the repo root as is: `index.html`, `style.css`, `js/`, `vendor/`, `startng.json` and `cover.png`.
- `startng.json` defines the leaderboard columns `earnings` and `deliveries`, ranked by earnings with ties broken by deliveries. Changing these keys after the first publish changes the leaderboard columns.
- To check before publishing: `POST https://api.start.ng/games/check` with `{ "repo_url": "<your public repo>" }`.
- `?guest` (added by start.ng when a player chooses guest) hides the sign-in invitation.

## Layout

| Path | Job |
| --- | --- |
| `js/config.js` | Every tunable: bike, camera, economy, city generation, look. The game name is `GAME_NAME`. |
| `js/rng.js`, `js/route.js`, `js/bike.js`, `js/collide.js`, `js/orders.js`, `js/validate.js` | Pure rules, no three.js or DOM, so they run under `node --test`. |
| `js/map.js`, `js/terrain.js`, `js/city.js`, `js/streetscape.js`, `js/placer.js`, `js/decor.js` | The road graph and district as data, the ground raster, and deterministic generation of buildings and props. Pure. |
| `js/game.js` | The shift state machine: bike, health, clock, orders, payout. Pure. |
| `js/world.js`, `js/groundmesh.js`, `js/buildingmesh.js`, `js/propmesh.js`, `js/batch.js`, `js/textures.js`, `js/sky.js` | Meshes for the district, merged into chunks. |
| `js/rider.js`, `js/character.js`, `js/camera.js`, `js/markers.js` | The bike and the start.ng character, the chase camera, the target beacon. |
| `js/input.js`, `js/ui.js`, `js/minimap.js`, `js/presenter.js` | Keyboard and touch, the DOM, the minimap, and what the HUD shows. |
| `js/startng.js`, `js/profile.js`, `js/results.js`, `js/storage.js` | start.ng messages, who is playing, score saving and the leaderboard, the local best. |
| `js/main.js` | Bootstrap and the loop. |

## Known limits

- Sign-in, score saving and the live leaderboard only work when the game is live at `sharp-sharp.start.ng`. Anywhere else there is no player: the game plays with the guest look and the leaderboard shows as unavailable.
- Only the personal best (`sharp-sharp:best`) is kept in `localStorage`.
- Needs WebGL. Without it the page shows a short message instead of a blank screen.
- No sound, traffic, pedestrians, banter or weather yet (later passes).
