import { MODELS } from "@/config/constants";
import type { WhisperTranscriptionResponse } from "@/types";
import { callAudioTranscription } from "@/lib/huitOpenAI";

/**
 * Call OpenAI Whisper to transcribe an uploaded audio file.
 */
export async function transcribeAudioFile(
  file: File
): Promise<WhisperTranscriptionResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", MODELS.WHISPER);
  formData.append("response_format", "json");

  const response = await callAudioTranscription(formData);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Whisper API error: ${errorText}`);
  }

  const data = await response.json();
  return {
    text: data.text || "",
  };
}
