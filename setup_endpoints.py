#!/usr/bin/env python3
import os
import sys
import json
import urllib.request
import urllib.error

def print_header(title):
    print("=" * 60)
    print(f" {title:^58}")
    print("=" * 60)

def query_runpod_graphql(api_key, query, variables=None):
    url = f"https://api.runpod.io/graphql?api_key={api_key}"
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
        
    req = urllib.request.Request(
        url, 
        data=json.dumps(payload).encode('utf-8'), 
        headers=headers,
        method='POST'
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode('utf-8')
            res_json = json.loads(res_body)
            if "errors" in res_json:
                print(f"GraphQL Errors: {json.dumps(res_json['errors'], indent=2)}")
                return None
            return res_json.get("data")
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} - {e.read().decode('utf-8')}")
        return None
    except Exception as e:
        print(f"Network error calling RunPod GraphQL: {e}")
        return None

def query_runpod_rest(api_key, path, data=None, method='POST'):
    url = f"https://rest.runpod.io/v1{path}"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    req_data = json.dumps(data).encode('utf-8') if data else None
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode('utf-8')
            if not res_body.strip():
                return {}
            return json.loads(res_body)
    except urllib.error.HTTPError as e:
        print(f"REST API HTTP Error: {e.code} - {e.read().decode('utf-8')}")
        return None
    except Exception as e:
        print(f"Network error calling RunPod REST API: {e}")
        return None

def load_existing_env():
    env_path = "frontend/.env.local"
    env_vars = {}
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                if "=" in line and not line.strip().startswith("#"):
                    k, v = line.strip().split("=", 1)
                    env_vars[k.strip()] = v.strip()
    return env_vars

def save_env_vars(updates):
    env_path = "frontend/.env.local"
    lines = []
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            lines = f.readlines()
            
    new_lines = []
    processed_keys = set()
    
    for line in lines:
        stripped = line.strip()
        if "=" in stripped and not stripped.startswith("#"):
            k, v = stripped.split("=", 1)
            k = k.strip()
            if k in updates:
                new_lines.append(f"{k}={updates[k]}\n")
                processed_keys.add(k)
                continue
        new_lines.append(line)
        
    for k, v in updates.items():
        if k not in processed_keys:
            if new_lines and not new_lines[-1].endswith("\n"):
                new_lines[-1] += "\n"
            new_lines.append(f"{k}={v}\n")
            
    with open(env_path, "w") as f:
        f.writelines(new_lines)
        
    print(f"Updated environment variables successfully in: {env_path}")

