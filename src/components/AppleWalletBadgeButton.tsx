import React from 'react';

interface AppleWalletBadgeButtonProps {
  onClick: () => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}

export function AppleWalletIcon({ className = 'w-6 h-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 36 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="1" y="1" width="34" height="26" rx="5" fill="#1C1C1E" stroke="#3A3A3C" strokeWidth="1.2" />
      <rect x="4" y="4" width="28" height="7" rx="2" fill="#3B82F6" />
      <rect x="4" y="7" width="28" height="7" rx="2" fill="#F59E0B" />
      <rect x="4" y="10" width="28" height="7" rx="2" fill="#10B981" />
      <rect x="4" y="13" width="28" height="11" rx="2.5" fill="#EF4444" />
      <path
        d="M12.5 14C13.6 15.8 15.6 16.8 18 16.8C20.4 16.8 22.4 15.8 23.5 14H32V22C32 23.1 31.1 24 30 24H6C4.9 24 4 23.1 4 22V14H12.5Z"
        fill="#2C2C2E"
      />
    </svg>
  );
}

export const AppleWalletBadgeButton: React.FC<AppleWalletBadgeButtonProps> = ({
  onClick,
  disabled = false,
  compact = false,
  className = '',
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2.5 bg-black hover:bg-[#1C1C1E] text-white border border-neutral-800 rounded-xl transition-colors cursor-pointer disabled:opacity-50 ${
        compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm w-full'
      } ${className}`}
    >
      <AppleWalletIcon className={compact ? 'w-5 h-4 shrink-0' : 'w-7 h-5 shrink-0'} />
      <span className="font-cairo font-bold tracking-tight whitespace-nowrap">
        {compact ? 'Apple Wallet' : 'إضافة إلى Apple Wallet'}
      </span>
    </button>
  );
};
