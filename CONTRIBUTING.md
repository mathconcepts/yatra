# Contributing to Yatra

Thanks for considering a contribution! Yatra is designed to be easy to extend.

## The two most useful contributions

### 1. Add a location

The whole point of Yatra is to map any journey. See [`docs/ADDING_LOCATIONS.md`](docs/ADDING_LOCATIONS.md) for a step-by-step.

Locations we'd love to see:
- **Char Dham** (Yamunotri, Gangotri, Kedarnath, Badrinath)
- **Vaishno Devi** (Katra → Bhawan)
- **Sabarimala** (Pamba → Sannidhanam)
- **Kailash Mansarovar parikrama**
- **Camino de Santiago** (any stage)
- **Mount Kailash kora**
- **Mecca tawaf circuit**
- **Inca Trail to Machu Picchu**

A good location PR includes:
- `src/config/<location-id>.js` with the full `LocationConfig`
- An import + registration in `src/config/index.js`
- A short note in the PR description explaining where the waypoint coordinates came from

### 2. Improve the core

Ideas welcome:
- More basemap providers (Stadia, Stamen, MapTiler)
- Per-route media (photos, audio) attached to landmarks
- Multi-day trek support (camp markers, daily progress segments)
- Offline mode (cache tiles for a chosen bounding box)
- Better elevation data when SRTM is too coarse (e.g. SRTM 30 m, ALOS PALSAR)

## Local development

```bash
git clone https://github.com/<your-username>/yatra.git
cd yatra
npm install
npm run dev
```

## Code style

- Plain JSX, no TypeScript (yet)
- Functional components + hooks
- One concern per file
- Comments explain *why*, not *what*

## License

By contributing, you agree your work is released under the MIT License.
