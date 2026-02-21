import { createOpenAI } from '@ai-sdk/openai';
import { streamText, convertToModelMessages, UIMessage } from 'ai';
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

    // Parse the incoming chat payload from the Vercel AI SDK v6 DefaultChatTransport
    // The transport sends { id, messages (UIMessage[]), trigger, messageId }
    const body = await req.json();
    const uiMessages: UIMessage[] = body.messages ?? [];

    // Convert UIMessage[] (parts-based) to ModelMessage[] (content-based) for the LLM
    const modelMessages = await convertToModelMessages(uiMessages);

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

    // Call the model via our custom provider
    const result = streamText({
        model: openclawProvider.chat('openclaw:main'),
        messages: modelMessages,
    });

    // Return in UIMessageStream format which DefaultChatTransport expects
    return result.toUIMessageStreamResponse();
}
