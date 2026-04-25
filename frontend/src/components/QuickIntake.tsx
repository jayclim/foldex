import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  useRef,
  useState,
} from "react";

import { Button } from "./Button";
import { MaterialIcon } from "./MaterialIcon";
import { parseGeneMutationInput } from "../utils/geneMutationParser";

const ANALYZE_ENDPOINT = "http://localhost:8000/api/analyze";

export function QuickIntake() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [textInput, setTextInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const selectFile = (file: File | null) => {
    setSelectedFile(file);

    if (file) {
      setTextInput("");
    }
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    selectFile(event.target.files?.[0] ?? null);
  };

  const handleTextInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTextInput(event.target.value);

    if (selectedFile) {
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    selectFile(event.dataTransfer.files[0] ?? null);
  };

  const parseActiveInput = async () => {
    if (selectedFile) {
      return parseGeneMutationInput(selectedFile.name, {
        fetcher: async () => new Response(selectedFile),
      });
    }

    return parseGeneMutationInput(textInput);
  };

  const handleAnalyze = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsAnalyzing(true);

    try {
      const parsedVariant = await parseActiveInput();
      const response = await fetch(ANALYZE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parsedVariant),
      });

      if (!response.ok) {
        throw new Error(
          `Analyze request failed with status ${response.status}`,
        );
      }

      const output = await response.json();
      console.log(output);
    } catch (error) {
      console.error(error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="glass-panel intake-panel">
      <div className="scan-line" />
      <h3>
        <MaterialIcon name="upload_file" />
        Quick Intake
      </h3>
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept=".vcf,.pdf,application/pdf,text/vcf,text/plain"
        onChange={handleFileInputChange}
      />
      <Button
        aria-label="Upload VCF or PDF file"
        className="drop-zone"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <MaterialIcon name="genetics" />
        <strong>
          {selectedFile ? selectedFile.name : "Upload VCF / PDF file"}
        </strong>
        <small>
          {selectedFile ? "Ready to analyze" : "Click to choose or drop file"}
        </small>
      </Button>
      <form className="sequence-entry" onSubmit={handleAnalyze}>
        <label className="sr-only" htmlFor="quick-intake-input">
          Enter gene and mutation
        </label>
        <input
          id="quick-intake-input"
          placeholder="Enter gene and mutation..."
          type="text"
          value={textInput}
          onChange={handleTextInputChange}
        />
        <Button
          aria-label="Analyze variant"
          disabled={isAnalyzing}
          type="submit"
        >
          <MaterialIcon name="send" />
        </Button>
      </form>
    </div>
  );
}
