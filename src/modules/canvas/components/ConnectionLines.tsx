import React, { useCallback } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { LayerData, PromptLayerData, PROMPT_MODE_COLORS } from '../types/canvas';

interface ConnectionLinesProps {
  offset: { x: number; y: number };
  scale: number;
  selectedEdgeId: string | null;
  onEdgeSelect: (edgeId: string | null) => void;
}

const operationColors: Record<string, string> = {
  'text-to-image': '#22c55e',
  'image-to-image': '#3b82f6',
  'text-to-video': '#06b6d4',
  'image-to-video': '#8b5cf6',
  'mkr-video': '#a855f7',
  'style-transfer': '#f59e0b',
  'direct-style-transfer': '#f59e0b',
  'ipa-style-transfer': '#a855f7',
  'background-replace': '#f97316',
  'expand': '#ec4899',
  'background-remove': '#14b8a6',
  'variant': '#84cc16',
  'import': '#6b7280',
  'drawing': '#eab308',
  'multi-angle': '#a855f7',
  'three-view': '#06b6d4',
  'storyboard-deduction': '#f59e0b',
  'lighting': '#fbbf24',
  'inpaint': '#22c55e',
  '9grid': '#a855f7',
  '4grid': '#f59e0b',
  '25grid': '#f97316',
  'panorama-generation': '#a855f7',
  'panorama-screenshot': '#a855f7'
};

const operationLabels: Record<string, string> = {
  'text-to-image': '文生图',
  'image-to-image': '图生图',
  'text-to-video': '文生视频',
  'image-to-video': '图生视频',
  'mkr-video': 'MKR多关键帧',
  'style-transfer': '风格迁移',
  'direct-style-transfer': '风格迁移',
  'ipa-style-transfer': 'IPA风格迁移',
  'background-replace': '背景替换',
  'expand': '图片扩展',
  'background-remove': '智能抠图',
  'variant': '图片变体',
  'import': '导入',
  'drawing': '绘图',
  'multi-angle': '多角度',
  'three-view': '三视图',
  'storyboard-deduction': '剧情推演',
  'lighting': '光影校正',
  'inpaint': '重绘',
  '9grid': '九宫格',
  '4grid': '四宫格',
  '25grid': '25宫格',
  'panorama-generation': '全景图',
  'panorama-screenshot': '全景截图'
};

const sourceRoleLabels: Record<string, string[]> = {
  'direct-style-transfer': ['目标图', '风格参考'],
  'ipa-style-transfer': ['风格参考', '图1', '图2', '图3'],
};

const getSourceLabel = (opType: string, index: number): string | null => {
  const roles = sourceRoleLabels[opType];
  return roles ? roles[index] ?? null : null;
};

