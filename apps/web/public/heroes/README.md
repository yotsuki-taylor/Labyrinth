# Character images

Put hero artwork here. Files in `public/` are served as-is (no import needed).

## Expected files (one per hero class)

| File | Class | Starter hero |
|--------------------|-------------|--------------|
| `guardian.png`     | Guardian    | Aldric       |
| `ranger.png`       | Ranger      | Sylva        |
| `occultist.png`    | Occultist   | Morvyn       |
| `medic.png`        | Medic       | Eryn         |

- Recommended: square images (e.g. 256×256 or 512×512), PNG or WebP.
- Transparent background looks best over the dark UI.
- `.png`, `.webp`, `.jpg` all work — if you use a different extension, update
  the filenames in code accordingly.

## How to reference them in code

The app is served under the `/Labyrinth/` base path, so build URLs with
`import.meta.env.BASE_URL` (never a hard-coded `/`):

```tsx
const heroImg = `${import.meta.env.BASE_URL}heroes/${hero.class}.png`;
// → "/Labyrinth/heroes/guardian.png" in production,
//   "/heroes/guardian.png" in local dev.

<img src={heroImg} alt={hero.name} />
```

Drop the files in, tell me, and I'll wire them into the hero cards and the
combat screen.
