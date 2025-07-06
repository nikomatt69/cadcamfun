// src/components/ai/ProactiveAssistant/VoiceInteractionHandler.tsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { Mic, MicOff, Volume2, VolumeX, Settings, Play, Square, RotateCcw, Check, AlertCircle } from "react-feather";
import { VoiceCommand } from "./types";

// Add type declarations for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
    SpeechRecognitionResultList: typeof SpeechRecognitionResultList;
  }

  interface SpeechRecognitionEvent extends Event {
    readonly resultIndex: number;
    readonly results: SpeechRecognitionResultList;
  }

  interface SpeechRecognitionResultList {
    readonly length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
  }

  interface SpeechRecognitionResult {
    readonly isFinal: boolean;
    readonly length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
  }

  interface SpeechRecognitionAlternative {
    readonly transcript: string;
    readonly confidence: number;
  }

  interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string; // Simplified, actual type is SpeechRecognitionErrorCode
    readonly message: string;
  }

  // Constructor for SpeechRecognition
  const SpeechRecognition: {
    prototype: SpeechRecognition;
    new (): SpeechRecognition;
  };

  interface SpeechRecognition extends EventTarget {
    grammars: SpeechGrammarList;
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    serviceURI: string;

    start(): void;
    stop(): void;
    abort(): void;

    onaudiostart: ((this: SpeechRecognition, ev: Event) => any) | null;
    onaudioend: ((this: SpeechRecognition, ev: Event) => any) | null;
    onend: ((this: SpeechRecognition, ev: Event) => any) | null;
    onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
    onnomatch: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
    onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
    onsoundstart: ((this: SpeechRecognition, ev: Event) => any) | null;
    onsoundend: ((this: SpeechRecognition, ev: Event) => any) | null;
    onspeechstart: ((this: SpeechRecognition, ev: Event) => any) | null;
    onspeechend: ((this: SpeechRecognition, ev: Event) => any) | null;
    onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  }

  interface SpeechGrammarList {
    readonly length: number;
    item(index: number): SpeechGrammar;
    [index: number]: SpeechGrammar;
    addFromURI(src: string, weight?: number): void;
    addFromString(string: string, weight?: number): void;
  }
  interface SpeechGrammar {
    src: string;
    weight: number;
  }
}

interface VoiceInteractionHandlerProps {
  /**
   * Controls whether voice interaction is currently active and listening for commands.
   * This state can be managed externally to integrate with overall assistant controls.
   */
  isActive: boolean;

  /**
   * Callback function triggered when a voice command is recognized and processed.
   * The command object contains intent, parameters, and confidence scoring.
   */
  onCommand: (command: VoiceCommand) => void;

  /**
   * Callback function for toggling voice interaction on/off from within the component.
   * This enables internal control while maintaining integration with parent components.
   */
  onToggle: () => void;

  /**
   * Configuration options for voice recognition behavior and speech synthesis settings.
   * This includes language preferences, confidence thresholds, and audio settings.
   */
  voiceConfig?: {
    language: string;
    confidenceThreshold: number;
    enableSpeechSynthesis: boolean;
    voiceResponseVolume: number;
    commandTimeout: number;
    enableContinuousListening: boolean;
  };

  /**
   * Optional callback for handling voice interaction errors and providing user feedback.
   * This enables graceful error handling and user guidance for voice interaction issues.
   */
  onError?: (error: string, code: string) => void;
}

/**
 * VoiceInteractionHandler provides comprehensive voice control capabilities for the G-code editing environment.
 * This component integrates speech recognition and synthesis to enable hands-free interaction with the AI assistant,
 * allowing users to issue commands, request explanations, and control editing operations through natural speech.
 *
 * The handler supports multiple languages, contextual command recognition, and intelligent intent parsing
 * to provide accurate and responsive voice-driven assistance during coding sessions.
 */
