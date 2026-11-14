<p align="center">
  <img src="assets/banner-impetus.png" alt="Impetus Kinetrix — Mapping Motion through time" width="100%">
</p>

<h1 align="center">🏎️ Impetus Kinetrix</h1>

<p align="center"><em>Mapping Motion through time</em></p>

<p align="center"><a href="https://qronox-kinetrix.stark-kodex.workers.dev"><strong>Drive the Simulation</strong></a></p>

<p align="center">
  <a href="#-about">About</a> ·
  <a href="#-the-car">Car</a> ·
  <a href="#%EF%B8%8F-road-modes">Road modes</a> ·
  <a href="#-reading-the-data">Data</a> ·
  <a href="#-concepts-covered">Concepts</a> ·
  <a href="#-controls">Controls</a> ·
  <a href="#-teaching-model">Teaching model</a> ·
  <a href="#-technology">Technology</a> ·
  <a href="#-3d-models">3D Models</a> ·
  <a href="#-credits">Credits</a>
</p>

---

## 📖 About

An interactive driving simulator for teaching **distance**, **time** and **speed** through the **distance–time graph**. You drive a car across a suspension bridge with the accelerator and brake, and a live graph traces every metre against every second:

- **a steeper line** when the car goes faster
- **a flat line** when the car stops
- **a curve** when the car speeds up or slows down

Built for classroom smart panels; it works on laptops and phones too.

---

## 📸 Screenshots

<table width="100%">
  <tr>
    <td width="50%" align="center">
      <img src="assets/screenshots/chase.png" alt="Chase camera behind the car on the bridge" width="100%">
      <br><sub><b>Chase view · Infinity road</b></sub>
    </td>
    <td width="50%" align="center">
      <img src="assets/screenshots/driver.png" alt="Driver view with hands on the wheel and the LED dash" width="100%">
      <br><sub><b>Driver view · LED speed and odometer</b></sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="assets/screenshots/traffic.png" alt="Car stopped at a red traffic light in Traffic mode" width="100%">
      <br><sub><b>Traffic mode · Red light</b></sub>
    </td>
    <td width="50%" align="center">
      <img src="assets/screenshots/trip.png" alt="Journey summary card with average speed and segment table" width="100%">
      <br><sub><b>Journey summary · Average speed</b></sub>
    </td>
  </tr>
</table>

---

## 🚗 The Car

A concept car drives in the left lane of a long suspension bridge over open water. The bridge repeats, so the road never ends.

| View | What you see |
|:--|:--|
| **Chase** | The camera follows behind the car. Distance boards every 10 m and reflector posts every 6 m pass by. |
| **Driver** | The view from the centre driving seat. The driver's hands hold a race steering wheel, and the dash shows **speed in green LEDs (km/h)** and the **odometer in blue LEDs (m)**. |
| **Foot cam** | A small low camera, top left. It shows the driver's leg on the pedals: the foot rests on the **accelerator**, pushes it down to speed up, and moves across to push the **brake**. |

---

## 🛣️ Road Modes

Switch with the buttons at the bottom left of the road view.

### ♾️ Infinity

- An open road with nothing in the way.
- Hold a steady speed (or use cruise) to draw **uniform motion**: a straight line on the graph.

### 🚦 Traffic

Three hold-ups appear ahead, one after another, with a **10 s cooldown** between them. Then the cycle repeats.

1. **Checkpoint**: a barrier across the lane. Stop at the white line, wait 3 s, and the barrier lifts.
2. **Traffic light**: red, then amber, then green after a 3 s wait.
3. **Slow traffic**: a slow car pulls into your lane. Follow it for about 12 s until it moves over and speeds away.

An **auto-brake** slows the car just enough to stop at the line or keep a safe gap, so the car never runs a stop. A banner shows what is coming next. Every stop and restart is real motion, so the graph shows **non-uniform motion**: flat parts, curves and changing slopes.

---

## 📊 Reading the Data

| Panel | What it shows |
|:--|:--|
| **Distance–time graph** | Distance (m) against time (s), drawn live. The axes rescale as the trip grows. |
| **Marked points** | Press **Mark** to drop a point. Tap the dashed line between two points to see the speed between them. |
| **Table** | Every marked point (and *Now*) with its time, distance and the speed since the previous point. |
| **Stats** | Elapsed time, what the car is doing (at rest, speeding up, slowing down, steady speed) and current speed in m/s, with the km/h conversion (× 18/5). |
| **Journey summary** | Press **End** for total distance, total time and **average speed = total distance ÷ total time**, plus the speed in each marked part of the trip, tagged uniform or non-uniform. A green dashed line joins the start to the end; its slope is the average speed. |
| **Averaging check** | The summary also shows why simply averaging the part speeds gives the wrong answer: each part lasted a different time. A bar shows the share of time spent in each part. |
| **Previous trip** | After **Reset**, the last trip stays on the graph as a grey dashed line to compare against. |

---

## 🌱 Concepts Covered

| Area | Concepts |
|:--|:--|
| Distance and time | Distance travelled · Elapsed time · The odometer only counts up |
| Speed | Speed = distance ÷ time · m/s and km/h (× 18/5, × 5/18) · Average speed |
| Motion | Rest · Uniform motion · Non-uniform motion · Speeding up · Slowing down |
| Graphs | Slope of a distance–time graph = speed · Steeper = faster · Flat = stopped · Curves = changing speed |

