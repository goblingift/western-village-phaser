# Continue Game Development

## Quick Commands (iOS-Friendly)

### Shortest (Recommended for iOS):
```text
@game-designer /dev
```

### Also Works:
```text
@game-designer Continue the improvement of the game.
```

### Voice-to-Text (Fastest):
Tap microphone, say:
```text
At game designer slash dev
```

---

## What `/dev` Does

1. **Analyzes** current game state (what's implemented, what's missing)
2. **Brainstorms** 5-10 improvement ideas across:
   - Core Loop (production chains, resource management)
   - Content (new buildings, resources, mechanics)
   - UX/UI (usability, feedback, quality of life)
   - Polish (visuals, animations, theme consistency)
3. **Prioritizes** using ICE scoring (Impact × Confidence × Ease)
4. **Presents** top 3-5 improvements to you for approval
5. **After your approval** → hands off to @chief-product-designer for implementation
6. **Implementation** → @docs-agent creates phase_XX.md automatically
7. **You commit & push** → AWS Amplify auto-deploys

---

## Example iOS Workflow

### You (from iPhone):
```text
@game-designer /dev
```

### Game Designer responds:
```text
## Game Analysis & Roadmap

### Current State
✅ [lists what's already implemented]
⚠️ [lists gaps and opportunities]

### Tier 1: Immediate Improvements (ICE 200+)

**1. [Feature Name]**
- ICE Score: XXX
- Why: [rationale]
- Requirements: [bullet points]

**2. [Feature Name]**
- ICE Score: XXX
- Why: [rationale]
- Requirements: [bullet points]

**3. [Feature Name]**
- ICE Score: XXX
- Why: [rationale]
- Requirements: [bullet points]

---

Shall I hand off Tier 1 to @chief-product-designer for implementation?
```

### You approve:
```text
Yes, proceed with Tier 1.
```

### Game Designer:
```text
@chief-product-designer Implement approved Tier 1 features:
[list of features with requirements]

Coordinate the team through all phases. Ensure docs-agent creates phase_XX.md for each feature.
```

### After Implementation:
```text
You: git add .
You: git commit -m "Phase XX-YY: [features]"
You: git push origin main

[AWS Amplify auto-deploys]
```

### Result:
- Features implemented
- Phase files created
- Auto-deployed to https://www.goblin.gift
- You get a summary when done

---

## Check Progress (Anytime)

### From iPhone:
```text
@docs-agent /status
```

### Returns:
```text
## Implementation Status

### Completed (Phase XX-YY):
✅ Phase XX: [feature name]
✅ Phase YY: [feature name]

### In Progress:
⏳ Phase ZZ: [currently implementing]

### Last Deploy:
🚀 https://www.goblin.gift
📅 [timestamp]
```

---

## Notes

- **Run anytime** to get fresh improvement ideas
- **Game Designer analyzes** current state each time (not repetitive)
- **You only approve** high-level features (no micromanagement)
- **Implementation is autonomous** (close app, check back later)
- **Perfect for mobile** (short prompts, long-running tasks)
- **All phase files created automatically** by docs-agent
- **AWS Amplify auto-deploys** on every git push (no manual deploy needed)

---

## Command Reference

| Command | Agent | What It Does |
|---------|-------|--------------|
| `/dev` | @game-designer | Continue development |
| `/status` | @docs-agent | Show current progress |
| `/roadmap` | @game-designer | Display roadmap |
| `/phases` | @docs-agent | List all phase files |