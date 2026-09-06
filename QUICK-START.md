# Quick Start (iOS)

## Development Commands

### Continue Development
```text
@game-designer /dev
```
**Use when:** You want new features implemented automatically

**What happens:**
1. Analyzes current game
2. Brainstorms improvements
3. Presents top 3-5 features
4. You approve (one message)
5. Implementation runs (close app, check back later)
6. docs-agent creates phase_XX.md files
7. You commit & push → AWS auto-deploys

---

### Check Status
```text
@docs-agent /status
```
**Use when:** You want to see what's been implemented

**Returns:**
- Completed phases
- In-progress tasks
- Last deployment info

---

### View Roadmap
```text
@game-designer /roadmap
```
**Use when:** You want to see upcoming features

**Returns:**
- Current priorities
- Next features in queue
- ICE scores

---

### List Phases
```text
@docs-agent /phases
```
**Use when:** You want to see all phase files

**Returns:**
- List of all phase_XX.md files
- Brief descriptions

---

## Voice Commands (Fastest)

Tap microphone in Claude iOS app, say:

```text
At game designer slash dev
```

or

```text
At docs agent slash status
```

---

## Typical Workflow

### Morning (2 min):
```text
You: @game-designer /dev

[Game Designer analyzes, presents features]

You: Yes, proceed with Tier 1.

[Close app, go to work]
```

### Lunch (2 min):
```text
You: @docs-agent /status

[Check what was implemented]

You: git add .
You: git commit -m "Phase XX-YY: new features"
You: git push origin main

[AWS Amplify auto-deploys]

You: Open https://www.goblin.gift in Safari
```

### Evening (2 min):
```text
You: @game-designer /dev

[Approve next batch]

[Implementation runs overnight]
```

**Total time:** 6 minutes/day
**Result:** Continuous improvement, fully automated!

---

## Tips

- ✅ **Enable push notifications** in Claude iOS settings
- ✅ **Use voice-to-text** for even faster input
- ✅ **Close app after approval** (runs in background)
- ✅ **Check status anytime** (no need to wait for completion)
- ✅ **Git commit/push** after implementation completes
- ✅ **AWS Amplify auto-deploys** on every push

---

## Command Cheat Sheet

| What You Want | Type This |
|---------------|-----------|
| New features | `@game-designer /dev` |
| What's done? | `@docs-agent /status` |
| Show roadmap | `@game-designer /roadmap` |
| List phases | `@docs-agent /phases` |
| Help | `@any-agent /help` |

---

## Files Reference

- **CLAUDE.md** – Project config and rules
- **AGENTS.md** – Agent definitions and shortcuts
- **continue-development.md** – Full `/dev` workflow documentation
- **QUICK-START.md** – This file (iOS quick reference)
- **docs/phases/** – All phase_XX.md files (auto-created by docs-agent)
- **docs/CHANGELOG.md** – Changelog (auto-updated by docs-agent)

---

## Git Workflow

After implementation completes:

```bash
# Check what changed
git status

# Stage all changes
git add .

# Commit with descriptive message
git commit -m "Phase XX-YY: [brief feature description]"

# Push to trigger AWS Amplify auto-deploy
git push origin main
```

**AWS Amplify will:**
1. Detect the push
2. Run `npm install`
3. Run `npm run build`
4. Deploy to production
5. Update https://www.goblin.gift

**Time:** 3-5 minutes (fully automatic)