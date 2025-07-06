import React, { useState } from "react";
import { toast } from "react-hot-toast";

interface FeedbackFormProps {
  messageId: string;
  onSubmit: (messageId: string, comment: string) => void;
  toastId: string; // ID del toast per poterlo chiudere programmaticamente
}

export const FeedbackForm: React.FC<FeedbackFormProps> = ({ messageId, onSubmit, toastId }) => {
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // In un'app reale, qui invieresti i dati al backend
    console.log(`Submitting feedback for ${messageId}: ${comment}`);
    onSubmit(messageId, comment);
    // Simula un piccolo ritardo e poi chiude il toast
    setTimeout(() => {
      setIsSubmitting(false);
      toast.dismiss(toastId);
      toast.success("Feedback submitted!", { duration: 2000 });
    }, 500);
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-white rounded-lg shadow-lg max-w-sm w-full">
      <h3 className="text-sm font-medium mb-2 text-gray-800">Provide Feedback</h3>
      <p className="text-xs text-gray-500 mb-3">
        Help us improve the assistant by explaining what was wrong with the response.
      </p>
      <textarea
        value={comment}
        onChange={e => setComment(e.target.value)}
        placeholder="Optional comments..."
        className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 mb-3"
        rows={3}
        disabled={isSubmitting}
      />
      <div className="flex justify-end space-x-2">
        <button
          type="button"
          onClick={() => toast.dismiss(toastId)}
          className="px-3 py-1 text-xs rounded bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-3 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
          disabled={isSubmitting || comment.trim() === ""} // Opzionale: disabilita se vuoto
        >
          {isSubmitting ? "Submitting..." : "Submit Feedback"}
        </button>
      </div>
    </form>
  );
};
