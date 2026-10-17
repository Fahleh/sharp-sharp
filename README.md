# Sharp Sharp

A 3D Lagos delivery-rider game for [start.ng](https://start.ng). Ride a bike through a stylised district, collect orders from vendors, deliver them to customers before the tip runs out, and keep the bike in one piece for a five-minute shift. "Sharp sharp" is Nigerian slang for "quickly".

Your start.ng character rides the bike. Signed-in players save `earnings` and `deliveries` to the start.ng leaderboard.

**Status: Pass C (audit and fix), on top of Pass B (city life).** On top of the Pass A foundation (city, bike, orders, guidance, start.ng sign-in and scores) the streets now have cars, danfos and keke, pedestrians, road banter, sound, one rain event per shift, a dusk-to-night sky, potholes and speed bumps, fragile orders, order choice and a streak bonus.

## Play

- Keyboard: arrows or WASD to ride, Space to brake, H to honk, R to get back on the road if you are stuck, P or Escape to pause, 1 or 2 to choose an order.
- Touch: the bike rides itself. Use the arrow buttons to steer, hold Brake to slow down, tap Horn to honk, tap an order card to choose it.
- Pick up at the amber marker, deliver at the green marker. The tip starts at 60% of the fare and drains to zero over the delivery time budget. Late deliveries pay 60% with no tip.
- After each delivery two orders are offered; the first is taken for you after 8 seconds.
- Close passes at speed pay a small bonus. Hitting a person costs money and rating; crashes cost bike health, and the shift ends at zero.
- Fragile orders carry a condition: crashes, potholes and bumps lower it, and the pay is multiplied by it. Below 20% the parcel is spoiled: no tip and no streak bonus.
- Each on-time delivery in a row adds 10% to the next one, up to 1.5x. A late delivery or a wreck (a crash costing 20 or more health) ends the streak.
- If the bike gets nowhere for 3 seconds while you are trying to go, a "Back to the road" button appears (touch) or press R. A vehicle you keep pressing against for about 3 seconds gives way, so a jam never holds you for good.
- If frames stay slow the game gives up detail by itself: first the pixel ratio, then the rain, then tree detail. It never gets it back until the page is reloaded.
- Rain starts once per shift and makes the road slippery. Sound and banter each have a switch on the title and pause cards.

## Run

ES modules and the import map need HTTP, not `file://`:

```sh
python3 -m http.server 8080
```

To open it on a phone on the same network, bind to all interfaces (`--bind 0.0.0.0`) and use the computer's LAN address, for example `http://192.168.1.20:8080/`. That serves the whole repo folder to your network while it runs. On macOS with the firewall on, a Homebrew `python3` was observed to drop LAN connections while `/usr/bin/python3` worked.

Open http://localhost:8080. No build step and no `node_modules`: the game is plain static files, with three.js r186.1 vendored in `vendor/` (from the npm tarball, integrity-checked against the registry).

## Test

```sh
npm test
```

That runs `node --test` over `tests/`: seeded RNG, routing and A*, bike kinematics, collisions and near-miss, orders, payout, fragile condition, streak and order choice, lane network and traffic, pedestrians, the banter picker, weather, daylight, hazards, start.ng reply validation, the map and generated city (every road rideable end to end), and the shift state machine. Browser checks were run with Playwright installed outside this repo and are not committed.

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
| `js/stuck.js`, `js/blocking.js`, `js/jamguard.js`, `js/quality.js` | Stuck detection, vehicles that give way, and the adaptive-quality rule. Pure. |
| `js/rng.js`, `js/route.js`, `js/bike.js`, `js/collide.js`, `js/orders.js`, `js/validate.js`, `js/lanes.js`, `js/traffic.js`, `js/pedestrians.js`, `js/banter.js`, `js/weather.js`, `js/daylight.js`, `js/hazards.js` | Pure rules, no three.js or DOM, so they run under `node --test`. |
| `js/map.js`, `js/terrain.js`, `js/city.js`, `js/streetscape.js`, `js/placer.js`, `js/decor.js` | The road graph and district as data, the ground raster, and deterministic generation of buildings and props. Pure. |
| `js/game.js` | The shift state machine: bike, health, clock, orders, payout, traffic, people, weather, hazards. Pure. |
| `js/lines.js` | Every word anyone says in the game. Banter text lives only here. |
| `js/world.js`, `js/groundmesh.js`, `js/buildingmesh.js`, `js/propmesh.js`, `js/batch.js`, `js/textures.js`, `js/sky.js` | Meshes for the district, merged into chunks. |
| `js/vehiclemesh.js`, `js/pedmesh.js`, `js/hazardmesh.js`, `js/streetlights.js`, `js/rainmesh.js`, `js/wetlook.js`, `js/atmosphere.js` | Instanced traffic and people, painted hazards, lamp glow, rain drops, the wet-road shader tweak, and the sky, fog and lights for the time of day. |
| `js/rider.js`, `js/character.js`, `js/camera.js`, `js/markers.js` | The bike and the start.ng character, the chase camera, the target beacon. |
| `js/input.js`, `js/ui.js`, `js/minimap.js`, `js/presenter.js`, `js/bubbles.js`, `js/chatter.js` | Keyboard and touch, the DOM, the minimap, what the HUD shows, and the speech bubbles. |
| `js/audio.js`, `js/feedback.js` | WebAudio sounds (no audio files) and the events that trigger them, plus the rider's reactions. |
| `js/startng.js`, `js/profile.js`, `js/results.js`, `js/storage.js` | start.ng messages, who is playing, score saving and the leaderboard, the local best. |
| `js/main.js` | Bootstrap and the loop. |

## Known limits

- Sign-in, score saving and the live leaderboard only work when the game is live at `sharp-sharp.start.ng`. Anywhere else there is no player: the game plays with the guest look and the leaderboard shows as unavailable.
- Only three things are kept in `localStorage`: the personal best (`sharp-sharp:best`), the banter switch (`sharp-sharp:banter`) and mute (`sharp-sharp:muted`).
- Needs WebGL. Without it the page shows a short message instead of a blank screen.
- Sound starts on the first tap or key press, because browsers do not allow audio before one.
- Not built: the Could features (multi-drop, traffic warden, ambient city sounds, lightning, upgrade shop, title riding loop).
