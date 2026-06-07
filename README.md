# Sneaky Imagen: CivitAI Image Generator Setup

This repository contains a full-stack, professional solution for generating images using CivitAI models. It consists of:
1. **RunPod Serverless Worker (Backend)**: PyTorch & Diffusers-based GPU container that loads model checkpoints and runs inference.
2. **Next.js Web App (Frontend)**: A premium, dark-themed dashboard styled with Vanilla CSS, supporting responsive layouts, aspect ratio selectors, preset prompts, and client-side history storage (IndexedDB).

---

## Architecture Overview

Instead of baking all models into a single massive Docker image (which would take ~30GB+ of storage and exceed normal GPU memory limits), this codebase uses a **multi-model template structure**. You build separate Docker images for each model type using a build argument.

We support three major base models out-of-the-box (configured in [builder.py](file:///Users/jvr/.gemini/antigravity/worktrees/sneaky-imagen/civit-image-generator-setup/builder.py)):
1. **SDXL**: *Photorealistic All-Purpose v4.0* (CivitAI Model Version 2113674)
2. **Flux**: *Pulsar Flux Male NSFW Base Model v0.1 fp8* (CivitAI Model Version 990314)
3. **SD 1.5**: *GAIJourney 2.0 Muscular Man Men v2.0* (CivitAI Model Version 1820935)

*Note: NSFW Safety Checkers are explicitly disabled on the worker to prevent false-flagging and black images.*

---

## 1. RunPod Worker Setup (Backend)

### A. Build the Docker Image
Build the Docker image specifically for the model you want to deploy. Set the `MODEL_TYPE` build argument to `SD15`, `SDXL`, or `Flux`:

```bash
# Build for SDXL (Photorealistic All-Purpose)
docker build --build-arg MODEL_TYPE=SDXL -t your-username/sneaky-imagen:sdxl .

# Build for Flux (Pulsar)
docker build --build-arg MODEL_TYPE=Flux -t your-username/sneaky-imagen:flux .

# Build for SD 1.5 (GAIJourney)
docker build --build-arg MODEL_TYPE=SD15 -t your-username/sneaky-imagen:sd15 .
```

*Note: Make sure your `CIVITAI_TOKEN` is set in the environment or passed as a build argument if downloading restricted models.*

Push the image to your container registry (Docker Hub, GHCR, etc.):
```bash
docker push your-username/sneaky-imagen:sdxl
```

### B. Deploy on RunPod Serverless
1. Go to **RunPod Console** > **Templates** > **New Template**.
2. Set configuration:
   - **Template Name**: `Sneaky Imagen - SDXL`
   - **Image Name**: `your-username/sneaky-imagen:sdxl`
   - **Container Disk**: `15GB` (Required for models. Flux might need `25GB`).
   - **Environment Variables**:
     - `MODEL_TYPE`: `SDXL` (or `Flux` or `SD15` depending on the image).
3. Save the template.
4. Go to **Serverless** > **New Endpoint**.
5. Select your template. Select an appropriate GPU:
   - For **SD 1.5** & **SDXL**: RTX 4090, A4000, or L4 are perfect.
   - For **Flux**: A100 (80GB), L40S, or A6000 are recommended due to memory requirements.
6. Create the Endpoint and copy the **Endpoint ID** (e.g. `sometempl-id`).
7. Go to **Settings** > **API Keys** and generate a RunPod API Key.

---

## 2. Frontend Web App Setup (Vercel)

The frontend is located in the [/frontend](file:///Users/jvr/.gemini/antigravity/worktrees/sneaky-imagen/civit-image-generator-setup/frontend) directory. It uses Next.js App Router and securely proxies requests through serverless API routes to keep your RunPod API key safe from client-side inspection.

### A. Environment Configuration
Create a `.env.local` inside the `frontend/` directory (or copy [env.example](file:///Users/jvr/.gemini/antigravity/worktrees/sneaky-imagen/civit-image-generator-setup/.env.example) from the root) and add your keys:

```ini
RUNPOD_API_KEY=your_runpod_api_key_here

# Add Endpoint IDs for whichever models you have deployed:
RUNPOD_ENDPOINT_ID_SD15=your_sd15_endpoint_id_here
RUNPOD_ENDPOINT_ID_SDXL=your_sdxl_endpoint_id_here
RUNPOD_ENDPOINT_ID_FLUX=your_flux_endpoint_id_here

# Optional: Add a password to prevent unauthorized visitors from burning your GPU balance
APP_PASSWORD=your_password_here
```

### B. Run Locally
To start the development server locally:
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### C. Deploy to Vercel
1. Push this git repository to your GitHub/GitLab.
2. In the **Vercel Dashboard**, click **New Project** and import the repository.
3. In the project setup panel, set:
   - **Root Directory**: `frontend`
4. Add your **Environment Variables** (matching `.env.local` keys).
5. Click **Deploy**. Vercel will build and serve your premium frontend on a fast serverless CDN!

