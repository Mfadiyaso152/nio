import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { EventDesign } from '../types';
import { FONT_CLASS_MAP, resolveLayerText } from '../utils/themePresets';

interface LayeredInvitationViewProps {
  design: EventDesign;
  guestDisplay?: string;
  editable?: boolean;
  selectedLayer?: { type: 'text' | 'png'; id: string } | null;
  onSelectLayer?: (sel: { type: 'text' | 'png'; id: string }) => void;
  onMoveLayer?: (type: 'text' | 'png', id: string, x: number, y: number) => void;
  className?: string;
}

export function LayeredInvitationView({
  design,
  guestDisplay = 'أحمد العتيبي',
  editable = false,
  selectedLayer = null,
  onSelectLayer,
  onMoveLayer,
  className = '',
}: LayeredInvitationViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(380);
  const draggingRef = useRef<{
    type: 'text' | 'png';
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateWidth = () => {
      if (el.clientWidth > 0) setContainerWidth(el.clientWidth);
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scaleFactor = containerWidth / 400;

  const handlePointerDown = (
    e: ReactPointerEvent,
    type: 'text' | 'png',
    id: string,
    origX: number,
    origY: number
  ) => {
    if (!editable) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onSelectLayer?.({ type, id });
    draggingRef.current = {
      type,
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX,
      origY,
    };
  };

  const handlePointerMove = (e: ReactPointerEvent) => {
    if (!editable || !draggingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dxPct = ((e.clientX - draggingRef.current.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - draggingRef.current.startY) / rect.height) * 100;

    const nextX = Math.max(4, Math.min(96, Math.round(draggingRef.current.origX + dxPct)));
    const nextY = Math.max(4, Math.min(96, Math.round(draggingRef.current.origY + dyPct)));

    onMoveLayer?.(draggingRef.current.type, draggingRef.current.id, nextX, nextY);
  };

  const handlePointerUp = () => {
    draggingRef.current = null;
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ backgroundColor: design.bgColor || '#FAFAFA' }}
      className={`relative w-full aspect-[3/4] overflow-hidden select-none rounded-2xl border border-[#E5E5EA] shadow-lg ${className}`}
    >
      {/* Background Image */}
      {design.backgroundImage && (
        <img
          src={design.backgroundImage}
          alt="خلفية الدعوة"
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />
      )}

      {/* Optional Dark/Contrast Wash */}
      {design.overlayOpacity > 0 && (
        <div
          style={{ backgroundColor: `rgba(20, 20, 24, ${design.overlayOpacity})` }}
          className="absolute inset-0 pointer-events-none"
        />
      )}

      {/* PNG Sticker / Image Overlays */}
      {design.pngOverlays.map((png) => {
        const isSelected =
          editable && selectedLayer?.type === 'png' && selectedLayer.id === png.id;
        return (
          <div
            key={png.id}
            onPointerDown={(e) => handlePointerDown(e, 'png', png.id, png.x, png.y)}
            style={{
              left: `${png.x}%`,
              top: `${png.y}%`,
              width: `${png.widthPercent}%`,
              opacity: png.opacity,
              transform: `translate(-50%, -50%) rotate(${png.rotation}deg)`,
            }}
            className={`absolute ${
              editable ? 'cursor-grab active:cursor-grabbing touch-none' : 'pointer-events-none'
            } ${
              isSelected
                ? 'ring-2 ring-[#35353C] ring-offset-2 rounded-lg bg-white/10'
                : ''
            }`}
          >
            <img
              src={png.src}
              alt={png.name || 'ملصق PNG'}
              draggable={false}
              className="w-full h-auto block pointer-events-none"
            />
          </div>
        );
      })}

      {/* Text Layers */}
      {design.textLayers.map((layer) => {
        const isSelected =
          editable && selectedLayer?.type === 'text' && selectedLayer.id === layer.id;
        const resolved = resolveLayerText(layer.text, guestDisplay);
        const fontClass = FONT_CLASS_MAP[layer.fontFamily] || 'font-ruqaa';
        const computedFontSize = Math.max(10, Math.round(layer.fontSize * scaleFactor));

        return (
          <div
            key={layer.id}
            onPointerDown={(e) => handlePointerDown(e, 'text', layer.id, layer.x, layer.y)}
            style={{
              left: `${layer.x}%`,
              top: `${layer.y}%`,
              transform: 'translate(-50%, -50%)',
              color: layer.color,
              fontSize: `${computedFontSize}px`,
              lineHeight: 1.45,
              textAlign: layer.align,
              fontWeight: layer.bold ? 700 : 400,
              textShadow: layer.shadow ? '0 2px 10px rgba(0,0,0,0.45)' : 'none',
              maxWidth: '88%',
            }}
            className={`absolute whitespace-pre-wrap break-words px-2 py-0.5 ${fontClass} ${
              editable ? 'cursor-grab active:cursor-grabbing touch-none' : 'pointer-events-none'
            } ${
              isSelected
                ? 'ring-2 ring-[#35353C] bg-white/35 backdrop-blur-[1px] rounded-md'
                : ''
            }`}
          >
            {resolved || 'نص فارغ'}
          </div>
        );
      })}
    </div>
  );
}
