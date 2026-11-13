# 🧲 Magnet Mayhem

**Chaotisches 2D-Multiplayer-Physikspiel im Browser.**
Du bist ein Magnet. Schalte zwischen **+** und **−** um, zieh Kisten und Bomben an, stoß Gegner ab und schleudere alle aus dem Ring!

- 🎮 **2–8 Spieler**: online per Raumcode, lokal an einem Gerät oder gegen Bots
- 🌐 **Keine Anmeldung, kein Server**: Online-Spiele laufen Peer-to-Peer über WebRTC
- ⌨️🎮📱 **Tastatur, Gamepad und Touch**
- 🔊 Alle Sounds werden live synthetisiert, es gibt keine Asset-Dateien

## So wird gespielt

| Aktion | Tastatur | Maus | Gamepad | Touch |
|---|---|---|---|---|
| Bewegen | WASD / Pfeiltasten | – | Linker Stick / D-Pad | Joystick links |
| Pol wechseln (+/−) | Leertaste / Q | Linksklick | Ⓐ | ±-Knopf |
| Magnet-Puls | Shift / E | Rechtsklick | Ⓑ / RT | PULS-Knopf |

**Regeln**
- **Gleiche Pole stoßen sich ab, ungleiche ziehen sich an.** Das gilt für Spieler, Kisten und Bomben (der Rand zeigt die Ladung).
- **Puls**: 0,3 s lang ein 5× stärkeres Magnetfeld mit größerer Reichweite. Beim Pulsen bist du verankert und bekommst kaum Rückstoß. Abklingzeit 2,2 s.
- **Bomben** zünden bei Berührung, durch einen Puls oder durch harte Treffer. Nach 2 s explodieren sie und lösen Kettenreaktionen aus.
- Nach **18 s** schrumpft der Ring. Wer als Letzter drin ist, gewinnt die Runde. Wer zuerst 3 Runden gewinnt (einstellbar), gewinnt das Match.
- **KOs** zählen für den Spieler, der dich zuletzt geschubst, angezogen oder per Bombe erwischt hat.

**Power-ups**

| | | |
|---|---|---|
| 🧲 | Supermagnet | Feld 60 % stärker, 30 % mehr Reichweite (8 s) |
| 🪨 | Schwergewicht | 2,6× Masse, kaum wegzuschubsen (8 s) |
| ⚡ | Turbo | 55 % mehr Beschleunigung (8 s) |
| 🔄 | Polwechsel | Dreht die Pole **aller anderen** sofort um |

**Lokaler Mehrspieler**: Spieler 1 nutzt WASD + Q/E, Spieler 2 nutzt die Pfeiltasten + Enter/Rechts-Shift (oder IJKL + U/O). Spieler 3 und 4 brauchen ein Gamepad.

## Lokal starten

Das Spiel ist eine statische Website ohne Build-Schritt:

```bash
npm run dev
```

Danach http://localhost:5173 öffnen. Tests der Spielphysik und der Bots:

```bash
npm test
```

## Auf Vercel veröffentlichen (kostenlos)

1. Auf [vercel.com](https://vercel.com) mit GitHub anmelden.
2. **Add New → Project** wählen und dieses Repository importieren.
3. Framework Preset: **Other**. Build Command und Output Directory bleiben leer.
4. **Deploy** klicken. Danach wird jeder Push automatisch veröffentlicht.

Alternativ funktioniert jeder statische Hoster (GitHub Pages, Netlify, Cloudflare Pages …).

## Technik

```
index.html        Oberfläche (Menü, Lobby, HUD)
style.css         Styles
src/game.js       Physik-Simulation & Regeln (DOM-frei, in Node testbar)
src/bot.js        KI-Gegner (3 Stärken)
src/render.js     Canvas-Renderer, Partikel, Effekte
src/net.js        WebRTC-Multiplayer über PeerJS
src/input.js      Tastatur, Maus, Gamepad, Touch
src/audio.js      Synthesizer-Sounds (Web Audio)
src/main.js       Spielschleife, Modi, UI
vendor/peerjs.min.js
test/             node:test-Tests
```

**Netzwerk-Modell**: Der Ersteller eines Raums ist Host und simuliert das Spiel mit 60 Hz. Die anderen Spieler senden nur ihre Eingaben und erhalten 30 Snapshots pro Sekunde, die flüssig interpoliert werden. Der Verbindungsaufbau läuft über den kostenlosen öffentlichen PeerJS-Server, danach fließen die Daten direkt zwischen den Browsern.

> Hinweis: In sehr restriktiven Netzwerken (manche Firmen- oder Schul-WLANs) kann eine direkte WebRTC-Verbindung scheitern. Dann springt ein TURN-Relay ein, falls verfügbar.

Für lokale Netzwerktests lässt sich ein eigener PeerJS-Server angeben: `?peer=127.0.0.1:9000`.

## Lizenz

MIT. PeerJS steht ebenfalls unter MIT (siehe `vendor/PEERJS-LICENSE`).
