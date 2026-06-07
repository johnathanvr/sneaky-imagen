import { NextResponse } from 'next/server';

export async function GET(request, props) {
  const params = await props.params;
  try {
    const { jobId } = params;
    const { searchParams } = new URL(request.url);
    const modelType = searchParams.get('modelType');
    const password = searchParams.get('password');

    // 1. Password check
    const appPassword = process.env.APP_PASSWORD;
    if (appPassword && password !== appPassword) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Select appropriate endpoint
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

    const apiKey = process.env.RUNPOD_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'RUNPOD_API_KEY is not configured' }, { status: 500 });
    }

    if (!endpointId) {
      return NextResponse.json({ error: `Endpoint ID for ${modelType} is not configured` }, { status: 500 });
    }

    // 3. Query RunPod job status
    const statusUrl = `https://api.runpod.ai/v1/${endpointId}/status/${jobId}`;
    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `RunPod status query failed: ${response.statusText}` },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Status API error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
export const runtime = 'nodejs';
