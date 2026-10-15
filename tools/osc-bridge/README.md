# OSC bridge

Browsers cannot send or receive OSC (UDP), so this small Node script sits between
the app and the network over a local WebSocket. No dependencies (Node 18+).

- **Receive:** OSC arriving on UDP 9000 is forwarded to the app (commands below).
- **Send (v10):** with **Send OSC** ticked in the app, transport feedback goes out as
  OSC to the targets listed in the app, plus any `--send` targets of the bridge.

**With the dev server you do not need to do anything**: `npm run dev` starts the
bridge (UDP 9000 → ws 9100) and the app connects automatically. Turn it off with
`OSC_BRIDGE=0 npm run dev`; change ports with `OSC_UDP_PORT` / `OSC_WS_PORT`.

Without the dev server (production build, hosted copy) run it yourself:

```sh
cd ProjectionSim_v4
npm run osc-bridge                          # = node tools/osc-bridge/index.mjs (UDP 9000, ws 9100)
node tools/osc-bridge/index.mjs --udp 8000 --ws 9200
node tools/osc-bridge/index.mjs --send 192.168.1.20:53000 --send 127.0.0.1:7000
```

| Flag | Environment variable | Default | Meaning |
|---|---|---|---|
| `--udp N` | `OSC_UDP_PORT` | 9000 | UDP port OSC is received on |
| `--ws N` | `OSC_WS_PORT` | 9100 | WebSocket port the app connects to |
| `--send host:port` (repeatable) | `OSC_SEND_TARGETS=host:port,host:port` | none | Always send the app's feedback here too, on top of the targets set in the app |
| `--allow-origin URL` (repeatable, `*` = any) | `OSC_ALLOW_ORIGINS=url,url` | — | Extra web pages allowed to send OSC through the bridge |

The environment variables also apply to the bridge that `npm run dev` starts.

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

## Sending OSC (feedback out)

Tick **Send OSC** in **More → External control → OSC**, add one or more targets
(host + port, e.g. QLab `127.0.0.1:53000`, TouchDesigner `127.0.0.1:7000`) and pick
the time rate. Messages are sent on change only, whatever started the change (buttons,
keyboard, MIDI, MSC, MTC chase, OSC):

| OSC address | Types | Sent when |
|---|---|---|
| `/show/state` | s | `"playing"`, `"paused"` or `"stopped"` (stopped = not playing, playhead at 0) |
| `/show/cue` | i s | the current cue changes (1-based index in time order, name); `0 ""` before the first cue |
| `/show/section` | i s | the section under the playhead changes (1-based index, name); `0 ""` outside sections |
| `/show/track` | i s | the setlist track changes (1-based index, name) |
| `/show/time` | f | seconds, while playing, at the chosen rate (default 10 Hz) |
| `/show/timecode` | s | `HH:MM:SS:FF`, same rate as `/show/time` |
| `/show/go/ack` | i | after every GO (1-based index of the cue it played from, 0 if none) |

When Send is switched on (or the bridge reconnects) the current state, cue, section and
track are sent once so receivers start in step. With Send off the app sends nothing to
the bridge.

The app sends `{ "type": "send", "address": "/show/state", "args": ["playing"], "types": "s",
"targets": ["127.0.0.1:53000"] }` over the WebSocket; the bridge encodes it and sends one
UDP packet per target. Only local pages (`localhost`, `127.0.0.1`), the hosted app
(`https://nottechhoman.github.io`) and `--allow-origin` pages may send; other pages
still receive. Errors (bad target, no targets) come back as `{ "type": "send-error" }`
and show in the app's log.
