/* eslint-disable matrix-org/require-copyright-header */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
// src/utils/AudioUtils.ts
export class AudioRecorder {
    private mediaRecorder: MediaRecorder | null = null;
    private stream: MediaStream | null = null;
    private chunks: Blob[] = [];
    private isRecording = false;
    
    public async requestPermission(): Promise<boolean> {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch (error) {
            console.error('Microphone permission denied:', error);
            return false;
        }
    }
    
    public async startRecording(): Promise<void> {
        if (this.isRecording) {
            throw new Error('Enregistrement déjà en cours');
        }
        
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000
                } 
            });
            
            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            
            this.chunks = [];
            this.isRecording = true;
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.chunks.push(event.data);
                }
            };
            
            this.mediaRecorder.start(100); // Collecte des données toutes les 100ms
            
        } catch (error) {
            this.cleanup();
            throw new Error(`Impossible de démarrer l'enregistrement: ${error}`);
        }
    }
    
    public async stopRecording(): Promise<Blob> {
        return new Promise((resolve, reject) => {
            if (!this.mediaRecorder || !this.isRecording) {
                reject(new Error('Aucun enregistrement en cours'));
                return;
            }
            
            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.chunks, { type: 'audio/webm;codecs=opus' });
                this.cleanup();
                resolve(audioBlob);
            };
            
            this.mediaRecorder.onerror = (event) => {
                this.cleanup();
                reject(new Error('Erreur lors de l\'enregistrement'));
            };
            
            this.mediaRecorder.stop();
        });
    }
    
    private cleanup(): void {
        this.isRecording = false;
        
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        this.mediaRecorder = null;
        this.chunks = [];
    }
    
    public getRecordingState(): boolean {
        return this.isRecording;
    }
}

export class AudioPlayer {
    private audio: HTMLAudioElement | null = null;
    
    public async playBlob(audioBlob: Blob): Promise<void> {
        return new Promise((resolve, reject) => {
            const audioUrl = URL.createObjectURL(audioBlob);
            this.audio = new Audio(audioUrl);
            
            this.audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                this.audio = null;
                resolve();
            };
            
            this.audio.onerror = () => {
                URL.revokeObjectURL(audioUrl);
                this.audio = null;
                reject(new Error('Erreur lors de la lecture audio'));
            };
            
            this.audio.play().catch(reject);
        });
    }
    
    public stop(): void {
        if (this.audio) {
            this.audio.pause();
            this.audio = null;
        }
    }
    
    public isPlaying(): boolean {
        return this.audio ? !this.audio.paused : false;
    }
}

// Convertir WebM vers WAV si nécessaire
export async function convertToWav(webmBlob: Blob): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const audioContext = new AudioContext();
        const fileReader = new FileReader();
        
        fileReader.onload = async (e) => {
            try {
                const arrayBuffer = e.target?.result as ArrayBuffer;
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                
                // Conversion simple vers WAV
                const wavBuffer = audioBufferToWav(audioBuffer);
                const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
                
                resolve(wavBlob);
            } catch (error) {
                reject(error);
            }
        };
        
        fileReader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
        fileReader.readAsArrayBuffer(webmBlob);
    });
}

// Fonction utilitaire pour convertir AudioBuffer vers WAV
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
    const length = buffer.length;
    const sampleRate = buffer.sampleRate;
    const arrayBuffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(arrayBuffer);
    const channels = buffer.numberOfChannels;
    
    // En-tête WAV
    const writeString = (offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);
    
    // Données audio
    const channelData = buffer.getChannelData(0);
    let offset = 44;
    for (let i = 0; i < length; i++) {
        const sample = Math.max(-1, Math.min(1, channelData[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
    }
    
    return arrayBuffer;
}