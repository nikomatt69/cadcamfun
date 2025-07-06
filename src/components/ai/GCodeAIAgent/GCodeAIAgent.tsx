import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  X,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  Send,
  Zap,
  Code,
  Search,
  RefreshCw,
  CornerUpRight,
  Cpu,
  Settings,
  Trash2,
  Info,
  HelpCircle,
  Image,
  FileText,
  AtSign,
  Command,
  Sliders,
  Wind,
  Edit,
  ChevronLeft,
  ChevronRight
} from "react-feather";
import useGCodeAI, {
  GCodeMessage,
  GCodeAnalysisResult,
  GCodeOptimizationResult,
  GCodeCompletion
} from "@/src/hooks/useGCodeAI";
import ChatMessage from "./ChatMessage";
import AnalysisPanel from "./AnalysisPanel";
import OptimizationPanel from "./OptimizationPanel";
import GenerationPanel from "./GenerationPanel";
import { useGCodeEditor } from "@/src/contexts/GCodeEditorContext";

// Import our new components
import { CommandMenu, ReferenceMenu, QuickEditDialog, ModeTab, ModeTabProps, GCodeAutocomplete } from "./components";

interface GCodeAIAgentProps {
  gcode: string;
  onUpdateGCode?: (newGCode: string) => void;
  onClose?: () => void;
  isExpanded?: boolean;
  defaultMode?: "chat" | "analyze" | "optimize" | "generate";
  fileName?: string;
  selectedCode?: string;
  onInsertSnippet?: (snippet: string) => void;
}

export type AIAgentMode = "chat" | "analyze" | "optimize" | "generate";

