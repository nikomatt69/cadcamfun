import React, { useState } from "react";

interface ExportImportControlsProps {
  entityType: "components" | "materials" | "tools" | "projects" | "machineConfigs"; // Determines which API endpoint to call
}

const ExportImportControls: React.FC<ExportImportControlsProps> = ({ entityType }) => {
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [importFile, setImportFile] = useState<File | null>(null);

  // Handle export action
  const handleExport = async () => {
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/${entityType}/export-import`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to export ${entityType}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${entityType}-export.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setMessage(`Successfully exported ${entityType}`);
    } catch (err) {
      setError(`Error exporting ${entityType}: ${(err as Error).message}`);
    }
  };

  // Handle file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
    }
  };

  // Handle import action
  const handleImport = async () => {
    if (!importFile) {
      setError("Please select a file to import.");
      return;
    }

    setMessage("");
    setError("");

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const data = JSON.parse(event.target?.result as string);

        const response = await fetch(`/api/${entityType}/export-import`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ data }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || `Failed to import ${entityType}`);
        }

        setMessage(`Successfully imported ${result.imported} ${entityType}`);
      };
      reader.readAsText(importFile);
    } catch (err) {
      setError(`Error importing ${entityType}: ${(err as Error).message}`);
    }
  };

  return (
    <div className="card mb-6">
      <div className="card-body">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          {entityType.charAt(0).toUpperCase() + entityType.slice(1)} Management
        </h3>
        <div className="flex items-center gap-4 mb-4">
          <button className="btn btn-primary" onClick={handleExport}>
            Export {entityType}
          </button>
          <input
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="form-input file:btn file:btn-outline file:mr-2"
          />
          <button
            className={`btn btn-primary ${!importFile ? "btn-disabled" : ""}`}
            onClick={handleImport}
            disabled={!importFile}
          >
            Import {entityType}
          </button>
        </div>
        {message && <p className="alert alert-success">{message}</p>}
        {error && <p className="alert alert-danger">{error}</p>}
      </div>
    </div>
  );
};

export default ExportImportControls;