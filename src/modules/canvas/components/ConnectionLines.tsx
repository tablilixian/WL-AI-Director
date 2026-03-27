import React from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { LayerData, PromptLayerData, PROMPT_MODE_COLORS } from '../types/canvas';

interface ConnectionLinesProps {
  offset: { x: number; y: number };
  scale: number;
}

const operationColors: Record<string, string> = {
  'text-to-image': '#22c55e',
  'image-to-image': '#3b82f6',
  'text-to-video': '#06b6d4',
  'image-to-video': '#8b5cf6',
  'style-transfer': '#f59e0b',
  'background-replace': '#f97316',
  'expand': '#ec4899',
  'background-remove': '#14b8a6',
  'variant': '#84cc16',
  'import': '#6b7280',
  'drawing': '#eab308'
};

const operationLabels: Record<string, string> = {
  'text-to-image': '文生图',
  'image-to-image': '图生图',
  'text-to-video': '文生视频',
  'image-to-video': '图生视频',
  'style-transfer': '风格迁移',
  'background-replace': '背景替换',
  'expand': '图片扩展',
  'background-remove': '智能抠图',
  'variant': '图片变体',
  'import': '导入',
  'drawing': '绘图'
};

export const ConnectionLines: React.FC<ConnectionLinesProps> = ({ offset, scale }) => {
  const { layers, selectedLayerId } = useCanvasStore();

  const layersWithSource = layers.filter(l => l.sourceLayerId);

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
        const sourceLayer = layers.find(l => l.id === layer.sourceLayerId);
        if (!sourceLayer) return null;

        const from = getLayerRightCenter(sourceLayer);
        const to = getLayerLeftCenter(layer);
        const color = operationColors[layer.operationType || 'import'] || '#6b7280';
        const isSelected = selectedLayerId === layer.id || selectedLayerId === layer.sourceLayerId;

        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;

        return (
          <g key={`connection-${layer.id}-${index}`}>
            <path
              d={calculateCurvePath(from, to)}
              fill="none"
              stroke={color}
              strokeWidth={isSelected ? 3 : 2}
              opacity={isSelected ? 1 : 0.5}
              markerEnd={`url(#arrow-${layer.operationType || 'import'})`}
            />
            <g>
              <rect
                x={midX - 25}
                y={midY - 10}
                width={50}
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
                {operationLabels[layer.operationType || 'import'] || '操作'}
              </text>
            </g>
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
                <g key={`prompt-output-${promptLayer.id}-${outputId}`}>
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
