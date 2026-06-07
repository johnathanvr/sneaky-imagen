import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      modelType,
      prompt,
      negativePrompt,
      width,
      height,
      steps,
      cfgScale,
      seed,
      scheduler,
      clipSkip,
      outputFormat,
      outputQuality,
      password,
    } = body;

    // 1. Password authentication check (if APP_PASSWORD is set)
    const appPassword = process.env.APP_PASSWORD;
    if (appPassword && password !== appPassword) {
      return NextResponse.json({ error: 'Unauthorized: Invalid password' }, { status: 401 });
    }

    // 2. RunPod API credentials check
    const apiKey = process.env.RUNPOD_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Server configuration error: RUNPOD_API_KEY is not configured' },
        { status: 500 }
      );
    }

    // 3. Select appropriate endpoint based on model size
    let endpointId = '';
    if (modelType === 'SD15') {
      endpointId = process.env.RUNPOD_ENDPOINT_ID_SD15;
    } else if (modelType === 'SDXL') {
      endpointId = process.env.RUNPOD_ENDPOINT_ID_SDXL;
    } else if (modelType === 'Flux') {
      endpointId = process.env.RUNPOD_ENDPOINT_ID_FLUX;
    } else {
      return NextResponse.json({ error: 'Invalid model type specified' }, { status: 400 });
    }

    if (!endpointId || endpointId.includes('your_')) {
      return NextResponse.json(
        { error: `RunPod Endpoint ID for ${modelType} is not configured on the server. Please set RUNPOD_ENDPOINT_ID_${modelType} in the environment.` },
        { status: 400 }
      );
    }

    // 4. Construct payload for RunPod serverless worker
    const inputPayload = {
      prompt,
      width: parseInt(width) || 1024,
      height: parseInt(height) || 1024,
      steps: parseInt(steps) || 30,
      cfg_scale: parseFloat(cfgScale) || 7.0,
      scheduler: scheduler || 'Euler a',
      output_format: outputFormat || 'JPEG',
      output_quality: parseInt(outputQuality) || 90,
    };

    // Only include negative prompt and clip skip for non-Flux models
    if (modelType !== 'Flux') {
      inputPayload.negative_prompt = negativePrompt || '';
    }
    if (modelType === 'SDXL' && clipSkip) {
      inputPayload.clip_skip = parseInt(clipSkip) || 2;
    }
    if (seed !== null && seed !== undefined && seed !== '') {
      inputPayload.seed = parseInt(seed);
    }

    console.log(`Sending job to RunPod endpoint ${endpointId} for model ${modelType}`);

    // 5. Trigger the serverless run
    const runpodUrl = `https://api.runpod.ai/v1/${endpointId}/run`;
    const response = await fetch(runpodUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input: inputPayload }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `RunPod API returned error: ${response.statusText}. Details: ${errorText}` },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json({ jobId: result.id, status: result.status });
  } catch (error) {
    console.error('Generation API error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
export const runtime = 'nodejs';
