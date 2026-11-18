interface NioLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showArabicWordmark?: boolean;
  className?: string;
}

export function NioLogo({
  size = 'md',
  showArabicWordmark = true,
  className = '',
}: NioLogoProps) {
  const imgSize =
    size === 'lg' ? 'w-14 h-14' : size === 'sm' ? 'w-9 h-9' : 'w-11 h-11';
  const textSize =
    size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-lg' : 'text-xl';

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <div
        className={`${imgSize} rounded-xl bg-white border border-[#E5E5EA] shadow-xs overflow-hidden flex items-center justify-center shrink-0`}
      >
        <img
          src="/assets/aistudio/nio_jpg_0e136059.jpg"
          alt="شعار نيو NIO"
          className="w-full h-full object-contain p-1"
        />
      </div>
      {showArabicWordmark && (
        <div className="leading-none">
          <div className={`font-ruqaa font-bold text-[#35353C] ${textSize}`}>
            نيو
          </div>
          <div className="text-[11px] font-mono-tabular tracking-[0.26em] text-[#6B6B76] mt-0.5">
            NIO
          </div>
        </div>
      )}
    </div>
  );
}
