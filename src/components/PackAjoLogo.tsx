import React from 'react';

// Official logo asset
const officialLogoPath = '/images/pack_ajo_logo.jpg';

export interface BetterAjoLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  variant?: 'horizontal' | 'stacked' | 'icon';
}

export const BetterAjoLogo: React.FC<BetterAjoLogoProps> = ({
  size = 'md',
  showText = true,
  className = '',
  variant = 'horizontal'
}) => {
  // Size specifications
  const iconDimensions = {
    xs: 'w-7 h-7',
    sm: 'w-9 h-9',
    md: 'w-11 h-11',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20'
  };

  const titleSizes = {
    xs: 'text-sm',
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-2xl',
    xl: 'text-3xl'
  };

  const subtitleSizes = {
    xs: 'text-[9px]',
    sm: 'text-[10px]',
    md: 'text-xs',
    lg: 'text-xs',
    xl: 'text-sm'
  };

  if (variant === 'icon') {
    return (
      <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
        <img
          src={officialLogoPath}
          alt="Better Ajo Official Logo"
          referrerPolicy="no-referrer"
          className={`${iconDimensions[size]} object-contain rounded-xl shadow-xs`}
        />
      </div>
    );
  }

  if (variant === 'stacked') {
    return (
      <div className={`flex flex-col items-center text-center ${className}`}>
        <img
          src={officialLogoPath}
          alt="Better Ajo Official Logo"
          referrerPolicy="no-referrer"
          className={`${iconDimensions[size]} object-contain rounded-2xl shadow-sm mb-2`}
        />
        {showText && (
          <div className="flex flex-col items-center">
            <span className={`${titleSizes[size]} font-black tracking-tight text-slate-900 leading-none uppercase`}>
              BETTER <span className="text-[#008751]">AJO</span>
            </span>
            <span className={`${subtitleSizes[size]} font-bold text-slate-500 tracking-wider uppercase mt-1`}>
              Save Better • Build Wealth Together
            </span>
          </div>
        )}
      </div>
    );
  }

  // Default horizontal lockup
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <img
        src={officialLogoPath}
        alt="Better Ajo Official Logo"
        referrerPolicy="no-referrer"
        className={`${iconDimensions[size]} object-contain rounded-xl shadow-xs shrink-0`}
      />
      {showText && (
        <div className="flex flex-col text-left">
          <div className="flex items-center gap-1.5">
            <span className={`${titleSizes[size]} font-black tracking-tight text-slate-900 leading-none uppercase`}>
              BETTER <span className="text-[#008751]">AJO</span>
            </span>
            <span className="text-[10px] font-black bg-[#E6F3ED] text-[#008751] px-1.5 py-0.5 rounded-md leading-none">
              NG
            </span>
          </div>
          <span className={`${subtitleSizes[size]} font-semibold text-slate-500 tracking-wide uppercase mt-0.5 leading-none`}>
            Save Better • Build Wealth Together
          </span>
        </div>
      )}
    </div>
  );
};

// Aliased export for complete backward compatibility across all imports
export const PackAjoLogo = BetterAjoLogo;
export type PackAjoLogoProps = BetterAjoLogoProps;

