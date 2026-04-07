import React from 'react';
import { Users, MapPin, Package } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { AssetLibraryItemType } from '../../../types';
import { useImageLoader } from '../../../hooks/useImageLoader';

interface AssetLibraryImageProps {
  imageUrl: string | undefined;
  alt: string;
  type: AssetLibraryItemType;
}

export const AssetLibraryImage: React.FC<AssetLibraryImageProps> = ({ imageUrl, alt, type }) => {
  const { src, loading } = useImageLoader(imageUrl);
  
  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  
  if (!src) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
        {type === 'character' || type === 'turnaround' ? (
          <Users className="w-8 h-8 opacity-30" />
        ) : type === 'scene' ? (
          <MapPin className="w-8 h-8 opacity-30" />
        ) : (
          <Package className="w-8 h-8 opacity-30" />
        )}
      </div>
    );
  }
  
  return <img src={src} alt={alt} className="w-full h-full object-cover" />;
};
