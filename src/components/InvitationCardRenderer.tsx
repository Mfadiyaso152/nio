import React, { useRef } from 'react';
import type { EventCanvasDesign } from '../types';
import { getFontClass, substituteGuestPlaceholders } from '../utils/themePresets';

interface InvitationCardRendererProps {
  design: EventCanvasDesign;
  guestName?: string;
  guestTitle?: string;
  editable?: boolean;
  selectedLayerId?: string | null;
  onSelectLayer?: (id: string, kind: 'text' | 'png') => void;
  onMoveLayer?: (id: string, kind: 'text' | 'png', x: number, y: number) => void;
  children?: React.ReactNode;
}

export function InvitationCardRenderer({
  design,
  guestName = 'ضيفنا الكريم',
  guestTitle = '',
  editable = false,
  selectedLayerId = null,
  onSelectLayer,
  onMoveLayer,
  children,
}: InvitationCardRendererProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const handlePointerDown = (
    e: React.PointerEvent,
    id: string,
    kind: 'text' | 'png'
  ) => {
    if (!editable || !canvasRef.current) return;
    e.stopPropagation();
    onSelectLayer?.(id, kind);

    if (!onMoveLayer) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const handleMove = (moveEvent: PointerEvent) => {
      const nextX = Math.max(
        5,
        Math.min(95, ((moveEvent.clientX - rect.left) / rect.width) * 100)
      );
      const nextY = Math.max(
        4,
        Math.min(96, ((moveEvent.clientY - rect.top) / rect.height) * 100)
      );
      onMoveLayer(id, kind, Number(nextX.toFixed(1)), Number(nextY.toFixed(1)));
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  return (
    <div className="w-full max-w-[440px] mx-auto space-y-4">
      <div
        ref={canvasRef}
        dir="rtl"
        onClick={() => editable && onSelectLayer?.('', 'text')}
        style={{ backgroundColor: design.backgroundColor || '#FFFFFF' }}
        className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden border border-[#E4E4EA] shadow-sm select-none"
      >
        {design.backgroundImage ? (
          <img
            src={design.backgroundImage}
            alt="خلفية الدعوة"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
        ) : (
          <div
            className="absolute inset-4 rounded-xl border border-dashed pointer-events-none"
            style={{ borderColor: `${design.accentColor || '#34343D'}33` }}
          />
        )}

        {/* PNG Image Overlays */}
        {(design.pngLayers || []).map((png) => {
          const isSelected = editable && selectedLayerId === png.id;
          return (
            <div
              key={png.id}
              onPointerDown={(e) => handlePointerDown(e, png.id, 'png')}
              style={{
                left: `${png.x}%`,
                top: `${png.y}%`,
                width: `${png.widthPct}%`,
                opacity: png.opacity ?? 1,
                transform: 'translate(-50%, -50%)',
              }}
              className={`absolute ${
                editable ? 'cursor-move touch-none' : 'pointer-events-none'
              } ${isSelected ? 'ring-2 ring-[#34343D] ring-offset-2 rounded-md' : ''}`}
            >
              <img
                src={png.src}
                alt="عنصر تصميم"
                className="w-full h-auto block pointer-events-none"
              />
            </div>
          );
        })}

        {/* Arabic Typography Layers */}
        {(design.textLayers || []).map((layer) => {
          const resolvedText = editable
            ? layer.text
            : substituteGuestPlaceholders(layer.text, guestName, guestTitle);
          const isSelected = editable && selectedLayerId === layer.id;

          return (
            <div
              key={layer.id}
              onPointerDown={(e) => handlePointerDown(e, layer.id, 'text')}
              style={{
                left: `${layer.x}%`,
                top: `${layer.y}%`,
                color: layer.color || '#34343D',
                fontSize: `${layer.fontSize || 20}px`,
                fontWeight: layer.bold ? 700 : 400,
                transform: 'translate(-50%, -50%)',
              }}
              className={`absolute w-[90%] text-center leading-snug px-2 ${getFontClass(
                layer.fontFamily
              )} ${
                editable ? 'cursor-move touch-none' : 'pointer-events-none'
              } ${
                isSelected
                  ? 'ring-2 ring-[#34343D] bg-white/60 rounded-lg py-0.5'
                  : ''
              }`}
            >
              {resolvedText}
            </div>
          );
        })}
      </div>

      {children && (
        <div className="bg-white border border-[#E4E4EA] rounded-2xl p-5 shadow-xs">
          {children}
        </div>
      )}
    </div>
  );
}
