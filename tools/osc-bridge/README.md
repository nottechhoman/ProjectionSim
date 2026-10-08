# OSC bridge

Browsers cannot receive OSC (UDP), so this small Node script listens for OSC and
forwards commands to the app over a local WebSocket. No dependencies (Node 18+).

```sh
cd ProjectionSim_v4
node tools/osc-bridge/index.mjs            # OSC on UDP 9000, app on ws://127.0.0.1:9100
node tools/osc-bridge/index.mjs --udp 8000 --ws 9200
```

Then in the app: **More → External control (MIDI / OSC)… → Connect to the OSC bridge**
(URL `ws://127.0.0.1:9100`). The status shows *connected*; it reconnects on its own if
the bridge restarts.

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
