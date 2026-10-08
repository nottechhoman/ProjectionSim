# OSC bridge

Browsers cannot receive OSC (UDP), so this small Node script listens for OSC and
forwards commands to the app over a local WebSocket. No dependencies (Node 18+).

**With the dev server you do not need to do anything**: `npm run dev` starts the
bridge (UDP 9000 → ws 9100) and the app connects automatically. Turn it off with
`OSC_BRIDGE=0 npm run dev`; change ports with `OSC_UDP_PORT` / `OSC_WS_PORT`.

Without the dev server (production build, hosted copy) run it yourself:

```sh
cd ProjectionSim_v4
npm run osc-bridge                          # = node tools/osc-bridge/index.mjs (UDP 9000, ws 9100)
node tools/osc-bridge/index.mjs --udp 8000 --ws 9200
```

The app connects to `ws://127.0.0.1:9100` by default and retries every few seconds.
**More → External control → OSC** shows *Bridge connected*, the UDP port, and the last
message received with what it did. Send a test message with
`npm run osc-send -- /show/cue 2` (= `node tools/osc-bridge/send.mjs /show/cue 2`).

| OSC address | Action |
|---|---|
| `/show/go` | GO (play from the cue you are on, else the next cue) |
| `/show/play`, `/show/pause`, `/show/toggle` | transport |
| `/show/stop` | stop and rewind to 0 |
| `/show/next`, `/show/prev` | jump to the next / previous cue |
| `/show/cue N` or `/show/cue/N` | go to cue N (cue named N, "Cue N", else the N-th cue) and play |
| `/show/locate S` | move the playhead to S seconds |

Buttons that send `1` on press and `0` on release only trigger on press. The WebSocket
is bound to 127.0.0.1; OSC is accepted on all interfaces so a console or tablet
on the network can send it. Test from a terminal with e.g.
`oscsend localhost 9000 /show/go` (liblo) or TouchOSC / QLab network cues.
