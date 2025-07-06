import React, { useState, useEffect } from "react";
import { Edit } from "react-feather";
import { useGCodeEditor } from "@/src/contexts/GCodeEditorContext";
import QuickEditPopup from "../QuickEditPopup";

interface QuickEditButtonProps {
  onSuccess?: () => void;
  className?: string;
}

const QuickEditButton: React.FC<QuickEditButtonProps> = ({ onSuccess, className = "" }) => {
  const editorContext = useGCodeEditor();
  const [showPopup, setShowPopup] = useState<boolean>(false);
  const [popupPosition, setPopupPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [success, setSuccess] = useState<boolean>(false);

  // Aggiorna il popup quando cambia la selezione o il flag showQuickEdit
  useEffect(() => {
    if (editorContext?.showQuickEdit && editorContext.selectedText) {
      handleShowPopup();
    } else {
      setShowPopup(false);
    }
  }, [editorContext?.showQuickEdit, editorContext?.selectedText]);

  // Calcola la posizione del popup
  const handleShowPopup = () => {
    if (!editorContext?.selectedText) return;

    // Per default, posiziona il popup vicino all'elemento button
    const buttonElement = document.querySelector("[data-quick-edit-button]");

    if (buttonElement) {
      const rect = buttonElement.getBoundingClientRect();
      setPopupPosition({
        top: rect.bottom + 10,
        left: rect.left
      });
      setShowPopup(true);

      // Resetta gli stati
      setError(undefined);
      setSuccess(false);
    }
  };

  // Gestisce la chiusura del popup
  const handleClosePopup = () => {
    setShowPopup(false);

    // Aggiorna lo stato anche nel context se disponibile
    if (editorContext?.setShowQuickEdit) {
      editorContext.setShowQuickEdit(false);
    }
  };

  // Gestisce l'invio della modifica rapida
  const handleQuickEditSubmit = async (instruction: string, selectedText: string) => {
    if (!selectedText || !instruction) return;

    setIsProcessing(true);
    setError(undefined);
    setSuccess(false);

    try {
      const response = await fetch("/api/ai/gcode-quick-edit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          instruction,
          code: selectedText,
          context: editorContext?.content || ""
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Error modifying code");
      }

      const data = await response.json();

      if (data.modifiedCode) {
        // Aggiorna il codice nell'editor
        if (editorContext?.replaceSelection) {
          editorContext.replaceSelection(data.modifiedCode);
          setSuccess(true);

          // Chiudi il popup dopo un breve ritardo
          setTimeout(() => {
            handleClosePopup();
            if (onSuccess) onSuccess();
          }, 1500);
        } else {
          throw new Error("Editor context not available");
        }
      } else {
        throw new Error("No modified code returned");
      }
    } catch (error) {
      console.error("Error with quick edit:", error);
      setError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <button
        data-quick-edit-button
        onClick={handleShowPopup}
        disabled={!editorContext?.selectedText}
        className={`p-2 ${
          editorContext?.selectedText
            ? "hover:bg-gray-700 text-gray-300 hover:text-white"
            : "text-gray-500 cursor-not-allowed"
        } flex items-center ${className}`}
        title="Quick Edit Selection"
      >
        <Edit size={16} className="mr-1" />
        <span className="text-xs">Quick Edit</span>
      </button>

      {showPopup && editorContext?.selectedText && (
        <QuickEditPopup
          selectedText={editorContext.selectedText}
          position={popupPosition}
          onSubmit={handleQuickEditSubmit}
          onClose={handleClosePopup}
          isProcessing={isProcessing}
          error={error}
          success={success}
        />
      )}
    </>
  );
};

export default QuickEditButton;
