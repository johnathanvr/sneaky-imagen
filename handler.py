import os
import torch
import runpod
import base64
import io
import requests
import re
import traceback
from diffusers import (
    StableDiffusionPipeline,
    StableDiffusionXLPipeline,
    FluxPipeline,
    AutoencoderKL,
    EulerAncestralDiscreteScheduler,
    DPMSolverMultistepScheduler
)
from PIL import Image

# Configuration
device = "cuda" if torch.cuda.is_available() else "cpu"
dtype = torch.bfloat16 if device == "cuda" else torch.float32

MODELS_DIR = "/runpod-volume"
CHECKPOINT_DIR = f"{MODELS_DIR}/checkpoints"
LORA_DIR = f"{MODELS_DIR}/loras"
VAE_DIR = f"{MODELS_DIR}/vae"

# Model URLs mapped by MODEL_TYPE
MODELS_CONFIG = {
    "SD15": {
        "checkpoint": "https://civitai.com/api/download/models/1820935?fileId=1721430",
        "loras": [],
        "vae": None
    },
    "SDXL": {
        "checkpoint": "https://civitai.red/api/download/models/2113674?fileId=2008314",
        "loras": [],
        "vae": None
    },
    "Flux": {
        "checkpoint": "https://civitai.red/api/download/models/990314?fileId=896468",
        "loras": [],
        "vae": None
    }
}

# Global pipeline variable
pipe = None
pipeline_info = {}
load_error_traceback = None

def download_file(url, output_dir, token=None):
    os.makedirs(output_dir, exist_ok=True)
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    if ('civitai.com' in url or 'civitai.red' in url) and token:
        separator = '&' if '?' in url else '?'
        url = f"{url}{separator}token={token}"

    print(f"Runtime Downloading from {url}...")
    try:
        response = requests.get(url, stream=True, headers=headers, allow_redirects=True, timeout=60)
        response.raise_for_status()

        # Try to get filename from content-disposition
        content_disp = response.headers.get('content-disposition', '')
        filename_match = re.findall(r'filename[^;=\n]*=(([\'"]).*?\2|[^;\n]*)', content_disp)
        
        if filename_match and filename_match[0][0]:
            filename = filename_match[0][0].strip('\'"')
        else:
            filename = "model.safetensors" # Fallback
            
        output_path = os.path.join(output_dir, filename)
        
        if os.path.exists(output_path):
            print(f"File {filename} already exists, skipping.")
            return output_path

        total_size = int(response.headers.get('content-length', 0))
        downloaded = 0
        
        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0 and downloaded % (1024*1024*100) == 0: # Print every 100MB
                        print(f"Downloaded {downloaded/1024/1024:.2f} MB")
                        
        print(f"Downloaded {filename} to {output_path}")
        return output_path
        
    except Exception as e:
        print(f"Error downloading {url}: {e}")
        return None

