import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Scissors, Palette, ImagePlus, Maximize2, Copy, Grid3x3, ChevronDown } from 'lucide-react';
import { StyleTransferPanel } from './StyleTransferPanel';
import { DirectStyleTransferPanel } from './DirectStyleTransferPanel';
import { IPAStyleTransferPanel } from './IPAStyleTransferPanel';
import { ImageEditPanel } from './ImageEditPanel';
import { RemoveBackgroundPanel } from './RemoveBackgroundPanel';
import { VariantPanel } from './VariantPanel';
import { MultiAnglePanel } from './MultiAnglePanel';
import { ThreeViewPanel } from './ThreeViewPanel';
import { StoryboardDeductionPanel } from './StoryboardDeductionPanel';
import { LightingControlPanel } from './LightingControlPanel';
import { InpaintPanel } from './InpaintPanel';
import { GridSplitPanel } from './GridSplitPanel';
import { ImageToImagePanel } from './ImageToImagePanel';
import { ImageToVideoPanel } from './ImageToVideoPanel';
import { GenerateVideoPanel } from './GenerateVideoPanel';
import type { LayerData, GridGenerationType } from '../types/canvas';

export type ImageAction =
  | 'remove-bg'
  | 'style-transfer'
  | 'direct-style-transfer'
  | 'ipa-style-transfer'
  | 'background-replace'
  | 'expand'
  | 'inpaint'
  | 'variant'
  | 'multi-angle'
  | 'three-view'
  | 'storyboard-deduction'
  | 'lighting'
  | 'split-9grid'
  | 'split-4grid'
  | 'split-25grid'
  | 'image-to-image'
  | 'image-to-video'
  | 'generate-video';

interface ActionItem {
  id: ImageAction;
  label: string;
}

interface ActionGroup {
  label: string;
  icon: React.ReactNode;
  single?: ActionItem;
  items?: ActionItem[];
}

interface ImageActionMenuProps {
  layer: LayerData;
  screenRect: { top: number; left: number; width: number; height: number };
}

const GROUP_DIVIDER = <div className="w-px h-5 bg-gray-600 mx-1" />;