def main():
    print_header("SNEAKY IMAGEN RUNPOD PROVISIONING SCRIPT")
    print("This script programmatically sets up your templates and endpoints on RunPod")
    print("using a Network Volume for persistent model storage in the cloud.")
    print("-" * 60)
    
    existing_vars = load_existing_env()
    
    # Get RunPod API Key
    runpod_key = os.environ.get("RUNPOD_API_KEY", existing_vars.get("RUNPOD_API_KEY", ""))
    if not runpod_key or runpod_key.startswith("your_"):
        print("[ERROR] RUNPOD_API_KEY not found in environment or .env.local.")
        sys.exit(1)
        
    print(f"Using RunPod API key ({runpod_key[:8]}...)")

    # Get CivitAI Token
    civitai_token = existing_vars.get("CIVITAI_TOKEN", "")
    if not civitai_token:
        civitai_token = "9f6f97877f0c7955cc66907597403a33"
    print(f"Using CivitAI Token ({civitai_token[:4]}...)")

    # Proceed without network volume
    volume_id = None
    print("Proceeding WITHOUT a network volume (using 40GB ephemeral volume per worker).")

    # Image registry options
    import subprocess
    try:
        commit_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
        print(f"Detected current git commit SHA: {commit_sha}")
    except Exception as e:
        print(f"Failed to detect commit SHA, falling back to latest. Error: {e}")
        commit_sha = "latest"
        
    full_image = f"ghcr.io/johnathanvr/sneaky-imagen:{commit_sha}"
    print(f"Using Docker image: {full_image}")

    # 0. Clean up existing endpoints
    print_header("CLEANING UP EXISTING ENDPOINTS")
    existing_endpoints = query_runpod_rest(runpod_key, "/endpoints", method='GET')
    if isinstance(existing_endpoints, list):
        for ep in existing_endpoints:
            if ep.get("name", "").startswith("sneaky-imagen-"):
                ep_id = ep.get("id")
                print(f"Cleaning up old endpoint '{ep.get('name')}' (ID: {ep_id})...")
                query_runpod_rest(runpod_key, f"/endpoints/{ep_id}", method='DELETE')

    # Create Templates
    print_header("1. CREATING RUNPOD TEMPLATES")
    models = ["SDXL", "Flux", "SD15"]
    template_ids = {}
    
    # Query existing templates
    existing_templates = query_runpod_rest(runpod_key, "/templates", method='GET')
    
    mutation = """
    mutation saveTemplate($input: SaveTemplateInput!) {
      saveTemplate(input: $input) {
        id
        name
      }
    }
    """
    
    for model in models:
        template_name = f"Sneaky-Imagen-{model}-Runtime"
        print(f"\n--> Setting up template '{template_name}'...")
        
        # Delete old template if exists
        if isinstance(existing_templates, list):
            for t in existing_templates:
                if t.get("name") == template_name:
                    t_id = t.get("id")
                    print(f"Cleaning up old template '{template_name}' (ID: {t_id})...")
                    query_runpod_rest(runpod_key, f"/templates/{t_id}", method='DELETE')
                    
        # Create new template
        print(f"Creating serverless template using image: {full_image} (MODEL_TYPE: {model})")
        variables = {
            "input": {
                "name": template_name,
                "imageName": full_image,
                "containerDiskInGb": 45,
                "volumeInGb": 0,
                "isServerless": True,
                "dockerArgs": "",
                "ports": "",
                "env": [
                    {"key": "CIVITAI_TOKEN", "value": civitai_token},
                    {"key": "MODEL_TYPE", "value": model}
                ]
            }
        }
        res_data = query_runpod_graphql(runpod_key, mutation, variables)
        if not res_data or not res_data.get("saveTemplate"):
            print(f"[ERROR] Failed to create template for {model}.")
            sys.exit(1)
            
        template_id = res_data["saveTemplate"]["id"]
        print(f"Created template successfully! ID: {template_id}")
        template_ids[model] = template_id

    # Create Endpoints
    print_header("2. CREATING ENDPOINTS")
    env_updates = {
        "RUNPOD_API_KEY": runpod_key,
        "CIVITAI_TOKEN": civitai_token
    }
    
    for model in models:
        print(f"\n--> Deploying endpoint for {model}...")
        template_id = template_ids[model]
        endpoint_payload = {
            "name": f"sneaky-imagen-{model.lower()}-endpoint",
            "templateId": template_id,
            "computeType": "GPU",
            "gpuCount": 1,
            "gpuTypeIds": [
                "NVIDIA RTX A4000",
                "NVIDIA RTX A4500",
                "NVIDIA RTX 4000 Ada Generation",
                "NVIDIA RTX 2000 Ada Generation",
                "NVIDIA RTX A5000",
                "NVIDIA L4",
                "NVIDIA GeForce RTX 3090",
                "NVIDIA GeForce RTX 4090",
                "NVIDIA A40"
            ],
            "workersMin": 0,
            "workersMax": 3,
            "scalerType": "QUEUE_DELAY",
            "scalerValue": 4,
            "executionTimeoutMs": 600000
        }
        
        # Attach volume if provided
        if volume_id:
            endpoint_payload["networkVolumeId"] = volume_id
            
        endpoint_data = query_runpod_rest(runpod_key, "/endpoints", endpoint_payload)
        if not endpoint_data or not endpoint_data.get("id"):
            print(f"[ERROR] Failed to create serverless endpoint for {model}.")
            continue
            
        endpoint_id = endpoint_data["id"]
        print(f"Deployed endpoint '{endpoint_data['name']}' (ID: {endpoint_id})")
        
        env_updates[f"RUNPOD_ENDPOINT_ID_{model.upper()}"] = endpoint_id

    # Save env local updates
    save_env_vars(env_updates)
    
    print("\n" + "=" * 60)
    print(" RUNPOD PROVISIONING COMPLETED SUCCESSFULLY")
    print("=" * 60)
    print("Credentials and Endpoint IDs added to frontend/.env.local!")
    print("\nNext Steps:")
    print("1. Add the environment variables from frontend/.env.local to Vercel.")
    print("2. Once the GitHub Action workflow is finished, try out the generator!")
    print("=" * 60)

if __name__ == "__main__":
    main()
