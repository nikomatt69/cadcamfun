// src/components/ai/GCodeAIAgent/ChatMessage.tsx
import React, { useState } from "react";
import { User, Copy, Check, Code, Image, ExternalLink, X } from "react-feather";
import { Bot } from "lucide-react";
import { GCodeMessage } from "@/src/hooks/useGCodeAI";
import ReactMarkdown from "react-markdown";

interface ChatMessageProps {
  message: GCodeMessage;
  onCopyCode?: (code: string) => void;
  onApplyCode?: (code: string) => void;
}

// Enhanced GCodeMessage to support image attachments
interface EnhancedMessage extends GCodeMessage {
  imageUrls?: string[];
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onCopyCode, onApplyCode }) => {
  const [copied, setCopied] = useState<string | null>(null);
  const [imageViewerOpen, setImageViewerOpen] = useState<boolean>(false);
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);

  const enhancedMessage = message as EnhancedMessage;

  // Function to handle copying text to clipboard
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  // Function to open image in viewer
  const openImageViewer = (url: string) => {
    setActiveImageUrl(url);
    setImageViewerOpen(true);
  };

  // Function to close image viewer
  const closeImageViewer = () => {
    setImageViewerOpen(false);
    setActiveImageUrl(null);
  };

  // Function to process text with code blocks
  const processTextWithCodeBlocks = (text: string) => {
    const segments = [];
    let lastIndex = 0;
    const codeBlockRegex = /```(?:gcode)?\n?([\s\S]*?)\n?```/g;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      // Text before code block
      if (match.index > lastIndex) {
        segments.push({
          type: "text",
          content: text.substring(lastIndex, match.index)
        });
      }

      // Code block
      segments.push({
        type: "code",
        content: match[1],
        id: `code-${match.index}`
      });

      lastIndex = match.index + match[0].length;
    }

    // Text after the last code block
    if (lastIndex < text.length) {
      segments.push({
        type: "text",
        content: text.substring(lastIndex)
      });
    }

    return segments;
  };

  // Process the message content
  const segments = processTextWithCodeBlocks(message.content);

  return (
    <div className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`relative max-w-[85%] px-4 py-3 rounded-lg ${
          message.role === "user"
            ? "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100"
            : "bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-600"
        }`}
      >
        {/* Message Header */}
        <div className="flex items-center mb-2">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center ${
              message.role === "user" ? "bg-blue-200 dark:bg-blue-800" : "bg-gray-200 dark:bg-gray-600"
            }`}
          >
            {message.role === "user" ? <User size={14} /> : <Bot size={14} />}
          </div>
          <div className="ml-2 text-sm font-medium">{message.role === "user" ? "You" : "AI Assistant"}</div>
          <div className="ml-2 text-xs opacity-70">
            {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>

        {/* Image Attachments (if any) */}
        {enhancedMessage.imageUrls && enhancedMessage.imageUrls.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {enhancedMessage.imageUrls.map((url, idx) => (
              <div
                key={idx}
                className="relative w-24 h-24 bg-gray-200 dark:bg-gray-800 rounded overflow-hidden cursor-pointer group"
                onClick={() => openImageViewer(url)}
              >
                <img src={url} alt={`Attachment ${idx + 1}`} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 flex items-center justify-center transition-all">
                  <ExternalLink size={18} className="text-white opacity-0 group-hover:opacity-100" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Message Content */}
        <div className="prose dark:prose-invert max-w-none">
          {segments.map((segment, index) => {
            if (segment.type === "text") {
              return <ReactMarkdown key={index}>{segment.content}</ReactMarkdown>;
            } else if (segment.type === "code") {
              return (
                <div
                  key={index}
                  className="relative my-3 rounded-md overflow-hidden border border-gray-300 dark:border-gray-600"
                >
                  {/* Code Header */}
                  <div className="bg-gray-200 dark:bg-gray-800 px-3 py-1 text-xs font-medium flex justify-between items-center">
                    <span>G-Code</span>
                    <div className="flex space-x-1">
                      {onApplyCode && (
                        <button
                          onClick={() => onApplyCode(segment.content)}
                          className="p-1 rounded hover:bg-gray-300 dark:hover:bg-gray-700"
                          title="Apply code"
                        >
                          <Code size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => copyToClipboard(segment.content, segment.id as string)}
                        className="p-1 rounded hover:bg-gray-300 dark:hover:bg-gray-700"
                        title="Copy to clipboard"
                      >
                        {copied === segment.id ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Code Content */}
                  <pre className="p-3 overflow-x-auto bg-gray-100 dark:bg-gray-900 text-sm">
                    <code>{segment.content}</code>
                  </pre>
                </div>
              );
            }
          })}
        </div>
      </div>

      {/* Image Viewer Modal */}
      {imageViewerOpen && activeImageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75"
          onClick={closeImageViewer}
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-auto">
            <img src={activeImageUrl} alt="Full-size attachment" className="max-w-full max-h-full object-contain" />
            <button
              className="absolute top-4 right-4 p-2 bg-black bg-opacity-50 rounded-full text-white hover:bg-opacity-70"
              onClick={closeImageViewer}
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatMessage;
