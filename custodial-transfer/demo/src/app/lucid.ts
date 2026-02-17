// Lazy import for Lucid Evolution to avoid loading issues
let lucidModule: typeof import('@lucid-evolution/lucid') | null = null;

export async function loadLucidModule() {
    if (!lucidModule) {
        console.log('🔄 Lazy loading Lucid Evolution...');
        try {
            lucidModule = await import('@lucid-evolution/lucid');
            console.log('✅ Lucid Evolution loaded successfully');
            return lucidModule;
        } catch (error) {
            console.error('❌ Failed to load Lucid Evolution:', error);
            console.log('🔄 Trying alternative loading approach...');

            // Try a different approach - load without problematic dependencies
            try {
                // Force reload Vite dev server dependencies
                await new Promise(resolve => setTimeout(resolve, 1000));
                lucidModule = await import('@lucid-evolution/lucid');
                console.log('✅ Lucid Evolution loaded successfully on retry');
                return lucidModule;
            } catch (retryError) {
                console.error('❌ Retry also failed:', retryError);
                throw retryError;
            }
        }
    }
    return lucidModule;
}
