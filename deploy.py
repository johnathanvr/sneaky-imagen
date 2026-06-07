#!/usr/bin/env python3
import os
import sys
import subprocess
import json
import urllib.request
import urllib.error
import argparse

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

def run_command(command, description):
    print(f"\n--> Running: {description}...")
    try:
        result = subprocess.run(command, shell=True, check=True)
        return result.returncode == 0
    except subprocess.CalledProcessError as e:
        print(f"Error executing command: {e}")
        return False

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
    parser = argparse.ArgumentParser(description="Sneaky Imagen Deployment Automation")
    parser.add_argument("-u", "--username", help="Docker registry username (e.g. sneaky2x)")
    parser.add_argument("-k", "--api-key", help="RunPod API Key")
    parser.add_argument("-m", "--model", choices=["SDXL", "Flux", "SD15", "All"], help="Model size to build/deploy")
    parser.add_argument("-c", "--civitai-token", help="CivitAI API Token for downloads")
    parser.add_argument("-y", "--yes", action="store_true", help="Skip prompts and confirm deployment")
    
    args = parser.parse_args()

    print_header("SNEAKY IMAGEN DEPLOYMENT AUTOMATION")
    
    # 1. Check docker command
    docker_bin = "docker"
    try:
        subprocess.run(f"{docker_bin} --version", shell=True, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        mac_docker_path = "/Applications/Docker.app/Contents/Resources/bin/docker"
        if os.path.exists(mac_docker_path):
            docker_bin = mac_docker_path
            print(f"Found Docker at: {docker_bin}")
        else:
            print("[ERROR] Docker is not installed or running. Please start Docker Desktop and try again.")
            sys.exit(1)

    # 2. Get Docker Registry Username
    docker_username = args.username
    if not docker_username:
        docker_username = input("Enter your Docker Hub (or GHCR) username: ").strip()
    if not docker_username:
        print("[ERROR] Docker username is required to tag container images.")
        sys.exit(1)

    # 3. Get RunPod API Key
    existing_vars = load_existing_env()
    default_key = existing_vars.get("RUNPOD_API_KEY", "")
    
    runpod_key = args.api_key
    if not runpod_key:
        if default_key and not default_key.startswith("your_"):
            reuse = input(f"Found existing RunPod API key in env.local ({default_key[:8]}...). Reuse it? [Y/n]: ").strip().lower()
            if reuse in ('', 'y', 'yes'):
                runpod_key = default_key
            else:
                runpod_key = input("Enter your RunPod API Key: ").strip()
        else:
            runpod_key = input("Enter your RunPod API Key: ").strip()

    if not runpod_key:
        print("[ERROR] RunPod API Key is required for deployment.")
        sys.exit(1)

    # Get CivitAI Token (default is the one in builder.py if not provided)
    civitai_token = args.civitai_token
    if not civitai_token:
        if not args.yes:
            civitai_token = input("Enter your CivitAI API Token (optional, press Enter to use default): ").strip()
        if not civitai_token:
            civitai_token = "daa65fe2bceb540c0a1a9e7cf2ab1245"

    # 4. Model selection
    choice = args.model
    if not choice:
        print("\nSelect the model you want to build and deploy:")
        print("1) Photorealistic SDXL Checkpoint (Photorealistic All-Purpose v4)")
        print("2) Pulsar Flux FP8 Checkpoint (Gay NSFW Base Model)")
        print("3) GAIJourney SD 1.5 Checkpoint (Gay Muscular Sexy Man Men)")
        print("4) All Models")
        sel = input("Enter selection [1-4]: ").strip()
        if sel == '1': choice = 'SDXL'
        elif sel == '2': choice = 'Flux'
        elif sel == '3': choice = 'SD15'
        elif sel == '4': choice = 'All'
        else: choice = 'SDXL'

    models_to_deploy = []
    if choice == 'All':
        models_to_deploy = ['SDXL', 'Flux', 'SD15']
    else:
        models_to_deploy = [choice]

    print(f"\nPreparing to build and deploy models: {', '.join(models_to_deploy)}")
    
    if not args.yes:
        confirm = input("Proceed? [Y/n]: ").strip().lower()
        if confirm not in ('', 'y', 'yes'):
            print("Deployment cancelled.")
            sys.exit(0)

    env_updates = {
        "RUNPOD_API_KEY": runpod_key
    }

    # Iterate models
    for model in models_to_deploy:
        model_tag = f"sneaky-imagen-{model.lower()}"
        full_image = f"{docker_username}/{model_tag}:latest"
        
        print_header(f"BUILDING AND DEPLOYING {model}")
        
        # A. Docker Build
        build_cmd = f"{docker_bin} build --build-arg MODEL_TYPE={model} --build-arg CIVITAI_TOKEN={civitai_token} -t {full_image} ."
        if not run_command(build_cmd, f"Docker Build for {model}"):
            print(f"[ERROR] Build failed for model {model}. Aborting.")
            sys.exit(1)
            
        # B. Docker Push
        push_cmd = f"{docker_bin} push {full_image}"
        if not run_command(push_cmd, f"Docker Push to {full_image}"):
            print(f"[ERROR] Push failed. Make sure you are logged in to your docker registry via '{docker_bin} login'.")
            sys.exit(1)

        # C. Create RunPod Template
        print("\nCreating Serverless Template on RunPod...")
        mutation = """
        mutation saveTemplate($input: SaveTemplateInput!) {
          saveTemplate(input: $input) {
            id
            name
          }
        }
        """
        
        disk_size = 25 if model == 'Flux' else 15
        
        variables = {
            "input": {
                "name": f"Sneaky-Imagen-{model}",
                "imageName": full_image,
                "containerDiskInGb": disk_size,
                "volumeInGb": 0,
                "env": [
                    {"key": "MODEL_TYPE", "value": model}
                ]
            }
        }
        
        res_data = query_runpod_graphql(runpod_key, mutation, variables)
        if not res_data or not res_data.get("saveTemplate"):
            print(f"[ERROR] Failed to create template for {model} on RunPod.")
            sys.exit(1)
            
        template_id = res_data["saveTemplate"]["id"]
        print(f"Created template: '{res_data['saveTemplate']['name']}' (ID: {template_id})")

        # D. Create Serverless Endpoint
        print("\nCreating Serverless Endpoint on RunPod...")
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
        
        endpoint_data = query_runpod_rest(runpod_key, "/endpoints", endpoint_payload)
        if not endpoint_data or not endpoint_data.get("id"):
            print(f"[ERROR] Failed to create serverless endpoint for {model}.")
            sys.exit(1)
            
        endpoint_id = endpoint_data["id"]
        print(f"Successfully deployed endpoint: '{endpoint_data['name']}' (ID: {endpoint_id})")
        
        env_updates[f"RUNPOD_ENDPOINT_ID_{model}"] = endpoint_id

    # Save Env changes
    save_env_vars(env_updates)
    
    print("\n" + "=" * 60)
    print(" DEPLOYMENT PROCESS COMPLETED SUCCESSFULLY")
    print("=" * 60)
    print("Credentials added to frontend/.env.local!")
    print("\nNext Steps:")
    print("1) Run frontend locally for testing:")
    print("   cd frontend && npm run dev")
    print("2) Push your changes and deploy the 'frontend' folder to Vercel!")
    print("=" * 60)

if __name__ == "__main__":
    main()