const GCodeAIAgent: React.FC<GCodeAIAgentProps> = ({
  gcode,
  onUpdateGCode,
  onClose,
  isExpanded = true,
  defaultMode = "chat",
  fileName = "untitled.gcode",
  selectedCode = "",
  onInsertSnippet
}) => {
  // Accesso al context
  const editorContext = useGCodeEditor();

  // Core states
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeMode, setActiveMode] = useState<AIAgentMode>(defaultMode);
  const [inputValue, setInputValue] = useState<string>("");
  const [expanded, setExpanded] = useState<boolean>(isExpanded);
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);
  const [imageAttachments, setImageAttachments] = useState<{ file: File; preview: string }[]>([]);

  // UI interaction states
  const [showCommandMenu, setShowCommandMenu] = useState<boolean>(false);
  const [showReferenceMenu, setShowReferenceMenu] = useState<boolean>(false);
  const [showQuickEdit, setShowQuickEdit] = useState<boolean>(false);
  const [quickEditSelection, setQuickEditSelection] = useState<string>("");
  const [chatMode, setChatMode] = useState<"normal" | "gather" | "agent">("normal");

  // Autocomplete state
  const [showAutocomplete, setShowAutocomplete] = useState<boolean>(false);
  const [autocompletePosition, setAutocompletePosition] = useState<{ top: number; left: number } | null>(null);
  const [completionSuggestions, setCompletionSuggestions] = useState<GCodeCompletion[]>([]);
  const [isLoadingCompletions, setIsLoadingCompletions] = useState<boolean>(false);
  const [recentCommands, setRecentCommands] = useState<string[]>([]);
  const [autocompleteDebounceTimeout, setAutocompleteDebounceTimeout] = useState<NodeJS.Timeout | null>(null);

  // Refs for DOM manipulation
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use the GCode AI hook
  const {
    chatMessages,
    isGenerating,
    isOptimizing,
    isAnalyzing,
    isSendingMessage,
    addUserMessage,
    sendChatMessage,
    clearChatHistory,
    generateGCode,
    optimizeGCode,
    analyzeGCode,
    explainGCode,
    getGCodeCompletions,
    lastAnalysisResult,
    lastOptimizationResult
  } = useGCodeAI();

  // Useeffect per sincronizzare con il context
  useEffect(() => {
    // Se esiste il context dell'editor, aggiorna il selectedCode
    if (editorContext && editorContext.selectedText !== undefined) {
      setQuickEditSelection(editorContext.selectedText);

      // Se c'è una selezione e il context vuole mostrare quickEdit, mostra il dialog
      if (editorContext.showQuickEdit && editorContext.selectedText) {
        setShowQuickEdit(true);
      }
    }
  }, [editorContext?.selectedText, editorContext?.showQuickEdit]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Set loading state based on AI operations
  useEffect(() => {
    setIsLoading(isGenerating || isOptimizing || isAnalyzing || isSendingMessage || uploadingImage);
  }, [isGenerating, isOptimizing, isAnalyzing, isSendingMessage, uploadingImage]);

  // Auto-resize textarea for input
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [inputValue]);

  // Calculate autocomplete position
  useEffect(() => {
    const calculatePosition = () => {
      if (inputRef.current && activeMode === "generate" && inputValue.trim().length >= 2) {
        // Get cursor position
        const cursorPosition = inputRef.current.selectionStart;

        // Get text until cursor
        const textUntilCursor = inputValue.substring(0, cursorPosition);

        // Check if we should trigger autocomplete
        const shouldShowAutocomplete =
          // If text has G or M commands
          /[GM]\d+/.test(textUntilCursor) ||
          // Or if in the middle of a parameter
          /[XYZ]\-?\d*\.?\d*$/.test(textUntilCursor);

        if (shouldShowAutocomplete) {
          // Position depends on cursor location in textarea
          const textHeight = parseInt(getComputedStyle(inputRef.current).lineHeight);
          const lines = textUntilCursor.split("\n");
          const lineIndex = lines.length - 1;

          // Calculate position
          const rect = inputRef.current.getBoundingClientRect();
          const scrollTop = inputRef.current.scrollTop;

          setShowAutocomplete(true);
          setAutocompletePosition({
            top: -textHeight * (lineIndex + 2) - 10,
            left: 10
          });

          // Get autocompletions
          fetchAutocompletions(textUntilCursor);
        } else {
          setShowAutocomplete(false);
        }
      } else {
        setShowAutocomplete(false);
      }
    };

    // If we're in generate mode, calculate position
    if (activeMode === "generate") {
      calculatePosition();
    } else {
      setShowAutocomplete(false);
    }
  }, [inputValue, activeMode]);

  // Fetch autocompletions with debounce
  const fetchAutocompletions = (context: string) => {
    // Clear previous timeout
    if (autocompleteDebounceTimeout) {
      clearTimeout(autocompleteDebounceTimeout);
    }

    // Set new timeout
    const timeout = setTimeout(async () => {
      if (context.trim().length < 2) return;

      setIsLoadingCompletions(true);
      try {
        const suggestions = await getGCodeCompletions(context, {
          limit: 5,
          cursorPosition: inputRef.current?.selectionStart || 0,
          recentCommands,
          mode: chatMode
        });

        setCompletionSuggestions(suggestions);
      } catch (error) {
        console.error("Error fetching completions:", error);
        setCompletionSuggestions([]);
      } finally {
        setIsLoadingCompletions(false);
      }
    }, 300); // Debounce time

    setAutocompleteDebounceTimeout(timeout);
  };

  // Handle autocomplete selection
  const handleSelectCompletion = (completion: string) => {
    if (inputRef.current) {
      const cursorPosition = inputRef.current.selectionStart || 0;

      // Find word to replace
      const textBeforeCursor = inputValue.substring(0, cursorPosition);
      const textAfterCursor = inputValue.substring(cursorPosition);

      // Search for last word/token before cursor
      const tokenMatch = textBeforeCursor.match(/([GM]\d+|[XYZ][-]?\d*\.?\d*)$/);

      if (tokenMatch) {
        const tokenStart = tokenMatch.index || 0;
        const newText = textBeforeCursor.substring(0, tokenStart) + completion + textAfterCursor;
        setInputValue(newText);

        // Add to recent commands if it's a G or M code command
        if (/^[GM]\d+/.test(completion)) {
          setRecentCommands(prev => {
            const newRecent = [completion, ...prev.filter(cmd => cmd !== completion)].slice(0, 10);
            return newRecent;
          });
        }
      } else {
        // Just insert at cursor
        setInputValue(textBeforeCursor + completion + textAfterCursor);
      }

      setShowAutocomplete(false);
    }
  };

  // Handle sending a message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if ((!inputValue.trim() && imageAttachments.length === 0) || isLoading) return;

    // Check for command
    if (inputValue.startsWith("/")) {
      const commandResult = handleCommand(inputValue);
      if (commandResult) {
        setInputValue("");
        return;
      }
    }

    // Process the message based on the active mode
    if (activeMode === "chat") {
      // Prepare message with any image attachments
      let messageContent = inputValue;

      // Process and add the message with images by passing a single object argument
      await sendChatMessage({
        content: messageContent,
        attachments: imageAttachments.map(img => img.file)
      });

      // Clear input and attachments
      setInputValue("");
      setImageAttachments([]);
    } else if (activeMode === "generate") {
      const generatedCode = await generateGCode(inputValue);
      if (generatedCode && onUpdateGCode) {
        onUpdateGCode(generatedCode);
      }
      setInputValue("");
    }
  };

  // Handle keyboard commands in input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // If autocomplete is showing, let it handle keyboard events
    if (showAutocomplete) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === "Tab" || e.key === "Escape") {
        // These keys are handled by the autocomplete component
        return;
      }
    }

    // Enter without shift sends message
    if (e.key === "Enter" && !e.shiftKey && !isLoading) {
      e.preventDefault();
      handleSendMessage();
    }

    // Tab or / opens command menu
    if (e.key === "Tab" && showCommandMenu) {
      e.preventDefault();
      // Focus first command
    }

    // / at beginning of line opens command menu
    if (e.key === "/" && inputValue === "") {
      setShowCommandMenu(true);
      setShowReferenceMenu(false);
    }

    // @ opens the reference menu
    if (e.key === "@") {
      setShowReferenceMenu(true);
      setShowCommandMenu(false);
    }

    // Escape closes menus
    if (e.key === "Escape") {
      setShowCommandMenu(false);
      setShowReferenceMenu(false);
      setShowQuickEdit(false);
      setShowAutocomplete(false);
    }
  };

  // Handle input changes to update autocompletions
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);

    // Clear menus
    setShowCommandMenu(false);
    setShowReferenceMenu(false);

    // If it's a generate mode, we will trigger autocompletion in useEffect
    if (activeMode === "generate" && e.target.value.trim().length >= 2) {
      // Autocomplete will be triggered in useEffect
    }
  };

  // Handle command execution (/help, /normal, /agent, etc.)
  const handleCommand = (command: string): boolean => {
    const cmd = command.trim().toLowerCase();

    if (cmd === "/help") {
      // Add system message with help info
      addUserMessage("/help");
      const helpMessage: GCodeMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content: `**Available Commands:**
- \`/normal\` - Activate normal chat mode
- \`/gather\` - Activate Gather mode (AI will ask more questions)
- \`/agent\` - Activate Agent mode (AI can perform actions)
- \`/optimize\` - Optimize selected G-code
- \`/analyze\` - Analyze G-code for issues
- \`/explain\` - Explain what selected G-code does
- \`/generate\` - Generate G-code from description
- \`/clear\` - Clear chat history`,
        timestamp: new Date()
      };

      // Add to messages (need to use the hook's internal method)
      addSystemMessage(helpMessage);
      return true;
    }

    if (cmd === "/normal") {
      setChatMode("normal");
      addSystemMessage({
        id: Date.now().toString(),
        role: "system",
        content: "Normal mode activated. How can I help you with your G-code?",
        timestamp: new Date()
      });
      return true;
    }

    if (cmd === "/gather") {
      setChatMode("gather");
      addSystemMessage({
        id: Date.now().toString(),
        role: "system",
        content: "Gather mode activated. I'll ask more questions to understand your needs better.",
        timestamp: new Date()
      });
      return true;
    }

    if (cmd === "/agent") {
      setChatMode("agent");
      addSystemMessage({
        id: Date.now().toString(),
        role: "system",
        content:
          "Agent mode activated. I can now perform actions on your G-code such as analyzing, optimizing, and explaining.",
        timestamp: new Date()
      });
      return true;
    }

    if (cmd === "/optimize") {
      if (editorContext?.selectedText || selectedCode || gcode) {
        setActiveMode("optimize");
        return true;
      }
    }

    if (cmd === "/analyze") {
      if (gcode) {
        setActiveMode("analyze");
        return true;
      }
    }

    if (cmd === "/generate") {
      setActiveMode("generate");
      return true;
    }

    if (cmd === "/explain") {
      if (editorContext?.selectedText || selectedCode || gcode) {
        handleExplainCode();
        return true;
      }
    }

    if (cmd === "/clear") {
      clearChatHistory();
      return true;
    }

    return false;
  };

  // Hack - this would normally be part of the hook, but we're adding it here for demo
  const addSystemMessage = (message: GCodeMessage) => {
    // In a real implementation, this would be in the useGCodeAI hook
    // For now, we'll just manually add it to the chatMessages state
    // @ts-ignore - we're directly manipulating the hook's internal state, which is not ideal
    chatMessages.push(message);
  };

  // Handle analyzing the current code
  const handleAnalyzeCode = async () => {
    // Usa prima il codice selezionato dal context, poi dalla prop, poi tutto il gcode
    const codeToAnalyze = editorContext?.selectedText || selectedCode || gcode;

    if (!codeToAnalyze.trim() || isLoading) return;
    setActiveMode("analyze");
    await analyzeGCode(codeToAnalyze);
  };

  // Handle optimizing the current code
  const handleOptimizeCode = async (type: "speed" | "quality" | "balanced" = "balanced") => {
    // Usa prima il codice selezionato dal context, poi dalla prop, poi tutto il gcode
    const codeToOptimize = editorContext?.selectedText || selectedCode || gcode;

    if (!codeToOptimize.trim() || isLoading) return;
    setActiveMode("optimize");
    const result = await optimizeGCode(codeToOptimize, { optimizationType: type });
    if (result && onUpdateGCode) {
      // Se stiamo ottimizzando una selezione, sostituisci solo quella parte
      if (editorContext?.selectedText && editorContext.replaceSelection) {
        editorContext.replaceSelection(result.code);
      } else {
        onUpdateGCode(result.code);
      }
    }
  };

  // Handle explaining code
  const handleExplainCode = async () => {
    // Usa prima il codice selezionato dal context, poi dalla prop, poi tutto il gcode
    const codeToExplain = editorContext?.selectedText || selectedCode || gcode;

    if (!codeToExplain.trim() || isLoading) return;

    await explainGCode(codeToExplain);
  };

  // Handle applying the generated code
  const handleApplyGenerated = (generatedCode: string) => {
    if (!generatedCode.trim()) return;

    // Se c'è il context e c'è una selezione, sostituisci solo la selezione
    if (editorContext?.selectedText && editorContext.replaceSelection) {
      editorContext.replaceSelection(generatedCode);
    }
    // Altrimenti usa il callback standard
    else if (onUpdateGCode) {
      onUpdateGCode(generatedCode);
    }
  };

  // Handle file upload for images
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      const imageFiles = newFiles.filter(file => file.type.startsWith("image/"));

      // Create previews for images
      const newImageAttachments = imageFiles.map(file => {
        const preview = URL.createObjectURL(file);
        return { file, preview };
      });

      setImageAttachments(prev => [...prev, ...newImageAttachments]);
    }
  };

  // Handle removing an image attachment
  const handleRemoveAttachment = (index: number) => {
    setImageAttachments(prev => {
      const newAttachments = [...prev];
      // Release the object URL to avoid memory leaks
      URL.revokeObjectURL(newAttachments[index].preview);
      newAttachments.splice(index, 1);
      return newAttachments;
    });
  };

  // Handle selecting a command from the command menu
  const handleSelectCommand = (command: string) => {
    setInputValue(command);
    setShowCommandMenu(false);

    // Execute command immediately if it doesn't need parameters
    if (
      command === "/help" ||
      command === "/normal" ||
      command === "/gather" ||
      command === "/agent" ||
      command === "/clear"
    ) {
      setTimeout(() => handleCommand(command), 100);
    }
  };

  // Handle inserting a reference
  const handleInsertReference = (refType: "selectedCode" | "currentFile" | "editSelection") => {
    if (refType === "selectedCode") {
      // Prima cerca nel context, poi nella prop
      const code = editorContext?.selectedText || selectedCode;
      if (code) {
        setInputValue(prev => `${prev}\`\`\`gcode\n${code}\n\`\`\``);
      }
    } else if (refType === "currentFile") {
      setInputValue(prev => `${prev} @file`);
    } else if (refType === "editSelection") {
      // Prima cerca nel context, poi nella prop
      const code = editorContext?.selectedText || selectedCode;
      if (code) {
        setQuickEditSelection(code);
        setShowQuickEdit(true);

        // Se esiste il context, imposta anche lì lo stato di quickEdit
        if (editorContext?.setShowQuickEdit) {
          editorContext.setShowQuickEdit(true);
        }
      }
    }
    setShowReferenceMenu(false);
  };

  // Handle quick edit prompt submission
  const handleQuickEditSubmit = async (instruction: string, selection: string) => {
    if (!selection || !instruction) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/ai/gcode-quick-edit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          instruction,
          code: selection,
          context: gcode
        })
      });

      if (!response.ok) {
        throw new Error("Error modifying code");
      }

      const data = await response.json();

      if (data.modifiedCode) {
        // Se c'è il context, usa replaceSelection
        if (editorContext?.replaceSelection) {
          editorContext.replaceSelection(data.modifiedCode);
        }
        // Altrimenti sostituisci nel gcode principale
        else if (onUpdateGCode) {
          const newCode = gcode.replace(selection, data.modifiedCode);
          onUpdateGCode(newCode);
        }

        // Add a system message about the edit
        addSystemMessage({
          id: Date.now().toString(),
          role: "system",
          content: `✓ Quick Edit Applied: \"${instruction}\"`,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error("Error with quick edit:", error);
      addSystemMessage({
        id: Date.now().toString(),
        role: "system",
        content: `❌ Quick Edit Failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date()
      });
    } finally {
      setIsLoading(false);
      setShowQuickEdit(false);

      // Aggiorna anche lo stato nel context
      if (editorContext?.setShowQuickEdit) {
        editorContext.setShowQuickEdit(false);
      }
    }
  };

  // Handle quick edit opening
  const handleOpenQuickEdit = () => {
    // Cerca prima il codice selezionato nel context, poi nella prop
    const code = editorContext?.selectedText || selectedCode;
    if (code) {
      setQuickEditSelection(code);
      setShowQuickEdit(true);

      // Aggiorna anche lo stato nel context
      if (editorContext?.setShowQuickEdit) {
        editorContext.setShowQuickEdit(true);
      }
    }
  };

  // Render different panels based on the active mode
  const renderActivePanel = () => {
    switch (activeMode) {
      case "analyze":
        return (
          <AnalysisPanel
            gcode={editorContext?.selectedText || selectedCode || gcode}
            onAnalyze={handleAnalyzeCode}
            analysisResult={lastAnalysisResult}
            isAnalyzing={isAnalyzing}
          />
        );
      case "optimize":
        return (
          <OptimizationPanel
            gcode={editorContext?.selectedText || selectedCode || gcode}
            onOptimize={handleOptimizeCode}
            optimizationResult={lastOptimizationResult}
            isOptimizing={isOptimizing}
            onApplyOptimized={code => {
              // Se c'è il context e c'è una selezione, sostituisci solo la selezione
              if (editorContext?.selectedText && editorContext.replaceSelection) {
                editorContext.replaceSelection(code);
              } else if (onUpdateGCode) {
                onUpdateGCode(code);
              }
            }}
          />
        );
      case "generate":
        return (
          <GenerationPanel
            onGenerate={prompt => {
              setInputValue(prompt);
              handleSendMessage();
            }}
            isGenerating={isGenerating}
            onApplyGenerated={handleApplyGenerated}
            lastGeneratedCode={
              chatMessages.length > 0 ? extractCodeFromMessage(chatMessages[chatMessages.length - 1]) : ""
            }
          />
        );
      case "chat":
      default:
        return (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
            {chatMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
                <div className="relative mb-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center backdrop-blur-xl border border-white/20 shadow-xl">
                    <MessageCircle size={32} className="text-white" />
                  </div>
                  <div className="absolute -inset-2 bg-gradient-to-r from-blue-400/20 to-indigo-600/20 rounded-3xl blur-lg animate-pulse"></div>
                </div>
                
                <div className="text-center mb-6">
                  <h3 className="text-lg font-bold text-gray-700 dark:text-gray-300 mb-2">G-Code AI Assistant</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
                    Ask me about G-code programming, CNC operations, toolpaths, and machining strategies.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-md mb-6">
                  <SuggestionButton
                    onClick={() => {
                      setInputValue("Explain the difference between G0 and G1 commands");
                      setTimeout(handleSendMessage, 100);
                    }}
                  >
                    Explain G0 vs G1
                  </SuggestionButton>
                  <SuggestionButton
                    onClick={() => {
                      setInputValue("How do I program a circular arc in G-code?");
                      setTimeout(handleSendMessage, 100);
                    }}
                  >
                    Programming arcs
                  </SuggestionButton>
                  <SuggestionButton
                    onClick={() => {
                      setInputValue("What are typical feeds and speeds for aluminum?");
                      setTimeout(handleSendMessage, 100);
                    }}
                  >
                    Feeds for aluminum
                  </SuggestionButton>
                  <SuggestionButton
                    onClick={() => {
                      setInputValue("How can I optimize my toolpaths for better surface finish?");
                      setTimeout(handleSendMessage, 100);
                    }}
                  >
                    Improve surface finish
                  </SuggestionButton>
                </div>
                
                <div className="bg-gradient-to-r from-blue-50/70 to-indigo-50/70 dark:from-gray-700/70 dark:to-gray-600/70 backdrop-blur-sm border border-blue-200/50 dark:border-gray-600/50 p-4 rounded-xl text-xs space-y-3 max-w-sm shadow-lg">
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                      <Cpu size={12} className="text-white" />
                    </div>
                    <div className="font-medium text-gray-700 dark:text-gray-300">Enhanced Features</div>
                  </div>
                  
                  <div className="space-y-2 text-gray-600 dark:text-gray-400">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span>🔍 G-Code Analysis & Debugging</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                      <span>⚡ Code Optimization</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                      <span>🤖 Intelligent Code Generation</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span>💬 Interactive Chat Support</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                      <span>✏️ Quick Edit & Autocomplete</span>
                    </div>
                  </div>
                  
                  <div className="pt-3 border-t border-blue-200/50 dark:border-gray-600/50">
                    <div className="text-xs text-blue-600 dark:text-blue-400">
                      💡 Ready to help with all your G-Code needs!
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {chatMessages.map((message, index) => (
                  <motion.div
                    key={`${message.id || index}-${message.timestamp.getTime()}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                    className="min-w-0 w-full overflow-hidden"
                  >
                    <ChatMessage
                      message={message}
                      onApplyCode={handleApplyGenerated}
                      onCopyCode={code => navigator.clipboard.writeText(code)}
                    />
                  </motion.div>
                ))}
                <div ref={messagesEndRef} />
              </AnimatePresence>
            )}
          </div>
        );
    }
  };

  // Extract code from message
  const extractCodeFromMessage = (message: GCodeMessage): string => {
    const codeMatch = message.content.match(/```(?:gcode)?\n([\s\S]*?)\n```/);
    return codeMatch ? codeMatch[1] : "";
  };

  return (
    <AnimatePresence>
      <motion.div
        key="gcode-ai-agent-panel"
        initial={{ opacity: 0, x: 50 }}
        animate={{
          opacity: 1,
          x: 0,
          width: expanded ? "520px" : "48px"
        }}
        exit={{ opacity: 0, x: 50 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={`flex flex-col h-full shadow-xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border-l border-white/20 dark:border-gray-700/50 overflow-hidden ${
          expanded ? "rounded-l-2xl" : "rounded-l-2xl"
        }`}
      >
      {expanded ? (
        <>
          {/* Header with glassmorphism design */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="border-b bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-700 text-white dark:from-gray-700 dark:to-gray-800 dark:border-gray-600/50 backdrop-blur-sm rounded-tl-2xl relative"
            style={{ minHeight: '140px' }}
          >
            {/* Glassmorphism overlay with holographic effect */}
            <motion.div 
              className="absolute inset-0 bg-white/10 backdrop-blur-sm"
              animate={{
                background: [
                  "linear-gradient(45deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.1) 100%)",
                  "linear-gradient(45deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 100%)"
                ]
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            ></motion.div>
            
            {/* Subtle animated gradient overlay */}
            <motion.div 
              className="absolute inset-0 opacity-20"
              animate={{
                background: [
                  "linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
                  "linear-gradient(240deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)"
                ]
              }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            ></motion.div>
            
            <div className="relative z-10 p-3 space-y-3">
              {/* Title and Controls Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm flex-shrink-0">
                    <img src="/icon.png" className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-base whitespace-nowrap">G-Code AI Assistant</h3>
                </div>
                
                {/* Main Control Buttons */}
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => setExpanded(false)}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-all duration-300 backdrop-blur-sm"
                    title="Collapse"
                  >
                    <Minimize2 size={15} />
                  </button>
                  {onClose && (
                    <button
                      onClick={onClose}
                      className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-all duration-300 backdrop-blur-sm"
                      title="Close"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              </div>

              {/* Feature Status Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1">
                  {/* G-Code Analysis Status */}
                  <div className="flex items-center space-x-1 bg-green-500/20 px-2 py-1 rounded-md backdrop-blur-sm border border-green-400/30">
                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                    <span className="text-xs text-green-200 font-medium whitespace-nowrap">Analysis</span>
                  </div>
                  
                  {/* G-Code Generation Status */}
                  <div className="flex items-center space-x-1 bg-purple-500/20 px-2 py-1 rounded-md backdrop-blur-sm border border-purple-400/30">
                    <div className="w-1.5 h-1.5 bg-purple-400 rounded-full"></div>
                    <span className="text-xs text-purple-200 font-medium whitespace-nowrap">Generation</span>
                  </div>
                  
                  {/* G-Code Optimization Status */}
                  <div className="flex items-center space-x-1 bg-orange-500/20 px-2 py-1 rounded-md backdrop-blur-sm border border-orange-400/30">
                    <div className="w-1.5 h-1.5 bg-orange-400 rounded-full"></div>
                    <span className="text-xs text-orange-200 font-medium whitespace-nowrap">Optimize</span>
                  </div>
                </div>
                
                {/* File Info */}
                <div className="text-xs text-blue-100 whitespace-nowrap">
                  <span className="font-medium">{fileName || "untitled.gcode"}</span>
                </div>
              </div>
              
              {/* Mode and Status Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5 flex-wrap">
                  <div className={`flex items-center space-x-1 px-2 py-1 rounded-md backdrop-blur-sm border ${
                    activeMode === "chat" ? "bg-blue-500/20 border-blue-400/30" :
                    activeMode === "analyze" ? "bg-green-500/20 border-green-400/30" :
                    activeMode === "optimize" ? "bg-orange-500/20 border-orange-400/30" :
                    "bg-purple-500/20 border-purple-400/30"
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      activeMode === "chat" ? "bg-blue-400" :
                      activeMode === "analyze" ? "bg-green-400" :
                      activeMode === "optimize" ? "bg-orange-400" :
                      "bg-purple-400"
                    }`}></div>
                    <span className={`text-xs font-medium whitespace-nowrap ${
                      activeMode === "chat" ? "text-blue-200" :
                      activeMode === "analyze" ? "text-green-200" :
                      activeMode === "optimize" ? "text-orange-200" :
                      "text-purple-200"
                    }`}>
                      {activeMode.charAt(0).toUpperCase() + activeMode.slice(1)}
                    </span>
                  </div>
                  
                  {chatMode !== "normal" && (
                    <div className="flex items-center space-x-1 bg-yellow-500/20 px-2 py-1 rounded-md backdrop-blur-sm border border-yellow-400/30">
                      <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse"></div>
                      <span className="text-xs text-yellow-200 font-medium whitespace-nowrap">
                        {chatMode}
                      </span>
                    </div>
                  )}
                </div>
                
                {/* Overall Status Indicator */}
                <div className="flex items-center space-x-1.5">
                  {gcode && gcode.trim().length > 0 && (
                    <>
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span className="text-xs text-green-200 font-medium whitespace-nowrap">
                        Ready
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Mode Tabs */}
          <div className="shrink-0 border-b bg-gray-50/70 dark:bg-gray-700/70 dark:border-gray-600/50 dark:text-gray-300 backdrop-blur-sm">
            <div className="flex">
              <ModeTab
                mode="chat"
                activeMode={activeMode}
                onClick={() => setActiveMode("chat")}
                icon={<MessageCircle size={16} />}
                label="Chat"
              />
              <ModeTab
                mode="analyze"
                activeMode={activeMode}
                onClick={() => setActiveMode("analyze")}
                icon={<Search size={16} />}
                label="Analyze"
              />
              <ModeTab
                mode="optimize"
                activeMode={activeMode}
                onClick={() => setActiveMode("optimize")}
                icon={<Zap size={16} />}
                label="Optimize"
              />
              <ModeTab
                mode="generate"
                activeMode={activeMode}
                onClick={() => setActiveMode("generate")}
                icon={<Code size={16} />}
                label="Generate"
              />
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-hidden flex flex-col relative bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm">
            {/* Processing Indicator */}
            <AnimatePresence>
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="px-2 py-1 border-b border-gray-200 dark:border-gray-700"
                >
                  <motion.div
                    initial={{ scale: 0.95 }}
                    animate={{ scale: 1 }}
                    className="flex items-center space-x-3 p-3 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 dark:from-gray-700/80 dark:to-gray-600/80 backdrop-blur-sm border border-blue-200/50 dark:border-gray-600/50 rounded-xl shadow-lg"
                  >
                    <div className="flex space-x-1">
                      <motion.div
                        animate={{ y: [0, -5, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                        className="w-2 h-2 bg-gradient-to-t from-blue-400 to-blue-600 rounded-full"
                      />
                      <motion.div
                        animate={{ y: [0, -5, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                        className="w-2 h-2 bg-gradient-to-t from-indigo-400 to-indigo-600 rounded-full"
                      />
                      <motion.div
                        animate={{ y: [0, -5, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                        className="w-2 h-2 bg-gradient-to-t from-purple-400 to-purple-600 rounded-full"
                      />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {isGenerating ? "Generating G-Code..." :
                         isOptimizing ? "Optimizing G-Code..." :
                         isAnalyzing ? "Analyzing G-Code..." :
                         isSendingMessage ? "Processing Message..." :
                         uploadingImage ? "Processing Image..." :
                         "Processing..."}
                      </span>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {activeMode === "generate" ? "Creating optimized toolpaths" :
                         activeMode === "optimize" ? "Improving performance" :
                         activeMode === "analyze" ? "Checking for issues" :
                         "AI processing in progress"}
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {renderActivePanel()}

            {/* Quick Edit Dialog */}
            {showQuickEdit && (
              <QuickEditDialog
                selection={quickEditSelection}
                onSubmit={handleQuickEditSubmit}
                onClose={() => {
                  setShowQuickEdit(false);
                  // Aggiorna anche lo stato nel context
                  if (editorContext?.setShowQuickEdit) {
                    editorContext.setShowQuickEdit(false);
                  }
                }}
                isProcessing={isLoading}
              />
            )}
          </div>

          {/* Image Attachments Preview */}
          <AnimatePresence>
            {imageAttachments.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="px-3 py-2 border-t border-gray-200/50 dark:border-gray-700/50 bg-white/30 dark:bg-gray-800/30 backdrop-blur-sm"
              >
                <div className="flex flex-wrap gap-2">
                  {imageAttachments.map((img, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      whileHover={{ scale: 1.05 }}
                      className="relative group w-16 h-16 bg-gray-200/70 dark:bg-gray-700/70 backdrop-blur-sm rounded-lg overflow-hidden border border-gray-300/50 dark:border-gray-600/50"
                    >
                      <img src={img.preview} alt={`Attachment ${idx + 1}`} className="w-full h-full object-cover" />
                      <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        whileHover={{ opacity: 1, scale: 1 }}
                        onClick={() => handleRemoveAttachment(idx)}
                        className="absolute top-1 right-1 bg-red-500/90 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 backdrop-blur-sm"
                      >
                        <X size={10} />
                      </motion.button>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input Area */}
          <form
            onSubmit={handleSendMessage}
            className="shrink-0 border-t border-gray-200/50 dark:border-gray-700/50 bg-white/30 dark:bg-gray-800/30 backdrop-blur-sm p-3 relative"
          >
            <div className="flex space-x-2">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    activeMode === "chat"
                      ? "Ask about G-code programming..."
                      : activeMode === "generate"
                        ? "Describe what to generate..."
                        : "Enter your message here..."
                  }
                  className="w-full p-3 pr-10 border border-gray-300/50 dark:border-gray-600/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700/70 dark:text-white bg-white/70 backdrop-blur-sm resize-none min-h-[40px] max-h-[120px] shadow-sm"
                  disabled={isLoading}
                  rows={1}
                />

                {/* Command Menu */}
                {showCommandMenu && (
                  <CommandMenu onSelectCommand={handleSelectCommand} onClose={() => setShowCommandMenu(false)} />
                )}

                {/* Reference Menu */}
                {showReferenceMenu && (
                  <ReferenceMenu
                    onSelectReference={handleInsertReference}
                    hasSelectedCode={!!(editorContext?.selectedText || selectedCode)}
                    onClose={() => setShowReferenceMenu(false)}
                  />
                )}

                {/* Autocomplete Menu */}
                {showAutocomplete && (
                  <GCodeAutocomplete
                    input={inputValue}
                    position={autocompletePosition}
                    suggestions={completionSuggestions}
                    isLoading={isLoadingCompletions}
                    onSelect={handleSelectCompletion}
                    onClose={() => setShowAutocomplete(false)}
                    contextMode={chatMode}
                  />
                )}
              </div>

              <div className="flex items-end space-x-2">
                {/* Image Upload Button */}
                <motion.button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`p-2.5 rounded-xl backdrop-blur-sm border shadow-sm transition-all duration-200 ${
                    isLoading
                      ? "bg-gray-300/70 dark:bg-gray-700/70 text-gray-500 dark:text-gray-400 cursor-not-allowed border-gray-300/50 dark:border-gray-600/50"
                      : "bg-white/70 hover:bg-white/90 dark:bg-gray-700/70 dark:hover:bg-gray-600/90 border-gray-300/50 dark:border-gray-600/50 hover:border-gray-400/70 dark:hover:border-gray-500/70 hover:shadow-lg"
                  }`}
                  title="Attach image"
                  disabled={isLoading}
                >
                  <motion.div
                    animate={isLoading ? { rotate: 0 } : {}}
                    transition={{ duration: 0.2 }}
                  >
                    <Image size={18} />
                  </motion.div>
                </motion.button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  className="hidden"
                  multiple
                  disabled={isLoading}
                />

                {/* Send Button */}
                <motion.button
                  type="submit"
                  disabled={isLoading || (!inputValue.trim() && imageAttachments.length === 0)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`p-2.5 rounded-xl backdrop-blur-sm border shadow-sm transition-all duration-200 ${
                    isLoading || (!inputValue.trim() && imageAttachments.length === 0)
                      ? "bg-gray-300/70 dark:bg-gray-700/70 text-gray-500 dark:text-gray-400 cursor-not-allowed border-gray-300/50 dark:border-gray-600/50"
                      : "bg-blue-500/90 hover:bg-blue-600 text-white border-blue-400/50 hover:border-blue-500/70 shadow-blue-500/20 hover:shadow-blue-500/40"
                  }`}
                  title="Send message"
                >
                  <motion.div
                    animate={isLoading ? { rotate: 360 } : {}}
                    transition={{ duration: 1, repeat: isLoading ? Infinity : 0, ease: "linear" }}
                  >
                    {isLoading ? <RefreshCw size={18} /> : <Send size={18} />}
                  </motion.div>
                </motion.button>
              </div>
            </div>

            {/* Command Bar */}
            <div className="mt-3 flex justify-between text-xs text-gray-500 dark:text-gray-400">
              <div className="flex space-x-2 flex-wrap">
                <span className="flex items-center">
                  <kbd className="px-1.5 py-0.5 bg-white/50 dark:bg-gray-700/50 border border-gray-300/50 dark:border-gray-600/50 rounded-md backdrop-blur-sm">Enter</kbd>
                  <span className="ml-1">send</span>
                </span>
                <span className="flex items-center">
                  <kbd className="px-1.5 py-0.5 bg-white/50 dark:bg-gray-700/50 border border-gray-300/50 dark:border-gray-600/50 rounded-md backdrop-blur-sm">Shift+Enter</kbd>
                  <span className="ml-1">new line</span>
                </span>
                <span className="flex items-center">
                  <kbd className="px-1.5 py-0.5 bg-white/50 dark:bg-gray-700/50 border border-gray-300/50 dark:border-gray-600/50 rounded-md backdrop-blur-sm">/</kbd>
                  <span className="ml-1">commands</span>
                </span>
                <span className="flex items-center">
                  <kbd className="px-1.5 py-0.5 bg-white/50 dark:bg-gray-700/50 border border-gray-300/50 dark:border-gray-600/50 rounded-md backdrop-blur-sm">@</kbd>
                  <span className="ml-1">references</span>
                </span>
              </div>

              <div className="flex items-center">
                {chatMode !== "normal" && (
                  <div className={`flex items-center px-2 py-1 rounded-md backdrop-blur-sm border ${
                    chatMode === "gather" 
                      ? "bg-purple-500/20 border-purple-400/30 text-purple-600 dark:text-purple-400" 
                      : "bg-green-500/20 border-green-400/30 text-green-600 dark:text-green-400"
                  }`}>
                    {chatMode === "gather" ? (
                      <Search size={12} className="mr-1" />
                    ) : (
                      <Wind size={12} className="mr-1" />
                    )}
                    <span className="text-xs font-medium">{chatMode} mode</span>
                  </div>
                )}
              </div>
            </div>

            {/* Status Bar */}
            <div className="mt-3 flex justify-between text-xs text-gray-500 dark:text-gray-400 border-t pt-3 border-gray-200/50 dark:border-gray-700/50">
              <div>
                {activeMode === "chat" && (
                  <button
                    onClick={clearChatHistory}
                    className="flex items-center px-2 py-1 rounded-md hover:bg-white/50 dark:hover:bg-gray-700/50 hover:text-gray-700 dark:hover:text-gray-300 transition-all duration-200 backdrop-blur-sm"
                    title="Clear chat history"
                  >
                    <Trash2 size={12} className="mr-1" />
                    Clear history
                  </button>
                )}
              </div>

              <div className="flex items-center space-x-2">
                {isLoading && (
                  <span className="flex items-center px-2 py-1 bg-blue-500/20 border border-blue-400/30 rounded-md backdrop-blur-sm">
                    <RefreshCw size={12} className="animate-spin mr-1 text-blue-500" />
                    <span className="text-blue-600 dark:text-blue-400 font-medium">Processing...</span>
                  </span>
                )}
                
                {(editorContext?.selectedText || selectedCode) && (
                  <button
                    onClick={handleOpenQuickEdit}
                    className="flex items-center px-2 py-1 bg-blue-500/20 border border-blue-400/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/30 hover:border-blue-500/50 rounded-md transition-all duration-200 backdrop-blur-sm"
                    title="Quick edit selected code"
                  >
                    <Edit size={12} className="mr-1" />
                    Quick Edit
                  </button>
                )}
              </div>
            </div>
          </form>
        </>
      ) : (
        // Collapsed view with glassmorphism
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="h-full flex flex-col items-center justify-between py-4 bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border border-white/20 dark:border-gray-700/50 rounded-l-2xl"
        >
          <motion.button
            onClick={() => setExpanded(true)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className="p-2 mt-2 text-gray-600 dark:text-gray-300 rounded-full hover:bg-blue-500/20 transition-all duration-300 backdrop-blur-sm"
            title="Expand G-Code AI Assistant"
          >
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            >
              <Maximize2 size={14} />
            </motion.div>
          </motion.button>
          
          <div className="flex flex-col items-center space-y-3">
            {[
              { icon: Cpu, color: "blue" },
              { icon: MessageCircle, color: "green" },
              { icon: Search, color: "orange" },
              { icon: Zap, color: "purple" },
              { icon: Code, color: "indigo" }
            ].map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ scale: 1.2, rotate: 10 }}
                className={`w-6 h-6 bg-${item.color}-500/20 rounded-full flex items-center justify-center backdrop-blur-sm border border-${item.color}-400/30`}
              >
                <item.icon size={12} className={`text-${item.color}-600 dark:text-${item.color}-400`} />
              </motion.div>
            ))}
          </div>
          
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-xs font-medium text-gray-700 dark:text-gray-300 [writing-mode:vertical-rl] transform rotate-180 whitespace-nowrap"
          >
            G-Code AI
          </motion.span>
        </motion.div>
      )}
      </motion.div>
    </AnimatePresence>
  );
};

interface SuggestionButtonProps {
  children: React.ReactNode;
  onClick: () => void;
}

const SuggestionButton: React.FC<SuggestionButtonProps> = ({ children, onClick }) => {
  return (
    <motion.button
      whileHover={{ 
        scale: 1.02, 
        y: -2,
        boxShadow: "0 10px 25px rgba(0,0,0,0.15)"
      }}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-3 text-sm bg-white/70 dark:bg-gray-700/70 hover:bg-white/90 dark:hover:bg-gray-600/90 backdrop-blur-sm border border-gray-200/50 dark:border-gray-600/50 hover:border-blue-300/70 dark:hover:border-blue-500/50 rounded-xl text-left transition-all duration-200 shadow-sm hover:shadow-md"
      onClick={onClick}
    >
      {children}
    </motion.button>
  );
};

export default GCodeAIAgent;