---

## 🧭 Controls

| Control | What it does |
|:--|:--|
| ⬆ Accelerate (hold) | Speeds the car up · also starts the simulation |
| ⏹ Brake (hold) | Slows the car to a stop |
| ◔ Cruise | Holds the current speed |
| ▶ Start / ⏸ Pause | Runs or freezes the simulation and the clock |
| ↺ Reset | Starts a new trip; the last one stays as a ghost line |
| ＋ Mark · ↶ Undo | Adds or removes a marked point on the graph |
| ⚑ End | Ends the trip and opens the journey summary |
| Chase · Driver | Switches the camera |
| ♾️ Infinity · 🚦 Traffic | Switches the road mode |
| ‹ on Foot cam | Hides or shows the foot camera |
| ▦ Table | Shows the marked points as a table |
| ⛶ Full screen | Fills the screen for classroom use |

**Keyboard:** `↑` accelerate · `↓` brake · `Space` start / pause · `K` cruise · `M` mark · `U` undo · `C` camera · `F` full screen · `Esc` close the summary

---

## 🔬 Teaching Model

This is a deliberately **simplified** model of a car's motion. Real cars have gears, engine power curves, tyre grip and air resistance that grows with the square of speed. Here:

| Quantity | Value |
|:--|:--|
| Acceleration (accelerator held) | 4.6 m/s² (0–100 km/h in about 6 s) |
| Braking (brake held) | 7.0 m/s² |
| Top speed | 38 m/s (about 137 km/h) |
| Coasting (no pedal) | A gentle slow-down: 0.15 m/s² plus 0.03 m/s² for every m/s of speed |
| Auto-brake in Traffic mode | Up to 3.0 m/s², just enough to stop in time |

The graph records distance travelled, which can only increase. That is why it never slopes downwards.

---

## 💻 Technology

HTML · CSS · JavaScript · Three.js · glTF · Cloudflare Workers

The 3D scene runs in Three.js, with the car, bridge, hands, leg and traffic loaded as glTF models. A **single-file build** (one `.html` with every model inside) runs offline with no server. If the device has no 3D support, a simple drawn road is shown instead and the simulator still works.

---

## 🧩 3D Models

| | Asset | Model | Creator | Licence |
|:-:|:--|:--|:--|:--|
| 🏎️ | Car | [FREE Concept Car 004](https://sketchfab.com/3d-models/free-concept-car-004-public-domain-cc0-4cba124633eb494eadc3bb0c4660ad7e) | Unity Fan | Sketchfab Standard ¹ |
| 🌉 | Bridge environment | [Car_ Animation](https://sketchfab.com/3d-models/car--animation-cb83f35f5a5942b7a5e7756366797b6a) | lawanya B | CC BY 4.0 |
| 🎮 | Steering wheel | [Race Steering Wheel – Lamborghini Essenza SCV12](https://sketchfab.com/3d-models/race-steering-wheel-lamborghini-essenza-scv12-7fd7543c58994fd09344d761978eecfa) | SDC PERFORMANCE | CC BY 4.0 |
| ✋ | Driver's hands | [Connor RK900 – Detroit Become Human](https://sketchfab.com/3d-models/connor-rk900-detroit-become-human-623e3f52b7da4116a4576f38479eaaaf) | Q.SARDOR | CC BY 4.0 |
| 🦿 | Driver's leg | Robotic prosthetic leg | Not recorded ² | Not recorded ² |
| 🚦 | Traffic light | [Traffic Light](https://sketchfab.com/3d-models/traffic-light-240630f6755d43d6bb0af54f7f2d135b) | miwaVV | CC BY 4.0 |
| 🚧 | Checkpoint barrier | [Checkpoint Stop Road Barrier](https://sketchfab.com/3d-models/checkpoint-stop-road-barrier-lowpoly-security-cd64979fc9774d729ac31e443a9f3935) | 00amza | CC BY 4.0 |
| 🚙 | Traffic cars | [Traffic Car Pack](https://sketchfab.com/3d-models/traffic-car-pack-916a8b149ae24d8b8c9cf12d4a1c64d4) | JUSTGAME | CC BY 4.0 |
| ⏲️ | Dash cluster | [Digital Speedometer](https://sketchfab.com/3d-models/digital-speedometer-48ebbd6321b44617b32e7bfa91c81e2d) | ROY | CC BY 4.0 |

<sub>Original creators retain ownership of their models. Models were simplified and resized for this simulator: the car's own steering wheel and display were removed, the cars were removed from the bridge scene, Connor was trimmed to forearms and hands, and the leg is split at the knee in code so it can bend.<br>
¹ The model's title says "public domain (CC0)", but its file lists the Sketchfab Standard licence. Check the model page before reusing it.<br>
² The leg's original source and licence were not recorded. Add them here once known.</sub>

---

## 🤖 Credits

- OpenAI: Initial code implementation
- Claude: Subsequent code architecture
- Perplexity: Scientific validation and debugging
- GitHub: Repository
- Cloudflare Workers: Hosting

---

## 📜 License

Source code: **MIT** (see [LICENSE](LICENSE)). 3D models keep their own licences (see [3D Models](#-3d-models)).

---

<p align="center">
  <b>Repository</b>: GitHub &nbsp;&nbsp;|&nbsp;&nbsp; <b>Hosting</b>: Cloudflare Workers
</p>