export const ConnectionLines: React.FC<ConnectionLinesProps> = ({ offset, scale, selectedEdgeId, onEdgeSelect }) => {
  const { layers, selectedLayerId } = useCanvasStore();
  const currentTargetId = selectedEdgeId ? selectedEdgeId.split('::')[0] : null;
  const currentSourceId = selectedEdgeId ? selectedEdgeId.split('::')[1] : null;

  const layersWithSource = layers.filter(l => l.sourceLayerId || (l.sourceLayerIds && l.sourceLayerIds.length > 0));

  const getLayerRightCenter = (layer: LayerData) => ({
    x: (layer.x + layer.width) * scale + offset.x,
    y: (layer.y + layer.height / 2) * scale + offset.y
  });

  const getLayerLeftCenter = (layer: LayerData) => ({
    x: layer.x * scale + offset.x,
    y: (layer.y + layer.height / 2) * scale + offset.y
  });

  const calculateCurvePath = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const midX = (from.x + to.x) / 2;
    const controlOffset = Math.abs(to.x - from.x) * 0.5;
    return `M ${from.x} ${from.y} C ${from.x + controlOffset} ${from.y}, ${to.x - controlOffset} ${to.y}, ${to.x} ${to.y}`;
  };

  const promptLayers = layers.filter(l => l.type === 'prompt') as PromptLayerData[];
  
  const getLayerCenter = (layer: LayerData) => ({
    x: (layer.x + layer.width / 2) * scale + offset.x,
    y: (layer.y + layer.height / 2) * scale + offset.y
  });

  const getLayerRight = (layer: LayerData) => ({
    x: (layer.x + layer.width) * scale + offset.x,
    y: (layer.y + layer.height / 2) * scale + offset.y
  });

  const getLayerLeft = (layer: LayerData) => ({
    x: layer.x * scale + offset.x,
    y: (layer.y + layer.height / 2) * scale + offset.y
  });

  const getLayerBottom = (layer: LayerData) => ({
    x: (layer.x + layer.width / 2) * scale + offset.x,
    y: (layer.y + layer.height) * scale + offset.y
  });

  const getLayerTop = (layer: LayerData) => ({
    x: (layer.x + layer.width / 2) * scale + offset.x,
    y: layer.y * scale + offset.y
  });

  return (
    <svg 
      className="absolute inset-0 w-full h-full pointer-events-none" 
      style={{ zIndex: 1 }}
    >
      <defs>
        {Object.entries(operationColors).map(([op, color]) => (
          <marker
            key={op}
            id={`arrow-${op}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
          </marker>
        ))}
        <marker
          id="arrow-prompt"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6" />
        </marker>
        <marker
          id="arrow-prompt-output"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
        </marker>
      </defs>

      {layersWithSource.map((layer, index) => {
        const sourceIds = layer.sourceLayerIds && layer.sourceLayerIds.length > 0
          ? layer.sourceLayerIds
          : (layer.sourceLayerId ? [layer.sourceLayerId] : []);
        const isMultiSource = layer.sourceLayerIds && layer.sourceLayerIds.length > 1;
        if (sourceIds.length === 0) return null;

        const to = getLayerLeftCenter(layer);
        const color = operationColors[layer.operationType || 'import'] || '#6b7280';
        const opType = layer.operationType || 'import';

        const connections = sourceIds.map((sourceId, ci) => {
          const sourceLayer = layers.find(l => l.id === sourceId);
          if (!sourceLayer) return null;
          return {
            from: getLayerRightCenter(sourceLayer),
            isSelected: selectedLayerId === layer.id || selectedLayerId === sourceId,
            label: isMultiSource ? getSourceLabel(opType, ci) : null,
          };
        }).filter(Boolean) as { from: { x: number; y: number }; isSelected: boolean; label: string | null }[];

        if (connections.length === 0) return null;

        const isAnySelected = connections.some(c => c.isSelected);
        const label = operationLabels[opType] || '操作';

        return (
          <g key={`connection-${layer.id}-${index}`}>
            {connections.map((conn, ci) => {
              const sourceLayer = sourceIds[ci];
              const edgeId = sourceLayer ? `${layer.id}::${sourceLayer}` : null;
              const isThisEdgeSelected = selectedEdgeId !== null && selectedEdgeId === edgeId;
              const midX = (conn.from.x + to.x) / 2;
              const midY = (conn.from.y + to.y) / 2;
              return (
                <g key={`conn-${ci}`}>
                  <path
                    d={calculateCurvePath(conn.from, to)}
                    fill="none"
                    stroke={isThisEdgeSelected ? '#3b82f6' : color}
                    strokeWidth={isThisEdgeSelected ? 3.5 : isAnySelected ? 3 : 2}
                    opacity={isThisEdgeSelected ? 1 : 0.5}
                    markerEnd={`url(#arrow-${opType})`}
                    style={{ transition: 'stroke-width 0.15s, opacity 0.15s' }}
                  />
                  {conn.label ? (
                    <g>
                      <rect
                        x={midX - 24}
                        y={midY - 10}
                        width={48}
                        height={20}
                        fill="#1f2937"
                        stroke={color}
                        strokeWidth={1}
                        rx={4}
                        opacity={0.9}
                      />
                      <text
                        x={midX}
                        y={midY + 4}
                        fill={color}
                        fontSize={10}
                        textAnchor="middle"
                        className="select-none"
                      >
                        {conn.label}
                      </text>
                    </g>
                  ) : (
                    <g>
                      {(() => {
                        const labelW = Math.max(label.length * 8 + 16, 50);
                        return (
                          <>
                            <rect
                              x={midX - labelW / 2}
                              y={midY - 10}
                              width={labelW}
                              height={20}
                              fill="#1f2937"
                              stroke={color}
                              strokeWidth={1}
                              rx={4}
                              opacity={0.9}
                            />
                            <text
                              x={midX}
                              y={midY + 4}
                              fill={color}
                              fontSize={10}
                              textAnchor="middle"
                              className="select-none"
                            >
                              {label}
                            </text>
                          </>
                        );
                      })()}
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      {promptLayers.map((promptLayer) => {
        const isPromptSelected = selectedLayerId === promptLayer.id;
        const linkedLayerIds = promptLayer.promptConfig.linkedLayerIds;
        const outputLayerIds = promptLayer.promptConfig.outputLayerIds;
        const promptColor = promptLayer.promptConfig.nodeColor;
        
        return (
          <React.Fragment key={`prompt-connections-${promptLayer.id}`}>
            {linkedLayerIds.map((linkedId, idx) => {
              const linkedLayer = layers.find(l => l.id === linkedId);
              if (!linkedLayer) return null;
              
              const from = getLayerBottom(promptLayer);
              const to = getLayerTop(linkedLayer);
              const midX = (from.x + to.x) / 2;
              const midY = (from.y + to.y) / 2;
              
              return (
                <g key={`prompt-link-${promptLayer.id}-${linkedId}`}>
                  <path
                    d={calculateCurvePath(from, to)}
                    fill="none"
                    stroke={promptColor}
                    strokeWidth={isPromptSelected ? 3 : 2}
                    strokeDasharray="6,4"
                    opacity={isPromptSelected ? 1 : 0.6}
                    markerEnd="url(#arrow-prompt)"
                  />
                  <circle
                    cx={midX}
                    cy={midY}
                    r={8}
                    fill={promptColor}
                    opacity={0.8}
                  />
                  <text
                    x={midX}
                    y={midY + 4}
                    fill="#ffffff"
                    fontSize={10}
                    textAnchor="middle"
                    className="select-none font-medium"
                  >
                    {idx + 1}
                  </text>
                </g>
              );
            })}
            
            {outputLayerIds.map((outputId, idx) => {
              const outputLayer = layers.find(l => l.id === outputId);
              if (!outputLayer) return null;
              
              const from = getLayerRight(promptLayer);
              const to = getLayerLeft(outputLayer);
              const midX = (from.x + to.x) / 2;
              const midY = (from.y + to.y) / 2;
              
              return (
                <g key={`prompt-output-${promptLayer.id}-${outputId}`} style={{ pointerEvents: 'none' }}>
                  <path
                    d={calculateCurvePath(from, to)}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth={isPromptSelected ? 3 : 2}
                    opacity={isPromptSelected ? 1 : 0.6}
                    markerEnd="url(#arrow-prompt-output)"
                  />
                  <rect
                    x={midX - 15}
                    y={midY - 8}
                    width={30}
                    height={16}
                    fill="#065f46"
                    stroke="#10b981"
                    strokeWidth={1}
                    rx={3}
                    opacity={0.9}
                  />
                  <text
                    x={midX}
                    y={midY + 4}
                    fill="#10b981"
                    fontSize={9}
                    textAnchor="middle"
                    className="select-none"
                  >
                    输出
                  </text>
                </g>
              );
            })}
          </React.Fragment>
        );
      })}
    </svg>
  );
};
