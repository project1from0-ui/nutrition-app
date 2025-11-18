'use client';

import React, { useEffect, useRef } from 'react';
import type { Quad, QualityHints } from '@/src/types/cv';

interface FrameOverlayProps {
  width: number;
  height: number;
  quad?: Quad;
  progress: number; // 0-1, for auto-capture countdown
  showDebug?: boolean;
  hints?: QualityHints;
}

export const FrameOverlay: React.FC<FrameOverlayProps> = ({
  width,
  height,
  quad,
  progress,
  showDebug = false,
  hints,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    if (!quad) {
      // No quad detected - show hint
      drawCenterHint(ctx, width, height, 'メニュー表をかざしてください');
      return;
    }

    // Determine color based on score
    const color = getColorForScore(quad.score);

    // Draw quad outline
    drawQuadOutline(ctx, quad, color);

    // Draw corner markers (Adobe Scan style)
    drawCornerMarkers(ctx, quad.points, color);

    // Draw progress ring if auto-capture is in progress
    if (progress > 0 && quad.score >= 0.82) {
      drawProgressRing(ctx, width, height, progress, color);
    }

    // Draw debug info
    if (showDebug) {
      drawDebugInfo(ctx, quad);
    }

    // Draw quality hints
    if (hints) {
      drawHints(ctx, width, height, hints);
    }
  }, [width, height, quad, progress, showDebug, hints]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 10,
      }}
      aria-live="polite"
      aria-label={
        quad
          ? `メニュー表を検出しました。スコア: ${Math.round(quad.score * 100)}%`
          : 'メニュー表を探しています'
      }
    />
  );
};

/**
 * Get color based on detection score
 */
function getColorForScore(score: number): string {
  if (score < 0.70) return '#ff0000'; // Red
  if (score < 0.82) return '#ffaa00'; // Yellow/Orange
  return '#00ff00'; // Green
}

/**
 * Draw quad outline
 */
function drawQuadOutline(ctx: CanvasRenderingContext2D, quad: Quad, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;

  ctx.beginPath();
  ctx.moveTo(quad.points[0].x, quad.points[0].y);

  for (let i = 1; i < 4; i++) {
    ctx.lineTo(quad.points[i].x, quad.points[i].y);
  }

  ctx.closePath();
  ctx.stroke();

  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

/**
 * Draw corner markers (Adobe Scan style)
 */
function drawCornerMarkers(
  ctx: CanvasRenderingContext2D,
  points: [any, any, any, any],
  color: string
): void {
  const markerSize = 30;
  const lineWidth = 6;

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 15;

  points.forEach((point) => {
    // Draw L-shaped corner marker
    ctx.beginPath();

    // Horizontal line
    ctx.moveTo(point.x - markerSize / 2, point.y);
    ctx.lineTo(point.x + markerSize / 2, point.y);

    // Vertical line
    ctx.moveTo(point.x, point.y - markerSize / 2);
    ctx.lineTo(point.x, point.y + markerSize / 2);

    ctx.stroke();
  });

  // Reset
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.lineCap = 'butt';
}

/**
 * Draw progress ring for auto-capture countdown
 */
function drawProgressRing(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  color: string
): void {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = 60;
  const lineWidth = 8;

  // Background circle
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.stroke();

  // Progress arc
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 20;

  const startAngle = -Math.PI / 2; // Start at top
  const endAngle = startAngle + 2 * Math.PI * progress;

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, startAngle, endAngle);
  ctx.stroke();

  // Progress text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 10;

  const percentage = Math.round(progress * 100);
  ctx.fillText(`${percentage}%`, centerX, centerY);

  // Reset
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.lineCap = 'butt';
}

/**
 * Draw debug information
 */
function drawDebugInfo(ctx: CanvasRenderingContext2D, quad: Quad): void {
  const x = 20;
  const y = 40;
  const lineHeight = 25;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(x - 10, y - 30, 280, lineHeight * 3 + 20);

  ctx.fillStyle = '#00ff00';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 4;

  ctx.fillText(`Score: ${quad.score.toFixed(3)}`, x, y);
  ctx.fillText(`Blur: ${quad.blur.toFixed(3)}`, x, y + lineHeight);
  ctx.fillText(`Lux: ${quad.lux.toFixed(3)}`, x, y + lineHeight * 2);

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

/**
 * Draw center hint text
 */
function drawCenterHint(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string
): void {
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 10;

  ctx.fillText(text, width / 2, height / 2);

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

/**
 * Draw quality hints
 */
function drawHints(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  hints: QualityHints
): void {
  if (!hints.message) return;

  const x = width / 2;
  const y = 60;

  // Background
  ctx.fillStyle = 'rgba(255, 165, 0, 0.9)';
  ctx.fillRect(x - 150, y - 20, 300, 50);

  // Border
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 150, y - 20, 300, 50);

  // Text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 4;

  ctx.fillText(hints.message, x, y + 5);

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}
