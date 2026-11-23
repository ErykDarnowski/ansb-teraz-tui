# ansb-teraz-tui

A terminal (TUI) version of [**ANSB teraz**](https://erykdarnowski.pl/ansb.html), a small PWA I run on my website. ANSB teraz lets me look up my class's weekend timetable and the current lecture at a simple URL, without logging in to USOS.

The plan it shows is for my group: part-time (zaoczne) Computer Science group, at the [Stefan Batory University of Applied Sciences](https://ansb.pl) (Akademia Nauk Stosowanych Stefana Batorego, ANSB) in Skierniewice.

I made it because I didn't like switching between my Neovim setup and the browser just to check what's on, so now I keep it open in a little pane or tab instead.

ansb-teraz-tui shows the same thing (what's on right now, how long until it ends, what comes next) and runs fine in a small vim/tmux split. Both use the same API, which pulls the plan from USOS and adds the breaks between classes.

- **Now view:** current block, countdown, next block and time left in the day, with progress bars. It uses big digits when there's room and switches to more compact layouts in small panes.
- **Timetable view:** the full Saturday or Sunday plan. Finished blocks are greyed out, the current one is marked `▶`, and long titles scroll.
- The clock is synced to the server's `Date` header (re-synced with `HEAD` every 10 min, so the API stats counter isn't bumped).
- The last fetched plan is cached in `~/.cache/ansb-teraz-tui/`, so it still opens offline.

Zero dependencies, Node ≥ 20.

![ansb-teraz-tui: a lecture's countdown running out and rolling over to the next one, then the timetable view](demo.gif)

## Contents

- [Install](#install)
  - [Working on it](#working-on-it)
- [Use](#use)
- [Debugging](#debugging)
- [Config](#config)
- [License](#license)

## Install

You need [Node.js](https://nodejs.org) 20 or newer (`node -v` to check). There are no other dependencies.

```sh
npm install -g github:ErykDarnowski/ansb-teraz-tui
ansb
```

npm downloads the repo and installs it into its own global folder, so you don't need to keep a clone around. To update, run the same command again. To uninstall:

```sh
npm uninstall -g ansb-teraz-tui
```

If npm complains about permissions, your global npm folder is owned by root. Point it somewhere in your home directory instead (and make sure `~/.local/bin` is on your PATH):

```sh
npm config set prefix ~/.local
```

### Working on it

To hack on the code, clone the repo and run `npm link` inside it. That points `ansb` at your clone, so changes take effect right away. Run `npm test` to check the schedule logic.

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

## Debugging

`--at` starts the clock at the given time and then lets it tick in real time. It's the TUI version of the web app's `debug`/`debugDate`, and the info screen shows the version with a `-D` suffix. Pick a weekend date that has classes in the current plan:

```sh
ansb --at "2026-11-29 08:00"   # before classes
ansb --at "2026-11-29 11:12"   # during a break
ansb --at "2026-11-29 12:30"   # mid-lecture
ansb --at "2026-11-29 17:55"   # last block
ansb --at "2026-11-29 19:00"   # after classes
```

## Config

| Variable / flag       | Default                                 |                                   |
| --------------------- | --------------------------------------- | --------------------------------- |
| `ANSB_API` / `--api`  | `https://erykdarnowski.pl/ansb-api.php` | schedule endpoint                 |
| `ANSB_TZ`             | `Europe/Warsaw`                         | timezone the class times are in   |
| `NO_COLOR`            | unset                                   | set to anything to disable colour |

The default API is my own instance, which serves my group's plan. Please don't point scripts or polling at it.

## License

Proprietary, all rights reserved. See [LICENSE](LICENSE).
