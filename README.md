# ansb-tui

Terminal version of the ANSB weekend timetable. It runs fine in a small vim/tmux split.

- **Now view:** current block, countdown, next block and time left in the day, with progress bars. It uses big digits when there's room and switches to more compact layouts in small panes.
- **Timetable view:** the full Saturday or Sunday plan. Finished blocks are greyed out, the current one is marked `▶`, and long titles scroll.
- The clock is synced to the server's `Date` header (re-synced with `HEAD` every 10 min, so the API stats counter isn't bumped).
- The last fetched plan is cached in `~/.cache/ansb-tui/`, so it still opens offline.

Zero dependencies, Node ≥ 20.

## Install

```sh
npm link        # puts `ansb` on your PATH
```

## Use

```sh
ansb                              # TUI
ansb --line                       # one-line status for tmux/statuslines
ansb --at "2025-11-08 13:00"      # debug: pretend it's that time
```

From vim: `:vert term ansb` (or `:term ++rows=20 ansb`). In Neovim: `:vsplit | term ansb`.

| Key                   | Action                          |
| --------------------- | ------------------------------- |
| `←` `→` `h` `l` `Tab` | switch now / timetable view     |
| `↑` `↓` `j` `k`       | switch day (timetable)          |
| `t`                   | toggle start–end / length       |
| `r`                   | refetch plan                    |
| `i`                   | version / info                  |
| `?`                   | help                            |
| `q`                   | quit                            |

`NO_COLOR=1` disables colours. `ANSB_API` or `--api` overrides the endpoint.
