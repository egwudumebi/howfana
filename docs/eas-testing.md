# EAS Build — share Howfana with remote testers

Use this flow when the app owner (or friends in another city) need an install link **without your dev PC or Metro running**.

## What you get

- **Android:** an Expo install page with a QR code + APK download (internal distribution).
- **Standalone app:** the JavaScript bundle is baked into the build — testers do not need `expo start`.
- **Same Wi‑Fi mesh testing:** testers still need to be on the **same local network** to chat/sync; EAS only distributes the app, it is not a chat server.

## One-time setup (project maintainer)

### 1. Expo account

Create a free account at [expo.dev](https://expo.dev) if you do not have one.

### 2. Log in on your machine

**Option A — browser login (recommended)**

```bash
cd ~/Projects/Dev/Howfana
npx eas-cli login
npx eas-cli whoami
```

`whoami` only *checks* login — it does not log you in. You must run `login` first.

**Option B — access token (if npm/network is flaky or no browser on server)**

1. On any device, open [expo.dev/settings/access-tokens](https://expo.dev/settings/access-tokens)
2. Create a token (name it e.g. `howfana-build`)
3. In your terminal:

```bash
export EXPO_TOKEN=paste_your_token_here
npx eas-cli whoami
```

You should see your Expo username. Add the token to `~/.bashrc` if you want it permanent:

```bash
echo 'export EXPO_TOKEN=your_token_here' >> ~/.bashrc
```

**If `npm` times out downloading `eas-cli`**

Retry when the network is stable, or install once globally:

```bash
npm install -g eas-cli
eas login
eas whoami
```

Project `.npmrc` already increases npm fetch retries/timeouts for slow connections.

### 3. Link this project to EAS

```bash
npm run eas:init
```

This adds `extra.eas.projectId` to `app.json`. **Commit that change.**

### 4. Paystack test key (optional, for Premium checkout)

Do **not** commit real keys. Set an EAS environment variable for the **preview** profile (replace with your real test key from `.env`):

```bash
npx eas-cli env:set preview \
  --name EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY \
  --value pk_test_YOUR_ACTUAL_KEY \
  --visibility plaintext \
  --type string
```

Use **`plaintext`** (not `secret`) — `EXPO_PUBLIC_` vars are embedded in the app bundle anyway. Paystack **public** keys are safe for this.

If the command fails with `GraphQL request failed`, set it in the browser instead: [expo.dev](https://expo.dev) → **Howfana** → **Environment variables** → **preview** → add the variable.

This step is **optional**; skip it and run the build if you only need mesh/chat testing.

## Build for testers (Android — recommended)

**One command** (login + init check + build):

```bash
npm run eas:preview:android
```

Or step by step:

```bash
npm run eas:build:android
```

- First run: EAS will offer to generate an Android keystore (choose **Yes**).
- When the build finishes, open the URL printed in the terminal (also on [expo.dev](https://expo.dev) → your project → Builds).
- Share that **install link** with the owner via WhatsApp, email, etc.

The owner opens the link on their Android phone, downloads the APK, and installs (enable “Install unknown apps” if prompted).

### iOS (optional, harder)

Internal iOS builds require an **Apple Developer** account ($99/year) and registered test devices. Only use if you already have that set up:

```bash
npx eas-cli build --profile preview --platform ios
```

## npm scripts (shortcut)

```bash
npm run eas:login          # log in to Expo
npm run eas:init             # link project (once)
npm run eas:build:android    # preview APK for testers
npm run eas:build:ios        # preview iOS (needs Apple dev account)
```

## Tester checklist (owner + friends)

1. Install from the **EAS install link** (not Expo Go).
2. Open Howfana → accept **Terms & Privacy** → create account → **save recovery key**.
3. Settings → turn **Nearby Discovery** on; enable Bluetooth + Location on Android.
4. Everyone joins the **same Wi‑Fi** (home router or one phone’s hotspot works well).
5. **People** tab → find each other → **Connect**.
6. **Chat** → tap someone under **Active now** → send messages.

If peers do not appear: same Wi‑Fi, discovery enabled, not invisible, try manual connect `192.168.x.x:47338` on the Peers screen.

## Rebuild when you change the app

After code changes, run another preview build and share the **new** install link. Version numbers auto-increment on EAS (`appVersionSource: remote`).

## Profiles in `eas.json`

| Profile       | Use case                                      |
|---------------|-----------------------------------------------|
| `development` | Dev client + Metro on your machine            |
| `preview`     | **Remote testers** — internal APK, standalone |
| `production`  | Play Store / App Store later                    |

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails on BLE patch | `patches/` is committed; EAS runs `postinstall` |
| Premium checkout missing | Add `EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY` EAS secret and rebuild |
| “App not installed” | Uninstall old debug build first; allow unknown sources |
| Chat does not work across states | Expected — mesh needs same Wi‑Fi; EAS does not replace that |
