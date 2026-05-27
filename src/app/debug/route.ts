export async function GET() {
  const backend = process.env.BACKEND_URL || 'NOT SET - using localhost:8000';

  // Try a live request to the backend
  let backendTest: unknown = 'not tested';
  try {
    const res = await fetch(`${process.env.BACKEND_URL || 'http://localhost:8000'}/health`);
    backendTest = await res.json();
  } catch (e) {
    backendTest = `FAILED: ${e instanceof Error ? e.message : String(e)}`;
  }

  return Response.json({ BACKEND_URL: backend, backendHealthCheck: backendTest });
}
