<p align="center">
  <img src="assets/banner-impetus.png" alt="Impetus Kinetrix — Mapping Motion through time" width="100%">
</p>

<h1 align="center">🏎️ Impetus Kinetrix</h1>

<p align="center"><em>Mapping Motion through time</em></p>

<p align="center"><a href="https://qronox-kinetrix.stark-kodex.workers.dev"><strong>Drive the Simulation</strong></a></p>

---

## 📖 About

A 3D driving simulator for teaching **distance**, **time** and **speed** through the **distance–time graph**. Drive across a suspension bridge with the accelerator and brake while a live graph traces every metre against every second: **steeper** when faster, **flat** when stopped, **curved** when speeding up or slowing down.

Built for classroom smart panels; works on laptops and phones too.

---

## 📸 Screenshots

<table width="100%">
  <tr>
    <td width="50%" align="center">
      <img src="assets/screenshots/Intro.png" alt="Driver view at 75 km/h with the distance–time graph" width="100%">
      <br><sub><b>Refreshing learning · Physics in motion</b></sub>
    </td>
    <td width="50%" align="center">
      <img src="assets/screenshots/Checkpoint_Simulation.png" alt="Car waiting at a checkpoint barrier with the graph flattening" width="100%">
      <br><sub><b>Observe &amp; discover · Checkpoints</b></sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="assets/screenshots/Traffic_Simulation.png" alt="Car following a slow car in Traffic mode with a stepped graph" width="100%">
      <br><sub><b>Experience the traffic · Non-uniform motion</b></sub>
    </td>
    <td width="50%" align="center">
      <img src="assets/screenshots/Summary_Avg_Speed.png" alt="Journey summary with total distance, time and average speed" width="100%">
      <br><sub><b>Your journey, your calculations · Average speed</b></sub>
    </td>
  </tr>
</table>

---

## ✨ Features

- **Chase and Driver views**: drag inside the car to look around; LED dash shows speed (green, km/h) and odometer (blue, m).
- **Foot cam**: the driver's feet working the accelerator and brake.
- **♾️ Infinity mode**: an open road for **uniform motion**.
- **🚦 Traffic mode**: a checkpoint, a traffic light and a slow car, one after another with 10 s gaps, for **non-uniform motion**. Auto-brake stops the car in time.
- **Marked points, table and journey summary**: speed between any two points, and **average speed = total distance ÷ total time**.
- **Ghost trip**: the last journey stays on the graph to compare.

---

## 🧭 Controls

**Hold** ⬆ Accelerate / ⏹ Brake · **Buttons** Cruise · Start/Pause · Reset · Mark · Undo · End · Table · Full screen

**Keyboard** `↑` accelerate · `↓` brake · `Space` start/pause · `K` cruise · `M` mark · `U` undo · `C` camera · `F` full screen · `Esc` close summary

---

## 💻 Technology

HTML · CSS · JavaScript · Three.js · glTF · Cloudflare Workers

A **single-file build** (`Impetus-Kinetrix.html`, every model inside) runs offline with no server.

---

## 🧩 3D Models

| Asset | Model | Creator | Licence |
|:--|:--|:--|:--|
| Car | [FREE Concept Car 004](https://sketchfab.com/3d-models/free-concept-car-004-public-domain-cc0-4cba124633eb494eadc3bb0c4660ad7e) | Unity Fan | Sketchfab Standard ¹ |
| Bridge | [Car_ Animation](https://sketchfab.com/3d-models/car--animation-cb83f35f5a5942b7a5e7756366797b6a) | lawanya B | CC BY 4.0 |
| Steering wheel | [Race Steering Wheel – Lamborghini Essenza SCV12](https://sketchfab.com/3d-models/race-steering-wheel-lamborghini-essenza-scv12-7fd7543c58994fd09344d761978eecfa) | SDC PERFORMANCE | CC BY 4.0 |
| Driver | [Connor RK900 – Detroit Become Human](https://sketchfab.com/3d-models/connor-rk900-detroit-become-human-623e3f52b7da4116a4576f38479eaaaf) | Q.SARDOR | CC BY 4.0 |
| Traffic light | [Traffic Light](https://sketchfab.com/3d-models/traffic-light-240630f6755d43d6bb0af54f7f2d135b) | miwaVV | CC BY 4.0 |
| Barrier | [Checkpoint Stop Road Barrier](https://sketchfab.com/3d-models/checkpoint-stop-road-barrier-lowpoly-security-cd64979fc9774d729ac31e443a9f3935) | 00amza | CC BY 4.0 |
| Traffic cars | [Traffic Car Pack](https://sketchfab.com/3d-models/traffic-car-pack-916a8b149ae24d8b8c9cf12d4a1c64d4) | JUSTGAME | CC BY 4.0 |
| Dash cluster | [Digital Speedometer](https://sketchfab.com/3d-models/digital-speedometer-48ebbd6321b44617b32e7bfa91c81e2d) | ROY | CC BY 4.0 |

<sub>Models were simplified and resized for this simulator; creators keep ownership.<br>
¹ Title says CC0, but the file lists the Sketchfab Standard licence. Check before reusing.</sub>

---

## 🤖 Credits

OpenAI (initial code) · Claude (code architecture) · Perplexity (scientific validation) · GitHub (repository) · Cloudflare Workers (hosting)

---

## 📜 License

Code: **MIT** ([LICENSE](LICENSE)). 3D models keep their own licences. See [CHANGELOG](CHANGELOG.md) for release history.