export const ImageActionMenu: React.FC<ImageActionMenuProps> = ({ layer, screenRect }) => {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<ImageAction | null>(null);
  const [showSplitPanel, setShowSplitPanel] = useState(false);
  const [showGenerateVideo, setShowGenerateVideo] = useState(false);
  const [splitGridType, setSplitGridType] = useState<GridGenerationType | null>(null);
  const groupRef = useRef<HTMLDivElement>(null);

  const closeAll = useCallback(() => setOpenGroup(null), []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (groupRef.current && !groupRef.current.contains(e.target as Node)) {
        closeAll();
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [closeAll]);

  const handleAction = (action: ImageAction) => {
    closeAll();
    if (action === 'generate-video') {
      setShowGenerateVideo(true);
    } else if (action === 'split-9grid' || action === 'split-4grid' || action === 'split-25grid') {
      const gt = action === 'split-9grid' ? '9grid' : action === 'split-4grid' ? '4grid' : '25grid';
      setSplitGridType(gt);
      setShowSplitPanel(true);
    } else {
      setActivePanel(action);
    }
  };

  const handleClosePanel = () => setActivePanel(null);

  const groups: ActionGroup[] = [
    {
      label: '基于此图生成',
      icon: <ImagePlus className="w-3.5 h-3.5" />,
      items: [
        { id: 'generate-video', label: 'AI 生成视频' },
        { id: 'image-to-image', label: '图生图' },
        { id: 'image-to-video', label: '单图生视频' },
      ],
    },
    {
      label: '图像处理',
      icon: <Scissors className="w-3.5 h-3.5" />,
      items: [
        { id: 'remove-bg', label: '智能抠图' },
        { id: 'background-replace', label: '背景替换' },
        { id: 'expand', label: '图片扩展' },
        { id: 'inpaint', label: '局部重绘' },
      ],
    },
    {
      label: '风格光影',
      icon: <Palette className="w-3.5 h-3.5" />,
      items: [
        { id: 'style-transfer', label: '风格切换' },
        { id: 'direct-style-transfer', label: '风格参考迁移' },
        { id: 'ipa-style-transfer', label: 'IPA风格迁移' },
        { id: 'lighting', label: '光影校正' },
      ],
    },
    {
      label: '多视角',
      icon: <Grid3x3 className="w-3.5 h-3.5" />,
      items: [
        { id: 'multi-angle', label: '多机位角度' },
        { id: 'three-view', label: '角色三视图' },
      ],
    },
    {
      label: '剧情推演',
      icon: <Grid3x3 className="w-3.5 h-3.5" />,
      single: { id: 'storyboard-deduction', label: '剧情推演' },
    },
    // {
    //   label: '变体生成',
    //   icon: <Copy className="w-3.5 h-3.5" />,
    //   single: { id: 'variant', label: '变体生成' },
    // },
    {
      label: '宫格切分',
      icon: <Grid3x3 className="w-3.5 h-3.5" />,
      items: [
        { id: 'split-9grid', label: '九宫格切分' },
        { id: 'split-4grid', label: '四宫格切分' },
        { id: 'split-25grid', label: '25宫格切分' },
      ],
    },
  ];

  const menu = (
    <div
      className="fixed z-[200] pointer-events-none"
      style={{
        left: screenRect.left + screenRect.width / 2,
        bottom: window.innerHeight - (screenRect.top - 26),
        transform: 'translateX(-50%)',
      }}
    >
      <div
        ref={groupRef}
        className="flex items-center gap-0.5 bg-gray-800/95 backdrop-blur-sm rounded-lg border border-gray-700 shadow-xl pointer-events-auto px-1.5 py-1"
      >
        {groups.map((group, gi) => (
          <React.Fragment key={group.label}>
            {gi > 0 && GROUP_DIVIDER}
            {group.single ? (
              <button
                onClick={(e) => { e.stopPropagation(); handleAction(group.single!.id); }}
                className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-gray-700 rounded text-gray-200 hover:text-white transition-colors text-xs font-medium whitespace-nowrap"
              >
                {group.icon}
                {group.single.label}
              </button>
            ) : (
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setOpenGroup(openGroup === group.label ? null : group.label); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                    openGroup === group.label
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-200 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  {group.icon}
                  {group.label}
                  <ChevronDown className={`w-3 h-3 transition-transform ${openGroup === group.label ? 'rotate-180' : ''}`} />
                </button>
                {openGroup === group.label && group.items && (
                  <div className="absolute top-full left-0 mt-1.5 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[150px] z-50">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={(e) => { e.stopPropagation(); handleAction(item.id); }}
                        className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center gap-2"
                      >
                        {group.icon}
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );

  return (
    <>
      {!activePanel && !showSplitPanel && createPortal(menu, document.body)}

      {activePanel && createPortal(
        <>
          {activePanel === 'style-transfer' && <StyleTransferPanel selectedLayerId={layer.id} onClose={handleClosePanel} />}
          {activePanel === 'direct-style-transfer' && <DirectStyleTransferPanel selectedLayerId={layer.id} onClose={handleClosePanel} />}
          {activePanel === 'ipa-style-transfer' && <IPAStyleTransferPanel selectedLayerId={layer.id} onClose={handleClosePanel} />}
          {activePanel === 'background-replace' && <ImageEditPanel selectedLayerId={layer.id} editMode="background" onClose={handleClosePanel} />}
          {activePanel === 'expand' && <ImageEditPanel selectedLayerId={layer.id} editMode="expand" onClose={handleClosePanel} />}
          {activePanel === 'remove-bg' && <RemoveBackgroundPanel selectedLayerId={layer.id} onClose={handleClosePanel} />}
          {/* activePanel === 'variant' && <VariantPanel selectedLayerId={layer.id} onClose={handleClosePanel} /> */}
          {activePanel === 'multi-angle' && <MultiAnglePanel selectedLayerId={layer.id} onClose={handleClosePanel} />}
          {activePanel === 'three-view' && <ThreeViewPanel selectedLayerId={layer.id} onClose={handleClosePanel} />}
          {activePanel === 'storyboard-deduction' && <StoryboardDeductionPanel selectedLayerId={layer.id} onClose={handleClosePanel} />}
          {activePanel === 'inpaint' && <InpaintPanel selectedLayerId={layer.id} onClose={handleClosePanel} />}
          {activePanel === 'lighting' && <LightingControlPanel selectedLayerId={layer.id} onClose={handleClosePanel} />}
          {activePanel === 'image-to-image' && <ImageToImagePanel selectedLayerId={layer.id} onClose={handleClosePanel} />}
          {activePanel === 'image-to-video' && <ImageToVideoPanel selectedLayerId={layer.id} onClose={handleClosePanel} />}
        </>,
        document.body
      )}

      {showSplitPanel && splitGridType && (
        <GridSplitPanel
          selectedLayerId={layer.id}
          gridType={splitGridType}
          onClose={() => { setShowSplitPanel(false); setSplitGridType(null); }}
        />
      )}

      {showGenerateVideo && (
        <GenerateVideoPanel
          selectedLayerIds={[layer.id]}
          onClose={() => setShowGenerateVideo(false)}
        />
      )}
    </>
  );
};
