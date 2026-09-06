# Agent Shortcuts

## Quick Commands (Mobile-Friendly for iOS)

### Continue Development
```text
@game-designer /dev
```
**What it does:** Analyzes game → Brainstorms improvements → Prioritizes → Implements → Documents

**Even shorter (voice-to-text):**
```text
At game designer slash dev
```

### Check Status
```text
@docs-agent /status
```
**What it does:** Lists completed phases, in-progress tasks, last git push

### View Roadmap
```text
@game-designer /roadmap
```
**What it does:** Shows current priorities and next features

### List Phases
```text
@docs-agent /phases
```
**What it does:** Lists all phase_XX.md files with descriptions

---

## Workflow (iOS)

### 1. Open Claude iOS app
### 2. Type or speak:
```text
@game-designer /dev
```
### 3. Wait for analysis (2-3 min)
### 4. Approve features:
```text
Yes, proceed with Tier 1.
```
### 5. Close app (runs in background)
### 6. When done, commit & push:
```bash
git add .
git commit -m "Phase XX-YY: [features]"
git push origin main
```
(AWS Amplify auto-deploys on push)
### 7. Check back later:
```text
@docs-agent /status
```

---

## Tips for iOS

- **Voice-to-text:** Tap microphone, say *"At game designer slash dev"*
- **Push notifications:** Enable in settings for completion alerts
- **Siri Shortcuts:** Create shortcut for "@game-designer /dev"
- **Widget:** Add Claude widget to home screen for 1-tap access

---

## Command Reference

| Command | Agent | What It Does |
|---------|-------|--------------|
| `/dev` | @game-designer | Continue development (analyze → implement) |
| `/status` | @docs-agent | Show current progress and phases |
| `/roadmap` | @game-designer | Display feature roadmap and priorities |
| `/phases` | @docs-agent | List all phase files |
| `/help` | Any agent | Show available commands |