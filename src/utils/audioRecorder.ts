/**
 * Browser-based audio recording utilities using MediaRecorder API
 * Records audio chunks for later transcription via Whisper
 */

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private startTime: number = 0;

  /**
   * Initialize the recorder with a media stream
   */
  async initialize(stream: MediaStream): Promise<void> {
    this.stream = stream;
    
    // Use audio/webm for better browser compatibility
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      audioBitsPerSecond: 128000, // 128kbps for good quality
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };
  }

  /**
   * Start recording
   */
  start(): void {
    if (!this.mediaRecorder) {
      throw new Error('Recorder not initialized');
    }

    this.audioChunks = [];
    this.startTime = Date.now();
    
    // Request data every second for progressive recording
    this.mediaRecorder.start(1000);
  }

  /**
   * Stop recording and return the audio blob
   */
  async stop(): Promise<{ blob: Blob; duration: number }> {
    if (!this.mediaRecorder) {
      throw new Error('Recorder not initialized');
    }

    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('Recorder not initialized'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const duration = Date.now() - this.startTime;
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
        const blob = new Blob(this.audioChunks, { type: mimeType });
        resolve({ blob, duration });
      };

      this.mediaRecorder.onerror = (event: Event) => {
        reject(new Error(`Recording error: ${event}`));
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * Get current recording state
   */
  getState(): RecordingState {
    return this.mediaRecorder?.state || 'inactive';
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
  }
}

/**
 * Convert audio blob to File for upload
 */
export function blobToFile(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: blob.type });
}

/**
 * Format duration in milliseconds to MM:SS
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