def load_models():
    global pipe, pipeline_info, load_error_traceback
    
    model_type = os.environ.get("MODEL_TYPE", "SDXL") 
    print(f"Starting runtime model initialization for type: {model_type}...")
    
    # Ensure directories exist
    os.makedirs(CHECKPOINT_DIR, exist_ok=True)
    os.makedirs(LORA_DIR, exist_ok=True)
    os.makedirs(VAE_DIR, exist_ok=True)
    
    # Check if checkpoint is present
    checkpoint_path = None
    files = [f for f in os.listdir(CHECKPOINT_DIR) if f.endswith('.safetensors')]
    if files:
        checkpoint_path = os.path.join(CHECKPOINT_DIR, files[0])
        print(f"Found existing checkpoint: {checkpoint_path}")
    else:
        # Checkpoint is missing, download it
        if model_type not in MODELS_CONFIG:
            print(f"Error: Unknown model type '{model_type}'")
            return False
            
        config = MODELS_CONFIG[model_type]
        checkpoint_url = config.get("checkpoint")
        civitai_token = os.environ.get("CIVITAI_TOKEN", "9f6f97877f0c7955cc66907597403a33")
        
        if checkpoint_url:
            print(f"Checkpoint not found. Starting download for {model_type}...")
            downloaded_path = download_file(checkpoint_url, CHECKPOINT_DIR, civitai_token)
            if downloaded_path:
                checkpoint_path = downloaded_path
            else:
                print("Failed to download checkpoint!")
                return False
        else:
            print("No checkpoint URL configured!")
            return False

    # Check VAE
    vae_path = None
    files = [f for f in os.listdir(VAE_DIR) if f.endswith('.safetensors')]
    if files:
        vae_path = os.path.join(VAE_DIR, files[0])
        print(f"Found existing VAE: {vae_path}")
    else:
        config = MODELS_CONFIG.get(model_type, {})
        vae_url = config.get("vae")
        civitai_token = os.environ.get("CIVITAI_TOKEN", "9f6f97877f0c7955cc66907597403a33")
        if vae_url:
            print("VAE not found. Downloading...")
            vae_path = download_file(vae_url, VAE_DIR, civitai_token)

    # Check LoRAs
    lora_paths = []
    files = [f for f in os.listdir(LORA_DIR) if f.endswith('.safetensors')]
    if files:
        lora_paths = [os.path.join(LORA_DIR, f) for f in files]
        print(f"Found {len(lora_paths)} existing LoRAs")
    else:
        config = MODELS_CONFIG.get(model_type, {})
        loras = config.get("loras", [])
        civitai_token = os.environ.get("CIVITAI_TOKEN", "9f6f97877f0c7955cc66907597403a33")
        for lora_url in loras:
            if lora_url:
                print(f"LoRA not found. Downloading from {lora_url}...")
                path = download_file(lora_url, LORA_DIR, civitai_token)
                if path:
                    lora_paths.append(path)

    # Load VAE
    vae = None
    if vae_path:
        try:
            vae = AutoencoderKL.from_single_file(vae_path, torch_dtype=dtype)
        except Exception as e:
            print(f"Error loading VAE: {e}")

    print(f"Loading {model_type} pipeline from {checkpoint_path}...")
    
    try:
        pipe_kwargs = {
            "torch_dtype": dtype
        }
        if vae is not None:
            pipe_kwargs["vae"] = vae

        if model_type == "Flux":
            pipe = FluxPipeline.from_single_file(
                checkpoint_path,
                **pipe_kwargs
            )
        elif model_type == "SD15":
            pipe = StableDiffusionPipeline.from_single_file(
                checkpoint_path,
                safety_checker=None,
                feature_extractor=None,
                **pipe_kwargs
            )
        else: # SDXL
            pipe = StableDiffusionXLPipeline.from_single_file(
                checkpoint_path,
                **pipe_kwargs
            )
        try:
            pipe = pipe.to(device)
        except Exception as e:
            print(f"Failed to move pipeline to {device}: {e}")
            print("Inspecting pipeline components:")
            for name, component in pipe.components.items():
                if isinstance(component, torch.nn.Module):
                    meta_params = [p_name for p_name, p in component.named_parameters() if p.device.type == "meta"]
                    meta_buffers = [b_name for b_name, b in component.named_buffers() if b.device.type == "meta"]
                    if meta_params or meta_buffers:
                        print(f"  Component '{name}' ({component.__class__.__name__}) has meta parameters: {meta_params} or buffers: {meta_buffers}")
            raise e
        
        # Disable safety checker to prevent false flags / black images
        if hasattr(pipe, "safety_checker") and pipe.safety_checker is not None:
            pipe.safety_checker = None
            print("Pipeline safety checker disabled.")
        if hasattr(pipe, "feature_extractor") and pipe.feature_extractor is not None:
            pipe.feature_extractor = None
            
        # Enable memory optimizations
        if device == "cuda":
            pipe.enable_vae_slicing()
            
        # Load LoRAs
        if lora_paths:
            print("Loading LoRAs...")
            loaded_loras = []
            for i, lora_path in enumerate(lora_paths):
                try:
                    adapter_name = f"lora_{i+1}"
                    pipe.load_lora_weights(lora_path, adapter_name=adapter_name)
                    loaded_loras.append(adapter_name)
                    print(f"Loaded LoRA: {lora_path}")
                except Exception as e:
                    print(f"Error loading LoRA {i+1}: {e}")
                    
            # Set adapters active
            if loaded_loras:
                # Default scale 0.8 as per script
                scales = [0.8] * len(loaded_loras)
                pipe.set_adapters(loaded_loras, adapter_weights=scales)

        pipeline_info = {
            "model_type": model_type,
            "loaded": True
        }
        print("Models loaded successfully!")
        return True
    except Exception as e:
        load_error_traceback = traceback.format_exc()
        print(f"Error in load_models: {e}")
        return False

