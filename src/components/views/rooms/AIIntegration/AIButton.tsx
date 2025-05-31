/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable matrix-org/require-copyright-header */
// src/components/views/rooms/AIIntegration/AIButton.tsx
import React, { useState, useCallback, useRef } from 'react';

import { getMCPClient } from '../../../../utils/MCPclient';
import { AudioRecorder, AudioPlayer, convertToWav } from '../../../../utils/AudioUtils';

interface AIButtonProps {
    selectedText?: string;
    onTextInsert?: (text: string) => void;
    className?: string;
}

type AIProvider = 'ai1' | 'ai2';
type AIMode = 'tts' | 'stt' | null;

interface AIState {
    isLoading: boolean;
    isRecording: boolean;
    isPlaying: boolean;
    error: string | null;
    currentMode: AIMode;
    selectedProvider: AIProvider;
}

export const AIButton: React.FC<AIButtonProps> = ({ 
    selectedText = '', 
    onTextInsert,
    className = ''
}) => {
    const [showMenu, setShowMenu] = useState(false);
    const [state, setState] = useState<AIState>({
        isLoading: false,
        isRecording: false,
        isPlaying: false,
        error: null,
        currentMode: null,
        selectedProvider: 'ai1'
    });
    
    const audioRecorderRef = useRef<AudioRecorder>(new AudioRecorder());
    const audioPlayerRef = useRef<AudioPlayer>(new AudioPlayer());
    const mcpClient = getMCPClient();
    
    const updateState = useCallback((updates: Partial<AIState>) => {
        setState(prev => ({ ...prev, ...updates }));
    }, []);
    
    const handleError = useCallback((error: string) => {
        updateState({ error, isLoading: false, isRecording: false });
        setTimeout(() => updateState({ error: null }), 5000);
    }, [updateState]);
    
    const handleTTS = useCallback(async (provider: AIProvider) => {
        const textToSpeak = selectedText.trim();
        
        if (!textToSpeak) {
            handleError('Aucun texte sélectionné pour la synthèse vocale');
            return;
        }
        
        updateState({ isLoading: true, currentMode: 'tts', selectedProvider: provider });
        setShowMenu(false);
        
        try {
            const response = await mcpClient.textToSpeech({
                text: textToSpeak,
                provider: provider
            });
            
            if (response.success && response.data) {
                await audioPlayerRef.current.playBlob(response.data);
                updateState({ isLoading: false, currentMode: null });
            } else {
                handleError(response.error || 'Erreur lors de la synthèse vocale');
            }
        } catch (error) {
            handleError(`Erreur TTS: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
        }
    }, [selectedText, mcpClient, updateState, handleError]);
    
    const startRecording = useCallback(async (provider: AIProvider) => {
        updateState({ currentMode: 'stt', selectedProvider: provider });
        setShowMenu(false);
        
        try {
            // Vérifier les permissions
            const hasPermission = await audioRecorderRef.current.requestPermission();
            if (!hasPermission) {
                handleError('Permission microphone requise pour la reconnaissance vocale');
                return;
            }
            
            await audioRecorderRef.current.startRecording();
            updateState({ isRecording: true });
            
        } catch (error) {
            handleError(`Erreur enregistrement: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
        }
    }, [updateState, handleError]);
    
    const stopRecording = useCallback(async () => {
        if (!state.isRecording) return;
        
        updateState({ isRecording: false, isLoading: true });
        
        try {
            const audioBlob = await audioRecorderRef.current.stopRecording();
            
            // Convertir en WAV si nécessaire
            const wavBlob = await convertToWav(audioBlob);
            
            const response = await mcpClient.speechToText(wavBlob, {
                provider: state.selectedProvider,
                language: 'fr-FR' // Adaptez selon vos besoins
            });
            
            if (response.success && response.data) {
                const transcribedText = response.data.text.trim();
                if (transcribedText && onTextInsert) {
                    onTextInsert(transcribedText);
                }
                updateState({ isLoading: false, currentMode: null });
            } else {
                handleError(response.error || 'Erreur lors de la reconnaissance vocale');
            }
            
        } catch (error) {
            handleError(`Erreur STT: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
        }
    }, [state.isRecording, state.selectedProvider, mcpClient, onTextInsert, updateState, handleError]);
    
    const stopAudio = useCallback(() => {
        audioPlayerRef.current.stop();
        updateState({ isPlaying: false, currentMode: null });
    }, [updateState]);
    
    const getButtonText = () => {
        if (state.isLoading) return '⏳';
        if (state.isRecording) return '🎤 Recording...';
        if (state.isPlaying) return '🔊';
        return '🤖 AI';
    };
    
    const getButtonColor = () => {
        if (state.error) return 'mx_AIButton--error';
        if (state.isRecording) return 'mx_AIButton--recording';
        if (state.isLoading) return 'mx_AIButton--loading';
        return '';
    };
    
    return (
        <div className={`mx_AIButton ${className}`}>
            <button 
                className={`mx_AIButton_main ${getButtonColor()}`}
                onClick={() => {
                    if (state.isRecording) {
                        stopRecording();
                    } else if (state.isPlaying) {
                        stopAudio();
                    } else {
                        setShowMenu(!showMenu);
                    }
                }}
                disabled={state.isLoading}
                title={state.error || 'Fonctionnalités IA'}
            >
                {getButtonText()}
            </button>
            
            {showMenu && !state.isLoading && (
                <div className="mx_AIButton_menu">
                    <div className="mx_AIButton_section">
                        <h4>Text-to-Speech</h4>
                        <button 
                            onClick={() => handleTTS('ai1')}
                            disabled={!selectedText.trim()}
                            className="mx_AIButton_option"
                        >
                            🔊 TTS - IA 1
                        </button>
                        <button 
                            onClick={() => handleTTS('ai2')}
                            disabled={!selectedText.trim()}
                            className="mx_AIButton_option"
                        >
                            🔊 TTS - IA 2
                        </button>
                    </div>
                    
                    <div className="mx_AIButton_section">
                        <h4>Speech-to-Text</h4>
                        <button 
                            onClick={() => startRecording('ai1')}
                            className="mx_AIButton_option"
                        >
                            🎤 STT - IA 1
                        </button>
                        <button 
                            onClick={() => startRecording('ai2')}
                            className="mx_AIButton_option"
                        >
                            🎤 STT - IA 2
                        </button>
                    </div>
                </div>
            )}
            
            {state.error && (
                <div className="mx_AIButton_error">
                    {state.error}
                </div>
            )}
        </div>
    );
};