import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { cookies } from 'next/headers';

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    // Forward the Supabase Auth Cookie to our Go Backend
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('sb-localhost-auth-token')?.value || '';

    // Parse the incoming chat messages from the Vercel AI SDK
    const { messages } = await req.json();

    const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:4001';

    // Create a custom OpenAI provider instance that points to our Go Backend Proxy
    const openclawProvider = createOpenAI({
        baseURL: `${backendUrl}/api/projects/${id}`,
        apiKey: 'dummy-key', // The Go Backend will securely inject the real Gateway authorization token
        fetch: async (url, options) => {
            // Inject the user's Supabase session so the Go Backend accepts the proxied request
            const headers = new Headers(options?.headers);
            if (sessionToken) {
                headers.set('Cookie', `sb-localhost-auth-token=${sessionToken}`);
            }
            return fetch(url, { ...options, headers });
        }
    });

    // Call the model via our custom provider. The model string is largely ignored by "main" agent unless routing
    const result = streamText({
        model: openclawProvider.chat('openclaw:main'),
        messages,
    });

    return result.toTextStreamResponse();
}
