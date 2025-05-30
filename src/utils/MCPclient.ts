/* eslint-disable matrix-org/require-copyright-header */
// src/utils/MCPClient.ts
export interface MCPConfig {
    baseUrl: string;
    timeout?: number;
    apiKey?: string;
}

export interface TTSRequest {
    text: string;
    provider: 'ai1' | 'ai2';
    voice?: string;
    speed?: number;
}

export interface STTRequest {
    provider: 'ai1' | 'ai2';
    language?: string;
}

export interface MCPResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

export class MCPClient {
    private config: MCPConfig;
    
    public constructor(config: MCPConfig) {
        this.config = {
            timeout: 30000,
            ...config
        };
    }
    
    private async makeRequest<T>(
        endpoint: string, 
        options: RequestInit
    ): Promise<MCPResponse<T>> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
        
        try {
            const headers: Record<string, string> = {
                ...(options.headers as Record<string, string> || {}),
            };
            
            if (this.config.apiKey) {
                headers['Authorization'] = `Bearer ${this.config.apiKey}`;
            }
            
            const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
                ...options,
                headers,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                return {
                    success: false,
                    error: `HTTP ${response.status}: ${response.statusText}`
                };
            }
            
            // Pour les réponses audio (TTS)
            if (response.headers.get('content-type')?.includes('audio')) {
                const blob = await response.blob();
                return {
                    success: true,
                    data: blob as T
                };
            }
            
            // Pour les réponses JSON (STT, erreurs)
            const data = await response.json();
            return {
                success: true,
                data: data as T
            };
            
        } catch (error) {
            clearTimeout(timeoutId);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Erreur inconnue'
            };
        }
    }
    
    public async textToSpeech(request: TTSRequest): Promise<MCPResponse<Blob>> {
        return this.makeRequest<Blob>('/api/tts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request)
        });
    }
    
    public async speechToText(audioBlob: Blob, request: STTRequest): Promise<MCPResponse<{text: string}>> {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.wav');
        formData.append('provider', request.provider);
        
        if (request.language) {
            formData.append('language', request.language);
        }
        
        return this.makeRequest<{text: string}>('/api/stt', {
            method: 'POST',
            body: formData
        });
    }
    
    // Test de connexion au serveur
    public async ping(): Promise<MCPResponse<{status: string}>> {
        return this.makeRequest<{status: string}>('/api/ping', {
            method: 'GET'
        });
    }
}

// Instance singleton
let mcpClientInstance: MCPClient | null = null;

export function getMCPClient(): MCPClient {
    if (!mcpClientInstance) {
        // Configuration par défaut - vous pouvez la modifier
        const config: MCPConfig = {
            baseUrl: process.env.REACT_APP_MCP_SERVER_URL || 'http://localhost:3000',
            apiKey: process.env.REACT_APP_MCP_API_KEY
        };
        mcpClientInstance = new MCPClient(config);
    }
    return mcpClientInstance;
}