const VoiceInteractionHandler: React.FC<VoiceInteractionHandlerProps> = ({
  isActive,
  onCommand,
  onToggle,
  voiceConfig = {
    language: "en-US",
    confidenceThreshold: 0.7,
    enableSpeechSynthesis: true,
    voiceResponseVolume: 0.8,
    commandTimeout: 5000,
    enableContinuousListening: false
  },
  onError
}) => {
  // Voice interaction state management
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [lastCommand, setLastCommand] = useState<string>("");
  const [recognitionStatus, setRecognitionStatus] = useState<"idle" | "listening" | "processing" | "error">("idle");
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [supportedLanguages, setSupportedLanguages] = useState<string[]>([]);

  // Voice API references and configuration
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const commandTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Effect hook for initializing voice recognition and synthesis capabilities.
   * This sets up the necessary Web APIs and handles browser compatibility checks.
   */
  useEffect(() => {
    const initializeVoiceAPIs = async () => {
      try {
        // Initialize Speech Recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
          const recognition = new SpeechRecognition();

          // Configure recognition settings
          recognition.continuous = voiceConfig.enableContinuousListening;
          recognition.interimResults = true;
          recognition.lang = voiceConfig.language;
          recognition.maxAlternatives = 3;

          // Set up recognition event handlers
          recognition.onstart = handleRecognitionStart;
          recognition.onresult = handleRecognitionResult;
          recognition.onerror = handleRecognitionError;
          recognition.onend = handleRecognitionEnd;

          recognitionRef.current = recognition;
        } else {
          throw new Error("Speech recognition not supported in this browser");
        }

        // Initialize Speech Synthesis
        if ("speechSynthesis" in window) {
          synthesisRef.current = window.speechSynthesis;

          // Get available voices and languages
          const voices = speechSynthesis.getVoices();
          const languages = Array.from(new Set(voices.map(voice => voice.lang)));
          setSupportedLanguages(languages);
        } else {
          console.warn("Speech synthesis not supported in this browser");
        }

        // Initialize audio analysis for visual feedback
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const audioContext = new (window.AudioContext || window.AudioContext)();
          const analyser = audioContext.createAnalyser();
          const microphone = audioContext.createMediaStreamSource(stream);

          analyser.fftSize = 256;
          microphone.connect(analyser);

          audioContextRef.current = audioContext;
          analyserRef.current = analyser;
          microphoneRef.current = microphone;

          // Start audio level monitoring
          monitorAudioLevel();
        }
      } catch (error) {
        console.error("Failed to initialize voice APIs:", error);
        if (onError) {
          onError("Voice initialization failed", "INIT_ERROR");
        }
      }
    };

    initializeVoiceAPIs();

    // Cleanup on unmount
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (commandTimeoutRef.current) {
        clearTimeout(commandTimeoutRef.current);
      }
    };
  }, [voiceConfig, onError]);

  /**
   * Effect hook for managing active voice listening state.
   * This handles starting and stopping voice recognition based on the isActive prop.
   */
  useEffect(() => {
    if (isActive && recognitionRef.current) {
      startListening();
    } else if (!isActive && recognitionRef.current) {
      stopListening();
    }
  }, [isActive]);

  /**
   * Monitors audio input levels for visual feedback during voice interaction.
   * This provides users with real-time indication of microphone activity and sensitivity.
   */
  const monitorAudioLevel = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

    const updateAudioLevel = () => {
      if (analyserRef.current && isListening) {
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
        setAudioLevel(average / 255);
        requestAnimationFrame(updateAudioLevel);
      }
    };

    if (isListening) {
      updateAudioLevel();
    }
  }, [isListening]);

  /**
   * Starts voice recognition and sets up command timeout handling.
   * This function manages the complete listening session lifecycle.
   */
  const startListening = useCallback(() => {
    if (!recognitionRef.current || isListening) return;

    try {
      setRecognitionStatus("listening");
      setIsListening(true);
      recognitionRef.current.start();

      // Set command timeout
      if (voiceConfig.commandTimeout > 0) {
        commandTimeoutRef.current = setTimeout(() => {
          stopListening();
        }, voiceConfig.commandTimeout);
      }

      // Start audio level monitoring
      monitorAudioLevel();
    } catch (error) {
      console.error("Failed to start voice recognition:", error);
      if (onError) {
        onError("Could not start voice recognition", "START_ERROR");
      }
      setRecognitionStatus("error");
    }
  }, [isListening, voiceConfig.commandTimeout, monitorAudioLevel, onError]);

  /**
   * Stops voice recognition and cleans up active listening session.
   * This function handles graceful termination of voice interaction.
   */
  const stopListening = useCallback(() => {
    if (!recognitionRef.current || !isListening) return;

    try {
      recognitionRef.current.stop();
      setIsListening(false);
      setRecognitionStatus("idle");
      setAudioLevel(0);

      // Clear command timeout
      if (commandTimeoutRef.current) {
        clearTimeout(commandTimeoutRef.current);
        commandTimeoutRef.current = null;
      }
    } catch (error) {
      console.error("Error stopping voice recognition:", error);
    }
  }, [isListening]);

  /**
   * Handles speech recognition start events and updates component state accordingly.
   * This provides user feedback when voice recognition becomes active.
   */
  const handleRecognitionStart = useCallback(() => {
    setRecognitionStatus("listening");
    setIsListening(true);
  }, []);

  /**
   * Processes speech recognition results and converts them into actionable commands.
   * This function handles intent recognition, parameter extraction, and confidence validation.
   */
  const handleRecognitionResult = useCallback(
    (event: SpeechRecognitionEvent) => {
      const results = Array.from(event?.results || []);
      const latestResult = results[results.length - 1];

      if (latestResult && latestResult.isFinal) {
        setRecognitionStatus("processing");

        const transcript = latestResult[0]?.transcript?.toLowerCase().trim() || "";
        const confidence = latestResult[0]?.confidence || 0;

        setLastCommand(transcript);

        // Check confidence threshold
        if (confidence < voiceConfig.confidenceThreshold) {
          if (onError) {
            onError("Voice command not clear enough", "LOW_CONFIDENCE");
          }
          setRecognitionStatus("error");
          return;
        }

        // Parse command intent and parameters
        const command = parseVoiceCommand(transcript, confidence);

        if (command) {
          // Execute the parsed command
          onCommand(command);

          // Provide voice feedback if enabled
          if (voiceConfig.enableSpeechSynthesis) {
            speakResponse(`Command recognized: ${command.intent}`);
          }

          setRecognitionStatus("idle");
        } else {
          if (onError) {
            onError("Command not recognized", "PARSE_ERROR");
          }
          setRecognitionStatus("error");
        }
      }
    },
    [voiceConfig, onCommand, onError]
  );

  /**
   * Handles speech recognition errors and provides appropriate user feedback.
   * This function manages error recovery and user guidance for voice interaction issues.
   */
  const handleRecognitionError = useCallback(
    (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      setRecognitionStatus("error");

      const errorMessages: Record<string, string> = {
        "no-speech": "No speech detected. Please try speaking again.",
        "audio-capture": "Microphone access denied or unavailable.",
        "not-allowed": "Microphone permission denied.",
        "network": "Network error during voice recognition.",
        "service-not-allowed": "Voice recognition service unavailable."
      };

      const message = errorMessages[event.error] || "Voice recognition error occurred";

      if (onError) {
        onError(message, event.error.toUpperCase());
      }
    },
    [onError]
  );

  /**
   * Handles speech recognition end events and manages session cleanup.
   * This ensures proper state management when voice recognition terminates.
   */
  const handleRecognitionEnd = useCallback(() => {
    setIsListening(false);
    if (recognitionStatus !== "error") {
      setRecognitionStatus("idle");
    }
    setAudioLevel(0);
  }, [recognitionStatus]);

  /**
   * Parses voice commands into structured command objects with intent and parameters.
   * This function implements natural language processing for G-code specific commands.
   */
  const parseVoiceCommand = useCallback((transcript: string, confidence: number): VoiceCommand | null => {
    // Define command patterns and their corresponding intents
    const commandPatterns = [
      {
        pattern: /(?:generate|create|make)\s+(?:g-?code|program|toolpath)?\s*(?:for|to)?\s*(.*)/i,
        intent: "generate" as const,
        extractor: (match: RegExpMatchArray) => ({ description: match[1]?.trim() || "" })
      },
      {
        pattern: /(?:optimize|improve|enhance)\s*(?:this|the)?\s*(?:code|program)?/i,
        intent: "optimize" as const,
        extractor: () => ({ type: "balanced" })
      },
      {
        pattern: /(?:explain|describe|tell me about)\s*(?:this|the)?\s*(?:code|command|line)?/i,
        intent: "explain" as const,
        extractor: () => ({})
      },
      {
        pattern: /(?:go to|navigate to|jump to)\s*line\s*(\d+)/i,
        intent: "navigate" as const,
        extractor: (match: RegExpMatchArray) => ({ line: parseInt(match[1]) })
      },
      {
        pattern: /(?:insert|add|put)\s*(.*?)(?:\s+at\s+line\s+(\d+))?/i,
        intent: "edit" as const,
        extractor: (match: RegExpMatchArray) => ({
          action: "insert",
          content: match[1]?.trim() || "",
          line: match[2] ? parseInt(match[2]) : undefined
        })
      },
      {
        pattern: /(?:delete|remove)\s*line\s*(\d+)/i,
        intent: "edit" as const,
        extractor: (match: RegExpMatchArray) => ({
          action: "delete",
          line: parseInt(match[1])
        })
      }
    ];

    // Try to match the transcript against known patterns
    for (const { pattern, intent, extractor } of commandPatterns) {
      const match = transcript.match(pattern);
      if (match) {
        const parameters = extractor(match);

        return {
          command: transcript,
          intent,
          parameters,
          confidence
        };
      }
    }

    // If no specific pattern matches, treat as a general query
    if (transcript.length > 0) {
      return {
        command: transcript,
        intent: "generate",
        parameters: { description: transcript },
        confidence
      };
    }

    return null;
  }, []);

  /**
   * Provides voice feedback using speech synthesis for command confirmation and responses.
   * This enhances the voice interaction experience with audio feedback.
   */
  const speakResponse = useCallback(
    (text: string) => {
      if (!voiceConfig.enableSpeechSynthesis || !synthesisRef.current) return;

      // Cancel any ongoing speech
      synthesisRef.current.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.volume = voiceConfig.voiceResponseVolume;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      // Try to use a voice that matches the recognition language
      const voices = synthesisRef.current.getVoices();
      const matchingVoice = voices.find(voice => voice.lang === voiceConfig.language);
      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      synthesisRef.current.speak(utterance);
    },
    [voiceConfig]
  );

  /**
   * Retries the last voice command when recognition fails or confidence is low.
   * This provides users with a convenient way to repeat commands without starting over.
   */
  const retryLastCommand = useCallback(() => {
    if (lastCommand) {
      const command = parseVoiceCommand(lastCommand, 1.0);
      if (command) {
        onCommand(command);
        setRecognitionStatus("idle");
      }
    }
  }, [lastCommand, parseVoiceCommand, onCommand]);

  // Render voice interaction interface with status indicators and controls
  return (
    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className={`p-2 rounded-full ${isActive ? "bg-green-100 text-green-600" : "bg-gray-200 text-gray-400"}`}>
            {isListening ? <Mic size={16} /> : <MicOff size={16} />}
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Voice Control</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {recognitionStatus === "listening"
                ? "Listening..."
                : recognitionStatus === "processing"
                  ? "Processing..."
                  : recognitionStatus === "error"
                    ? "Error occurred"
                    : "Ready"}
            </p>
          </div>
        </div>

        {/* Toggle Button */}
        <button
          onClick={onToggle}
          className={`p-2 rounded-lg transition-colors ${
            isActive ? "bg-red-500 hover:bg-red-600 text-white" : "bg-blue-500 hover:bg-blue-600 text-white"
          }`}
          title={isActive ? "Stop voice control" : "Start voice control"}
        >
          {isActive ? <Square size={16} /> : <Play size={16} />}
        </button>
      </div>

      {/* Audio Level Indicator */}
      {isListening && (
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Volume2 size={14} className="text-gray-500" />
            <div className="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all duration-100"
                style={{ width: `${audioLevel * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">{Math.round(audioLevel * 100)}%</span>
          </div>
        </div>
      )}

      {/* Status Information */}
      <div className="space-y-2">
        {/* Last Command */}
        {lastCommand && (
          <div className="bg-white dark:bg-gray-600 rounded p-2">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Last Command:</p>
                <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{lastCommand}</p>
              </div>

              {recognitionStatus === "error" && (
                <button
                  onClick={retryLastCommand}
                  className="p-1 rounded bg-blue-500 hover:bg-blue-600 text-white text-xs"
                  title="Retry last command"
                >
                  <RotateCcw size={12} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Status Indicators */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            {recognitionStatus === "listening" && (
              <div className="flex items-center space-x-1 text-green-600">
                <div className="animate-pulse w-2 h-2 bg-green-500 rounded-full" />
                <span>Listening for commands</span>
              </div>
            )}

            {recognitionStatus === "processing" && (
              <div className="flex items-center space-x-1 text-blue-600">
                <div className="animate-spin w-2 h-2 border border-blue-500 border-t-transparent rounded-full" />
                <span>Processing command</span>
              </div>
            )}

            {recognitionStatus === "error" && (
              <div className="flex items-center space-x-1 text-red-600">
                <AlertCircle size={12} />
                <span>Command failed</span>
              </div>
            )}

            {recognitionStatus === "idle" && lastCommand && (
              <div className="flex items-center space-x-1 text-green-600">
                <Check size={12} />
                <span>Command executed</span>
              </div>
            )}
          </div>

          {isSpeaking && (
            <div className="flex items-center space-x-1 text-purple-600">
              <Volume2 size={12} />
              <span>Speaking...</span>
            </div>
          )}
        </div>
      </div>

      {/* Voice Commands Help */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded p-2">
        <p className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-1">Try saying:</p>
        <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
          <li>• Generate code for drilling holes</li>
          <li>• Optimize this code</li>
          <li>• Explain this command</li>
          <li>• Go to line 25</li>
        </ul>
      </div>
    </div>
  );
};

export default VoiceInteractionHandler;