def handler(job):
    global load_error_traceback
    job_input = job["input"]
    
    if not pipeline_info.get("loaded"):
        print("Models not pre-loaded. Initializing now...")
        success = load_models()
        if not success:
            return {
                "error": "Pipeline failed to load during handler execution.",
                "traceback": load_error_traceback or "No traceback captured."
            }

    # Extract parameters with defaults
    prompt = job_input.get("prompt", "a beautiful landscape, highly detailed, 8k")
    negative_prompt = job_input.get("negative_prompt", "blurry, low quality, distorted, ugly")
    height = job_input.get("height", 1024)
    width = job_input.get("width", 1024)
    steps = job_input.get("steps", 30)
    cfg_scale = job_input.get("cfg_scale", 7.0 if pipeline_info["model_type"] == "SD15" else 5.5)
    seed = job_input.get("seed", None)
    scheduler_type = job_input.get("scheduler", "Euler a")
    clip_skip = job_input.get("clip_skip", 2) # SDXL only
    output_format = job_input.get("output_format", "JPEG").upper()  # JPEG or PNG
    output_quality = int(job_input.get("output_quality", 90))  # JPEG quality 1-95

    # Configure Scheduler (only for SD15 and SDXL)
    if pipeline_info["model_type"] in ("SD15", "SDXL"):
        try:
            if scheduler_type == "Euler a":
                pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config)
            elif scheduler_type == "DPM++ 2M Karras":
                pipe.scheduler = DPMSolverMultistepScheduler.from_config(
                    pipe.scheduler.config,
                    use_karras_sigmas=True,
                    algorithm_type="dpmsolver++"
                )
        except Exception as e:
            print(f"Error overriding scheduler: {e}")
        
    generator = None
    if seed:
        generator = torch.Generator(device=device).manual_seed(seed)
    else:
        seed = torch.seed()
        generator = torch.Generator(device=device).manual_seed(seed)

    print(f"Generating: Prompt='{prompt[:50]}...', Steps={steps}, Seed={seed}")

    gen_params = {
        "prompt": prompt,
        "height": height,
        "width": width,
        "num_inference_steps": steps,
        "generator": generator
    }

    # Model specific parameter configuration
    if pipeline_info["model_type"] != "Flux":
        gen_params["negative_prompt"] = negative_prompt
        gen_params["guidance_scale"] = cfg_scale
    else:
        # Flux uses guidance_scale in modern diffusers versions
        gen_params["guidance_scale"] = cfg_scale

    if pipeline_info["model_type"] == "SDXL" and clip_skip > 1:
        gen_params["clip_skip"] = clip_skip

    try:
        # Extra safety check disablement before run
        if hasattr(pipe, "safety_checker") and pipe.safety_checker is not None:
            pipe.safety_checker = None
            
        output = pipe(**gen_params)
        image = output.images[0]
        
        # Convert to base64
        buffered = io.BytesIO()
        if output_format == "PNG":
            image.save(buffered, format="PNG")
        else:
            if image.mode in ("RGBA", "P"):
                image = image.convert("RGB")
            image.save(buffered, format="JPEG", quality=output_quality)
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")

        return {
            "image": img_str,
            "image_format": output_format.lower(),
            "seed": seed,
            "params": {
                "width": width,
                "height": height,
                "steps": steps,
                "cfg": cfg_scale,
                "model": pipeline_info["model_type"]
            }
        }
    except Exception as e:
        return {"error": str(e)}

runpod.serverless.start({"handler": handler})
