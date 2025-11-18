// Computer Vision types for menu scanning

export interface Point {
  x: number;
  y: number;
}

export interface Quad {
  points: [Point, Point, Point, Point];
  score: number;
  blur: number;
  lux: number;
  ts: number;
}

export interface FrameAnalysisResult {
  quad?: Quad;
  debug?: {
    contours: number;
    candidates: number;
    score: number;
    blur: number;
    lux: number;
    processingTime: number;
  };
}

export interface RectifyResult {
  blob: Blob;
  width: number;
  height: number;
  meta: {
    score: number;
    blur: number;
    lux: number;
  };
}

export type WorkerMessageType =
  | 'init'
  | 'analyzeFrame'
  | 'rectify'
  | 'ready'
  | 'frameResult'
  | 'rectifyResult'
  | 'error';

export interface WorkerMessage {
  type: WorkerMessageType;
  id?: string;
  payload?: any;
}

export interface InitMessage extends WorkerMessage {
  type: 'init';
  payload: {
    opencvPath: string;
  };
}

export interface AnalyzeFrameMessage extends WorkerMessage {
  type: 'analyzeFrame';
  id: string;
  payload: {
    imageData?: ImageData;
    width: number;
    height: number;
  };
}

export interface RectifyMessage extends WorkerMessage {
  type: 'rectify';
  id: string;
  payload: {
    imageData: ImageData;
    quad: Quad;
    targetWidth?: number;
  };
}

export interface ReadyMessage extends WorkerMessage {
  type: 'ready';
}

export interface FrameResultMessage extends WorkerMessage {
  type: 'frameResult';
  id: string;
  payload: FrameAnalysisResult;
}

export interface RectifyResultMessage extends WorkerMessage {
  type: 'rectifyResult';
  id: string;
  payload: RectifyResult;
}

export interface ErrorMessage extends WorkerMessage {
  type: 'error';
  id?: string;
  payload: {
    message: string;
    stack?: string;
  };
}

export interface ScoreThresholds {
  low: number;    // < 0.70 - red
  medium: number; // 0.70-0.82 - yellow
  high: number;   // >= 0.82 - green (auto-capture)
}

export interface CaptureSettings {
  autoThreshold: number;      // 0.82
  stabilityDuration: number;  // 1200ms
  resetThreshold: number;     // 0.78
  minAreaRatio: number;       // 0.15
  maxAreaRatio: number;       // 0.95
  minAspectRatio: number;     // 0.5
  maxAspectRatio: number;     // 2.2
}

export interface QualityHints {
  darkWarning: boolean;
  blurWarning: boolean;
  message?: string;
}
