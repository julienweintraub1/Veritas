# Veritas Projections API

Backend API to fetch NFL fantasy projections without CORS issues.

## Deploy to Vercel

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Navigate to this directory:
```bash
cd projections-api
```

3. Install dependencies:
```bash
npm install
```

4. Deploy:
```bash
vercel
```

5. Copy the deployment URL (e.g., `https://veritas-projections-api.vercel.app`)

6. Update your main app to use this URL instead of calling FantasyPros directly

## Local Testing

```bash
npm run dev
```

Then visit: `http://localhost:3000/api/projections`
