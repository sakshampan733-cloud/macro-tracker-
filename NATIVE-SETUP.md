# Making Basal a real iPhone app

Plain steps. Do them in order. Nothing here deletes or changes the app you
already have — the website keeps working exactly as it does now.

The approach: your app runs *inside* a real iPhone app. Every screen, the
Light theme, the ticket, the food library, the plus button — all of it comes
across working on day one. Then Apple Health, iCloud backup and a proper
barcode scanner get added on top.

---

## Part 1 — Two downloads (you have to do these)

Both are free. Both are big. Start them and go do something else.

### 1. Xcode

This is Apple's app-building program. You cannot make an iPhone app without it.

1. Open the **App Store** on your Mac
2. Search **Xcode**
3. Click **Get**, then **Install**
4. It is about 15 GB. Leave it running.
5. When it finishes, **open Xcode once** and accept the licence it shows you.

### 2. Node

This is the tool that assembles the app shell.

1. Go to **nodejs.org**
2. Click the big green button that says **LTS** (the left one)
3. Open the file it downloads and click through the installer

### Check they worked

Come back here and tell me, or run this yourself in Terminal:

```bash
node --version && xcodebuild -version
```

If both print a version number, you are done with Part 1.

---

## Part 2 — Building it (I do this)

Once Part 1 is done, tell me and I will run these. Listed here so you can see
there is nothing mysterious in it:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios
npx cap add ios
npx cap sync ios
npx cap open ios
```

That last command opens your app in Xcode. Then you press the **▶ play
button** and it launches on a simulated iPhone.

The settings it uses are already written, in `capacitor.config.json`:

- **App name:** Basal
- **App ID:** com.sakshampanchal.basal
- **Web folder:** `docs` — the app you already have

---

## Part 3 — Putting it on your actual phone

1. Plug your iPhone into the Mac with a cable
2. In Xcode, click the device name at the top and pick your iPhone
3. Xcode → Settings → Accounts → **+** → sign in with your Apple ID
4. Click the blue **App** item in the left sidebar, then **Signing &
   Capabilities**, and choose your name under **Team**
5. Press **▶**

The first time, your iPhone will refuse to open it. Go to **Settings →
General → VPN & Device Management** on the phone, tap your Apple ID, and tap
**Trust**.

With a free Apple ID the app stops working after 7 days and you plug in and
press ▶ again. A paid developer account (£79/year) removes that, and is also
what you need to put it on your siblings' phones properly or on the App Store.

---

## Part 4 — What gets better afterwards

These are the reasons for doing this at all. I do them once the app is
running.

**Apple Health, read directly.** The whole Shortcut chain disappears — no
relay, no key, no JSON body, no 11:50pm automation, no Sum-versus-Average, no
duplicate step counting. The app just asks Health for today's numbers. This
alone removes the most fragile thing in the project.

**Backups that happen by themselves.** Right now your log lives in Safari's
storage and one wrong tap in Settings deletes it. A native app can save to
iCloud automatically. The backup reminder becomes unnecessary.

**A real barcode scanner.** The camera through a webpage is slow and asks
permission awkwardly. Native scanning is instant.

**Notifications that actually fire.** Weigh-in and meal reminders can arrive
when the app is closed. At the moment they can only appear while you are
already looking at it.

---

## What has already been prepared

- `package.json` and `capacitor.config.json` — the shell's settings
- The service worker is switched off inside the native app. It exists to stop
  the website serving stale screens; inside a packaged app it would cause
  exactly that problem instead.
- `PORTING.md` — which parts of the code are precious, which get thrown away
- `docs/test.html` — 88 checks on the maths, so you can prove the ported app
  still computes the same numbers. It runs inside the native app too.

---

## One thing to know before you start

Your food log will **not** carry across on its own. The website and the app
are separate storage as far as iOS is concerned.

Before you switch over: open the website, go to **Settings → Data → Export**,
and save the file. Then in the new app, **Import** it. Do this before you
start using the native version daily, not after.
