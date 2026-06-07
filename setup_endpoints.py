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
        runpod_key = input("Enter your RunPod API Key: ").strip()
    else:
        reuse = input(f"Reuse existing RunPod API key ({runpod_key[:8]}...)? [Y/n]: ").strip().lower()
        if reuse not in ('', 'y', 'yes'):
            runpod_key = input("Enter your RunPod API Key: ").strip()
            
    if not runpod_key:
        print("[ERROR] RunPod API Key is required.")
        sys.exit(1)

    # Get CivitAI Token
    civitai_token = existing_vars.get("CIVITAI_TOKEN", "")
    if not civitai_token:
        civitai_token = "9f6f97877f0c7955cc66907597403a33"

    # Query existing network volumes
    print("\nChecking for existing RunPod Network Volumes...")
    volumes = []
    res_volumes = query_runpod_rest(runpod_key, "/networkvolumes", method='GET')
    if isinstance(res_volumes, list):
        volumes = res_volumes

    volume_id = None
    if volumes:
        print(f"Found {len(volumes)} existing Network Volume(s):")
        for i, vol in enumerate(volumes):
            print(f"  [{i+1}] ID: {vol.get('id')}, Name: {vol.get('name')}, Size: {vol.get('size')} GB, Region: {vol.get('dataCenterId')}")
        
        choice = input(f"\nSelect a volume to use (1-{len(volumes)}) or press Enter to create a new one: ").strip()
        if choice.isdigit() and 1 <= int(choice) <= len(volumes):
            volume_id = volumes[int(choice) - 1].get("id")
            print(f"Selected existing volume: {volume_id}")

    if not volume_id:
        create_choice = input("\nNo volume selected. Would you like to create a new 50GB persistent network volume? (Recommended) [Y/n]: ").strip().lower()
        if create_choice not in ('n', 'no'):
            print("\nAvailable datacenter regions:")
            print("  [1] US-TX-1 (Texas, USA - Default)")
            print("  [2] US-CA-1 (California, USA)")
            print("  [3] EU-RO-1 (Romania, Europe)")
            region_choice = input("Select a region (1-3) [default: 1]: ").strip()
            dc_id = "US-TX-1"
            if region_choice == "2":
                dc_id = "US-CA-1"
            elif region_choice == "3":
                dc_id = "EU-RO-1"
                
            print(f"Creating 50GB network volume in {dc_id}...")
            payload = {
                "name": "sneaky-imagen-volume",
                "size": 50,
                "dataCenterId": dc_id
            }
            create_res = query_runpod_rest(runpod_key, "/networkvolumes", data=payload, method='POST')
            if create_res and "id" in create_res:
                volume_id = create_res["id"]
                print(f"Created volume successfully! ID: {volume_id}")
            else:
                print("\n[WARNING] Failed to create network volume.")
                if create_res and "error" in create_res:
                    print(f"RunPod Error: {create_res['error']}")
                print("We will proceed WITHOUT a network volume. Estimated cold start: 5-15 mins.")
                confirm = input("Continue anyway? [Y/n]: ").strip().lower()
                if confirm in ('n', 'no'):
                    sys.exit(1)
        else:
            print("Proceeding without volume attachment.")

    # Image registry options
    print("\n--- Docker Image Setup ---")
    print("We have configured GitHub Actions to build and push to GitHub Container Registry (ghcr.io).")
    print("The default image tag is: ghcr.io/johnathanvr/sneaky-imagen:latest")
    
    image_override = input("\nEnter custom Docker image tag if different (press Enter to keep default): ").strip()
    full_image = image_override if image_override else "ghcr.io/johnathanvr/sneaky-imagen:latest"

    # Create Template
    print_header("1. CREATING RUNPOD TEMPLATE")
    
    # Check if a template with this name already exists and delete it to prevent uniqueness errors
    template_name = "Sneaky-Imagen-Runtime"
    print("Checking for existing templates with the same name...")
    existing_templates = query_runpod_rest(runpod_key, "/templates", method='GET')
    if isinstance(existing_templates, list):
        for t in existing_templates:
            if t.get("name") == template_name:
                t_id = t.get("id")
                print(f"Cleaning up old template '{template_name}' (ID: {t_id})...")
                query_runpod_rest(runpod_key, f"/templates/{t_id}", method='DELETE')

    print(f"Creating serverless template using image: {full_image}")
    
    mutation = """
    mutation saveTemplate($input: SaveTemplateInput!) {
      saveTemplate(input: $input) {
        id
        name
      }
    }
    """
    
    variables = {
        "input": {
            "name": "Sneaky-Imagen-Runtime",
            "imageName": full_image,
            "containerDiskInGb": 20,
            "volumeInGb": 0,
            "isServerless": True,
            "dockerArgs": "",
            "ports": "",
            "env": [
                {"key": "CIVITAI_TOKEN", "value": civitai_token}
            ]
        }
    }
    
    res_data = query_runpod_graphql(runpod_key, mutation, variables)
    if not res_data or not res_data.get("saveTemplate"):
        print("[ERROR] Failed to create template on RunPod. Verify your API Key.")
        sys.exit(1)
        
    template_id = res_data["saveTemplate"]["id"]
    print(f"Created template successfully! ID: {template_id}")

    # Create Endpoints
    print_header("2. CREATING ENDPOINTS")
    models = ["SDXL", "Flux", "SD15"]
    env_updates = {
        "RUNPOD_API_KEY": runpod_key,
        "CIVITAI_TOKEN": civitai_token
    }
    
    for model in models:
        print(f"\n--> Deploying endpoint for {model}...")
        endpoint_payload = {
            "name": f"sneaky-imagen-{model.lower()}-endpoint",
            "templateId": template_id,
            "computeType": "GPU",
            "gpuCount": 1,
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
